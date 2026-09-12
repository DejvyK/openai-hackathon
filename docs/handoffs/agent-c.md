# Agent C — workspace handoff

## Active user correction: model-selected tools, not fixed workflow bundles

Integration completed in source by coordinated B/D: configured live conversation supplies primitive definitions to the model's application-mediated tool loop, stores the exact preview, executes only its server-bound confirmation and returns actual provider results to the model for continuation. See `docs/handoffs/workspace-conversation-integration.md`. Final `npm run typecheck --workspace @agentlayer/api` and `npm run build --workspace @agentlayer/api` both passed. No live writes/browser/tests were run. Activation remains pending: automatic approval review rejected the guarded Stop-Process/Start-Process command for local API restart with `blocked by policy`; no restart completion is claimed. Last observed listener before the rejected command was PID 14192 on port 4318.

Follow-up implementation: `workspace/conversation-tools.ts` now provides a transport-independent bridge with definitions/prepare/execute/reconcile. Trusted session, context, revision, goal revision and message identity plus a server-assigned call ordinal determine stable journal IDs. Approval must retain that original context across the confirmation turn. A changed payload under the same call identity conflicts instead of creating a second record. Authorization receives a cloned context and exact prepared hash; cancellation is checked again after asynchronous contact lookup and before write dispatch. D is connecting the bridge to the application-mediated conversational tool loop and server-retained approval proposals. No external records or messages are created to verify this integration.

The user wants the agent to decide what to create/send and compose the contents based on context and conversation. This supersedes the assumption that every profile always creates contact+task and every selection always creates a note. Tool capability schemas remain explicit; workflow choice, ordering and text belong to the model. User intent authorizes actions; page content alone does not. This does not authorize an unrelated external send during development.

Implemented in C-owned paths:
- `workspace/agent-tools.ts`: createWorkspaceToolRegistry({actions, allowedTools, authorize}). definitions() exposes model-facing JSON tool schemas; prepare() builds a validated proposal with exact payloadHash; execute() checks server authorization and delegates to the persistent executor. No provider requests occur on prepare or capability listing.
- Independent tools: ambiguous_create_contact, ambiguous_create_task, ambiguous_create_note. Contact creation does not force a task. Task accepts contactId:null or a real returned ID; document accepts model-composed content with optional server-held selected text. No preset task titles or note text. Context/source evidence comes from the server, not arbitrary tool URLs.
- Existing WorkspaceActions and FileJournal now accept single contact/task operations as well as previous contact+task/note workflows. Standalone contact-linked tasks read the referenced contact before creating. Existing deduplication, date handling, read-back, request hashes and unknown states remain in that executor.
- Source mapping accepts a note without selected text, enabling a conversation-generated document outside selection mode. Existing v1 HTTP contracts and routes are untouched.

D/B integration request (shared contract/runner ownership remains D/B):
1. Supply only configured/allowed tool definitions to the model runner. These are capabilities, not suggested fixed scripts. Do not choose the tool by matching keywords or context kind in application code.
2. Dispatch actual model tool calls by their registered name with validated arguments. Model may call contact first, use its returned ID for a task, create only a document, or ask the user for missing inputs.
3. Bind WorkspaceToolContext from the current authenticated session/revision and source evidence. Allocate stable requestId/proposalId per model tool call on the server and retain them across transport retries. Model arguments cannot set IDs, backend URL, workspace or credentials.
4. Implement authorize(prepared) using server-held explicit user intent/current permissions for this exact payload. It returns {allowed,payloadHash}; it can accept an already explicit command without another hardcoded Save dialog. Missing intent should produce a meaningful conversational question, not an automatic write. Never accept a model-generated approval/hash as authorization. Reject stale session/revision after asynchronous authorization via signal/server state.
5. Return execution results to the model, including actual IDs and created/reused/unknown status. Let it continue from actual tool outcomes. Unknown is not success and must not trigger a new create request ID. Bound tool count/time at the existing runner layer.
6. Please promote tool-call request/response validation into packages/contracts before exposing a new HTTP surface. These schemas are an internal capability boundary, not a replacement of the shared HTTP source of truth. Keep legacy v1 compatibility until A/D migration is ready.

No Slack tool is advertised: there is no configured Slack provider in C. Add other destinations as separate registered capabilities only when their real adapters and permissions exist. Do not claim a message was sent when the runner merely produced draft text.

Validation: npm run typecheck -w @agentlayer/api passed. Per user instruction, no Ambiguous live/API/browser tests were repeated and no new external records/messages were created. The new model-tool path is implemented but not yet wired into the D/B runtime; therefore dynamic end-to-end execution is not claimed.


## Current user scope: proceed without further Ambiguous testing

The user explicitly instructed: "uz to netestuj. pokracujeme" (original Czech wording in conversation). Further Ambiguous/API/browser/deep-link testing and requests for the note URL are withdrawn from the current work. This supersedes previous browser-access, sign-in and URL blockers. Preserve existing evidence and keep unverified URL fields null; this instruction is not proof that every link or full J1/J2 journey was tested.

C has delivered the workspace adapter, reviewed mapping, contact identity handling, linked task/document persistence, persistent journal and reconciliation. Existing live evidence records the three approved writes, source/selection preservation, zero-create fresh-process replay, user-confirmed document UI and the subsequent no-date repair. Latest recorded local checks were 20 workspace tests and API typecheck passing. No further tests were run for this scope update.

D: continue integration/delivery using this handoff; do not block progress or request login/URL solely to repeat Ambiguous verification. DELIVERY-PLAN is D-owned: distinguish tests omitted by the user's instruction from tests that passed. Research/browser integration outside C remains assigned to A/B/D. Prior approval covers only the named demo; no additional writes or social publication are implied.

SC01/SC03: current-scope English social copy and Ambiguous evidence are prepared in SOCIAL-POST.md and EVIDENCE.md. SC02 publication awaits a chosen account/platform, final media/link targets and an explicit publication request. These publication inputs are not blockers for handing off the completed implementation.


## Status and task IDs

2026-09-12: implementation started for C01–C06 in C-owned paths. C07 has live synthetic workspace evidence; full real-profile/research journeys still require D integration acceptance. Authenticated reads and the explicitly user-approved synthetic workspace writes now pass; see live evidence below. No DELIVERY-PLAN status changed; D owns acceptance. This is a fixture-tested workspace implementation, not a completed live journey.

## Contract request to D / next dependency

D01 v1 contracts arrived during implementation. `apps/api/src/workspace/v1.ts` now imports and validates shared CommitRequest/CommitResult. Construct `createWorkspaceCommitter(new WorkspaceActions(provider, journal))`; this exposes the D-facing commitReviewedAction/reconcile interface. Pass `{workspace:{context,brief},signal}` where context/brief come from server proposal storage. The bridge enforces live mode and context/profile identity, attaches server-owned sources/selection, and converts internal operation states to created/reused/skipped. Internal model types are not HTTP schemas.

- Public interface: `new WorkspaceActions(provider, journal).commitReviewedAction(request, {signal})` and `.reconcile(requestId, {signal})`.
- Construction: `new AmbiguousProvider(serverApiKey)`; `new FileJournal(absoluteJournalRoot, serverConfiguredWorkspaceScope)`; no dependencies added.
- Request fields: requestId, proposalId, contextId, actionKind and reviewedPayload. Payload includes sourceUrl/sources and either person/task or note. Person has name, role/company nullable, profileUrl; task title/description and optional dueAt; note title/content/selection.
- D must authenticate, validate via shared schemas, verify server-owned proposal/context/live mode, enforce reviewed-field whitelist, and supply trusted workspace scope. Page content cannot choose API origin, credentials, workspace or journal path. The adapter always uses `https://app.ambiguous.ai`, refuses redirects and does not log credentials/provider bodies.
- Due date request: Ambiguous accepts a calendar date only. D updated v1 dueAt to YYYY-MM-DD, now consumed unchanged; timestamps are rejected to prevent silent timezone changes. Task title maximum is 255.
- D approved the file journal beneath ignored `apps/api/.agentlayer/`; configure an absolute path and server-owned workspace scope. D owns configuration and test-script integration. No package or root edits are required by C.
- Result URLs remain null until actual record routes are verified. D/UI must show this honestly. Public recipes document `/tasks/{id}` and CLI examples `/docs/{id}`, but neither was authenticated/browser verified; contact route remains unverified.

## Capability evidence (C01)

Source: https://app.ambiguous.ai/api/openapi.json fetched 2026-09-12. Relevant paths and referenced schemas saved in `apps/api/tests/workspace/openapi.snapshot.json`. Public specification only, not tenant capability proof.

| Operation | Verified public specification |
| --- | --- |
| Contact create | POST /api/crm/contacts, ContactCreateInput; explicit type=person/name; title and website supported; company_id references a company record, so free company text is preserved in custom_properties.agentlayer_company rather than invented company_id. OpenAPI omits required array; runtime requirements need live validation. Response `{contact}`. |
| Contact read/search | GET /api/crm/contacts/{id}, `{contact}`. List `{data,total,has_more,next_cursor?}`; type=person, limit<=500. q searches name/email/phone, not profile URL. Client scans up to 20 pages and compares exact normalized profile URL in custom properties or website; incomplete scan blocks creation. Multiple matches block with CONTACT_MATCH_AMBIGUOUS; names alone never merge. |
| Task create/read | POST /api/tasks requires title 1–255; description Markdown, contact_id UUID, due_date YYYY-MM-DD. Create and GET /api/tasks/{id} both `{task}`. Read-back checks title/description/contact_id/date. No priority/assignee/notification fields are set. |
| Note create/read | POST /api/documents requires type; type=doc supports ProseMirror JSON string content. Response and GET /api/documents/{id} are unwrapped document objects. Literal text nodes preserve selection, brief and source URLs; read-back compares paragraph text. It does not substitute a task for a note. |

Provider custom_properties support is specified but tenant behavior must be tested. Existing matching contacts are read and reused without mutation. No email is fabricated. No existing authoritative fields are overwritten.

## Persistence and failure semantics (C06)

Journal stores workspace-scoped request hash, expected mapped bodies, operation state, IDs and result. Canonical key ordering makes property order irrelevant. Same requestId with changed payload is rejected. Each write is preceded by a flushed atomic journal update to unknown; returned IDs are saved before GET. A known ID reconciles with GET; unknown writes without an ID stay unknown and are never blindly retried. Confirmed 429 can retry; contact success survives a later task failure. Successful operations are never repeated under the same request ID.

Single workspace filesystem lock excludes simultaneous writers, including other process instances using the same directory. Abrupt process death leaves a fail-closed `writer.lock` directory. Operator must first verify no writer process remains, then remove only that empty lock directory before restart; saved unknown states remain. Automatic stale-lock recovery, power-loss durability guarantees and distributed/multi-host operation are not implemented. D must agree this limitation or request a stronger journal implementation.

Reconciliation limitation: missing create response without a record ID cannot currently be resolved automatically. There is no verified provider idempotency key or unique request lookup in the fetched endpoints; no speculative replay occurs. A separate new requestId represents a new save: contacts deduplicate by profile URL, tasks/documents do not deduplicate across different request IDs. UI must retain requestId for retries.

## Changed files / evidence paths

- apps/api/src/adapters/ambiguous.ts
- apps/api/src/workspace/{model,mapping,journal,index,v1}.ts
- apps/api/tests/workspace/{openapi.snapshot.json,workspace.test.ts}
- docs/handoffs/agent-c.md

## Checks and results

- `node --import tsx --test apps/api/tests/workspace/workspace.test.ts`: 15 fixture tests pass (including contact field read-back and corrupt-journal rejection).
- `npm run typecheck -w @agentlayer/api`: pass.
- `npm run build -w @agentlayer/api`: pass. D now imports C via config/integrations.ts; standalone tests execute the module.
- Covered: contact/task linkage and evidence, request conflict, restart persistence, partial retry, unknown timeout, known-ID reconciliation, title/date prevalidation, stable identity reuse/ambiguity/namesake handling, real document payload shape and content verification, simultaneous writers, malformed response and pagination failure.

## Remaining acceptance / blockers

C01 runtime required fields, permissions, real record links and provider behavior are unverified. C02 shared contract bridge is fixture-tested and D config now wires it. C03 ambiguity is surfaced but a user-resolution UI/contract is not yet wired. C04/C05 live read-back and links, C06 crash-lock operational recovery and no-ID reconciliation, and C07 named workspace demo remain open. No claim of J1/J2 completion. D has added workspace tests to the API test harness.


## Integration verification (latest continuation)

D has applied the requested correction: `config/integrations.ts` now constructs `createWorkspaceCommitter(workspace)` and forwards server-held context/brief. The internal reused flag is no longer spread directly into the public schema.

Latest combined `npm run test -w @agentlayer/api`: 53 tests, 48 pass, 5 fail in D-owned app.test.ts while legacy routes are being migrated. All 15 C workspace tests pass. Observed failures include invalid/oversized legacy input (400 instead of 413), legacy demo research (400 instead of 200), and legacy task idempotence. This is not a green integrated API result; D owns the route/test migration. C did not edit those files.

External configuration blocker resolved after user supplied the API key: it is stored only in ignored apps/api/.env. Authenticated GET /api/workspaces returned exactly one active workspace, AgentLayer (id 9a7455fd-2353-437e-bd4b-fc2530004a62, slug agentlayer), role owner. Its verified ID was saved as AMBIGUOUS_WORKSPACE_ID in the same ignored env file. Runtime mode was not changed.

Live read-only evidence on 2026-09-12:
- GET /api/crm/contacts?limit=1: HTTP 200, API-Version 1, data/total/has_more envelope; zero contacts.
- GET /api/tasks?limit=1: HTTP 200, API-Version 1, data/total/has_more envelope; zero tasks.
- GET /api/documents?type=doc&limit=1: HTTP 200, API-Version 1; one existing document.
- Actual AmbiguousProvider.contacts() completed successfully.
- Actual AmbiguousProvider.read('note', existingDocumentId) completed, matching ID, type doc, string content. Existing content was not printed or changed.
- GET /api/workspaces: HTTP 200, single active workspace identity confirmed. Public OpenAPI was consulted for this read-only endpoint before calling it.

User explicitly approved the prepared three-record integration demo ("ano souhlas"). Authorization and workspace configuration are no longer blockers for this named scope. The approved synthetic test was executed, with no outreach, deletion or changes to existing records.


New safeguards: created contact read-back checks name, title, website and the two intended custom properties before creating a task; missing preserved company/profile data remains unknown with confirmed ID. Journal load rejects invalid operation sequences/states, missing confirmed IDs and missing expected write bodies instead of proceeding from a malformed file. Existing-contact reuse still deliberately leaves authoritative fields unchanged.


## Approved live write evidence

Artifacts: `apps/api/tests/workspace/live-demo-proposal.json`, `live-demo-result.json`, and `run-live-demo.ts` in the same directory.

Execution: `node --env-file=apps/api/.env --import tsx apps/api/tests/workspace/run-live-demo.ts --execute-approved-demo` (exit 0). Exactly three HTTP POST calls, all 201, in the verified AgentLayer workspace:

- Contact: `beaea8e2-cc41-49cb-8ad0-b84d3d382c64`.
- Linked task: `978fc28f-2dcb-4ae0-8b87-bbf7dbf90f19`; read-back contact_id matches the above contact.
- Document: `eb13605b-a8c3-41ef-bbd2-4f194e438ec0`; ProseMirror content preserves the exact synthetic selection, brief and source reference.

Each record was independently fetched again with HTTP 200 after the module's own verification. Result artifact keeps only relevant fields from synthetic records, not unrelated owner details. Controlled partial failure was injected before task network dispatch after the real contact succeeded; this is explicitly a local injected failure, not an observed provider outage. Retrying completed the task without recreating the contact. Repeating both requests with a new service object produced zero additional POSTs. A separate fresh Node process then replayed both persisted requests with a fetch guard rejecting POST: both succeeded, zero POST attempts. This proves actual process restart persistence for confirmed records.

This is live Ambiguous persistence evidence using labeled synthetic inputs, not live OpenAI/Exa research or browser J1/J2 proof. Existing records were untouched. Workspace UI deep links remain unverified/null; D should not infer full C07/J1/J2 acceptance from these API results alone. DELIVERY-PLAN completion remains D-owned.


## Playwright browser access update

User explicitly requested Playwright and no native browser tools. Playwright headless launch works; unauthenticated navigation and same-origin Authorization-header navigation both reach /login. The API key authenticates API reads/writes but did not establish a web UI session. A dedicated headed persistent Playwright browser was launched with CDP on 127.0.0.1:9333 using apps/api/tests/workspace/open-ambiguous-browser.mjs. Browser profile and session metadata are stored under ignored apps/api/.agentlayer/browser-verification. User login is pending. Prior generic browser-unavailable blocker is superseded by this concrete UI-authentication step; no additional write approval is needed.


## User-confirmed document UI verification

The user copied the exact synthetic note body, selection and source URL from Ambiguous, then explicitly confirmed: "ano je zobrazena tam. funguje" (original confirmation in conversation includes Czech diacritics). This is user-observed UI evidence that the created note renders correctly in Ambiguous. Repeating note-display verification via Playwright is unnecessary. It does not prove automated deep-link routing or contact/task UI display; those must remain distinguished from the already successful API read-back. No further sign-in is required just to verify this note's visible content.


## Stable profile identity correction

Generic profile URLs now retain query strings, fragments and path spelling. Only supported LinkedIn /in/<slug> profile paths discard tracking query/fragment and trailing slash. Previously stripping every query/hash could match distinct people at /profile?id=1 versus /profile?id=2, or hash-routed profiles. Regression covers actual commit selection (must create a distinct fixture contact), hash routes, normal LinkedIn normalization and lookalike domains. No external records were written or changed by this correction. Existing stored URLs that had already lost identity parameters cannot be recovered automatically; no such generic profile was used in the approved live synthetic demo.

Latest checks: node --import tsx --test apps/api/tests/workspace/workspace.test.ts: 20/20 pass; npm run typecheck -w @agentlayer/api: pass. D retains acceptance ownership. The plan's optional-date blocker remains stale relative to live-no-date-repair.json; no plan flags were changed by C.


## Submission evidence alignment (SC01 / SC03)

Updated assigned artifacts docs/submission/EVIDENCE.md and SOCIAL-POST.md to include the approved live three-record persistence, zero-create replay and repaired date. Prize explanation distinguishes synthetic inputs, conversation approval and user-confirmed note UI from unverified browser-to-workspace footage. Existing partner placeholders and publication boundaries remain. Nothing was published. A concise question for the already-open note URL is pending; no new sign-in or repeated note-display verification is requested.
