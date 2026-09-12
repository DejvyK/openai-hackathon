# Project runtime MCP isolation probe

Verified on 2026-09-13 using installed Codex CLI 0.153.2 and model metadata for `gpt-5.6-terra`. This is local protocol/catalog evidence, not live LinkedIn or external Exa evidence.

Commands from repository root:

```powershell
node --import tsx apps/api/src/mcp/isolation.probe.ts
node --import tsx apps/api/src/mcp/isolation.probe.ts --dispatch
```

The default command starts a localhost MCP protocol fixture and local mock model endpoint. It performs actual Codex MCP initialize/list and captures the outgoing model tool catalog. `--dispatch` additionally returns a synthetic model function call and verifies that real Codex executes exactly the local fixture tool and sends its result back to the mock model endpoint. Neither command calls external providers, sends Slack messages, writes workspace records, or changes global config/auth.

`probeRuntimeMcp({ url, token, toolNames })` is reusable against the runtime's actual MCP endpoint for initialize/list/catalog only. Credentials go through a transient child environment variable, `AGENTLAYER_RUNTIME_MCP_TOKEN`, referenced with `bearer_token_env_var`. No credentials appear in CLI arguments or output.

## Verified isolation

- All four inherited MCP servers were disabled in child-process CLI config. Only `agentlayer_runtime` remained enabled.
- Global config SHA-256 before and after every successful final probe matched: `b3cb16c48675be56eb24cc8eb65a33042f32337ef6f09cbb776cdd88ecdd176f`.
- Actual catalog contained `functions.exec`, `functions.wait`, and `mcp__agentlayer_runtime.exa_search` only.
- The code-mode wrapper contained zero nested tool declarations. No shell, browser, resource-reading, host-skill, or other MCP tools were exposed.
- `selectedCapabilityRoots: []`, ephemeral thread, read-only sandbox and `approvalPolicy: never` remained in place.

## Required runtime configuration findings

Modern model metadata marks `gpt-5.6-terra` as `code_mode_only`. Disabling the code-mode host makes its tools unavailable. The verified minimal feature overrides are exported as `runtimeMcpFeatureConfig` from the probe:

```ts
{
  'features.code_mode': {
    enabled: true,
    direct_only_tool_namespaces: ['mcp__agentlayer_runtime'],
    excluded_tool_namespaces: ['functions', 'skills'],
  },
  'features.code_mode_host': true,
  'features.skip_host_skill_discovery': true,
  'features.skill_mcp_dependency_install': false,
}
```

The MCP namespace is direct; the otherwise empty code-mode exec/wait wrappers still exist. Excluding `functions` removes the generic MCP resource tools from the nested registry; excluding `skills` removes host skill tooling. Setting `tools.skills.enabled=false` or individual generic-resource `enabled=false` did not remove those nested capabilities and is not a sufficient isolation mechanism.

Responses Lite exposes its catalog in `input[type=additional_tools].tools`, not necessarily top-level `tools`. The probe handles both shapes and flattens namespaces. Checking only `body.tools` falsely reports zero tools.

## Native dispatch

The read-only fixture needs `default_tools_approval_mode: 'auto'` and honest tool annotations (`readOnlyHint: true`, `destructiveHint: false`; `openWorldHint: true` also passed). Unannotated tools were rejected under `approvalPolicy: never`. This is not blanket authorization for write operations: the production integration must preserve its application-level review and authorization logic.

The mock response emitted `function_call` with `name: 'exa_search'` and `namespace: 'mcp__agentlayer_runtime'`. The actual app-server notifications used item type `mcpToolCall`, fields `server: 'agentlayer_runtime'`, `tool: 'exa_search'`, and statuses `inProgress` then `completed`.

The passing dispatch observed `initialize`, `notifications/initialized`, `tools/list`, `tools/call`, and two model requests. The second mock model request deliberately returns HTTP 400 to terminate the probe, so its terminal model error is expected and is not a successful live inference claim.

## Legacy catalog regression

The old zero-tool assertion checked only top-level `tools`. Its corrected Responses Lite inspection exposed a functions namespace with exec/wait and nested host-skill tools. The read-only production policy now also excludes `functions` and `skills` namespaces from code mode, while keeping the host disabled. Its installed-CLI regression checks the exact two inert wrappers, no nested tool declarations, no active MCP server and a disabled host. It does not claim zero advertised wrappers.

The installed CLI still injects local skill names/descriptions into model input despite `skip_host_skill_discovery: true`. They are metadata, not callable skill tools; the probe reports their presence rather than hiding this limitation. This does not modify global configuration or give other sessions access to the project MCP.
