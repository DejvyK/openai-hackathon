import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ReactiveSessions, type ReactiveRunner } from './reactive.js';
import type { ReactiveSnapshotRequest } from '@agentlayer/contracts/reactive-v1';
const snapshot: ReactiveSnapshotRequest = { schemaVersion: 'reactive-v1', sessionId: 's', contextId: 'c1', revision: 1, snapshot: { url: 'https://example.org', pageTitle: 'Example', capturedAt: '2026-09-12T00:00:00Z', mainText: 'Page one', selectedText: '', extractedEvidence: [] } };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('frontend intents preserve bindings and reject unbacked sources or mismatched Slack drafts', async () => {
  const calls: Parameters<ReactiveRunner>[] = [];
  let finish = () => {};
  const sessions = new ReactiveSessions(async (...args) => { calls.push(args); await new Promise<void>(resolve => { finish = resolve; }); });
  try {
    const request = { ...snapshot, goalRevision: 2, conversation: { messageId: 'm', userMessage: 'Prepare a Slack draft', history: [] }, snapshot: { ...snapshot.snapshot, extractedEvidence: [{ id: 'page-1', text: 'Visible page', sourceUrl: snapshot.snapshot.url }] } };
    const ack = sessions.snapshot(request); await tick();
    const event = { schemaVersion: 'reactive-v1' as const, sessionId: 's', contextId: 'c1', revision: 1, goalRevision: 2, runId: ack.runId!, sequence: 1, type: 'completed' as const, text: 'Review', evidenceRefs: [] };
    const summary = { type: 'component' as const, name: 'sourced_summary' as const, props: { title: 'Summary', text: 'Visible page', sourceIds: ['page-1'] } };
    const draft = { type: 'tool' as const, name: 'prepare_slack_draft' as const, arguments: { text: `Review ${snapshot.snapshot.url}` } };
    assert.throws(() => calls[0][1].emit({ ...event, frontendIntents: [{ ...summary, props: { ...summary.props, sourceIds: ['invented'] } }] }), /UNKNOWN_FRONTEND_EVIDENCE/);
    assert.throws(() => calls[0][1].emit({ ...event, frontendIntents: [draft], slackDraft: 'Changed message' }), /INVALID_FRONTEND_DRAFT/);
    assert.throws(() => calls[0][1].emit({ ...event, goalRevision: 1, frontendIntents: [summary] }), /EVENT_CONTEXT_MISMATCH/);
    calls[0][1].emit({ ...event, frontendIntents: [summary, draft], slackDraft: draft.arguments.text });
    const completed = sessions.events('s').at(-1);
    assert.ok(completed?.type === 'completed');
    assert.deepEqual(completed.frontendIntents, [summary, draft]);
    assert.equal(sessions.currentContext('s')?.goalRevision, 2);
  } finally { finish(); sessions.close(); }
});
test('server research sources support citations and conversational Slack drafts preserve current binding', async () => {
  const profile = { ...snapshot, snapshot: { ...snapshot.snapshot, url: 'https://www.linkedin.com/in/example-person/' } };
  const sessions = new ReactiveSessions(async (request, { runId, emit }) => {
    emit({ schemaVersion: 'reactive-v1', sessionId: request.sessionId, contextId: request.contextId, revision: request.revision, runId, sequence: 0,
      type: 'completed', text: 'Source found [exa-1].', evidenceRefs: ['exa-1'],
      sources: [{ id: 'exa-1', title: 'Source', url: 'https://example.org/bio', retrievedAt: new Date().toISOString() }],
      slackDraft: `Profile for discussion: ${request.snapshot.url}` });
  });
  try {
    const ack = sessions.snapshot(profile); await tick();
    assert.equal(sessions.events('s').at(-1)?.type, 'completed');
    assert.equal(sessions.currentContext('s')?.profileUrl, profile.snapshot.url);
    sessions.control({ schemaVersion: 'reactive-v1', sessionId: 's', contextId: 'c1', revision: 1, runId: ack.runId, action: 'cancel' });
    assert.equal(sessions.currentContext('s'), null);
  } finally { sessions.close(); }
});
test('a stale goal revision cannot emit into or cancel the accepted goal run', async () => {
  const calls: Parameters<ReactiveRunner>[] = [];
  const sessions = new ReactiveSessions(async (...args) => { calls.push(args); await new Promise<void>(resolve => args[1].signal.addEventListener('abort', () => resolve(), { once: true })); });
  try {
    const request = { ...snapshot, userGoal: 'Research leadership evidence', goalRevision: 2 };
    const ack = sessions.snapshot(request); await tick();
    const identity = { schemaVersion: 'reactive-v1' as const, sessionId: 's', contextId: 'c1', revision: 1, runId: ack.runId! };
    assert.throws(() => calls[0][1].emit({ ...identity, goalRevision: 1, sequence: 1, type: 'completed', text: 'Old assessment', evidenceRefs: [] }), /EVENT_CONTEXT_MISMATCH/);
    assert.throws(() => sessions.control({ ...identity, goalRevision: 1, action: 'cancel' }), /STALE_CONTROL/);
    assert.equal(calls[0][1].signal.aborted, false);
    sessions.control({ ...identity, goalRevision: 2, action: 'cancel' });
    assert.equal(calls[0][1].signal.aborted, true);
  } finally { sessions.close(); }
});
test('goal edits invalidate the previous run and stamp results with the accepted goal revision', async () => {
  const calls: Parameters<ReactiveRunner>[] = [];
  const sessions = new ReactiveSessions(async (...args) => { calls.push(args); await new Promise<void>(resolve => args[1].signal.addEventListener('abort', () => resolve(), { once: true })); });
  try {
    sessions.snapshot(snapshot); await tick();
    const goal = { ...snapshot, revision: 2, userGoal: 'Prepare a team discussion', goalRevision: 1 };
    const ack = sessions.snapshot(goal); await tick();
    assert.equal(ack.goalRevision, 1);
    assert.equal(calls[0][1].signal.aborted, true);
    assert.equal(sessions.events('s')[0].goalRevision, 1);
    assert.equal(sessions.snapshot({ ...goal, revision: 3, userGoal: 'Changed without revision' }).status, 'stale');
    assert.equal(sessions.snapshot({ ...snapshot, revision: 3 }).status, 'stale');
    assert.equal(sessions.snapshot({ ...goal, revision: 3, goalRevision: 2, userGoal: '' }).status, 'accepted');
  } finally { sessions.close(); }
});
test('a new conversation turn on an unchanged page runs once and supersedes the previous turn', async () => {
  const calls: Parameters<ReactiveRunner>[] = [];
  const sessions = new ReactiveSessions(async (...args) => { calls.push(args); await new Promise<void>(resolve => args[1].signal.addEventListener('abort', () => resolve(), { once: true })); });
  try {
    sessions.snapshot(snapshot); await tick();
    const turn = { ...snapshot, revision: 2, conversation: { messageId: 'm1', userMessage: 'Send this profile to Slack', history: [] } };
    assert.equal(sessions.snapshot(turn).status, 'accepted'); await tick();
    assert.equal(calls.length, 2);
    assert.equal(calls[0][1].signal.aborted, true);
    assert.equal(calls[1][0].conversation?.userMessage, turn.conversation.userMessage);
    assert.equal(sessions.snapshot(turn).status, 'unchanged');
    assert.equal(sessions.snapshot({ ...turn, revision: 3 }).status, 'unchanged');
    assert.equal(sessions.snapshot({ ...turn, revision: 3, conversation: { ...turn.conversation, messageId: 'm2', userMessage: 'First prepare the message' } }).status, 'accepted');
    await tick(); assert.equal(calls.length, 3);
  } finally { sessions.close(); }
});
test('navigation aborts previous run and ignores its late output; duplicate content does not infer twice', async () => {
  const calls: Parameters<ReactiveRunner>[] = [];
  const sessions = new ReactiveSessions(async (...args) => { calls.push(args); await new Promise<void>(resolve => args[1].signal.addEventListener('abort', () => resolve(), { once: true })); });
  try {
    sessions.snapshot(snapshot); await tick();
    assert.equal(sessions.snapshot({ ...snapshot, snapshot: { ...snapshot.snapshot, capturedAt: '2026-09-12T01:00:00Z' } }).status, 'unchanged');
    sessions.snapshot({ ...snapshot, revision: 2, contextId: 'c2', snapshot: { ...snapshot.snapshot, mainText: 'Page two' } }); await tick();
    assert.equal(calls.length, 2); assert.equal(calls[0][1].signal.aborted, true);
    calls[0][1].emit({ ...snapshot, runId: calls[0][1].runId, sequence: 1, type: 'message_delta', text: 'Late' });
    assert.equal(sessions.events('s').some(e => e.type === 'message_delta'), false);
    assert.equal(sessions.snapshot(snapshot).status, 'stale');
  } finally { sessions.close(); }
});
test('pause cancels and prevents inference until resumed; invalid control cannot cancel another run', async () => {
  let signal: AbortSignal | undefined;
  const sessions = new ReactiveSessions(async (_r, options) => { signal = options.signal; await new Promise<void>(resolve => options.signal.addEventListener('abort', () => resolve(), { once: true })); });
  try {
    const ack = sessions.snapshot(snapshot); await tick();
    assert.throws(() => sessions.control({ ...snapshot, snapshot: undefined, action: 'cancel', runId: ack.runId }));
    sessions.control({ schemaVersion: 'reactive-v1', sessionId: 's', action: 'pause' });
    assert.equal(signal?.aborted, true);
    assert.equal(sessions.snapshot({ ...snapshot, revision: 2 }).status, 'paused');
    sessions.control({ schemaVersion: 'reactive-v1', sessionId: 's', action: 'resume' });
    assert.equal(sessions.snapshot({ ...snapshot, revision: 2 }).status, 'accepted');
  } finally { sessions.close(); }
});
test('unbacked evidence fails safely and provider errors never leak', async () => {
  const sessions = new ReactiveSessions(async (request, { runId, emit }) => { emit({ schemaVersion: 'reactive-v1', sessionId: request.sessionId, contextId: request.contextId, revision: request.revision, runId, sequence: 9, type: 'completed', text: 'Unsupported', evidenceRefs: ['invented'] }); });
  try {
    sessions.snapshot(snapshot); await tick();
    const events = sessions.events('s');
    assert.deepEqual(events.map(e => e.type), ['started', 'error']);
    assert.equal(events[1].sequence, 1);
  } finally { sessions.close(); }
});
