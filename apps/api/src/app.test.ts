import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from './app.js';
import { completeProfile, articleSelection, noSources } from '@agentlayer/contracts/fixtures/v1';
import type { CommitRequest } from '@agentlayer/contracts/v1';
import { ApiErrorSchema } from '@agentlayer/contracts/v1';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileJournal, WorkspaceActions, WorkspaceError, type WorkspaceProvider, type Kind, type RecordData } from './workspace/index.js';
import { createWorkspaceCommitter } from './workspace/v1.js';
import { ResearchError } from './research/validation.js';

test('reactive HTTP authenticates, acknowledges and streams bounded read-only events', async () => {
  const input = { schemaVersion: 'reactive-v1', sessionId: 'http-session', contextId: 'page', revision: 1, snapshot: { url: 'https://example.org', pageTitle: 'Page', capturedAt: '2026-09-12T00:00:00Z', mainText: 'Page content', selectedText: '', extractedEvidence: [] } };
  const unavailable = createApp({ token, mode: 'live' });
  assert.equal((await post(unavailable, '/api/reactive/snapshots', input, '')).status, 401);
  assert.equal((await post(unavailable, '/api/reactive/snapshots', input)).status, 503);
  const app = createApp({ token, mode: 'live', reactiveRunner: async (request, options) => {
    options.emit({ schemaVersion: 'reactive-v1', sessionId: request.sessionId, contextId: request.contextId, revision: request.revision, runId: options.runId, sequence: 1, type: 'completed', text: 'Fixture page analysis', evidenceRefs: [] });
  } });
  const accepted = await post(app, '/api/reactive/snapshots', input);
  assert.equal(accepted.status, 200); assert.equal((await accepted.json()).status, 'accepted');
  const response = await app.request('/api/reactive/sessions/http-session/events', { headers: { Authorization: `Bearer ${token}` } });
  assert.match(response.headers.get('Content-Type')!, /text\/event-stream/);
  const reader = response.body!.getReader();
  let received = '';
  try { while (!received.includes('event: completed')) { const chunk = await reader.read(); if (chunk.done) break; received += new TextDecoder().decode(chunk.value); } }
  finally { await reader.cancel(); }
  assert.match(received, /event: started/); assert.match(received, /Fixture page analysis/);
  assert.equal((await post(app, '/api/reactive/control', { schemaVersion: 'reactive-v1', sessionId: 'http-session', action: 'close' })).status, 200);
});

test('HTTP commit preserves evidence, handles partial retry and reconciles after restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'agentlayer-http-'));
  const records = new Map<string, RecordData>();
  const writes: Kind[] = [];
  let rejectTask = true;
  const provider: WorkspaceProvider = {
    contacts: async () => [...records.values()].filter(r => r.type === 'person'),
    create: async (kind, body) => {
      if (kind === 'task' && rejectTask) { rejectTask = false; throw new WorkspaceError('RATE_LIMIT', false, true); }
      const record = { ...body, id: `fixture-${kind}-${writes.length}` };
      writes.push(kind); records.set(record.id, record); return record;
    },
    read: async (_kind, id) => records.get(id)!,
  };
  const makeApp = () => {
    const committer = createWorkspaceCommitter(new WorkspaceActions(provider, new FileJournal(directory, 'http-fixture')));
    return createApp({ token, mode: 'live', integrations: {
      research: async context => ({ ...noSources, mode: 'live', contextId: context.contextId }),
      commit: (request, options) => committer.commitReviewedAction(request, { workspace: options, signal: options.signal }),
      reconcile: (id, options) => committer.reconcile(id, options),
    } });
  };
  try {
    const app = makeApp();
    const { proposal } = await (await post(app, '/api/research', { context: completeProfile })).json();
    const request = { requestId: 'http-profile', proposalId: proposal.proposalId, contextId: proposal.contextId, actionKind: proposal.actionKind, reviewedPayload: proposal.reviewedPayload };
    request.reviewedPayload.task.dueAt = '2026-10-01';
    const first = await post(app, '/api/actions/commit', request);
    assert.equal(first.status, 200);
    const partial = await first.json();
    assert.equal(partial.status, 'partial');
    assert.equal(partial.operations[0].status, 'created');
    assert.equal(partial.operations[1].retryable, true);
    const retry = await post(app, '/api/actions/commit', request);
    assert.equal((await retry.json()).status, 'succeeded');
    assert.deepEqual(writes, ['contact', 'task']);
    const taskRecord = [...records.values()].find(r => 'contact_id' in r)!;
    assert.equal(taskRecord.contact_id, partial.operations[0].id);
    assert.equal(taskRecord.due_date, '2026-10-01');
    assert.ok(String(taskRecord.description).includes('https://example\\.org/people/alex'), 'Markdown-escaped profile URL is preserved');
    const conflict = await post(app, '/api/actions/commit', { ...request, reviewedPayload: { ...request.reviewedPayload, task: { ...request.reviewedPayload.task, title: 'Changed after save' } } });
    assert.equal(conflict.status, 409);
    assert.equal(ApiErrorSchema.parse(await conflict.json()).requestId, request.requestId);
    const restarted = makeApp();
    const status = await restarted.request(`/api/actions/${request.requestId}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(status.status, 200);
    assert.equal((await status.json()).status, 'succeeded');
    assert.deepEqual(writes, ['contact', 'task']);
    const { proposal: note } = await (await post(restarted, '/api/research', { context: articleSelection })).json();
    const noteResponse = await post(restarted, '/api/actions/commit', { requestId: 'http-note', proposalId: note.proposalId, contextId: note.contextId, actionKind: note.actionKind, reviewedPayload: note.reviewedPayload });
    const noteResult = await noteResponse.json();
    assert.equal(noteResult.status, 'succeeded');
    assert.equal(noteResult.operations[0].kind, 'note');
    assert.match(String(records.get(noteResult.operations[0].id)!.content), /Small teams organize customer research/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('HTTP errors follow ApiError and preserve bounded provider rate limits', async () => {
  const app = createApp({ token, mode: 'live', integrations: { research: async () => { throw new ResearchError('PROVIDER_RATE_LIMIT', true, 'exa'); } } });
  const limited = await post(app, '/api/research', { context: completeProfile });
  assert.equal(limited.status, 429);
  assert.equal(ApiErrorSchema.parse(await limited.json()).code, 'PROVIDER_RATE_LIMIT');
  for (const response of [await app.request('/missing'), await app.request('/api/settings/connection'), await post(app, '/api/research', { context: {} })]) {
    assert.equal(ApiErrorSchema.safeParse(await response.json()).success, true);
  }
});

test('v1 binds reviewed writes to server-held context and original profile', async () => {
  const writes: CommitRequest[] = [];
  const app = createApp({ token, mode: 'live', integrations: {
    research: async context => ({ ...noSources, contextId: context.contextId, mode: 'live' }),
    commit: async request => { writes.push(request); return { requestId: request.requestId, contextId: request.contextId, status: 'succeeded', operations: [{ kind: 'note', status: 'created', id: 'fixture-note', url: null, errorCode: null, retryable: false }], warnings: [] }; },
  } });
  const response = await post(app, '/api/research', { context: completeProfile });
  assert.equal(response.status, 200);
  const { proposal } = await response.json();
  assert.equal(writes.length, 0);
  const request = { requestId: 'reviewed-1', proposalId: proposal.proposalId, contextId: proposal.contextId, actionKind: proposal.actionKind, reviewedPayload: proposal.reviewedPayload };
  assert.equal((await post(app, '/api/actions/commit', { ...request, contextId: 'other-profile' })).status, 409);
  assert.equal((await post(app, '/api/actions/commit', { ...request, reviewedPayload: { ...request.reviewedPayload, person: { ...request.reviewedPayload.person, profileUrl: 'https://example.org/other' } } })).status, 409);
  assert.equal((await post(app, '/api/actions/commit', { ...request, proposalId: 'invented' })).status, 409);
  assert.equal(writes.length, 0);
  const selectionResponse = await post(app, '/api/research', { context: articleSelection });
  const selection = (await selectionResponse.json()).proposal;
  assert.equal(selection.actionKind, 'research_note');
  assert.match(selection.reviewedPayload.note.content, /Small teams organize/);
  assert.equal((await post(app, '/api/actions/commit', { requestId: 'note-1', proposalId: selection.proposalId, contextId: selection.contextId, actionKind: selection.actionKind, reviewedPayload: selection.reviewedPayload })).status, 200);
  assert.equal(writes.length, 1);
});

test('v1 does not accept demo provider output into a live proposal', async () => {
  const app = createApp({ token, mode: 'live', integrations: { research: async () => noSources } });
  assert.equal((await post(app, '/api/research', { context: completeProfile })).status, 502);
  assert.equal((await app.request('/api/actions/request-1')).status, 401);
});

const token = 'test-pairing-token';
test('connection settings require authentication and never equate presence with verification', async () => {
  const secret = 'provider-secret-do-not-disclose';
  const app = createApp({ token, mode: 'live', env: { OPENAI_API_KEY: secret, OPENAI_MODEL: 'configured-model' } });
  assert.equal((await app.request('/api/settings/connection')).status, 401);
  const response = await app.request('/api/settings/connection', { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.equal(body.includes(secret), false);
  const status = JSON.parse(body);
  assert.equal(status.providers[0].status, 'configured');
  assert.equal(status.providers[1].status, 'missing_configuration');
  assert.equal(status.providers.some((p: {status: string}) => p.status === 'verified'), false);
});
const context = completeProfile;
const task = { requestId: 'request-1', contextId: context.contextId, title: 'Follow up', description: 'Review the source profile.' };
function post(app: ReturnType<typeof createApp>, path: string, body: unknown, authorization = `Bearer ${token}`) {
  return app.request(path, { method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

test('root opens the demo while unknown routes remain 404', async () => {
  const app = createApp({ token, mode: 'demo' });
  const root = await app.request('/');
  assert.equal(root.status, 302);
  assert.equal(root.headers.get('Location'), '/demo');
  const demo = await app.request(root.headers.get('Location')!);
  assert.equal(demo.status, 200);
  assert.match(await demo.text(), /data-agentlayer-profile/);
  assert.equal((await app.request('/does-not-exist')).status, 404);
});

test('API requires token; readiness does not disclose it', async () => {
  const app = createApp({ token, mode: 'demo' });
  assert.equal((await post(app, '/api/research', { context }, '')).status, 401);
  assert.equal((await post(app, '/api/tasks', task, 'Bearer wrong')).status, 401);
  const ready = await app.request('/ready');
  assert.equal(ready.status, 200);
  assert.equal((await ready.text()).includes(token), false);
});

test('invalid context and oversized input are rejected', async () => {
  const app = createApp({ token, mode: 'demo' });
  assert.equal((await post(app, '/api/research', { context: {} })).status, 400);
  assert.equal((await post(app, '/api/research', { context: { ...context, url: 'not-a-url' } })).status, 400);
  assert.equal((await post(app, '/api/research', { context: { ...context, selection: 'x'.repeat(70_000) } })).status, 413);
});

test('only v1 is accepted and missing integrations never return a demo success', async () => {
  for (const mode of ['demo', 'live'] as const) {
    const app = createApp({ token, mode });
    assert.equal((await post(app, '/api/research', { context })).status, 503);
    assert.equal((await post(app, '/api/research', { context: { contextId: 'legacy', title: 'Old context', name: 'Alex', url: context.url, company: null, selection: '' } })).status, 400);
    assert.equal((await post(app, '/api/tasks', task)).status, 404);
  }
});

test('malformed JSON and unsupported content type return JSON errors', async () => {
  const app = createApp({ token, mode: 'demo' });
  const malformed = await app.request('/api/research', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  assert.equal(typeof (await malformed.json()).message, 'string');
  const unsupported = await app.request('/api/research', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: '{}' });
  assert.equal(unsupported.status, 415);
});
