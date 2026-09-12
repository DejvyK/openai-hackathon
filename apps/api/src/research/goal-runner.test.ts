import test from 'node:test';
import assert from 'node:assert/strict';
import type { GoalAssessment, ReactiveEvent, ReactiveSnapshotRequest } from '@agentlayer/contracts/reactive-v1';
import { createGoalReactiveRunner, isLinkedInProfile } from './goal-runner.js';
const request: ReactiveSnapshotRequest = { schemaVersion: 'reactive-v1', sessionId: 'session', contextId: 'profile', revision: 3, goalRevision: 2, userGoal: 'Find leadership evidence', snapshot: {
  url: 'https://www.linkedin.com/in/example/', pageTitle: 'Visible profile', capturedAt: '2026-09-12T00:00:00Z', mainText: 'Visible profile information', selectedText: '', extractedEvidence: [],
} };
const assessment: GoalAssessment = { profileUrl: request.snapshot.url, userGoal: request.userGoal!, identityStatus: 'insufficient', identityKind: 'unknown', verdict: 'insufficient_evidence', criteria: ['Leadership'], findings: [], sources: [], unknowns: ['Identity needs verification'] };
function options() { const events: ReactiveEvent[] = []; const controller = new AbortController(); return { events, controller, run: { runId: 'run', signal: controller.signal, emit: (event: ReactiveEvent) => { events.push(event); } } }; }
test('research runs only for an applied goal on an actual LinkedIn profile route', async () => {
  let researchCalls = 0, conversationCalls = 0;
  const runner = createGoalReactiveRunner(async () => { conversationCalls++; }, async () => { researchCalls++; return assessment; });
  await runner({ ...request, userGoal: '' }, options().run);
  await runner({ ...request, snapshot: { ...request.snapshot, url: 'https://example.org/in/person' } }, options().run);
  await runner({ ...request, conversation: { messageId: 'm1', userMessage: 'Explain this', history: [] } }, options().run);
  assert.equal(conversationCalls, 3); assert.equal(researchCalls, 0);
  const { run, events } = options(); await runner(request, run);
  assert.equal(researchCalls, 1); assert.deepEqual(events.map(event => event.type), ['progress', 'completed']);
  const last = events.at(-1); assert.ok(last?.type === 'completed'); assert.deepEqual(last.assessment, assessment);
  assert.equal(last.goalRevision, 2);
  assert.equal(isLinkedInProfile('https://linkedin.com.attacker.org/in/person'), false);
  assert.equal(isLinkedInProfile('http://linkedin.com/in/person'), false);
});
test('missing configuration and wrong-context evidence cannot become successful research', async () => {
  const missing = options(); await createGoalReactiveRunner(undefined)(request, missing.run);
  assert.equal(missing.events[0].type, 'error');
  const mismatch = options(); await createGoalReactiveRunner(undefined, async () => ({ ...assessment, userGoal: 'Different goal' }))(request, mismatch.run);
  assert.deepEqual(mismatch.events.map(event => event.type), ['progress', 'error']);
  const unbacked = options(); await createGoalReactiveRunner(undefined, async () => ({ ...assessment, verdict: 'worth_discussing', identityStatus: 'matched' }))(request, unbacked.run);
  assert.equal(unbacked.events.at(-1)?.type, 'error');
});
test('navigation abort propagates and suppresses late research results', async () => {
  const current = options();
  await createGoalReactiveRunner(undefined, async (_input, { signal }) => { assert.equal(signal, current.controller.signal); current.controller.abort(); return assessment; })(request, current.run);
  assert.deepEqual(current.events.map(event => event.type), ['progress']);
});
test('source passages are stripped from the wire while quoted evidence remains linked', async () => {
  const current = options();
  const sourced = { ...assessment, sources: [{ id: 's1', title: 'Source', url: 'https://example.org/source', retrievedAt: '2026-09-12T00:00:00Z', text: 'A long evidence passage' }], findings: [{ criterion: 'Leadership', text: 'Evidence requires identity verification', stance: 'neutral' as const, sourceIds: ['s1'], quotes: [{ sourceId: 's1', text: 'evidence passage' }] }] };
  await createGoalReactiveRunner(undefined, async () => sourced)(request, current.run);
  const last = current.events.at(-1); assert.ok(last?.type === 'completed');
  assert.equal('text' in last.assessment!.sources[0], false);
  assert.equal(last.assessment!.findings[0].quotes[0].sourceId, 's1');
});
