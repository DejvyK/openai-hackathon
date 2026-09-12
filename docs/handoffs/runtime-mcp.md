# Run-scoped AgentLayer MCP bridge

## Connected runtime (2026-09-13)

The project API now defaults to native MCP for its background Codex children. This is a process-scoped connection, not a global `codex mcp add` registration and not a tool added to every interactive Codex session. `configuredCodex` starts the endpoint, disables inherited MCP servers in that child, applies the exact tool allowlist, and passes its ephemeral bearer through the child environment. Completion/cancellation closes both child and endpoint. Existing Codex login is reused; this is tool isolation, not a separate OS account or identity sandbox.

No global configuration was written. Global `config.toml` SHA-256 before and after matched `b3cb16c48675be56eb24cc8eb65a33042f32337ef6f09cbb776cdd88ecdd176f`. Installed CLI 0.153.2 is pinned by runtime verification. Its inert code-mode wrappers and inherited skill descriptions can still appear, but the verified catalog provides no nested ambient capabilities; see [isolation evidence](mcp-isolation-probe.md).

Provider secrets stay in the project API environment. Exa and Ambiguous credentials are present locally; this change does not duplicate them into Codex configuration. Exa is live-verified. Ambiguous tools reuse the existing application authorization and persistence callbacks; no new live workspace record was created to test this connection. Slack sending remains unavailable until `SLACK_BOT_TOKEN`, `SLACK_TEAM_ID`, and `SLACK_CHANNEL_ID` are configured. Draft preparation needs no Slack credentials.

The local API was started on `127.0.0.1:4318` in live mode and `/ready` returned `status: ready`, `mode: live`. Readiness deliberately reports `inferenceVerified: false`: it is not itself an inference test. To start the same mode from the repository root in PowerShell:

```powershell
$env:AGENTLAYER_MODE = 'live'
npm run start -w @agentlayer/api
```

`AGENTLAYER_MCP_ENABLED` defaults to enabled; `0` explicitly selects the legacy rollback. No persistent project mode or global environment variable was changed by the launch command.

### Acceptance evidence

- `npm test -w @agentlayer/api`: 138/138 passed.
- API typecheck and build passed.
- `npm run probe:mcp -w @agentlayer/api`: repeatable local native-dispatch/isolation check with a mock model endpoint.
- `npm run probe:mcp:live -w @agentlayer/api`: actual Codex selected `exa_search`, received four real sources, then selected `prepare_slack_draft`; final result included those sources and the exact user-provided profile URL. No message or record was sent. [Live attempts and successful result](native-mcp-live.json) retain failures as well as success; one provider attempt returned no verified evidence. An earlier probe also failed to save its result because of a corrected output-path error.
- The live check used the supplied William Bryk URL, not browser-extracted LinkedIn DOM. Browser/profile acceptance remains separate.

### Adding a tool

Add a server-side provider adapter and a typed callback; register the narrowly scoped tool in `runtime-server.ts` with validated arguments, truthful annotations, source handling, limits and cancellation. Include it in the context-derived `toolNames` list. That list automatically becomes the child Codex allowlist. New write tools must retain application authorization and retry/reconciliation semantics; do not route them directly around the existing workspace/Slack services. Add a real SDK list/call test and then a native dispatch check. No global Codex change is needed.

This first version centralizes Exa and application actions behind one project MCP bridge. It is an explicit extension point, not automatic installation/discovery of arbitrary third-party MCP servers.

`apps/api/src/mcp/runtime-server.ts` implements a real SDK Streamable HTTP MCP server on a random `127.0.0.1` port. Each Codex run gets a new bearer token, capability list, evidence cache and teardown handle. This module does not write Codex configuration, credentials, or other sessions' files.

## Interface

`startRuntimeMcp({ request, signal, searchExa?, assessProfile?, workspaceTools?, trustedEvidence? })` returns `{ url, token, toolNames, sources(), assessment(), slackDraft(), close() }`.

- No-goal initial page: no tools; suggestions remain the agent's responsibility.
- Explicit goal on a LinkedIn profile: `assess_profile` uses the root-supplied existing assessor, once, bound to the exact page and goal. It validates the public assessment and retains bounded source text server-side.
- Follow-up: `exa_search` uses the existing server adapter, with two searches, four results per search, eight stored sources and 3000 characters per passage.
- `prepare_slack_draft` captures one exact editable draft containing the current page URL. It never sends Slack messages. Root must deliver this draft to the existing review UI.
- Approved workspace definitions are exposed through the existing `ConversationWorkspaceTools.request` callback; the callback's authorization, validation and journal remain authoritative. No direct provider-write transport is added. Maximum three workspace calls per run.

Endpoint access requires the per-run bearer, exact loopback Host, no Origin header, `/mcp`, and POST. Provider failures return sanitized errors; cancellation aborts callbacks, prevents late result caching and closes listeners. Source text remains untrusted evidence. An exposed capability is not permission to perform a write.

## Verification

`npx tsx --test apps/api/src/mcp/runtime-server.test.ts` exercises SDK client initialization, tool listing and actual HTTP tool calls with injected provider callbacks. Cases cover bounded research, draft-only behavior, access isolation, initial context policy, workspace argument validation/gating, profile binding and cancellation teardown. These tests do not call live providers or send messages; root owns native Codex process integration and live acceptance.

SDK implementation references: installed `@modelcontextprotocol/sdk` 1.30.0, `dist/esm/examples/server/simpleStatelessStreamableHttp.js`, `server/mcp.js` and `client/streamableHttp.js`. Stateless transport is instantiated per HTTP request, while run capabilities and limits remain shared across requests.
