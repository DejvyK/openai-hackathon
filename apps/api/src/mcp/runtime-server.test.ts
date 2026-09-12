import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startRuntimeMcp, type RuntimeMcpOptions } from './runtime-server.js';

const base = { schemaVersion: 'reactive-v1' as const, sessionId: 'session', contextId: 'context', revision: 1, snapshot: { url: 'https://www.linkedin.com/in/darth-vader/', pageTitle: 'Profile', capturedAt: '2026-09-13T10:00:00.000Z', mainText: 'Profile content', selectedText: '', extractedEvidence: [] } };
const followup = { ...base, conversation: { messageId: 'message', userMessage: 'Research and prepare a draft', history: [] } };
const source = { id: 'raw', title: 'Evidence', url: 'https://example.org/evidence', retrievedAt: '2026-09-13T10:00:00.000Z', text: 'Evidence passage', author: null, publishedDate: null };
async function connected(options: Partial<RuntimeMcpOptions> = {}) {
  const runtime = await startRuntimeMcp({ request: followup, signal: new AbortController().signal, ...options });
  const client = new Client({ name: 'runtime-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(runtime.url), { requestInit: { headers: { Authorization: `Bearer ${runtime.token}` } } }));
  return { runtime, client, close: async () => { await client.close(); await runtime.close(); } };
}
test('real SDK initialize/list/call: bounded Exa sources and reviewed Slack draft only', async () => {
  let count = 0;
  const { runtime, client, close } = await connected({ searchExa: async () => { count++; return Array.from({ length: 6 }, (_, i) => ({ ...source, url: `https://example.org/${count}/${i}`, text: 'x'.repeat(4000) })); } });
  try {
    const catalog = (await client.listTools()).tools;
    assert.deepEqual(catalog.map(tool => tool.name), ['exa_search', 'prepare_slack_draft']);
    assert.deepEqual(catalog[0].annotations, { readOnlyHint: true, destructiveHint: false, openWorldHint: true });
    assert.deepEqual(catalog[1].annotations, { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true });
    for (let i = 0; i < 2; i++) assert.notEqual((await client.callTool({ name: 'exa_search', arguments: { query: 'evidence', purpose: 'person' } })).isError, true);
    assert.equal((await client.callTool({ name: 'exa_search', arguments: { query: 'evidence', purpose: 'person' } })).isError, true);
    assert.equal(count, 2); assert.equal(runtime.sources().length, 8); assert.equal(runtime.sources()[0].text.length, 3000);
    const text = `Reviewed evidence for ${base.snapshot.url}`;
    assert.equal((await client.callTool({ name: 'prepare_slack_draft', arguments: { text: 'wrong page' } })).isError, true);
    assert.notEqual((await client.callTool({ name: 'prepare_slack_draft', arguments: { text } })).isError, true);
    assert.equal(runtime.slackDraft(), text);
    assert.notEqual((await client.callTool({ name: 'prepare_slack_draft', arguments: { text } })).isError, true);
    assert.equal((await client.callTool({ name: 'prepare_slack_draft', arguments: { text: `${text} changed` } })).isError, true);
  } finally { await close(); }
});

test('MCP replaces stale cached evidence and validates grouped draft citations', async () => {
  const cached = Array.from({ length: 8 }, (_, i) => ({ ...source, id: `exa-${i + 1}`, url: `https://example.org/old-${i}` }));
  let round = 0;
  const setup = await connected({ trustedEvidence: cached, searchExa: async () => {
    round++; return [{ ...source, url: `https://example.org/new-${round}` }, cached[2]];
  } });
  try {
    for (let i = 0; i < 2; i++) assert.notEqual((await setup.client.callTool({ name: 'exa_search', arguments: { query: 'new topic', purpose: 'person' } })).isError, true);
    const sources = setup.runtime.sources();
    assert.equal(sources.length, 8);
    assert.equal(sources.find(s => s.id === 'exa-3')?.url, cached[2].url);
    assert.equal(sources.find(s => s.id === 'exa-9')?.url, 'https://example.org/new-1');
    assert.equal(sources.find(s => s.id === 'exa-10')?.url, 'https://example.org/new-2');
    for (const citation of ['[exa-1]', '[exa-9, exa-99]', '[s99]']) {
      assert.equal((await setup.client.callTool({ name: 'prepare_slack_draft', arguments: { text: `Finding ${citation} ${base.snapshot.url}` } })).isError, true);
      assert.equal(setup.runtime.slackDraft(), undefined);
    }
    const text = `Finding [exa-3, exa-9, exa-10] ${base.snapshot.url}`;
    assert.notEqual((await setup.client.callTool({ name: 'prepare_slack_draft', arguments: { text } })).isError, true);
    assert.equal(setup.runtime.slackDraft(), text);
  } finally { await setup.close(); }
});
test('loopback endpoint denies bearer-less, Origin, and invalid Host requests', async () => {
  const runtime = await startRuntimeMcp({ request: base, signal: new AbortController().signal });
  try {
    assert.equal((await fetch(runtime.url, { method: 'POST' })).status, 401);
    const headers = { Authorization: `Bearer ${runtime.token}` };
    assert.equal((await fetch(runtime.url, { method: 'POST', headers: { ...headers, Origin: 'http://localhost' } })).status, 403);
    const invalidHost = await new Promise<number | undefined>((resolve, reject) => {
      const req = httpRequest(runtime.url, { method: 'POST', headers: { ...headers, Host: 'attacker.example' } }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(invalidHost, 403);
  } finally { await runtime.close(); }
});
test('initial exposes no tools; applied LinkedIn goal followup exposes bound assessor', async () => {
  const initial = await connected({ request: base, searchExa: async () => assert.fail('no search') });
  try { assert.deepEqual((await initial.client.listTools()).tools, []); } finally { await initial.close(); }
  let calls = 0;
  const withGoal = { ...followup, userGoal: 'Find a research collaborator' };
  const goal = await connected({ request: withGoal, assessProfile: async input => {
    calls++; assert.equal(input.snapshot.url, base.snapshot.url); assert.equal(input.userGoal, withGoal.userGoal);
    return { profileUrl: input.snapshot.url, userGoal: input.userGoal, identityKind: 'unknown', identityStatus: 'insufficient', verdict: 'insufficient_evidence', criteria: [], findings: [], unknowns: ['Identity uncertain'], sources: [{ ...source, id: 'exa-1' }] };
  } });
  try {
    const catalog = (await goal.client.listTools()).tools;
    assert.deepEqual(catalog.map(tool => tool.name), ['assess_profile', 'prepare_slack_draft']);
    assert.deepEqual(catalog[0].annotations, { readOnlyHint: true, destructiveHint: false, openWorldHint: true });
    assert.notEqual((await goal.client.callTool({ name: 'assess_profile', arguments: {} })).isError, true);
    assert.equal(goal.runtime.assessment()?.verdict, 'insufficient_evidence');
    assert.equal(goal.runtime.sources()[0].text, source.text);
    assert.equal((await goal.client.callTool({ name: 'assess_profile', arguments: {} })).isError, true);
    assert.equal(calls, 1);
  } finally { await goal.close(); }
});
test('workspace tools preserve callback gate and validate exact schema; raw failures sanitized', async () => {
  let calls = 0;
  const setup = await connected({ workspaceTools: { definitions: () => [{ name: 'ambiguous_create_note', description: 'Prepare note', parameters: { type: 'object', properties: { title: { type: 'string', maxLength: 255 } }, required: ['title'], additionalProperties: false } }], request: async call => {
    calls++; assert.deepEqual(call.arguments, { title: 'Requested note' }); throw new Error('SECRET_PROVIDER_TOKEN');
  } } });
  try {
    const workspaceTool = (await setup.client.listTools()).tools.find(tool => tool.name === 'ambiguous_create_note');
    assert.deepEqual(workspaceTool?.annotations, { readOnlyHint: false, destructiveHint: false, openWorldHint: true });
    assert.equal((await setup.client.callTool({ name: 'ambiguous_create_note', arguments: { title: 'Requested note', authorize: 'true' } })).isError, true);
    assert.equal(calls, 0);
    const failed = await setup.client.callTool({ name: 'ambiguous_create_note', arguments: { title: 'Requested note' } });
    assert.equal(failed.isError, true); assert.equal(calls, 1); assert.ok(!JSON.stringify(failed).includes('SECRET_PROVIDER_TOKEN'));
  } finally { await setup.close(); }
});
test('assessor cannot substitute a different profile or goal', async () => {
  const setup = await connected({ request: { ...followup, userGoal: 'Research collaboration' }, assessProfile: async () => ({ profileUrl: 'https://www.linkedin.com/in/other/', userGoal: 'Research collaboration', identityKind: 'unknown', identityStatus: 'insufficient', verdict: 'insufficient_evidence', criteria: [], findings: [], unknowns: [], sources: [] }) });
  try {
    assert.equal((await setup.client.callTool({ name: 'assess_profile', arguments: {} })).isError, true);
    assert.equal(setup.runtime.assessment(), undefined); assert.deepEqual(setup.runtime.sources(), []);
  } finally { await setup.close(); }
});
test('abort propagates to in-flight callback and closes endpoint without caching late results', async () => {
  const controller = new AbortController();
  let entered!: () => void;
  const entry = new Promise<void>(resolve => { entered = resolve; });
  const setup = await connected({ signal: controller.signal, searchExa: async (_q, _p, { signal }) => {
    entered(); await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true })); return [source];
  } });
  const call = setup.client.callTool({ name: 'exa_search', arguments: { query: 'test', purpose: 'person' } }).catch(() => null);
  await entry; controller.abort(); await call;
  assert.equal(setup.runtime.sources().length, 0);
  await setup.close();
  await assert.rejects(fetch(setup.runtime.url));
});

const calendarInput = { title: 'Booked appointment', description: 'Confirmed booking', location: 'Prague', start: '2026-09-15T10:00:00+02:00', end: '2026-09-15T10:30:00+02:00', timeZone: 'Europe/Prague' };
test('calendar stays unavailable on passive pages with goals and when disconnected', async () => {
  for (const [request, isConnected] of [[{ ...base, userGoal: 'Organize my schedule' }, true], [followup, false]] as const) {
    const setup = await connected({ request, assessProfile: async () => assert.fail('passive research'), calendar: { status: () => ({ configured: true, connected: isConnected }), createEvent: async () => assert.fail('unauthorized create') } });
    try {
      const names = (await setup.client.listTools()).tools.map(tool => tool.name);
      assert.ok(!names.includes('google_calendar_create_event'));
      if (!request.conversation) assert.deepEqual(names, []);
      const denied = setup.client.callTool({ name: 'google_calendar_create_event', arguments: calendarInput });
      if (!request.conversation) await assert.rejects(denied, /Method not found/);
      else assert.equal((await denied).isError, true);
    } finally { await setup.close(); }
  }
});

test('calendar uses validated arguments and stable server operation identity across new message contexts', async () => {
  const calls: { requestId: string; sourceUrl: string }[] = [];
  const calendar: NonNullable<RuntimeMcpOptions['calendar']> = { status: () => ({ configured: true, connected: true }), createEvent: async (input, context) => {
    assert.deepEqual(input, calendarInput); calls.push(context);
    return { status: calls.length === 1 ? 'created' : 'reused', id: 'confirmed-id', url: 'https://calendar.google.com/calendar/event?eid=confirmed' };
  } };
  for (let i = 0; i < 2; i++) {
    const setup = await connected({ request: { ...followup, contextId: `context-${i}`, conversation: { ...followup.conversation, messageId: `message-${i}`, userMessage: 'Add the confirmed appointment to my calendar' } }, calendar });
    try {
      const definition = (await setup.client.listTools()).tools.find(tool => tool.name === 'google_calendar_create_event');
      assert.ok(definition);
      assert.equal((await setup.client.callTool({ name: definition.name, arguments: { ...calendarInput, requestId: 'model-id' } })).isError, true);
      assert.equal((await setup.client.callTool({ name: definition.name, arguments: { ...calendarInput, end: calendarInput.start } })).isError, true);
      const result = await setup.client.callTool({ name: definition.name, arguments: calendarInput });
      assert.notEqual(result.isError, true);
      assert.match(JSON.stringify(result), /confirmed-id/);
    } finally { await setup.close(); }
  }
  assert.equal(calls.length, 2); assert.equal(calls[0].requestId, calls[1].requestId);
  assert.match(calls[0].requestId, /^calendar-[a-f0-9]{64}$/); assert.equal(calls[0].sourceUrl, base.snapshot.url);
});

test('uncertain calendar result stops subsequent writes and sanitizes provider errors', async () => {
  let calls = 0;
  const setup = await connected({ calendar: { status: () => ({ configured: true, connected: true }), createEvent: async () => { calls++; throw new Error('SECRET_TOKEN uncertain response'); } } });
  try {
    for (const input of [calendarInput, { ...calendarInput, title: 'Retry new wording' }]) {
      const result = await setup.client.callTool({ name: 'google_calendar_create_event', arguments: input });
      assert.equal(result.isError, true); assert.ok(!JSON.stringify(result).includes('SECRET_TOKEN'));
    }
    assert.equal(calls, 1);
  } finally { await setup.close(); }
});
