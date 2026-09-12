import { CodexStdio, findCodexExecutable, createCodexReactiveRunner } from './codex.js';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import type { ReactiveEvent, ReactiveSnapshotRequest } from '@agentlayer/contracts/reactive-v1';

if (process.argv.includes('--frontend')) {
  const runner = createCodexReactiveRunner();
  const events: ReactiveEvent[] = [];
  const started = Date.now();
  const request: ReactiveSnapshotRequest = { schemaVersion: 'reactive-v1', sessionId: 'frontend-probe', contextId: 'library', revision: 1,
    snapshot: { url: 'https://example.com/', pageTitle: 'Library opening hours', capturedAt: new Date().toISOString(), mainText: 'The town library opens Monday to Friday from 9:00 to 17:00. Visitors may borrow books with a library card.', selectedText: '', extractedEvidence: [{ id: 'page-hours', sourceUrl: 'https://example.com/', text: 'Library opens Monday to Friday from 9:00 to 17:00.' }] },
    conversation: { messageId: 'frontend-message', userMessage: 'Show a short sourced summary card and next-step buttons about these opening hours, and prepare a Slack draft for my review. Do not send it.', history: [] },
  };
  await runner(request, { runId: 'frontend-run', signal: new AbortController().signal, emit: event => events.push(event) });
  const completed = events.find(event => event.type === 'completed');
  if (!completed || completed.type !== 'completed' || !completed.frontendIntents?.some(intent => intent.type === 'component') || !completed.frontendIntents.some(intent => intent.type === 'tool' && intent.name === 'prepare_slack_draft')) throw new Error('Live model did not choose requested frontend intents');
  console.log(JSON.stringify({ elapsedMs: Date.now() - started, fixtureSnapshot: true, liveInference: true, frontendExecution: false, events }));
} else if (process.argv.includes('--conversation')) {
  // Existing unit-test snapshot, not a replacement demo page or live LinkedIn evidence.
  const runner = createCodexReactiveRunner();
  const request: ReactiveSnapshotRequest = { schemaVersion: 'reactive-v1', sessionId: 'conversation-probe', contextId: 'simple-page', revision: 1, snapshot: { url: 'https://example.com/', pageTitle: 'Library opening hours', capturedAt: new Date().toISOString(), mainText: 'The town library opens Monday to Friday from 9:00 to 17:00. Visitors may borrow books with a library card.', selectedText: '', extractedEvidence: [] } };
  let reply = '';
  for (const phase of ['initial', 'followup'] as const) {
    const events: ReactiveEvent[] = [];
    const started = Date.now();
    const input = phase === 'initial' ? request : { ...request, conversation: { messageId: 'message-1', userMessage: 'Help me share the opening hours in Slack.', history: [{ role: 'assistant' as const, text: reply }] } };
    await runner(input, { runId: `conversation-${phase}`, signal: new AbortController().signal, emit: event => events.push(event) });
    const completed = events.find(event => event.type === 'completed');
    if (!completed || completed.type !== 'completed' || events.some(event => event.type === 'message_delta')) throw new Error('Conversation did not produce a validated complete reply');
    reply = completed.text;
    console.log(JSON.stringify({ phase, elapsedMs: Date.now() - started, fixtureSnapshot: true, liveInference: true, events }));
  }
} else if (process.argv.includes('--live') || process.argv.includes('--cancel')) {
  const controller = new AbortController();
  const started = Date.now();
  try {
    await createCodexReactiveRunner({ onDiagnostic: event => console.log(JSON.stringify({ diagnostic: event })) })({ schemaVersion: 'reactive-v1', sessionId: 'live-probe', contextId: 'simple-page', revision: 1, snapshot: { url: 'https://example.com/', pageTitle: 'Library opening hours', capturedAt: new Date().toISOString(), mainText: 'The town library opens Monday to Friday from 9:00 to 17:00. Visitors may borrow books with a library card.', selectedText: '', extractedEvidence: [] } }, { runId: 'live-probe-run', signal: controller.signal, emit: e => { console.log(JSON.stringify(e)); if (process.argv.includes('--cancel') && e.type === 'progress') setTimeout(() => controller.abort(), 1000); } });
  } catch (e) { if (!controller.signal.aborted) throw e; console.log(JSON.stringify({ cancelled: true })); }
  console.log(JSON.stringify({ elapsedMs: Date.now() - started }));
} else if (process.argv.includes('--catalog')) {
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST') { res.writeHead(404); res.end(); return; }
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const catalog = [...(body.tools ?? []), ...(body.input ?? []).filter((item: any) => item.type === 'additional_tools').flatMap((item: any) => item.tools ?? [])];
      const toolNames = catalog.flatMap((tool: any) => tool.type === 'namespace' ? tool.tools.map((nested: any) => `${tool.name}__${nested.name}`) : [tool.name ?? tool.type]);
      const skillText = (body.input ?? []).flatMap((item: any) => item.content ?? []).map((content: any) => content.text ?? '').filter((text: string) => text.includes('<skills_instructions>')).join('\n');
      console.log(JSON.stringify({ model: body.model, toolCount: toolNames.length, toolNames, toolCatalog: catalog, toolChoice: body.tool_choice, hostSkillDescriptionsPresent: skillText.length > 0 }));
    } catch { console.log('Non-model request'); }
    res.writeHead(400, { 'content-type': 'application/json' }); res.end('{"error":{"message":"intentional probe stop"}}');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const init = async (c: CodexStdio) => { await c.request('initialize', { clientInfo: { name: 'agentlayer_probe', version: '0.1' }, capabilities: { experimentalApi: true } }); c.send({ method: 'initialized', params: {} }); };
  let c = new CodexStdio(findCodexExecutable(), tmpdir());
  await init(c);
  const config = await c.request('config/read', { includeLayers: false });
  const overrides = Object.fromEntries(Object.keys(config.config?.mcp_servers ?? {}).map(name => [`mcp_servers.${name}.enabled`, false]));
  await c.close();
  c = new CodexStdio(findCodexExecutable(), tmpdir(), { ...overrides, model_provider: 'local_probe', 'model_providers.local_probe': { name: 'Local fixture', base_url: `http://127.0.0.1:${port}/v1`, wire_api: 'responses', requires_openai_auth: false, request_max_retries: 0 } });
  const timer = setTimeout(() => void c.close(), 20000);
  try {
    await init(c);
    const effective = await c.request('config/read', { includeLayers: false });
    console.log(JSON.stringify({ activeMcpServers: Object.entries(effective.config?.mcp_servers ?? {}).filter(([, server]: [string, any]) => server.enabled !== false).map(([name]) => name), codeModeHostEnabled: effective.config?.features?.code_mode_host }));
    const thread = await c.request('thread/start', { model: 'gpt-5.6-terra', environments: [], dynamicTools: [], selectedCapabilityRoots: [], cwd: tmpdir(), ephemeral: true, sandbox: 'read-only', approvalPolicy: 'never', baseInstructions: 'Summarize the text. Never use tools.' });
    console.log(JSON.stringify({ policy: thread.sandbox }));
    const done = new Promise<void>(resolve => { c.onNotification = m => { if (m.method === 'turn/completed') resolve(); }; });
    await c.request('turn/start', { threadId: thread.thread.id, environments: [], input: [{ type: 'text', text: 'Library opens at 9.', text_elements: [] }] });
    await done;
  } finally { clearTimeout(timer); await c.close(); server.close(); }
} else {
  const c = new CodexStdio(findCodexExecutable(), tmpdir());
  const timer = setTimeout(() => void c.close(), 12000);
  try {
    await c.request('initialize', { clientInfo: { name: 'agentlayer_probe', version: '0.1' }, capabilities: { experimentalApi: true } });
    c.send({ method: 'initialized', params: {} });
    const r = await c.request('config/read', { includeLayers: false });
    console.log(JSON.stringify({ mcp: Object.keys(r.config.mcp_servers ?? {}), web: r.config.web_search, features: r.config.features }));
  } finally { clearTimeout(timer); await c.close(); }
}


