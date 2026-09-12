import test from 'node:test';
import assert from 'node:assert/strict';
import { configuredWorkspaceConversation } from './workspace-conversation.js';
import type { WorkspaceActions } from '../workspace/index.js';
import type { ReviewedAction, CommitResult } from '../workspace/model.js';
import type { ReactiveRunner } from '../routes/reactive.js';
import type { ReactiveEvent, ReactiveSnapshotRequest } from '@agentlayer/contracts/reactive-v1';

const request: ReactiveSnapshotRequest = { schemaVersion: 'reactive-v1', sessionId: 'session', contextId: 'context', revision: 1,
  goalRevision: 1, userGoal: 'Save this contact and a follow-up',
  snapshot: { url: 'https://example.org/person', pageTitle: 'Fixture', capturedAt: new Date().toISOString(), mainText: 'Fixture person', selectedText: '', extractedEvidence: [] },
  conversation: { messageId: 'message', userMessage: 'Save this contact and a follow-up', history: [] } };
const contactId = '11111111-1111-4111-8111-111111111111';

function harness(unknown = false, totalOperations = 2) {
  const writes: ReviewedAction[] = [];
  const saved = new Map<string, CommitResult>();
  const actions = { async commitReviewedAction(action: ReviewedAction) {
    if (saved.has(action.requestId)) return saved.get(action.requestId)!;
    writes.push(action);
    const kind = action.actionKind === 'create_contact' ? 'contact' : 'task';
    const result: CommitResult = { requestId: action.requestId, contextId: action.contextId, status: unknown ? 'unknown' : 'succeeded',
      operations: [{ kind, status: unknown ? 'unknown' : 'succeeded', id: unknown ? null : contactId,
        url: unknown ? null : `https://workspace.example/${kind}`, errorCode: null, retryable: false }], warnings: [] };
    saved.set(action.requestId, result); return result;
  } } as unknown as WorkspaceActions;
  const configured = configuredWorkspaceConversation({ AMBIGUOUS_API_KEY: 'fixture', AMBIGUOUS_WORKSPACE_ID: 'fixture' }, true, { actions })!;
  const runner: ReactiveRunner = async (input, options) => {
    const tools = configured.factory(input);
    const results = tools?.results as Array<{ toolName: string; operations: Array<{ id: string }> }> | undefined;
    const count = results?.length ?? 0;
    let reply: { text: string; suggestions: Array<{ id: string; label: string; prompt: string }> } = { text: 'Done.', suggestions: [] };
    if (tools && count < totalOperations) {
      reply = await tools.request(count === 0
        ? { callId: 'model-ignored', toolName: 'ambiguous_create_contact', arguments: { name: 'Fixture Person', role: null, company: null } }
        : { callId: 'model-ignored', toolName: 'ambiguous_create_task', arguments: { title: 'Follow up', description: 'Requested follow-up', dueAt: null, contactId: results![0].operations[0].id } }, [], options.signal);
    }
    options.emit({ schemaVersion: 'reactive-v1', type: 'completed', sessionId: input.sessionId, contextId: input.contextId,
      revision: input.revision, goalRevision: input.goalRevision, runId: options.runId, sequence: 0, ...reply, evidenceRefs: [] });
  };
  const run = async (input = request) => {
    const events: ReactiveEvent[] = [];
    await configured.wrap(runner)(input, { signal: new AbortController().signal, runId: 'run', emit: event => events.push(event) });
    return events;
  };
  return { writes, run };
}

test('one submitted task creates contact and linked task without visible forms or confirmation turns', async () => {
  const { writes, run } = harness();
  const events = await run();
  assert.deepEqual(writes.map(write => write.actionKind), ['create_contact', 'create_task']);
  assert.equal(writes[1].reviewedPayload.task?.contactId, contactId);
  const completions = events.filter(event => event.type === 'completed');
  assert.equal(completions.length, 1);
  assert.match(completions[0].text, /Contact: saved/);
  assert.match(completions[0].text, /Task: saved/);
  assert.doesNotMatch(completions[0].text, /Save contact in|Name:|Confirm workspace/);
  assert.deepEqual(events.map(event => event.sequence), events.map((_, index) => index));
  await run();
  assert.equal(writes.length, 2, 'retry uses retained results instead of creating duplicate records');
});

test('passive page observations cannot create workspace records', async () => {
  const { writes, run } = harness();
  await run({ ...request, conversation: undefined });
  assert.equal(writes.length, 0);
});

test('long tasks stop at three writes and one Continue action resumes without payload forms', async () => {
  const { writes, run } = harness(false, 5);
  const events = await run();
  assert.equal(writes.length, 3);
  const final = events.at(-1);
  if (final?.type !== 'completed') throw new Error('Missing continuation');
  assert.doesNotMatch(final.text, /Save task in Ambiguous|Description:/);
  assert.equal(final.suggestions?.[0].label, 'Continue task');
  await run({ ...request, conversation: { ...request.conversation!, messageId: 'continued', userMessage: final.suggestions![0].prompt } });
  assert.equal(writes.length, 5);
});

test('unknown contact result stops the task and retries retain the same write identity', async () => {
  const { writes, run } = harness(true);
  const events = await run();
  assert.equal(writes.length, 1);
  const final = events.at(-1);
  assert.equal(final?.type, 'completed');
  if (final?.type !== 'completed') throw new Error('Missing result');
  assert.match(final.text, /outcome unknown/);
  const retry = final.suggestions?.[0].prompt;
  assert.ok(retry);
  await run({ ...request, conversation: { ...request.conversation!, userMessage: retry, messageId: 'retry' } });
  assert.equal(writes.length, 1);
});
