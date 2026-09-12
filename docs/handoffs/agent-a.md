# Agent A handoff

## Conversational sources and Slack review bridge — 2026-09-12

Final selected-public-page pass: `node apps/extension/tests/live-selection-browser.mjs --conversation --selected-conversation` passed against D's corrected Copilot-wrapped live API (pid30816). The actual W3C paragraph remained the captured context across composer focus; the assistant asked about that selected passage, the user requested Exa research, and the completed reply rendered four matching W3C source links. One user turn survived; no retry was needed, both snapshot/SSE pairs were HTTP 200, zero browser errors and no provider writes. Evidence: `apps/extension/tests/evidence/live-exa-selected-conversation-browser.json` and `.png`. This closes the selected-conversation regression and real browser→Codex/Exa proof; native manual toolbar, actual LinkedIn and Slack delivery remain separate acceptance gates.

Actual public-page proof: `node apps/extension/tests/live-selection-browser.mjs --conversation` passed on W3C's accessibility introduction using the built extension, real Codex and Exa. The user composer request produced four returned W3C sources, four matching clickable UI links and the actual Exa progress event. Both snapshot/SSE pairs returned 200; zero browser errors and no save/send calls. Evidence: `apps/extension/tests/evidence/live-exa-conversation-browser.json` and `.png`.

This live test exposed a selection-loss race: moving from selected page text into the composer could collapse the DOM selection, and the disabled Send button could blur to body, invalidating the conversation. `page-snapshot.ts` now retains the last captured page selection through sidebar pointer/focus interaction and automatic blur, releasing it on actual page interaction or navigation. The final build/typecheck passed; the existing browser suite now passes 14 grouped checks, including selected passage → option/composer → one surviving turn without replay/cancellation, explicit page selection clearing, and failed turn → explicit Retry this message click → successful response with no hidden replay. A selected-public-page live recheck is tracked separately; its captured failure/request evidence helped D diagnose a provider/runtime issue after the UI selection repair.

D-delegated `/root/conversation_ui` now preserves returned source metadata on each assistant transcript message and renders safe clickable research sources beneath the corresponding response. Navigation, changed snapshot content and goal changes remove stale source-bearing messages. Only role/text enter follow-up conversation history; source metadata is not presented as new user authority.

The existing Slack review previously required a goal assessment in both rendering and background authorization. It now also accepts a current completed `slackDraft` from the conversational API, opens it in the editable draft UI, and uses the existing destination preview followed by explicit Send. LinkedIn profile URL restrictions, exact-text review, context binding, missing connection feedback and uncertain-send handling remain intact. Unsupported page contexts do not show a send action. No credentials or provider writes are involved in this extension change.

Focused verification: 13 state/goal/connection tests passed, including no-goal conversational draft → preview with zero sends, exact profile binding, URL restrictions and goal invalidation; extension typecheck/build passed. The existing browser suite passed all 11 grouped checks with zero errors, including safe source links attached separately to both conversational replies and removal after context replacement. Evidence: `apps/extension/tests/evidence/reactive-browser-results.json`. This does not prove live Exa retrieval or Slack delivery; D/B own that live provider evidence.

## Active coordinated conversation UI work — 2026-09-12

D delegated conversation UI to `/root/conversation_ui`; edits completed in `components/LiveAssistant.tsx`, `lib/reactive-state.ts`, `lib/reactive-background.ts`, sidebar CSS and targeted tests under `apps/extension`. Existing userGoal/goalRevision additions preserved. The sidebar renders the agent's question and up to three clickable options, plus an editable message composer. Each option sends its model-provided prompt as an ordinary user message; nothing dispatches arbitrary tools or claims Slack delivery.

Background state holds the page transcript, sends a unique message ID and a new revision per turn, and bounds history to 12 entries / 24,000 total characters. Navigation, meaningful snapshot-content changes and goal changes clear previous conversation; reconnect/recapture never replay a user message. Identical same-page recapture after a conversation updates context without unsolicited new answers; timestamps do not invalidate the conversation. Pause/cancel/reconnect controls remain in place. Transcript survives port reconnection within a live background session; a terminated background worker does not persist the transcript to storage.

Verification: `npm run typecheck --workspace @agentlayer/extension` passed; `npm run build --workspace @agentlayer/extension` passed; `node --import tsx --test apps/extension/tests/reactive-state-tests.ts apps/extension/tests/reactive-connection-tests.ts` passed 8 tests. `node apps/extension/tests/reactive-browser-tests.mjs` passed 11 grouped checks with zero page errors, including option click, free-text history/revision, reconnect without user replay, navigation and same-URL entity replacement clear, delayed acknowledgement cancellation, pause/resume and close. Evidence remains `apps/extension/tests/evidence/reactive-browser-results.json`; these are fixture transport checks, not live LinkedIn, Exa or Slack proof. No new substitute pages were added; the existing reactive fixture suite was extended.

## Latest integration recheck

Latest conversational live check: `node apps/extension/tests/reactive-live-browser.mjs` passed with the actual built extension and paired Codex API. First response asked “What would you like to explore about this automatic page-reading demo?” with three generated buttons. Clicking one and submitting an independent free-text follow-up produced real replies; hard navigation cleared the transcript and asked about the new page. Four actual snapshot requests and four SSE streams returned HTTP 200; zero browser errors. Evidence: `apps/extension/tests/evidence/reactive-live-browser.json` and `reactive-live-sidebar.png`. This uses the existing local HTTP sample pages and does not prove actual LinkedIn, Exa, Slack or native toolbar acceptance. No workspace writes occurred.

User design update: replace inline placement with a fixed **right sidebar** and monochrome styling. This explicit request supersedes the earlier inline-placement acceptance. Implemented a document-root shadow host, viewport-height 400px sidebar (full width on narrow screens), independent content scrolling, fixed header/footer, Escape/Close and restored focus. No host-page inset/form changes. Button/Input/Textarea/Card are adapted from MIT-licensed shadcn/ui source with scoped CSS replacing Tailwind utilities; source attribution/license is in `apps/extension/components/ui/LICENSE.md`. Sidebar composition is a non-modal extension-specific adaptation; no dependency/manifest edits were required. Browser fixtures pass original workflows plus geometry at desktop and 375px widths. Screenshots: `apps/extension/tests/evidence/sidebar-desktop.png` and `sidebar-narrow.png`. The native browser-tools restriction remains honored; verification uses Playwright.

Sidebar delivery checks: extension typecheck/build and `npm run test:e2e` passed on the final build. The isolated visible Chromium now shows the actual bundled sidebar on `/demo`; active runner session is **75478** (supersedes 25531), screenshot `apps/extension/tests/evidence/manual-browser.png`. No external records were created. The separate test browser previously contained only blank/settings/demo tabs when refreshed.

User explicitly requested a non-native alternative. Browser access is now available through `apps/extension/tests/manual-browser.mjs`, a standalone Playwright runner with a visible isolated Chromium profile and the built AgentLayer extension loaded. It successfully paired with the existing local API and opened `/demo`. The running exec session is 25531; JSON stdin commands include `pages`, `open`, `inspect`, `screenshot`, `close`. This supersedes the claim that browser access itself prevents further testing. Native toolbar activation and real signed-in LinkedIn inspection still require the user to click AgentLayer/open their intended profile in that window; no login or provider write was automated. The normal browser profile was not copied or changed.

Resumed-goal audit 1: no connected browser is available. A now queried authenticated `GET /api/settings/connection` directly on the running server. It reports `mode:demo`, `workspaceConfigured:false`, missing `OPENAI_MODEL`, `EXA_API_KEY`, `AMBIGUOUS_API_KEY`, and `AMBIGUOUS_WORKSPACE_ID`. This differs from D's shell-level note that an Ambiguous key is present; the running process does not report it configured. D owns reconciling process configuration and any restart. No secret values were emitted. Live verification remains blocked; no new A-owned implementation request appeared.

Third consecutive goal-turn audit: connected-browser inventory still returns no apps or browsers; D has no new A-owned correction beyond the demo labels already fixed. Local implementation and bundled/local-HTTP checks are complete as documented, but live profile/toolbar/provider acceptance remains unproven. The thread goal is blocked on access to a live browser and D-managed live integration configuration/demo-workspace authorization. This does not mark any delivery-plan item complete; only D owns those states.

On the next goal turn, A addressed D's label feedback: Settings now says **Demo mode — live research and saving are disabled**, and the local sample card says **Local sample profile · fictional data**. These labels no longer imply that the current demo API generates successful research or records.

- `npm run build -w @agentlayer/extension` passed after these edits.
- A directly ran `npm run test:e2e` against the current built extension and D-managed server; passed all ten reported checks, including real options pairing, authenticated connection, bundled content-script injection, no duplicate card, missing-configuration error/no fabricated Save, SPA invalidation and rejected-token feedback. No provider calls or workspace writes were made.
- Read-only `/ready` returned `{status:"ready",scope:"local-api",mode:"demo",protocol:"v1"}`.
- Evidence: `.agentlayer/extension-smoke.png`. This is bundled extension/local HTTP evidence, stronger than the isolated presentation harness, but **not** native toolbar or live-provider evidence.
- Browser inventory was rechecked and still returned `{apps:[],browsers:[]}`. Real LinkedIn selector coverage and toolbar acceptance remain blocked. D's latest handoff records missing model/Exa/workspace configuration; it supersedes the earlier provider-configuration note below.

The prior goal turn made implementation progress; this turn made the requested integration-label correction and added direct local HTTP/browser evidence. Neither proves the full live acceptance.

Implementation authorized 2026-09-12. Scope: A01–A08, extension paths only. Existing checkout changes were preserved. A did not edit manifests, lockfile, contracts, API, D's e2e tests or delivery-plan status. No external records, messages, deployment or push were performed.

## Delivered implementation

- Separate LinkedIn, selected-text and explicitly local-demo adapters; unknown pages do not become people. Empty company/role remain null. Extraction records source URL, field and selector; user corrections become `user_edit` evidence in the shared v1 context.
- Profile actions differ from selection actions. The card is anchored after the profile section or selected content, inside a shadow root; native forms are preserved.
- URL changes, same-URL entity changes and replacement of the anchor invalidate context and research. A synchronous context check runs before requests as well as DOM/selection observers and URL polling. Late responses are ignored; abort and unmount clean up. Repeated activation is guarded during async mounting.
- Research summary, source links, source-linked claims, identity uncertainty, warnings and suggestions. Text renders through React; links require HTTP(S), without embedded credentials. Invalid wire responses become readable errors.
- Editable contact name/role/company, task title/description, optional follow-up date, and separate note title/content. No email is required. Dates start blank and are sent as chosen YYYY-MM-DD or null. No save happens before explicit user review and Save.
- Per-operation `created`, `reused`, `succeeded`, `failed`, `unknown` and `skipped` displays; `succeeded` is not mislabeled created. Partial retries preserve request ID and reviewed payload. Unknown outcomes offer reconciliation, never a blind commit retry. Confirmed links come only from validated responses. Aggregate success is checked against the expected operations.
- Settings include setup instructions, pairing-token storage/removal, authenticated connection check, provider readiness and demo/live distinction. Provider keys are never stored in the extension. Transport uses fixed loopback API origin, rejects redirects and restricts runtime message senders.

## Changed files

- `apps/extension/adapters/{types,index,linkedin,selection,demo}.ts`
- `apps/extension/lib/{context-lifecycle,workflow,api-bridge}.ts`
- `apps/extension/components/AgentCard.tsx`
- `apps/extension/entrypoints/agent.content/{index.tsx,style.css}`
- `apps/extension/entrypoints/background.ts`
- `apps/extension/entrypoints/options/main.tsx`
- `apps/extension/tests/{browser-harness.tsx,browser-tests.mjs,background-tests.mjs,fixtures/*,evidence/*}`
- This handoff. Pre-existing `wxt.config.ts` edits were retained, not authored by this run.

## Public interface and D integration

- `extractPageContext(document, selection?) -> {context: BrowserContext, anchor}` is the browser capture API; unsupported is an explicit UI state.
- `toPageContext(context)` returns a `PageContextSchema`-validated v1 payload with D's exact field names. Selector metadata stays browser-local; shared `extractedEvidence` uses `{field,text,sourceUrl,method}`.
- `resolveActions(context)` selects contact/follow-up versus research note.
- `createApiBridge()` is the production adapter from validated shared v1 schemas to the card's presentation models. `AgentCard` accepts an optional bridge only for independent fixture tests.
- Background messages: `agentlayer:research` → POST `/api/research`; `agentlayer:commit` → POST `/api/actions/commit`; `agentlayer:reconcile` → GET `/api/actions/:requestId`; `agentlayer:connection` → GET `/api/settings/connection` (settings page only).
- All legacy `/api/tasks` and unversioned research calls were removed from A's files. D can remove legacy routes. Current demo v1 fails closed on the server; the UI displays its error, without falling back to fake live research.
- Accepted D's revised calendar-date contract and `succeeded` operation status; `CommitView` derives operation types from shared `CommitResult`.

## Checks and evidence

Run from the repository root, using its installed workspace dependencies:

1. `npm run typecheck -w @agentlayer/extension` — passed.
2. `npm run build -w @agentlayer/extension` — passed; output `apps/extension/.output/chrome-mv3`. Rollup reports upstream Zod pure-comment warnings; build succeeds.
3. `node apps/extension/tests/browser-tests.mjs` — passed, Chromium **149.0.7827.55**, zero page errors. Covers three profile DOM shapes, null company, v1 provenance, selected-text note review, exact edited payload, native form preservation, keyboard/focus, context corrections, safe text rendering, unselected optional date, partial/reused outcomes, same-payload retry, timeout reconciliation, same-URL entity and whole-section replacement, SPA URL changes, stale response rejection and close/remount.
4. `node apps/extension/tests/background-tests.mjs` — passed. Uses D's shared complete-profile fixture. Covers authenticated settings, sender restrictions, fixed API URL/no redirects, missing pairing token, 401/429, invalid request/response and encoded reconciliation GET.

Artifacts:

- `apps/extension/tests/evidence/browser-results.json`
- `apps/extension/tests/evidence/profile-review-fixture.png` (visually inspected; synthetic data clearly labeled)
- Three profile HTML fixtures and one article HTML fixture in `apps/extension/tests/fixtures/`.

**All tests above are local/fixture evidence.** The DOM files are synthetic anonymized examples of selector shapes, not captured real LinkedIn pages. The UI browser harness renders the real card/API bridge with controlled messages; it does not prove native toolbar activation, real provider calls or real records. The background tests execute the production background module with fixture browser/fetch APIs.

## Acceptance and blockers

| Tasks | Evidence available | Still unverified |
| --- | --- | --- |
| A01 | Separate adapters, three synthetic profile variants, no company inference from headline | Actual selectors on three real profiles; fixture shapes are not live DOM proof |
| A02 | Shared v1 validation, provenance, URL/entity invalidation, stale-response and replacement tests | Live SPA variants and bundled activation on real profiles |
| A03 | Context-specific actions, unknown state, native form fixture | Placement on real LinkedIn/article layouts |
| A04 | Research, sources, ambiguity, correction, safe rendering, demo/live states | Real OpenAI/Exa run |
| A05 | Separate editable contact/task/note review, exact payload, optional date | Actual provider-backed proposals and saves |
| A06 | Partial/reused/unknown states, exact retry payload, reconciliation, returned links | Actual partial failure/read-back and provider retries; request recovery after closing/reloading the card relies on the backend journal, not a persistent client queue |
| A07 | Settings implementation and background connection tests | Real options interaction and native toolbar click |
| A08 | Browser version, fixture screenshot, checks and reproduction below | Live acceptance and fresh-user browser setup |

Native browser verification was attempted: `sky.list_apps()` returned `Computer Use native pipe is unavailable ... (os error 2)`. Browser inventory `cua.getState()` returned `{apps:[],browsers:[]}`. There is no connected user browser/native toolbar to inspect in this session. Do not count programmatic injection or fixtures as toolbar proof.

D's current handoff records missing Exa/Ambiguous configuration and no designated demo workspace. A did not inspect or emit secret values and did not authorize external demo writes. These are separate live integration dependencies.

## Next dependency / manual acceptance

1. D should run its bundled-extension/API smoke test against the migrated routes; old expectations for `Save demo task` are obsolete. Updated controls are `Research & prepare follow-up`, `Research selection`, `Save contact + follow-up` / `Save research note` (or `Save demo proposal` for an explicitly demo response).
2. Load `apps/extension/.output/chrome-mv3` unpacked in Chrome, open extension Settings, enter the local server pairing token and use **Test connection**. Verify configured versus verified status without provider keys in the browser.
3. On three actual LinkedIn personal profile URLs, activate with the native toolbar. Compare visible name/headline/current-company fields, correct blanks and verify placement; record real selectors and screenshots. Current selectors are `main h1`, `.text-body-medium.break-words`, and the `.text-body-small` inside the top-section button whose aria-label contains `Current company` or `Současná společnost`. Unsupported variants must stay unknown or use explicit selection.
4. On two actual article pages, select a passage and activate. Verify note-only review; change the selected passage and navigate while research runs. No prior proposal may survive the new context.
5. In an explicitly authorized demo workspace, D/B/C complete J1/J2, actual links/read-back and failure/reconciliation checks. Confirm that a proposed date is not saved until explicitly selected by the user.

A does not mark `done:true` in the delivery plan. Live-dependent acceptance remains open for D.

## 2026-09-12: Reactive sidebar + Codex runtime — contract request to D

User wants the sidebar agent to follow navigation, read the current page automatically and work through Codex in the background. This changes the earlier click-to-research interaction. Automatic external research versus read-and-suggest is awaiting the user's preference; default proposal is read-and-suggest. This section is a proposed integration, not implemented/live evidence.

Verified locally: `codex --version` reports 0.153.2, `codex login status` reports Logged in using ChatGPT, and `codex app-server --help` exposes stdio transport. No inference turn or provider call was run. Current extension observes SPA/context changes but hard navigation removes its injected sidebar; current contracts support only profile/selection and the API runs research on explicit request.

D: please define/version the reactive session contract before A changes the shared interface. Proposed transport: existing paired localhost API owns a Codex app-server child over stdio; extension never receives Codex credentials or an unrestricted app-server socket. Request contains sessionId, contextId, revision and a bounded snapshot (URL, title, visible main text, selected text, extracted evidence). Events contain sessionId, contextId, revision, runId and sequence plus started/progress/message-delta/completed/cancelled/error. Reject stale events after navigation; cancellation must reach the running turn. Validate all payloads in packages/contracts. The page snapshot is untrusted data and must not enable tools, choose backend URLs or approve writes.

A implementation after agreement: retain activation across supported permitted navigations; request site access explicitly where needed; debounce stable page snapshots, deduplicate content, skip own UI and form/password fields; show current source, actual activity, streamed response and Pause/Resume; keep the accepted monochrome sidebar. D must agree whether persistence uses a native browser side panel or reinjection and coordinate any manifest/dependency changes. B owns the bounded Codex reasoning/research adapter after D assigns the new interface. C's reviewed commit flow remains the only workspace write path.

Acceptance: full navigation and SPA route change both update context without another toolbar click; rapid navigation cancels/coalesces runs; old output cannot appear against a new page; same content does not trigger repeated inference; Pause stops capture and cancels active work; denied site access is visible; one real Codex response streams into the sidebar with traceable page evidence; model/server failure is shown honestly; no workspace writes occur merely from reading a page.

Official reference: https://learn.chatgpt.com/docs/app-server (threads, streamed events, turn/interrupt; interface currently experimental). No delivery-plan acceptance was changed.

## Reactive implementation underway — A to D/B

User explicitly said "ano realizuj". A is implementing against D reactive-v1: bounded rendered-text snapshots, 750 ms debounce, background-owned per-tab session/revision, authenticated SSE fetch, stale-event/terminal filtering, pause/resume/close and permission-based reinjection. Files are extension-only. Optional host permissions are declared by A as D requested; Follow browsing requests them through an explicit user click.

D/B: A needs the Codex runner wired into actual API startup to finish the requested real browser demo. Current createApp supports reactiveRunner but default index has none. Please implement/integrate B's bounded read-and-suggest Codex adapter, then record startup command and live cancellation evidence. A will exercise built extension against your real API; no external workspace writes. The user has authorized this Codex integration, not outreach or workspace records. A will not change B/D files.

## Reactive implementation coordination (A, current turn)

A has assigned bounded runtime work to /root/codex_runtime_b (new research/codex*.ts only) and startup integration to /root/reactive_integration_d (index.ts + minimal app.ts readiness/cleanup). They follow B/D ownership, preserve shared edits and coordinate exports directly. Other B/D sessions: please avoid duplicating those same new files while they are in flight. A remains extension-only. Existing workspace/date work is separate and untouched. First built reactive fixture browser suite passes five groups, zero page errors; live Codex is next.

## Reactive sidebar delivered — live Codex browser evidence (2026-09-12)

Implemented A-owned `page-snapshot.ts`, `reactive-background.ts`, `reactive-stream.ts`, `reactive-state.ts`, `LiveAssistant.tsx`, and integration in the existing sidebar/background/WXT configuration. Existing reviewed research/save workflow remains available below the live assistant. Snapshot capture excludes forms, inputs, editable/hidden elements and the sidebar, bounds text/evidence, debounces for 750 ms and deduplicates unchanged content. Background owns per-tab session/revision; authenticated SSE uses fixed local API and filters mismatched page/run/sequence/terminal output. Navigation and Close cancel previous work. Pause stops automatic snapshots, retains the last answer, and Resume recaptures. A 20-second port heartbeat keeps the worker active; responses have a deadline/size bound. No automatic workspace writes.

Permission behavior: Follow browsing explicitly requests optional HTTP(S) host access. Without access, navigation to that origin does not inject or capture; toolbar badge indicates missing access. Returning to a permitted origin restores the sidebar. Revoking access pauses sessions. A does not claim a native permission prompt acceptance test or native toolbar test.

Commands/results:
- `npm run typecheck -w @agentlayer/extension`: PASS.
- `npm run build -w @agentlayer/extension`: PASS (upstream Zod annotation warnings only).
- `node --import tsx --test apps/extension/tests/reactive-state-tests.ts`: 4 PASS (stale/duplicate/terminal filtering, aggregate bounds, byte-split UTF-8/CRLF SSE, oversized frames).
- `node apps/extension/tests/background-tests.mjs`: PASS (existing v1 transport/sender/auth boundaries).
- `node apps/extension/tests/browser-tests.mjs`: 6 fixture groups PASS, zero page errors (existing review/save/sidebar regression checks).
- `node apps/extension/tests/reactive-browser-tests.mjs`: 7 fixture groups PASS before final missing-session recovery extension; final rerun noted separately below. Includes pending-ack navigation race, hard navigation/session continuity, SPA cancellation, pause/resume, unpermitted origin, close and no auto-reopen.
- `node apps/extension/tests/reactive-live-browser.mjs`: PASS, real built extension + actual local HTTP documents + actual paired API/Codex. Two automatic page analyses; second page reached by ordinary link navigation with no second programmatic injection. Both snapshots and SSE streams HTTP 200; source follows second page; pause; zero page errors. First attempt timed out waiting for extension serviceworker startup; repeat after build stabilization passed. This is not external LinkedIn/site extraction or toolbar proof.

Live report: `apps/extension/tests/evidence/reactive-live-browser.json`; screenshot `reactive-live-sidebar.png`. Actual Czech summaries/suggestions are recorded. No workspace writes in this test. `manual-browser.png` also shows actual Codex response on existing local demo page in headed Playwright. Visible browser runner session 2004, paired local API PID 24004 (owned/started by D, exec session 98125). Existing normal browser profile untouched; native browser tools not used.

B delivered enforced tool-free Codex runner and actual cancellation/process-exit evidence; D wired real startup/readiness/shutdown. Their handoffs are authoritative for those owned modules. CLI is intentionally gated to tested 0.153.2; upgrade requires renewed verification. The reactive feature is locally live; original J1/J2/toolbar/external profile/provider acceptance is separate and not marked complete by A.

Final verification: reactive-browser-tests.mjs rerun on final build PASS, all 7 groups and zero page errors, including recovery after simulated API restart (SESSION_NOT_FOUND/409). Final extension typecheck/build and scoped git diff --check PASS. Live Codex evidence remains the two real local HTTP-page run above; the final change only extends missing-session recovery.

## Recovery after observed permission/runtime disconnect (A continuation)

Previous goal turn yielded new browser evidence: Follow browsing request disappeared but the actual open sidebar displayed "Extension disconnected" with an inert Retry button. This was progress evidence, not completion. Current A change adds bounded port reconnect (250/1000/2500 ms, 5 s handshake), ignores old port messages, and never replays action messages. An invalidated extension context stops automatic retries and instructs activation through the toolbar. Activation now disposes/replaces a disconnected or invalidated host instead of focusing it; legacy disconnected hosts are also recognized.

Checks: extension typecheck/build PASS. `node --import tsx --test apps/extension/tests/reactive-connection-tests.ts`: 3 PASS. `node apps/extension/tests/reactive-browser-tests.mjs`: 9 fixture groups PASS, zero page errors; includes actual port disconnection/reconnect and stale-host replacement. `node apps/extension/tests/runtime-reload-browser.mjs`: actual Chromium runtime.reload invalidation detected, actionable status, no inert retry and zero page errors. Important limitation: the test-loaded extension is unloaded by runtime.reload, so the latter test proves detection only; fresh activation/remount is independently fixture-tested. Attempts to reload that command-line/CDP-loaded extension via its options URL returned ERR_BLOCKED_BY_CLIENT. Do not present this as native toolbar or normal-profile reload proof.

Original A acceptance still requires actual profile selector evidence, full original J1/J2 and native toolbar click. Requested a real LinkedIn URL from the user; awaiting response. D switched the verified local API to process-only live mode for read-only research: PID39692, exec9805, pairing unchanged, no new writes. A is now exercising real public W3C selection through Chrome's Extensions.triggerAction (browser action handler, stronger than direct injection, but still not a native physical toolbar click) and live research; results recorded separately when complete.

## Live public selection → research → reviewed note (read-only browser proof)

`node apps/extension/tests/live-selection-browser.mjs` PASS against the actual W3C accessibility introduction page, actual built extension and actual live local API. The test uses Chrome's documented `Extensions.triggerAction` with the real tab target (not the page target) to invoke the production action.onClicked handler. It does not directly inject the content script. This is browser action-path proof, not a physical/native toolbar click.

Selected paragraph matched the UI, selection-only research returned HTTP 200 with mode live, actual sources and a research_note proposal. Note title/content were editable and Save research note enabled. No POST /api/actions/commit occurred and no records/messages were created. This proves J2 through review; J2 persistence remains unverified. Current evidence is `apps/extension/tests/evidence/live-selection-browser.json`, with a readable viewport screenshot of the review form in `live-selection-review.png` (visually inspected). Initial full-page screenshot was too tall to read, so a second read-only run captured the review at viewport size. The latest run returned four W3C source links; claims cite the English primary page. Sources are not independent organizations.

Real-page probing exposed an ambiguous implicit textarea label; explicit aria-labels now match the visible Selected text/Note content labels. Typecheck/build and existing 6-group browser suite pass after the change. First protocol attempt used a page target and was rejected by Chrome; the successful test resolves the documented tab target. Final connection-unit tests 3/3 PASS; reactive fixture browser suite 9 groups/zero errors; actual runtime-invalidation test PASS with the stated harness limitation. No current actual user-browser activation is claimed from this isolated test.

Remaining original gates: user-selected real LinkedIn profile(s), native toolbar activation, reviewed and authorized workspace saves and actual record links, plus final demo/video acceptance. A requested the LinkedIn URL asynchronously and has not received it. These are not replaced by the successful Codex/reactive or public-selection checks. DELIVERY-PLAN acceptance remains D-owned.

## A06 continuation: recover a reviewed save after sidebar close

Implemented session-scoped recovery in `lib/save-recovery.ts`, `components/SaveRecovery.tsx`, `AgentCard.tsx` and the extension background handler. The background stores the validated exact CommitRequest before fetch, scoped to sender tab in extension-owned storage.session. Closing/remounting the sidebar or restarting its service worker retains the original reference, reviewed payload and source. The recovery panel shows the original reviewed content and actual returned operation links; it offers status first, exact-payload retry only for explicitly retryable failures without unknown operations, and acknowledgement only for confirmed completed/failed outcomes. New saves are gated while recovery is unresolved. Background rejects replacing an unresolved request or mutating the payload of an existing request ID. No automatic retry or write on mount.

Validation:
- `node apps/extension/tests/save-recovery-background-tests.mjs`: PASS. Production background handler bundled with only unrelated reactive initialization stubbed; fixture fetch asserts storage exists before outbound write, worker reinitialization preserves the request, replacement/mutation are rejected, reconciliation and exact retry succeed. No provider writes.
- `node apps/extension/tests/browser-tests.mjs`: 8 fixture groups PASS, zero page errors. New groups close/remount after timeout (one write only, original-ID status, gated new Save) and after partial failure (identical full reviewed payload on retry).
- `npm run typecheck -w @agentlayer/extension`: PASS. Initial run encountered concurrently edited reactive-state test indexing errors; latest run passes without changing those tests.
- `npm run build -w @agentlayer/extension`: PASS; upstream Zod annotation warnings only.
- `git diff --check` on changed A paths: PASS (line-ending notices only).

Limits: storage.session survives content/sidebar and worker restart in the same browser session; closing the tab or the entire browser does not provide cross-session recovery. Browser fixture proof is not Ambiguous persistence/read-back evidence. Current already-open isolated browser has not been force-reloaded; no claim that it has this newest build. Existing actual LinkedIn/native activation/provider-save/video gates remain open and D owns plan acceptance. Latest LinkedIn-Slack spec was read; it remains separate new demo scope and was not silently substituted for the active A goal.

## Actual user-supplied LinkedIn profile: Darth Vader

User supplied https://www.linkedin.com/in/darth-vader/. Opened it through the existing standalone Playwright session50690 without native browser/computer tools. It rendered the actual public page titled Darth Vader – Death Star | LinkedIn, main h1 Darth Vader, with Death Star visible. No sidebar was present in that existing tab. Screenshot saved as tests/evidence/live-profile-public.png. No login credentials or profile copying used.

Separate headed production-extension probe `node apps/extension/tests/live-profile-browser.mjs` reached HTTP200 and invoked Extensions.triggerAction (actual action handler, not a physical toolbar click). Sidebar rendered but profile fields were absent. Captured DOM proved section.top-card-layout contains nested hidden contextual sign-in dialogs and password fields. The adapter's blanket password-descendant rejection discarded the entire otherwise visible profile. Removed that blanket condition; heading extraction now excludes form/dialog headings. Existing fixture suite adds the exact failure pattern and a dialog-only negative case. No guessed public company/headline selector was added; missing fields stay unknown.

Initial headless probe got HTTP999; a later separate headed probe also received HTTP999 and navigated to signup. Stop that probe on non200 and do not treat signup as successful profile proof. Original user-facing tab remains open. No further repeated LinkedIn fetches, no login bypass, no research/provider or workspace write claimed. Post-fix live extraction still needs activation in an accessible profile session. Test script records non200 failures separately. Prior generated JSON with the signup heading is diagnostic, not acceptance evidence.

## Continued after user deferred manual LinkedIn verification

User said to leave manual profile verification aside and continue. Checked current integrated goal/conversation/Slack UI without restarting or requesting another LinkedIn session. `node --import tsx --test apps/extension/tests/reactive-goal-tests.ts apps/extension/tests/reactive-state-tests.ts apps/extension/tests/reactive-connection-tests.ts`: 13 PASS, including goal persistence per tab, pause/reconnect/close lifecycle, stale goal events, source attachment and supported Slack profile restriction.

Fixed SlackReview preview expiration: time passing now disables Send and displays a review-again instruction without requiring an unrelated render. A new preview clears the expired state; effect cleanup removes the old timer. Existing context binding and explicit approval remain intact.

`node apps/extension/tests/slack-review-browser-tests.mjs`: PASS. Isolated component rendered on the existing article fixture (no replacement profile page); asserts no automatic send, exact text and approved flag on explicit send, edits disable stale preview, unknown delivery locks further writes, expiration disables Send, renewed preview restores it, and >3000 characters blocks preview. No provider calls/messages. This is UI/fixture evidence, not actual Slack delivery.
## CopilotKit frontend hooks integrated (2026-09-13)

Implemented the requested starter-kit patterns inside the existing monochrome sidebar. `useAgentContext` registers the current validated page snapshot, applied goal and revision. A custom AG-UI SidebarAgent forwards conversation turns through the existing authenticated background transport. `useComponent` registers sourced summaries and next-step buttons; `useFrontendTool` registers draft preparation. Actual Codex-selected, contract-validated frontend intents execute through `copilotkit.runTool` with followUp disabled. Page text cannot select arbitrary tools or authorize writes. Draft preparation renders the existing editable Slack review and never sends automatically.

The provider uses exported headless CopilotKit contexts and core with a local agent registry (the registry used by selfManagedAgents). It does not open a second model connection or expose server credentials. This avoids the full provider's global styles and reduces the content script from the initial 16.23 MB attempt to 879.92 KB (extension total 1.32 MB). Navigation, goal changes and disconnects cancel stale turns; obsolete cards disappear and completed intents are not replayed.

Verification:

- `npm run typecheck -w @agentlayer/extension`: PASS.
- `npm run build -w @agentlayer/extension`: PASS, upstream Zod annotation warnings only.
- `node --import tsx --test apps/extension/tests/copilot-agent-tests.ts apps/extension/tests/reactive-goal-tests.ts apps/extension/tests/reactive-state-tests.ts apps/extension/tests/reactive-connection-tests.ts`: 16/16 PASS.
- `node apps/extension/tests/copilot-browser-tests.mjs`: PASS with actual SDK hooks/core and fixture model output; safe text, context forwarding, all three registered components/tools, no automatic writes, stale-card invalidation and no replay.
- `node apps/extension/tests/reactive-browser-tests.mjs`: 14 fixture groups PASS; `node apps/extension/tests/browser-tests.mjs`: 9 fixture groups PASS. These are regression fixtures, not live provider acceptance.
- `node apps/extension/tests/live-copilot-browser.mjs`: PASS on the actual W3C accessibility introduction page with the built extension and live Codex. The model selected a sourced summary and two next-step buttons, and actual CopilotKit hooks rendered them. Recorded snapshot/SSE requests returned 200; zero page errors and no send/commit requests. Evidence: `apps/extension/tests/evidence/live-copilot-browser.json` and `live-copilot-sidebar.png`; screenshot visually inspected. Extension action invoked through Playwright/CDP, not a physical toolbar click.
- D reported API 127/127 and contracts 12/12 tests passing, plus API typecheck/build and restarted live readiness. B's live frontend probe selected all three intent types; it did not itself execute frontend tools.

This completes the requested frontend integration, not the separate LinkedIn-to-Slack or Ambiguous acceptance journeys. No Slack message or external workspace record was created. The user's existing manual browser was not forcibly reloaded and is not claimed to have the newest extension build.
## Urgent functionality repairs verified

User requested priority functional fixes, without a broad architectural rewrite. Extension transport EOF/timeout now detaches the failed cursor and permits one explicit Retry; stale run output remains guarded. Snapshot observation has a two-second maximum wait while retaining fingerprint deduplication and cleanup.

Verification: `npm test` PASS (now includes extension unit tests); `npm run typecheck` PASS; `npm run build -w @agentlayer/extension` and `npm run build -w @agentlayer/api` PASS. `node apps/extension/tests/retry-browser-tests.mjs` PASS on the built extension: forced SSE EOF, explicit Retry, exactly one new request and completed response. `node apps/extension/tests/snapshot-progress-browser-tests.mjs` PASS: continuous CSS mutations cannot starve reading, unchanged content does not repeat inference, changed evidence is captured. Existing article fixtures only; no provider writes.

Integrated backend repairs present in current checkout: idle terminal-session eviction, explicit duplicate-stream refusal, retained uncertain-operation identity beyond preview expiry, fresh bounded research evidence replacement, grouped citation validation. Direct local probes passed forty completed sessions without capacity lock and ninth-source retention with unknown grouped citation rejection. No claim that an already-running API or already-loaded user extension has automatically adopted the rebuilt artifacts; no live Slack send was performed.
