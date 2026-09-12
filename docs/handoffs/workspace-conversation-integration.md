# Model-selected workspace actions

Implementation checkpoint, 2026-09-12. No live Ambiguous, browser, or external-write verification was performed; existing accepted evidence remains unchanged.

The configured conversational path now advertises C's contact/task/document definitions to the model in live mode when Ambiguous credentials and workspace are configured. The model chooses the operation and arguments through the existing bounded application-mediated JSON decision loop. Native Codex tools stay disabled. Exa retains its search quota; a subsequent workspace proposal does not spend an additional search.

`config/workspace-conversation.ts` prepares and retains the exact proposed operation, server-assigned identity, evidence, payload hash, page/goal fingerprint, original user request, and ten-minute expiry. The existing conversation suggestion button displays a human-readable review and submits a unique server-generated confirmation prompt. Only the exact current prompt authorizes that retained payload. Page text, history, and model-authored flags cannot grant permission. Pause, close, cancellation, page-content changes and goal changes invalidate previews; stale/expired confirmation prompts receive an explicit response without model interpretation.

After confirmation the bridge executes with the original idempotency identity and current cancellation signal. Actual operation outcomes are displayed and retained as trusted model input. The model then continues the original request, allowing it to choose a later linked task using the actual contact ID; another write requires its own review. Unknown outcomes retain the same confirmation identity for reconciliation and suppress further workspace proposals in that session until resolved. Slack sending remains on its separate explicit preview-and-Send path.

Startup wiring is `configuredReactive` -> `configuredWorkspaceConversation` -> `configuredCodex` plus the confirmation wrapper, retained inside the Copilot runtime. No new HTTP endpoint or extension UI was necessary. The model-decision contract gained only the three workspace tool variants. Root should perform final typecheck/build after concurrent changes settle, and determine whether the running API requires restart. This file is implementation evidence, not live acceptance.

Validation during integration: `npm run typecheck --workspace @agentlayer/api` passed before final UI-copy and uncertainty refinements; root owns final validation. No test suite was run per user instruction.
