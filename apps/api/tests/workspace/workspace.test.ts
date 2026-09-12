import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { digest } from '../../src/workspace/journal.js';
import { profileKey } from '../../src/workspace/mapping.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileJournal, WorkspaceActions, WorkspaceError, type ReviewedAction, type Kind, type RecordData, type WorkspaceProvider } from '../../src/workspace/index.js';
import { AmbiguousProvider } from '../../src/adapters/ambiguous.js';
import { createWorkspaceCommitter } from '../../src/workspace/v1.js';
import { completeProfile, noSources } from '@agentlayer/contracts/fixtures/v1';
import { CommitResultSchema, type CommitRequest } from '@agentlayer/contracts/v1';

const request = (): ReviewedAction => ({ requestId: 'r1', proposalId: 'p1', contextId: 'c1', actionKind: 'contact_followup', reviewedPayload: { sourceUrl: 'https://linkedin.com/in/example', sources: [{ title: 'Evidence', url: 'https://example.com/research' }], person: { name: 'Example', company: null, role: null, profileUrl: 'https://linkedin.com/in/example' }, task: { title: 'Follow up', description: 'Reviewed research' } } });
class Provider implements WorkspaceProvider {
  records = new Map<string, RecordData>(); writes: { kind: Kind; body: Record<string, unknown> }[] = [];
  failTask = false; timeout = false; failRead = false; existing: RecordData[] = [];
  async contacts() { return this.existing; }
  async create(kind: Kind, body: Record<string, unknown>) {
    this.writes.push({ kind, body });
    if (kind === 'task' && this.failTask) throw new WorkspaceError('AMBIGUOUS_HTTP_429', false, true);
    const row = { ...body, id: 'id-' + this.writes.length };
    this.records.set(row.id, row);
    if (this.timeout) throw new WorkspaceError('TIMEOUT', true);
    return row;
  }
  async read(_kind: Kind, id: string) { if (this.failRead) throw new Error('offline'); return this.records.get(id)!; }
}
function setup(t: { after: (f: () => void) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'agentlayer-c-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const provider = new Provider(); const journal = new FileJournal(dir, 'fixture-workspace');
  return { provider, journal, service: new WorkspaceActions(provider, journal) };
}
test('contact/task read-back, linkage, sources and restart idempotence', async t => {
  const { service, provider, journal } = setup(t);
  assert.equal((await service.commitReviewedAction(request())).status, 'succeeded');
  assert.equal(provider.writes[1].body.contact_id, 'id-1');
  assert.match(String(provider.writes[1].body.description), /linkedin/);
  assert.equal((await new WorkspaceActions(provider, journal).commitReviewedAction(request())).status, 'succeeded');
  assert.equal(provider.writes.length, 2);
  const changed = request(); changed.reviewedPayload.task!.title = 'Different';
  await assert.rejects(service.commitReviewedAction(changed), /REQUEST_ID_CONFLICT/);
});
test('partial retry reuses successful contact', async t => {
  const { service, provider } = setup(t); provider.failTask = true;
  assert.equal((await service.commitReviewedAction(request())).status, 'partial');
  provider.failTask = false;
  assert.equal((await service.commitReviewedAction(request())).status, 'succeeded');
  assert.equal(provider.writes.filter(x => x.kind === 'contact').length, 1);
});
test('lost create response stays unknown across restart without blind retry', async t => {
  const { service, provider, journal } = setup(t); provider.timeout = true;
  assert.equal((await service.commitReviewedAction(request())).status, 'unknown');
  provider.timeout = false;
  assert.equal((await new WorkspaceActions(provider, journal).commitReviewedAction(request())).status, 'unknown');
  assert.equal((await service.reconcile('r1')).status, 'unknown');
  assert.equal(provider.writes.length, 1);
});
test('known ID reconciles by GET after restart', async t => {
  const { service, provider, journal } = setup(t); provider.failRead = true;
  assert.equal((await service.commitReviewedAction(request())).status, 'unknown');
  provider.failRead = false;
  assert.equal((await new WorkspaceActions(provider, journal).commitReviewedAction(request())).status, 'succeeded');
  assert.equal(provider.writes.length, 2);
});
test('reject invalid task/date before contact write', async t => {
  const { service, provider } = setup(t);
  const r = request(); r.reviewedPayload.task!.title = 'a'.repeat(256);
  await assert.rejects(service.commitReviewedAction(r));
  r.reviewedPayload.task!.title = 'OK'; r.reviewedPayload.task!.dueAt = '2026-02-30';
  await assert.rejects(service.commitReviewedAction(r)); assert.equal(provider.writes.length, 0);
});
test('matching profile reuse does not overwrite contact; ambiguous match blocks', async t => {
  const { service, provider } = setup(t);
  const existing = { id: 'existing', type: 'person', name: 'Authoritative', website: request().reviewedPayload.sourceUrl };
  provider.existing = [existing]; provider.records.set(existing.id, existing);
  assert.equal((await service.commitReviewedAction(request())).status, 'succeeded');
  assert.equal(provider.writes.length, 1); assert.equal(provider.writes[0].body.contact_id, 'existing');
  provider.existing.push({ ...existing, id: 'duplicate' });
  const r = request(); r.requestId = 'r2';
  const result = await service.commitReviewedAction(r);
  assert.equal(result.operations[0].errorCode, 'CONTACT_MATCH_AMBIGUOUS'); assert.equal(provider.writes.length, 1);
});
test('note uses actual document type and preserves literal selection/source', async t => {
  const { service, provider } = setup(t);
  const r = request(); r.actionKind = 'research_note'; delete r.reviewedPayload.person; delete r.reviewedPayload.task;
  r.reviewedPayload.note = { title: 'Note', content: 'Research', selection: '<img src=x> [evil](https://example.org)' };
  assert.equal((await service.commitReviewedAction(r)).status, 'succeeded');
  assert.equal(provider.writes[0].kind, 'note'); assert.equal(provider.writes[0].body.type, 'doc');
  assert.match(String(provider.writes[0].body.content), /<img src=x>/);
});
test('journal excludes simultaneous writers', async t => {
  const { journal } = setup(t);
  await journal.exclusive(async () => { await assert.rejects(journal.exclusive(async () => {}), /JOURNAL_LOCKED/); });
});
test('provider validates envelopes, fixed origin, no redirects, safe errors', async () => {
  const provider = new AmbiguousProvider('secret', (async (url, init) => {
    assert.equal(url, 'https://app.ambiguous.ai/api/tasks'); assert.equal(init?.redirect, 'error');
    return new Response(JSON.stringify({ id: 'not-an-envelope' }), { status: 201 });
  }) as typeof fetch);
  await assert.rejects(provider.create('task', { title: 'Test' }), e => e instanceof WorkspaceError && e.uncertain && !e.message.includes('secret'));
});
test('provider walks contact pages and rejects incomplete scan', async () => {
  let calls = 0;
  const provider = new AmbiguousProvider('secret', (async () => {
    calls++;
    return Response.json({ data: [], has_more: true, next_cursor: 'same' });
  }) as typeof fetch);
  await assert.rejects(provider.contacts(), /INCOMPLETE_CONTACT_SCAN/);
  assert.equal(calls, 2);
});
test('same name without stable profile match never merges', async t => {
  const { service, provider } = setup(t);
  provider.existing = [{ id: 'namesake', type: 'person', name: 'Example', website: 'https://linkedin.com/in/another' }];
  await service.commitReviewedAction(request());
  assert.equal(provider.writes[0].kind, 'contact');
});
test('document read-back with missing selection remains unknown, preserving ID', async t => {
  const { service, provider } = setup(t);
  const original = provider.read.bind(provider);
  provider.read = async (kind, id) => ({ ...await original(kind, id), content: '{"type":"doc","content":[]}' });
  const r = request(); r.actionKind = 'research_note'; delete r.reviewedPayload.person; delete r.reviewedPayload.task;
  r.reviewedPayload.note = { title: 'Note', content: 'Brief', selection: 'Evidence' };
  const result = await service.commitReviewedAction(r);
  assert.equal(result.status, 'unknown'); assert.equal(result.operations[0].id, 'id-1');
  await service.commitReviewedAction(r); assert.equal(provider.writes.length, 1);
});
test('v1 bridge validates results, locks context, preserves local due date and full request hash', async t => {
  const { service, provider } = setup(t); const committer = createWorkspaceCommitter(service);
  const r: CommitRequest = { requestId: 'v1', proposalId: 'p1', contextId: completeProfile.contextId, actionKind: 'contact_followup', reviewedPayload: { actionKind: 'contact_followup', person: completeProfile.person!, task: { title: 'Follow up', description: 'Reviewed', dueAt: '2026-09-13' } } };
  const workspace = { context: completeProfile, brief: { ...noSources, mode: 'live' as const } };
  const saved = CommitResultSchema.parse(await committer.commitReviewedAction(r, { workspace }));
  assert.equal(saved.operations[0].status, 'created');
  assert.equal(provider.writes[1].body.due_date, '2026-09-13');
  const changed = structuredClone(r); if (changed.reviewedPayload.actionKind === 'contact_followup') changed.reviewedPayload.task.dueAt = '2026-09-14';
  await assert.rejects(committer.commitReviewedAction(changed, { workspace }), /REQUEST_ID_CONFLICT/);
  await assert.rejects(committer.commitReviewedAction(r, { workspace: { ...workspace, brief: noSources } }), /PROPOSAL_CONTEXT_MISMATCH/);
});
test('contact read-back must preserve reviewed company and role before task creation', async t => {
  const { service, provider } = setup(t);
  const original = provider.read.bind(provider);
  provider.read = async (kind, id) => {
    const row = await original(kind, id);
    return kind === 'contact' ? { ...row, custom_properties: {} } : row;
  };
  const result = await service.commitReviewedAction(request());
  assert.equal(result.status, 'unknown');
  assert.equal(result.operations[0].id, 'id-1');
  assert.equal(provider.writes.length, 1);
  await service.commitReviewedAction(request());
  assert.equal(provider.writes.length, 1);
});
test('corrupted persisted operation state cannot trigger another provider write', async t => {
  const { service, provider, journal } = setup(t);
  await service.commitReviewedAction(request());
  const path = join(journal.directory, digest('r1') + '.json');
  const original = JSON.parse(readFileSync(path, 'utf8'));
  for (const mutate of [
    (entry: any) => { entry.result.operations = []; },
    (entry: any) => { entry.result.operations[0].status = 'corrupt'; },
    (entry: any) => { entry.result.operations[0].id = null; },
    (entry: any) => { delete entry.expected.contact; },
  ]) {
    const entry = structuredClone(original); mutate(entry); writeFileSync(path, JSON.stringify(entry));
    await assert.rejects(service.commitReviewedAction(request()), /CORRUPT_JOURNAL/);
  }
  assert.equal(provider.writes.length, 2);
});
test('provider SLA date is cleared on the newly created task before success', async t => {
  const { provider, journal } = setup(t);
  const create = provider.create.bind(provider); let patches = 0;
  const extended: WorkspaceProvider = {
    contacts: () => provider.contacts(), read: (kind, id) => provider.read(kind, id),
    create: async (kind, body) => {
      const row = await create(kind, body);
      if (kind === 'task') row.due_date = '2026-09-26';
      return row;
    },
    clearTaskDueDate: async id => { patches++; provider.records.get(id)!.due_date = null; },
  };
  const service = new WorkspaceActions(extended, journal);
  assert.equal((await service.commitReviewedAction(request())).status, 'succeeded');
  assert.equal(patches, 1);
  assert.equal(provider.records.get('id-2')!.due_date, null);
  await service.commitReviewedAction(request()); assert.equal(patches, 1);
});
test('failed date clearing retains task ID and does not recreate it', async t => {
  const { provider, journal } = setup(t); const create = provider.create.bind(provider);
  const extended: WorkspaceProvider = {
    contacts: () => provider.contacts(), read: (kind, id) => provider.read(kind, id),
    create: async (kind, body) => { const row = await create(kind, body); if (kind === 'task') row.due_date = '2026-09-26'; return row; },
    clearTaskDueDate: async () => { throw new WorkspaceError('PATCH_TIMEOUT', true); },
  };
  const service = new WorkspaceActions(extended, journal);
  const result = await service.commitReviewedAction(request());
  assert.equal(result.status, 'unknown'); assert.equal(result.operations[1].id, 'id-2');
  assert.equal((await service.reconcile('r1')).status, 'unknown');
  await service.commitReviewedAction(request()); assert.equal(provider.writes.length, 2);
});
test('legacy successful journal with omitted date revalidates without provider mutation', async t => {
  const { provider, service, journal } = setup(t);
  await service.commitReviewedAction(request());
  provider.records.get('id-2')!.due_date = '2026-09-26';
  const path = join(journal.directory, digest('r1') + '.json');
  const entry = JSON.parse(readFileSync(path, 'utf8')); delete entry.expected.task.due_date;
  writeFileSync(path, JSON.stringify(entry));
  assert.equal((await service.reconcile('r1')).status, 'unknown');
  assert.equal(provider.writes.length, 2);
});
test('Ambiguous adapter omits null on create and sends documented PATCH null separately', async () => {
  const id = '978fc28f-2dcb-4ae0-8b87-bbf7dbf90f19'; const calls: any[] = [];
  const provider = new AmbiguousProvider('fixture-key', (async (url, init) => {
    calls.push({ url, method: init?.method, body: JSON.parse(String(init?.body)) });
    return Response.json({ task: { id } });
  }) as typeof fetch);
  await provider.create('task', { title: 'Test', due_date: null });
  await provider.clearTaskDueDate(id);
  assert.deepEqual(calls.map(c => ({ method: c.method, body: c.body })), [
    { method: 'POST', body: { title: 'Test' } }, { method: 'PATCH', body: { due_date: null } },
  ]);
});
test('generic profile identity preserves query and hash routes', async t => {
  const { service, provider } = setup(t);
  const r = request();
  r.reviewedPayload.sourceUrl = 'https://example.com/profile?id=2';
  r.reviewedPayload.person!.profileUrl = r.reviewedPayload.sourceUrl;
  provider.existing = [{ id: 'other-person', type: 'person', name: 'Example', website: 'https://example.com/profile?id=1' }];
  await service.commitReviewedAction(r);
  assert.equal(provider.writes[0].kind, 'contact');
  assert.equal(provider.writes[0].body.website, r.reviewedPayload.sourceUrl);
  assert.notEqual(profileKey('https://example.com/#/people/1'), profileKey('https://example.com/#/people/2'));
  assert.equal(profileKey('https://www.linkedin.com/in/example/?trk=test#details'), 'https://www.linkedin.com/in/example');
  assert.notEqual(profileKey('https://linkedin.com.evil.example/in/example/?id=1'), profileKey('https://linkedin.com.evil.example/in/example/?id=2'));
});
