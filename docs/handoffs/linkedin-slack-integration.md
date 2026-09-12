## Live acceptance recheck — 2026-09-13

The current browser-control inventory returned empty apps and browsers, so the two supplied LinkedIn URLs could not be inspected in the user's browser session. A presence-only check of apps/api/.env plus inherited process environment confirms SLACK_BOT_TOKEN, SLACK_TEAM_ID and SLACK_CHANNEL_ID are all absent. No credential values were printed and no provider messages were sent. These are current blockers for the real two-profile/Slack acceptance; prior public W3C evidence and passing fixture tests do not resolve them. The minimal task sidebar specification supersedes historical goal-form descriptions below.
# LinkedIn goal research and reviewed Slack integration

Live acceptance: `done:false`. Owner: integration/QA. Updated September 12, 2026.

## Implemented path

The existing extension sidebar now contains an optional per-tab goal. Apply stores it; typing does not start research. Clear restores the conversational suggestions path. Navigation and goal edits invalidate previous assessment and Slack preview. Pause cancels work without removing the saved goal.

In live mode, an applied goal on a supported HTTPS LinkedIn `/in/<profile>` URL invokes `configuredReactive` → `createGoalReactiveRunner` → `createGoalAssessor`. The assessor performs at most two Exa searches and one tool-free model assessment. It bounds evidence, validates quotations, distinguishes matched/ambiguous/insufficient identity and fictional/parody profiles, and does not hardcode either demo verdict. The sidebar receives findings, quoted evidence and source metadata; full retrieved passages stay on the server. No goal and conversational follow-ups continue through the existing Codex runner.

The assessment offers **Prepare Slack message**. The draft is editable and keeps source URLs intact. Messages above 3,000 characters must be shortened before review. **Review in Slack** calls authenticated `POST /api/slack/preview`; the UI displays the exact text and verified destination. Only the separate **Send to #channel** action calls `POST /api/slack/send` with explicit approval.

Previews bind session, context, page revision, goal revision, profile URL, goal and exact text. Completed assessments become invalid for sending when navigation cancels their context, before the next page snapshot arrives. The provider rechecks context and destination immediately before posting. A filesystem journal reserves attempts before dispatch and replays results after restart; pending/uncertain attempts never automatically post again.

## Server configuration

- `AGENTLAYER_MODE=live`.
- Goal research: existing `OPENAI_API_KEY`, `OPENAI_MODEL`, `EXA_API_KEY`.
- Slack: `SLACK_BOT_TOKEN`, `SLACK_TEAM_ID`, `SLACK_CHANNEL_ID`.
- Slack journal: `apps/api/.agentlayer/slack` when launched from the API workspace.
- Codex remains the existing local conversational runtime. Enabling tools on that runtime is not required by this integration.

Only environment-variable names were documented here. No credentials were read or copied as part of this implementation. Presence of configuration is not proof of provider access. Slack preparation checks access to the configured workspace/channel; it never joins a channel automatically.

## Verification

- `npm run build`: API and Chrome extension production builds passed.
- `npm run typecheck`: all three workspaces passed.
- Targeted integrated run: **67 tests passed**, covering existing HTTP auth/contracts, reactive sessions, goal assessor and runner, Slack provider/coordinator/routes, extension goal/state/connection and stream handling. Provider responses were injected; these are local tests, not live calls.
- API route tests cover exact review and explicit send, immutable-text rejection, authentication, durable replay without a second post, terminal-assessment cancellation before next snapshot, and demo-mode refusal.
- Extension tests cover per-tab persistence, goal edit/navigation/restart behavior, stale output rejection, displayed assessment state, Slack preview/send bindings and duplicate prevention.
- Browser tool inventory returned no available apps or browsers in this session. No replacement profile pages were created or used for acceptance.

## Still required for the requested demo

Profile discovery update: David supplied both URLs. Real calls through the existing Exa adapter retrieved the exact William Bryk profile and supporting sources, and the exact Darth Vader profile after one timeout/retry. Evidence is saved in [demo-profiles-exa.json](demo-profiles-exa.json). The Vader response also contained other same-name profiles, so identity matching must retain the exact requested URL and never merge those profiles based on name alone. These are external search results, not a captured live DOM, and neither a suitability verdict nor a Slack send has been verified. Direct web fetch of LinkedIn failed; requesting a browser through the browser tool returned `No browser is available`.

Live readiness check on September 12: `http://127.0.0.1:4318/ready` responds with `mode: demo` and reactive runtime configured (inference not verified). A separate process loaded the API workspace environment and reported only presence flags: OpenAI key/model and Exa key are configured; `SLACK_BOT_TOKEN`, `SLACK_TEAM_ID`, and `SLACK_CHANNEL_ID` are missing. No secret values were printed. Browser inventory again returned no available apps/browsers. The active runtime was not restarted or switched while the profile URLs and Slack destination remain unknown.

All items remain `done:false` until live evidence exists:

1. Profile URLs supplied by David: `https://www.linkedin.com/in/darth-vader/` and `https://www.linkedin.com/in/william-bryk/`. Input received; live profile acceptance remains `done:false`.
2. Inspect the actual signed-in LinkedIn DOM and confirm extraction/navigation with the built extension.
3. Run real Exa/model assessment on both pages, verify citations and identity, and confirm the same goal persists. A positive second assessment must follow evidence, not a forced result.
4. Configure David's intended Slack workspace/channel and bot access on the server.
5. David reviews the exact live recommendation and destination; execute that explicit Send, then verify the actual message/reference in Slack.
6. Capture the two-minute demo from the working flow and update submission materials to describe verified behavior.

Known limits: this is a local single-user API and filesystem journal. Unknown delivery is displayed without automatic retry; the UI currently directs the user to check Slack rather than providing automatic reconciliation. Long drafts require user editing. Unit tests do not prove real LinkedIn rendering, identity-match quality or provider connectivity.
