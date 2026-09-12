import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { installReactiveBackground } from '../lib/reactive-background';
import { applyReactiveEvent, initialReactiveView, type RunCursor } from '../lib/reactive-state';
import type { GoalAssessment } from '@agentlayer/contracts/reactive-v1';

const assessment: GoalAssessment = { profileUrl: 'https://www.linkedin.com/in/example', userGoal: 'Review leadership evidence',
  identityStatus: 'insufficient', identityKind: 'unknown', verdict: 'insufficient_evidence', criteria: ['Leadership'],
  findings: [], unknowns: ['No verified leadership evidence'], sources: [] };

test('goal persists per tab, invalidates output, stays paused, survives reconnect and clears on close', async () => {
  const stored: Record<string, any> = {};
  let connect: (port: any) => void = () => {};
  const listener = { addListener() {} };
  const previousBrowser = (globalThis as any).browser;
  const previousFetch = globalThis.fetch;
  const requests: any[] = [];
  (globalThis as any).browser = {
    runtime: { id: 'extension', onConnect: { addListener(fn: typeof connect) { connect = fn; } }, onMessage: listener },
    storage: { session: { async get(key: string) { return { [key]: stored[key] }; }, async set(value: any) { Object.assign(stored, value); }, async remove(key: string) { delete stored[key]; } }, local: { async get() { return { pairingToken: 'isolated-test' }; } } },
    permissions: { async contains() { return true; }, onRemoved: listener },
    tabs: { onUpdated: listener, onRemoved: listener, async get() { return { url: 'https://www.linkedin.com/in/example' }; } },
  };
  globalThis.fetch = async (_url, options) => {
    if (!options?.body) {
      const request = requests.filter(r => r.snapshot).at(-1);
      const event = { schemaVersion: 'reactive-v1', sessionId: request.sessionId, contextId: request.contextId,
        revision: request.revision, goalRevision: request.goalRevision, runId: 'run', sequence: 0,
        type: 'completed', text: 'Result for current goal', evidenceRefs: [], ...(request.userGoal && !request.conversation ? { assessment } : {}),
        ...(request.conversation ? { slackDraft: 'Profile draft prepared for review' } : {}) };
      return new Response(`data: ${JSON.stringify(event)}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
    }
    const body = JSON.parse(options?.body as string); requests.push(body);
    if (String(_url).endsWith('/api/slack/preview')) return Response.json({ ...body, previewId: '11111111-1111-4111-8111-111111111111', expiresAt: Date.now() + 60000,
      destination: { teamId: 'T1', teamName: 'Demo team', channelId: 'C1', channelName: 'hiring' } });
    if (String(_url).endsWith('/api/slack/send')) return Response.json({ status: 'sent', sendId: 'send1', channelId: 'C1', messageTs: '1.2', permalink: 'https://example.slack.com/archives/C1/p12', linkUnavailable: false });
    if (body.snapshot) return Response.json({ schemaVersion: 'reactive-v1', sessionId: body.sessionId, contextId: body.contextId,
      revision: body.revision, goalRevision: body.goalRevision, runId: 'run', status: 'accepted' });
    return Response.json({ schemaVersion: 'reactive-v1', sessionId: body.sessionId, status: 'paused' });
  };
  function port(tabId: number) {
    let receive: (message: any) => void = () => {};
    let disconnected = () => {};
    const messages: any[] = [];
    const value = { name: 'agentlayer:reactive', sender: { id: 'extension', tab: { id: tabId }, frameId: 0, url: 'https://www.linkedin.com/in/example' },
      onMessage: { addListener(fn: typeof receive) { receive = fn; } }, onDisconnect: { addListener(fn: typeof disconnected) { disconnected = fn; } },
      postMessage(message: any) { messages.push(message); }, disconnect() { disconnected(); } };
    connect(value);
    return { messages, emit(message: any) { receive(message); }, disconnect: value.disconnect, view: () => messages.filter(m => m.type === 'state').at(-1)?.view };
  }
  try {
    installReactiveBackground();
    const a = port(1); const b = port(2); await delay(10);
    a.emit({ type: 'set-goal', userGoal: '  Find a collaborative lead  ' }); await delay(10);
    assert.equal(a.view().userGoal, 'Find a collaborative lead');
    assert.equal(a.view().goalRevision, 1);
    assert.equal(b.view().userGoal, '');
    assert.equal(stored['reactive-tab-1'].userGoal, 'Find a collaborative lead');
    assert.equal(a.messages.filter(m => m.type === 'recapture').length, 1);
    a.emit({ type: 'set-goal', userGoal: 'Find a collaborative lead' }); await delay(10);
    assert.equal(a.view().goalRevision, 1);
    a.emit({ type: 'pause' }); await delay(10);
    a.emit({ type: 'set-goal', userGoal: 'Different criteria' }); await delay(10);
    assert.equal(a.view().paused, true);
    assert.equal(a.view().text, '');
    assert.equal(a.messages.filter(m => m.type === 'recapture').length, 1);
    assert.equal(requests.some(r => r.snapshot), false);
    a.disconnect(); installReactiveBackground(); // Simulate service-worker recreation: restore from storage, not its Map.
    const restored = port(1); await delay(10);
    assert.equal(restored.view().userGoal, 'Different criteria');
    assert.equal(restored.view().goalRevision, 2);
    assert.equal(restored.view().paused, true);
    restored.emit({ type: 'set-goal', userGoal: '' }); await delay(10);
    assert.equal(restored.view().userGoal, '');
    assert.equal(restored.view().goalRevision, 3);
    restored.emit({ type: 'set-goal', userGoal: 'x'.repeat(2001) }); await delay(10);
    assert.equal(restored.view().userGoal, '');
    assert.equal(restored.view().status, 'error');
    restored.emit({ type: 'close' }); await delay(10);
    assert.equal(stored['reactive-tab-1'], undefined);
    const fresh = port(1); await delay(10);
    assert.equal(fresh.view().userGoal, '');
    assert.equal(fresh.view().goalRevision, 0);
    const snapshot = { url: 'https://www.linkedin.com/in/example', pageTitle: 'Profile', capturedAt: new Date().toISOString(), mainText: 'Visible profile text', selectedText: '', extractedEvidence: [] };
    fresh.emit({ type: 'snapshot', snapshot }); await delay(20);
    assert.equal(fresh.view().text, 'Result for current goal');
    fresh.emit({ type: 'snapshot', snapshot }); await delay(10);
    assert.equal(requests.filter(r => r.snapshot).length, 1);
    fresh.emit({ type: 'set-goal', userGoal: 'Review leadership evidence' }); await delay(10);
    assert.equal(fresh.view().text, '');
    fresh.emit({ type: 'snapshot', snapshot }); await delay(20);
    const snapshots = requests.filter(r => r.snapshot);
    assert.equal(snapshots.length, 2);
    assert.equal(snapshots[1].userGoal, 'Review leadership evidence');
    assert.equal(snapshots[1].goalRevision, 1);
    assert.equal(snapshots[1].revision, snapshots[0].revision + 1);
    assert.deepEqual(fresh.view().assessment, assessment);
    fresh.emit({ type: 'slack-preview', text: 'Reviewed profile evidence', binding: { profileUrl: 'https://untrusted.invalid' } }); await delay(20);
    assert.equal(fresh.view().slack.status, 'ready');
    assert.equal(fresh.view().slack.preview.binding.profileUrl, snapshot.url);
    assert.equal(requests.filter(r => r.approved).length, 0);
    fresh.emit({ type: 'slack-reset' }); await delay(10);
    assert.equal(fresh.view().slack, undefined);
    fresh.emit({ type: 'slack-preview', text: 'Edited exact text' }); await delay(20);
    fresh.emit({ type: 'slack-send', previewId: '11111111-1111-4111-8111-111111111111', text: 'Different text', approved: true }); await delay(20);
    assert.equal(fresh.view().slack.status, 'failed');
    assert.equal(requests.filter(r => r.approved).length, 0);
    fresh.emit({ type: 'slack-preview', text: 'Edited exact text' }); await delay(20);
    fresh.emit({ type: 'slack-send', previewId: '11111111-1111-4111-8111-111111111111', text: 'Edited exact text', approved: true }); await delay(20);
    assert.equal(fresh.view().slack.status, 'sent');
    fresh.emit({ type: 'slack-send', previewId: '11111111-1111-4111-8111-111111111111', text: 'Edited exact text', approved: true }); await delay(10);
    assert.equal(requests.filter(r => r.approved).length, 1);
    fresh.emit({ type: 'invalidate', url: 'https://www.linkedin.com/in/next-profile' }); await delay(10);
    assert.equal(fresh.view().assessment, undefined);
    assert.equal(fresh.view().slack, undefined);
    assert.equal(requests.filter(r => r.action === 'cancel').at(-1).goalRevision, 1);
    fresh.emit({ type: 'snapshot', snapshot }); await delay(20);
    assert.deepEqual(fresh.view().assessment, assessment);
    fresh.emit({ type: 'set-goal', userGoal: '' }); await delay(10);
    assert.equal(fresh.view().assessment, undefined);
    fresh.emit({ type: 'snapshot', snapshot }); await delay(20);
    fresh.emit({ type: 'conversation', userMessage: 'Prepare a Slack draft for this profile' }); await delay(20);
    assert.equal(fresh.view().assessment, undefined);
    assert.equal(fresh.view().slackDraft, 'Profile draft prepared for review');
    const sendsBeforePreview = requests.filter(r => r.approved).length;
    fresh.emit({ type: 'slack-preview', text: fresh.view().slackDraft }); await delay(20);
    assert.equal(fresh.view().slack.status, 'ready');
    assert.equal(fresh.view().slack.preview.binding.userGoal, 'Prepare a Slack draft for this profile');
    assert.equal(fresh.view().slack.preview.binding.profileUrl, snapshot.url);
    assert.equal(requests.filter(r => r.approved).length, sendsBeforePreview);
    fresh.emit({ type: 'set-goal', userGoal: 'New goal invalidates the draft' }); await delay(10);
    assert.equal(fresh.view().slackDraft, undefined);
    assert.equal(fresh.view().slack, undefined);
  } finally { globalThis.fetch = previousFetch; (globalThis as any).browser = previousBrowser; }
});

test('assessment attaches to a current completion and disappears for a new run or conversation result', () => {
  const identity = { schemaVersion: 'reactive-v1' as const, sessionId: 's', contextId: 'c', revision: 1, goalRevision: 1, runId: 'r' };
  const cursor = (): RunCursor => ({ ...identity, lastSequence: -1, terminal: false });
  const completed = applyReactiveEvent(initialReactiveView, cursor(), { ...identity, sequence: 0, type: 'completed', text: 'Evidence', evidenceRefs: [], assessment });
  assert.deepEqual(completed.assessment, assessment);
  const started = applyReactiveEvent(completed, cursor(), { ...identity, sequence: 0, type: 'started' });
  assert.equal(started.assessment, undefined);
  const chat = applyReactiveEvent(completed, cursor(), { ...identity, sequence: 0, type: 'completed', text: 'Conversation reply', evidenceRefs: [] });
  assert.equal(chat.assessment, undefined);
  assert.equal(chat.transcript.at(-1)?.text, 'Conversation reply');
});

test('rejects stale goal events before they consume sequence numbers', () => {
  const cursor: RunCursor = { sessionId: 's', contextId: 'c', revision: 1, goalRevision: 2, runId: 'r', lastSequence: -1, terminal: false };
  const delta = { schemaVersion: 'reactive-v1' as const, sessionId: 's', contextId: 'c', revision: 1, goalRevision: 1, runId: 'r', sequence: 5, type: 'message_delta' as const, text: 'Old goal' };
  assert.equal(applyReactiveEvent(initialReactiveView, cursor, delta), initialReactiveView);
  assert.equal(cursor.lastSequence, -1);
  assert.equal(applyReactiveEvent(initialReactiveView, cursor, { ...delta, goalRevision: 2, text: 'Current goal' }).text, 'Current goal');
});
