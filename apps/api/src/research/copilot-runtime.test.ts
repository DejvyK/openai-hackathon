import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { ReactiveEvent } from '@agentlayer/contracts/reactive-v1';
import { createCopilotReactiveBridge } from './copilot-runtime.js';

const request = { schemaVersion: 'reactive-v1' as const, sessionId: 'copilot-test', contextId: 'library', revision: 1, snapshot: { url: 'https://example.com/', pageTitle: 'Library hours', capturedAt: new Date().toISOString(), mainText: 'The library opens Monday to Friday from 9:00 to 17:00.', selectedText: '', extractedEvidence: [] } };
const base = { schemaVersion: 'reactive-v1' as const, sessionId: request.sessionId, contextId: request.contextId, revision: 1, sequence: 0 };

test('actual CopilotKit runtime round trip preserves structured reactive result and sourced options', async () => {
  let invoked = 0; const result: ReactiveEvent[] = [];
  const bridge = createCopilotReactiveBridge(async (input, options) => {
    invoked++; assert.deepEqual(input, request);
    options.emit({ ...base, runId: options.runId, type: 'progress', message: 'Looking up sources' });
    options.emit({ ...base, sequence: 1, runId: options.runId, type: 'completed', text: 'What would you like to do?', evidenceRefs: [], suggestions: [{ id: 'research', label: 'Research with Exa', prompt: 'Research this with Exa' }] });
  });
  assert.equal((await bridge.inspect()).credentialStatus, 'not_configured');
  await bridge.runner(request, { runId: randomUUID(), signal: new AbortController().signal, emit: event => result.push(event) });
  assert.equal(invoked, 1); assert.deepEqual(result.map(event => event.type), ['progress', 'completed']);
  assert.equal(result[1].type === 'completed' && result[1].suggestions?.[0].id, 'research');
  bridge.close();
});

test('CopilotKit cancellation reaches underlying agent and suppresses late output', async () => {
  const controller = new AbortController(); let aborted = false; const result: ReactiveEvent[] = [];
  const bridge = createCopilotReactiveBridge(async (_input, options) => {
    await new Promise<void>(resolve => options.signal.addEventListener('abort', () => { aborted = true; resolve(); }, { once: true }));
    options.emit({ ...base, runId: options.runId, type: 'completed', text: 'stale', evidenceRefs: [] });
  });
  const pending = bridge.runner({ ...request, sessionId: 'cancel-test' }, { runId: randomUUID(), signal: controller.signal, emit: event => result.push(event) });
  setTimeout(() => controller.abort(), 50);
  await pending.catch(error => { assert.equal(error.name, 'AbortError'); });
  assert.equal(aborted, true); assert.deepEqual(result, []); bridge.close();
});

test('CopilotKit rejects output for another context and never executes pre-cancelled requests', async () => {
  let invoked = 0;
  const bridge = createCopilotReactiveBridge(async (_input, options) => {
    invoked++; options.emit({ ...base, contextId: 'wrong-page', runId: options.runId, type: 'completed', text: 'wrong', evidenceRefs: [] });
  });
  await assert.rejects(bridge.runner(request, { runId: randomUUID(), signal: new AbortController().signal, emit: () => assert.fail('wrong-context output') }), /COPILOT_RUN_FAILED/);
  const controller = new AbortController(); controller.abort();
  await bridge.runner(request, { runId: randomUUID(), signal: controller.signal, emit: () => assert.fail('cancelled output') });
  assert.equal(invoked, 1); bridge.close();
});

test('same-page conversation turns use their current context and retain the original runner closure', async () => {
  const contexts: string[] = [];
  const bridge = createCopilotReactiveBridge(async (input, options) => {
    contexts.push(input.contextId);
    options.emit({ ...base, contextId: input.contextId, revision: input.revision, runId: options.runId, type: 'completed', text: `turn ${contexts.length}`, evidenceRefs: [] });
  });
  for (let turn = 1; turn <= 2; turn++) {
    const events: ReactiveEvent[] = [];
    await bridge.runner({ ...request, sessionId: request.sessionId, contextId: `turn-${turn}`, revision: turn }, { runId: randomUUID(), signal: new AbortController().signal, emit: event => events.push(event) });
    assert.equal(events[0].type === 'completed' && events[0].text, `turn ${turn}`);
  }
  assert.deepEqual(contexts, ['turn-1', 'turn-2']); bridge.close();
});

test('completed publishes after cleanup so a synchronous next-turn request can reuse the thread', async () => {
  let firstCleanedUp = false;
  const calls: string[] = [];
  const bridge = createCopilotReactiveBridge(async (input, options) => {
    calls.push(input.contextId);
    if (input.contextId === 'second') assert.equal(firstCleanedUp, true);
    options.emit({ ...base, sessionId: input.sessionId, contextId: input.contextId, revision: input.revision, runId: options.runId, type: 'completed', text: input.contextId, evidenceRefs: [] });
    if (input.contextId === 'first') {
      await new Promise(resolve => setTimeout(resolve, 40));
      firstCleanedUp = true;
    }
  });
  const input = { ...request, sessionId: randomUUID(), contextId: 'first' };
  let second: Promise<void> | undefined;
  const replies: string[] = [];
  await bridge.runner(input, { runId: randomUUID(), signal: new AbortController().signal, emit: event => {
    if (event.type !== 'completed') return;
    assert.equal(firstCleanedUp, true);
    replies.push(event.text);
    second = bridge.runner({ ...input, contextId: 'second', revision: 2 }, { runId: randomUUID(), signal: new AbortController().signal, emit: next => { if (next.type === 'completed') replies.push(next.text); } });
  } });
  assert.ok(second); await second;
  assert.deepEqual(calls, ['first', 'second']); assert.deepEqual(replies, ['first', 'second']); bridge.close();
});

test('CopilotKit carries passive suggestions and a followup native Calendar result without passive writes', async () => {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
  const { startRuntimeMcp } = await import('../mcp/runtime-server.js');
  const { validateNativeMcpReply } = await import('./codex.js');
  const eventUrl = 'https://calendar.google.com/calendar/event?eid=local-fixture';
  const eventInput = { title: 'Library workshop', description: 'Workshop confirmed in this local fixture', location: 'Library', start: '2026-09-15T10:00:00+02:00', end: '2026-09-15T11:00:00+02:00', timeZone: 'Europe/Prague' };
  let writes = 0;
  const seenPages: string[] = [];
  // The scripted runner substitutes only model inference and the external provider.
  // CopilotKit streaming, native MCP SDK dispatch and reply validation are real.
  const bridge = createCopilotReactiveBridge(async (input, options) => {
    seenPages.push(input.snapshot.mainText);
    const mcp = await startRuntimeMcp({ request: input, signal: options.signal, calendar: {
      status: () => ({ configured: true, connected: true }),
      createEvent: async (event, context) => {
        writes++; assert.deepEqual(event, eventInput); assert.equal(context.sourceUrl, input.snapshot.url);
        assert.match(context.requestId, /^calendar-[a-f0-9]{64}$/);
        return { status: 'created', id: 'confirmed-fixture-id', url: eventUrl };
      },
    } });
    const client = new Client({ name: 'copilot-calendar-integration-test', version: '1.0.0' });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(mcp.url), { requestInit: { headers: { Authorization: `Bearer ${mcp.token}` } } }));
      let text = 'Add the confirmed workshop to your calendar?';
      let suggestions = [{ id: 'calendar', label: 'Add to calendar', prompt: 'Add this confirmed workshop to my Google Calendar' }];
      if (!input.conversation) {
        assert.deepEqual((await client.listTools()).tools, []);
        assert.equal(writes, 0);
      } else {
        assert.ok(input.snapshot.mainText.includes('10:00-11:00'));
        const tool = await client.callTool({ name: 'google_calendar_create_event', arguments: eventInput });
        assert.notEqual(tool.isError, true);
        const block = (tool.content as { type: string; text?: string }[]).find(item => item.type === 'text');
        const confirmed = JSON.parse(block!.text!);
        assert.equal(confirmed.id, 'confirmed-fixture-id');
        text = `Added [${eventInput.title}](${confirmed.url}) to Google Calendar.`; suggestions = [];
      }
      const { trustedEvidence: _, ...reply } = await validateNativeMcpReply(input, JSON.stringify({ text, suggestions }), mcp, options.signal);
      options.emit({ schemaVersion: 'reactive-v1', sessionId: input.sessionId, contextId: input.contextId, revision: input.revision, runId: options.runId, sequence: 0, type: 'completed', ...reply });
    } finally { await client.close(); await mcp.close(); }
  });
  try {
    const initial = { ...request, sessionId: randomUUID(), userGoal: 'Organize my schedule' };
    const passive: ReactiveEvent[] = [];
    await bridge.runner(initial, { runId: randomUUID(), signal: new AbortController().signal, emit: event => passive.push(event) });
    assert.equal(writes, 0);
    assert.equal(passive[0].type === 'completed' && passive[0].suggestions?.[0].id, 'calendar');
    const followup: ReactiveEvent[] = [];
    const freshText = 'Local integration fixture: library workshop confirmed September 15, 2026, 10:00-11:00 Europe/Prague.';
    await bridge.runner({ ...initial, contextId: 'fresh-workshop', revision: 2, snapshot: { ...initial.snapshot, mainText: freshText }, conversation: { messageId: 'accepted-calendar', userMessage: 'Add this confirmed workshop to my Google Calendar', history: [] } }, { runId: randomUUID(), signal: new AbortController().signal, emit: event => followup.push(event) });
    assert.equal(writes, 1);
    assert.deepEqual(seenPages, [request.snapshot.mainText, freshText]);
    assert.equal(followup[0].type, 'completed');
    assert.ok(followup[0].type === 'completed' && followup[0].text.includes(eventUrl));
  } finally { bridge.close(); }
});
