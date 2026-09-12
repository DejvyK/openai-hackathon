# CopilotKit integration

Status: implemented and verified through actual CopilotKit SSE runtime plus live Codex. Project credential accepted by the official Intelligence entitlement endpoint. Cloud conversation persistence is not enabled or claimed.

The supplied key remains in the ignored API environment as `COPILOTKIT_API_KEY`. It is never sent to the extension. Current official documentation identifies `cpk-` project keys as server-side CopilotKit Intelligence credentials. Prefix alone does not prove this particular key is accepted.

The integration is a CopilotKit runtime around the existing Codex and Exa conversation runner. CopilotKit executes the AG-UI lifecycle and event stream; it is not a search tool. The existing sidebar and reactive-v1 transport remain: a server-only bridge runs an AG-UI custom agent through the actual CopilotRuntime Fetch handler and translates its stream back to validated reactive events. Exa performs external research; Slack remains a separate reviewed send.

Files: `apps/api/src/research/copilot-runtime.ts` and `copilot-runtime.test.ts`. D wires `createCopilotReactiveBridge(baseRunner, { apiKey: env.COPILOTKIT_API_KEY })`. It returns `runner`, `inspect()` and `close()`. The base runner is retained across calls so the existing evidence cache survives followups. Same-page threads bind session, URL and goal revision; each emitted event still validates exact run, context and navigation revision.

Live evidence: `.agentlayer/live-copilot-runtime.json`, checked 2026-09-12T21:30:32Z. Non-sensitive library details passed through the actual CopilotKit SSE handler into Codex and returned progress plus a completed answer with two suggestions in 5,565 ms. Inspection returned `mode:sse`, `credentialStatus:accepted`. No Slack message or other external action was sent. This is not actual LinkedIn acceptance.

The SDK 1.71.1 Intelligence branch returns realtime connection credentials from `/run`, not the SSE transport described generically on its endpoint overview. A brief attempted cloud run first failed locally because setting a Memory grant to none denies that run path. Cloud-mode work was discontinued in favor of the supported SSE runtime; no failed cloud result is presented as a success. `intelligence` and an explicit SSE runner cannot be combined in the package's configuration union. The saved project key is used for separate real credential verification, not falsely described as powering a cloud-persisted conversation.

Validation: `node --import tsx --test src/research/copilot-runtime.test.ts` from `apps/api` covers actual SDK roundtrip, cancellation, mismatched context and same-page successive turns. `npm run typecheck --workspace @agentlayer/api` passed. Use `COPILOTKIT_TELEMETRY_DISABLED=true` when starting the runtime to disable unrelated SDK telemetry.

Followup race fix: terminal reactive events now wait for SDK `RUN_FINISHED`, stream completion and runtime cleanup before publication. Previously the sidebar could immediately submit its next turn while the same SDK thread still held the first run. A fifth actual SDK regression deliberately delays underlying cleanup after its completed event, then starts the next run synchronously from the outer completed callback. Both turns pass without a thread-running conflict. All five bridge tests passed after this fix.

Dependencies verified against npm: `@copilotkit/runtime@1.71.1`, `@ag-ui/client@0.0.59`, `@ag-ui/core@0.0.59`, `rxjs@7.8.1`. Shared manifests and install belong to D.

Official references checked:

- [Connect Intelligence](https://docs.copilotkit.ai/strands/intelligence/connect-your-runtime): construct `CopilotKitIntelligence({ apiKey })` and pass it to `CopilotRuntime`. A successful local SSE reply does not prove the key was used.
- [Runtime endpoints](https://docs.copilotkit.ai/strands/backend/runtime-endpoints): AG-UI runs stream SSE. `/info` can return 200 despite rejected credentials; inspect `runtimeEntitlements`.
- [Runtime adapters](https://docs.copilotkit.ai/strands/runtime-server-adapter): Fetch and Hono entry points are supported.
- [Custom agents](https://docs.copilotkit.ai/ag-ui/concepts/agents): custom `AbstractAgent` implementations preserve an existing agent backend.
- [CLI verification](https://docs.copilotkit.ai/cli): cloud round trips create thread records; checking only agent discovery is insufficient.

Remaining integration evidence belongs to D: built API and extension wired through this bridge, plus the actual Exa/Slack product journeys. Do not report cloud persistence from the successful local runtime or the accepted project credential.
