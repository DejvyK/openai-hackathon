# Page suggestions and Google Calendar

User scope: each new page offers fresh model-selected actions; subsequent interactions reread the page. Keep this simple, without long-term prediction machinery. Connect Google Calendar using the existing CopilotKit integration.

Implemented paths:

- A: synchronous page recapture at CopilotKit dispatch, same-page current-context binding, and Google Calendar connection controls in extension settings. Calendar connection messages are accepted only from settings; OAuth destinations are validated before opening.
- B: passive MCP runs expose no executable tools, including when a persistent goal exists. Model input receives calendar availability and current server time separately. Explicit follow-ups may use `google_calendar_create_event` with canonical fields, server-created operation IDs and source binding. Errors stop further calendar calls in that run.
- C: direct Google OAuth/Calendar provider under `apps/api/src/calendar`, private local token storage, deterministic event IDs and actual provider read-back. No attendee/invitation tool is exposed.
- D: canonical `@agentlayer/contracts/calendar-v1`, paired calendar connection routes, Google callback, shared service instance wired through the existing CopilotKit → Codex → project MCP runtime, and setup instructions in `docs/GOOGLE-CALENDAR.md`.

Local evidence received:

- Extension typecheck, 17 extension tests and background tests passed; production extension build passed.
- MCP/native runner focused checks passed; actual MCP SDK tool calls use a fixture Calendar provider.
- Six CopilotKit bridge tests passed, including its actual stream plus MCP SDK call, passive zero-write behavior and a follow-up result link. Google/model inference are fixtures in this test.
- Three calendar route tests passed: paired access, callback state/error boundary, demo disabled.
- Shared contracts typecheck passed.

Live acceptance remains pending. Google OAuth client credentials were absent in the project `.env` on inspection. Account consent and a user-authorized real calendar event have not been completed. No live Google event, Ambiguous record or Slack message was created during this implementation. API activation and provider final checks are recorded below when completed.

Final checks: `npm run typecheck --workspace @agentlayer/api` and contracts/extension typechecks passed. `npm run test:calendar --workspace @agentlayer/api` passed 9/9 including the six provider tests and three route tests. API and extension production builds passed. Calendar OAuth/HTTP provider tests use mocked transports; no live Google event was created or required solely for verification.

API activation succeeded: replaced the verified local Node listener PID12036 with built API PID16940. `/ready` returned ready/live/reactive configured; paired `/api/calendar/status` returned `{configured:false,connected:false}`. This proves the new routes are active and the missing client configuration is the remaining account-connection prerequisite. A request asking whether the user has an existing Google OAuth client is pending. No remote-debugging Chrome process was available to reload the user's installed extension, so that browser reload remains a user action. No further provider/browser testing was performed.
