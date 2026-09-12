/** Real installed Codex catalog probe. Never calls a provider or an MCP tool. */
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CodexStdio, findCodexExecutable } from '../research/codex.js';

export type McpIsolationInput = { url: string; token: string; toolNames: string[] };
export const runtimeMcpFeatureConfig = {
  'features.code_mode': { enabled: true, direct_only_tool_namespaces: ['mcp__agentlayer_runtime'], excluded_tool_namespaces: ['functions', 'skills'] },
  'features.code_mode_host': true,
  'features.skip_host_skill_discovery': true,
  'features.skill_mcp_dependency_install': false,
};
async function configHash(): Promise<string> {
  try { return createHash('sha256').update(await readFile(join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'config.toml'))).digest('hex'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'absent'; throw error; }
}
async function initialize(client: CodexStdio) {
  await client.request('initialize', { clientInfo: { name: 'agentlayer_mcp_isolation_probe', version: '0.1' }, capabilities: { experimentalApi: true } });
  client.send({ method: 'initialized', params: {} });
}

export async function probeRuntimeMcp(input: McpIsolationInput) {
  return runProbe(input, false);
}
async function runProbe(input: McpIsolationInput, dispatchLocalFixture: boolean) {
  const before = await configHash();
  const notifications = new Set<string>();
  let catalog: Array<{ type?: string; name?: string }> | undefined;
  let modelRequests = 0;
  let requestSeen!: () => void;
  const modelRequest = new Promise<void>(resolve => { requestSeen = resolve; });
  const model = createServer(async (req, res) => {
    if (req.method !== 'POST') { res.writeHead(404); res.end(); return; }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString()) as { tools?: Array<{ type?: string; name?: string }> };
    modelRequests++;
    if (!catalog) catalog = body.tools ?? (body as any).input?.filter((item: any) => item.type === 'additional_tools').flatMap((item: any) => item.tools) ?? [];
    if (dispatchLocalFixture && modelRequests === 1) {
      const call = { type: 'function_call', id: 'fc_probe', call_id: 'call_probe', name: 'exa_search', namespace: 'mcp__agentlayer_runtime', arguments: '{"query":"protocol fixture only"}', status: 'completed' };
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      for (const event of [
        { type: 'response.created', response: { id: 'resp_probe', status: 'in_progress', output: [] } },
        { type: 'response.output_item.added', output_index: 0, item: { ...call, status: 'in_progress' } },
        { type: 'response.output_item.done', output_index: 0, item: call },
        { type: 'response.completed', response: { id: 'resp_probe', status: 'completed', output: [call], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } },
      ]) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      res.end(); return;
    }
    requestSeen();
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end('{"error":{"message":"intentional local catalog probe stop"}}');
  });
  await new Promise<void>(resolve => model.listen(0, '127.0.0.1', resolve));
  const port = (model.address() as { port: number }).port;
  let client: CodexStdio | undefined;
  let timer: NodeJS.Timeout | undefined;
  try {
    client = new CodexStdio(findCodexExecutable(), tmpdir());
    await initialize(client);
    const baseline = await client.request('config/read', { includeLayers: false });
    const inherited = Object.keys(baseline.config?.mcp_servers ?? {});
    await client.close();
    const disabled = Object.fromEntries(inherited.filter(name => name !== 'agentlayer_runtime').map(name => [`mcp_servers.${name}.enabled`, false]));
    client = new CodexStdio(findCodexExecutable(), tmpdir(), {
      ...disabled, ...runtimeMcpFeatureConfig,
      'mcp_servers.agentlayer_runtime': { url: input.url, bearer_token_env_var: 'AGENTLAYER_RUNTIME_MCP_TOKEN', enabled: true, enabled_tools: input.toolNames, default_tools_approval_mode: 'auto', startup_timeout_sec: 10, tool_timeout_sec: 10 },
      model_provider: 'agentlayer_local_catalog',
      'model_providers.agentlayer_local_catalog': { name: 'Local catalog probe', base_url: `http://127.0.0.1:${port}/v1`, wire_api: 'responses', requires_openai_auth: false, request_max_retries: 0 },
    }, { AGENTLAYER_RUNTIME_MCP_TOKEN: input.token });
    client.onNotification = message => {
      if (message.method) notifications.add(message.method);
      if (message.method === 'mcpServer/startupStatus/updated') notifications.add(`mcp:${message.params?.name}:${message.params?.status}`);
      if (message.params?.item?.type) notifications.add(`item:${message.params.item.type}`);
      if (message.params?.item?.type === 'mcpToolCall') notifications.add(`mcpToolCall:${message.params.item.server}:${message.params.item.tool}:${message.params.item.status}`);
      if (message.params?.item?.type === 'mcpToolCall' && message.params.item.error) notifications.add(`mcpError:${JSON.stringify(message.params.item.error)}`);
    };
    await initialize(client);
    const effective = await client.request('config/read', { includeLayers: false });
    const activeServers = Object.entries(effective.config?.mcp_servers ?? {}).filter(([, entry]) => (entry as { enabled?: boolean }).enabled !== false).map(([name]) => name);
    if (activeServers.length !== 1 || activeServers[0] !== 'agentlayer_runtime') throw new Error('MCP_ISOLATION_FAILED');
    const thread = await client.request('thread/start', { model: 'gpt-5.6-terra', environments: [], dynamicTools: [], selectedCapabilityRoots: [], cwd: tmpdir(), ephemeral: true, sandbox: 'read-only', approvalPolicy: 'never', baseInstructions: 'Read the sentence. Do not invoke any tool.' });
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('MCP_CATALOG_TIMEOUT')), 25000); });
    await client.request('turn/start', { threadId: thread.thread.id, environments: [], input: [{ type: 'text', text: 'Library opens at nine.', text_elements: [] }] });
    await Promise.race([modelRequest, deadline]);
    const names = (catalog ?? []).flatMap((tool: any) => tool.type === 'namespace' ? tool.tools.map((nested: any) => `${tool.name}__${nested.name}`) : [tool.name ?? tool.type ?? 'unknown']);
    const expected = [...input.toolNames.map(name => `mcp__agentlayer_runtime__${name}`), 'functions__exec', 'functions__wait'];
    const descriptions = JSON.stringify(catalog);
    if (descriptions.includes('declare const tools:')) throw new Error(`UNEXPECTED_NESTED_TOOLS:${JSON.stringify([...descriptions.matchAll(/### `([^`]+)`/g)].map(match => match[1]))}`);
    if (names.length !== expected.length || expected.some(name => !names.includes(name))) throw new Error(`UNEXPECTED_TOOL_CATALOG:${JSON.stringify({ names, notifications: [...notifications] })}`);
    const after = await configHash();
    if (after !== before) throw new Error('GLOBAL_CONFIG_CHANGED_DURING_PROBE');
    if (dispatchLocalFixture && ![...notifications].some(name => name === 'mcpToolCall:agentlayer_runtime:exa_search:completed')) throw new Error(`MCP_DISPATCH_NOT_CONFIRMED:${JSON.stringify([...notifications])}`);
    return { activeServers, inheritedServersDisabled: inherited.length, toolNames: names, notifications: [...notifications], configHashBefore: before, configHashAfter: after, globalConfigUnchanged: true, liveCodex: true, liveProviderCalls: false, mcpToolCalls: dispatchLocalFixture, modelRequests };
  } finally {
    if (timer) clearTimeout(timer);
    await client?.close();
    model.closeAllConnections();
    await new Promise<void>(resolve => model.close(() => resolve()));
    if (await configHash() !== before) throw new Error('GLOBAL_CONFIG_CHANGED_DURING_PROBE');
  }
}

// A protocol-only fixture exercises initialize/list without credentials or external requests.
// It is not a substitute LinkedIn page or product acceptance evidence.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const token = randomBytes(24).toString('hex');
  const methods: string[] = [];
  const fixture = createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401); res.end(); return; }
    if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const message = JSON.parse(Buffer.concat(chunks).toString()); methods.push(message.method);
    if (message.id === undefined) { res.writeHead(202); res.end(); return; }
    const result = message.method === 'initialize'
      ? { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'agentlayer-isolation-fixture', version: '1' } }
      : message.method === 'tools/list'
        ? { tools: [{ name: 'exa_search', description: 'Read-only research catalog fixture.', annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true }, inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }] }
        : message.method === 'tools/call' ? { content: [{ type: 'text', text: 'Local protocol fixture result. No external search occurred.' }] } : {};
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
  });
  await new Promise<void>(resolve => fixture.listen(0, '127.0.0.1', resolve));
  try {
    const result = await runProbe({ url: `http://127.0.0.1:${(fixture.address() as { port: number }).port}/mcp`, token, toolNames: ['exa_search'] }, process.argv.includes('--dispatch'));
    console.log(JSON.stringify({ ...result, mcpMethods: methods }, null, 2));
  } finally { fixture.closeAllConnections(); await new Promise<void>(resolve => fixture.close(() => resolve())); }
}
