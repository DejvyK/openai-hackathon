# Minimal task sidebar

Current extension direction (2026-09-13): each newly observed page offers model-selected next actions from its current content. An existing task may guide relevance but is not replayed on navigation. Opening or changing a page does not run external research or writes. The next user interaction captures the current page again before execution. No long-term preference model or predictive event taxonomy is required. Google Calendar is connected through the existing CopilotKit/AG-UI/project MCP chain; account setup is documented in [GOOGLE-CALENDAR.md](GOOGLE-CALENDAR.md). A booking confirmation may lead the model to offer a calendar action, without a site-specific hardcoded rule.

User-authorized implementation, 2026-09-13. This direction supersedes the visible goal form, conversation transcript, separate workspace workflow and per-record review steps in the earlier UI specifications. It does not change Slack's explicit send boundary or claim completion of the live demo.

The live sidebar contains the AgentLayer header/menu, one task input, the latest concise status/result, and at most three agent-selected actions. Settings, pause/resume, new task and site access are in the menu. Sources are collapsed. There are no visible contact fields, task/note editors, workflow steps or chat history. Existing manual demo components remain isolated from the mounted live sidebar.

The first submitted instruction becomes the persistent task. The same input accepts refinements; the background retains bounded conversation context. Navigation clears the previous result and retains the task. New task clears it. The agent chooses supported operations and arguments; there is no UI-defined contact-then-task sequence.

For a submitted task, the server executes the agent's selected contact/task/note operations without exposing intermediate payloads or requiring individual Save clicks. The exact payload grant remains server-owned, with journal identities and actual provider results feeding the continuation. A task can execute up to three workspace operations per run; further work has one Continue action. Passive page observations cannot write. Unknown write outcomes stop continuation and retain the original operation for status checking. No email or Slack send permission is inherited from a workspace operation.

Slack preparation shows one Review message action. Only then does the exact message and destination appear with Send. There is no default message editor; corrections use the task input. Confirmed delivery collapses to the result link.

## Local verification

- Extension/API TypeScript checks and extension production build.
- `apps/extension/tests/minimal-sidebar-browser.mjs`: built extension, existing article fixture, real Chromium; one input, hidden forms/history, navigation, task persistence, actions, menu, pause/resume, reset, narrow layout and close.
- `apps/extension/tests/slack-review-browser-tests.mjs`: compact review has no editor, preview precedes exact Send, expired/unknown states remain protected.
- `apps/api/src/config/workspace-conversation.test.ts`: one instruction produces a contact and linked task using the returned ID, no intermediate review UI; passive observations do not write; unknown results stop and retry without duplicating the write identity.
- Existing Codex, reactive-route, goal-runner, connection, state and bridge regression tests.

Browser screenshot/report: `apps/extension/tests/evidence/minimal-sidebar.png` and `minimal-sidebar.json`. Provider transports in these checks are fixtures. No external records or Slack messages were created to verify this change. Real provider access and the two-profile live demo retain their separate acceptance requirements.
