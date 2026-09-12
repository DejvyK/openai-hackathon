import assert from 'node:assert/strict';
import { test } from 'node:test';
import { firstValueFrom, toArray } from 'rxjs';
import { SidebarAgentBridge } from '../lib/copilot-agent';
import { PAGE_CONTEXT_DESCRIPTION } from '../lib/sidebar-context';
import { initialReactiveView } from '../lib/reactive-state';
import type { RunAgentInput } from '@ag-ui/core';

const snapshot = { url: 'https://example.org/article', pageTitle: 'Existing article', capturedAt: new Date().toISOString(), mainText: 'Visible evidence', selectedText: '', extractedEvidence: [] };
const context = { snapshot, userGoal: 'Summarize', goalRevision: 2 };
const input: RunAgentInput = { threadId: 'thread-1', runId: 'sdk-run', state: {}, tools: [], forwardedProps: {},
  context: [{ description: PAGE_CONTEXT_DESCRIPTION, value: JSON.stringify(context) }], messages: [{ id: 'user-1', role: 'user', content: 'Explain this page' }] };

test('SDK context reaches background and exactly one matching response completes the run', async () => {
  const bridge = new SidebarAgentBridge();
  const before = { ...initialReactiveView, status: 'completed' as const, sourceUrl: snapshot.url, userGoal: 'Summarize', goalRevision: 2,
    transcript: [{ id: 'before', role: 'assistant' as const, text: 'Previous' }] };
  bridge.publish(before);
  const commands: unknown[] = [];
  bridge.send = command => {
    commands.push(command);
    bridge.publish(before); // Reconnection repeats an old result; it is not this reply.
    bridge.publish({ ...before, transcript: [...before.transcript, { id: 'new', role: 'assistant', text: 'Actual new reply' }] });
  };
  const events = await firstValueFrom(bridge.agent.run(input).pipe(toArray()));
  assert.deepEqual(commands, [{ type: 'conversation', userMessage: 'Explain this page', context }]);
  assert.deepEqual(events.map(event => event.type), ['RUN_STARTED', 'TEXT_MESSAGE_START', 'TEXT_MESSAGE_CONTENT', 'TEXT_MESSAGE_END', 'RUN_FINISHED']);
  bridge.publish(before); assert.equal(commands.length, 1);
});

test('missing registered context cannot trigger any background request', async () => {
  const bridge = new SidebarAgentBridge(); let sent = false;
  bridge.send = () => { sent = true; };
  await assert.rejects(firstValueFrom(bridge.agent.run({ ...input, context: [] }).pipe(toArray())), /context is not ready/);
  assert.equal(sent, false);
});

test('each SDK turn rereads page content before dispatch rather than sending the registered snapshot', async () => {
  const bridge = new SidebarAgentBridge();
  const fresh = { ...snapshot, mainText: 'Reservation now confirmed', capturedAt: new Date().toISOString() };
  let refreshes = 0;
  bridge.refreshContext = registered => { refreshes++; return { ...registered, snapshot: fresh }; };
  bridge.send = command => {
    assert.deepEqual((command as any).context.snapshot, fresh);
    bridge.publish({ ...initialReactiveView, status: 'completed', sourceUrl: fresh.url, goalRevision: 2,
      transcript: [{ id: `reply-${refreshes}`, role: 'assistant', text: 'Read the current confirmation' }] });
  };
  await firstValueFrom(bridge.agent.run(input).pipe(toArray()));
  await firstValueFrom(bridge.agent.run({ ...input, runId: 'second-run' }).pipe(toArray()));
  assert.equal(refreshes, 2);
});

test('navigation and goal changes cancel SDK turns instead of accepting stale output', async () => {
  for (const change of [{ sourceUrl: 'https://example.org/other', goalRevision: 2 }, { sourceUrl: snapshot.url, goalRevision: 3 }]) {
    const bridge = new SidebarAgentBridge();
    bridge.send = () => bridge.publish({ ...initialReactiveView, ...change, status: 'completed', transcript: [{ id: 'stale', role: 'assistant', text: 'Do not show' }] });
    await assert.rejects(firstValueFrom(bridge.agent.run(input).pipe(toArray())), /context/);
  }
});
