# Agent B — research handoff

## Integration handoff for D (2026-09-12)

Implementation is authorized by the user for B01–B06. Only B-owned paths are edited.
Received D's `@agentlayer/contracts/v1` during implementation and migrated the module to it.
`ResearchContext`/`ResearchBriefV1` are aliases of shared types. Input and output are validated with
the shared Zod schemas; the local interim protocol was removed.
`createResearcher(config).research(context, { signal, limits })` returns the v1 brief.
No workspace tools, writes or demo fallback exist in the runtime.

Dependency request: none; use native fetch and one bounded OpenAI Responses function-calling loop.
Configuration request: server-only OPENAI_API_KEY, EXA_API_KEY and explicit OPENAI_MODEL.
Observed environment: OpenAI key present (not connectivity-tested); Exa key and model absent.
No live acceptance is claimed. D owns route/config/manifest changes and DELIVERY-PLAN statuses.

### Ready for D integration

- `apps/api/src/adapters/research.ts`: `createResearcher(config, {fetcher?, onMetrics?})`.
  Config requires server OpenAI key, Exa key, explicit model. Optional limits are trusted server inputs.
  `research(context, {signal?, limits?})` returns the shared brief (mode live only).
- `apps/api/src/research/drafts.ts`: `prepareResearchDraft(context, brief)` returns
  `Omit<ActionProposal, 'proposalId'>`; D can spread it with a server-generated proposalId and validate/store it.
  Reviewed payload conforms to D's schemas: note.content, person without email/phone, dueAt:null.
  An ambiguous person gets a verify-identity task title. Selection and cited URLs are preserved.
  Oversized reviewed content fails with RESEARCH_LIMIT rather than silently truncating evidence.
- Suggestions are **plain strings without a Suggestion prefix**, so the existing D route can label them once.
  The draft helper labels them in task/note content. Unknown contact data comes only from supplied context;
  the model never generates contact fields or a follow-up date.
- `ResearchError` exposes sanitized code/retryable/operation. D should map provider 401/403, 429,
  timeout and cancellation distinctly; raw errors/provider bodies must not enter HTTP responses.
  Its operation is research/openai/exa; map provider names to API operation `research`.
- D's current config/integrations.ts already supplies the correct factory configuration. Default duration
  and tool-call count now come from shared LIMITS (60 seconds / 4 calls).

## Research strategy and evidence rules (B01–B05)

One native-fetch OpenAI Responses function-calling loop is the sole runtime. There is no SDK install,
alternative provider path, write tool or hidden demo fallback. The first turn requires a search;
later turns may refine it. Only one exa_search per turn is allowed. Queries are chosen by the model,
with person/company separated by purpose; company uses its Exa category, while person searches
include first-party sites rather than forcing the restrictive people category. Selections only allow selection searches.
The server fixes provider URLs, rejects extra tool arguments and disables redirects.

Defaults: 4 searches, at most 5 model calls, 60-second total deadline, 25-second per-request timeout,
4 results/search, 4,000 characters/source, 24,000 retained evidence characters, 20 sources maximum,
512,000 bytes/provider response, 4,000 output tokens/model call. Overrides have finite hard ceilings.
Provider errors fail visibly with no retry or demo conversion; user cancellation aborts pending requests.
Exa retains URL/title/author/publication date and server retrieval time; only usable HTTP(S) public
citation URLs with extracted text reach the model. Duplicate URLs retain their original evidence ID/text.

Facts must have known source IDs and exact supporting excerpts from the fetched text. The server
derives summary exclusively from accepted claims. A matched person requires corroborated name plus
company or exact profile URL; a different candidate name/company/profile produces ambiguity.
Name alone is insufficient. Person claims citing unconfirmed identities are suppressed. Company claims
require company evidence; selection cannot become a contact. No results yields an honest empty brief.

This validates provenance and conservative identity evidence, **not semantic entailment by proof**:
a real quotation does not guarantee the model's paraphrase is correct. Manual live evaluation remains
required, especially for subtle namesakes, stale company affiliations and instructions in page content.
The model has instructions to ignore page/tool injections. The fixture injection test proves the
tool/credential/destination boundary; it is not a claim of universal prompt-injection resistance.

## task_ids and acceptance status

| Task | Evidence | Remaining acceptance |
| --- | --- | --- |
| B01 | Separate person/company/selection strategy; fixtures for match, namesake, no results, injected instructions | Ready for D review |
| B02 | Responses + Exa adapters; user-selected gpt-5.6-luna and actual provider success | Ready for D review |
| B03 | Model-chosen query/refinement loop, finite limits, read-only Exa; actual call counts | Ready for D review |
| B04 | Citation/identity checks, source review of three final live briefs, failure fixtures | Ready for D review; sample limitations documented |
| B05 | Shared-schema review drafts validated from actual profile/selection briefs | Ready for D review; browser/Save is D's integrated gate |
| B06 | Three final actual runs, preserved initial failures, reviewed public evidence and measured latency | Ready for D review; outages/rate limits explicitly fixture-only |

No DELIVERY-PLAN done flags were changed by B.

## changed_files / evidence_paths

- `apps/api/src/adapters/{research,exa}.ts`
- `apps/api/src/research/{types,validation,http,model,evidence,drafts}.ts`
- `apps/api/tests/research/{fixtures,research.test,live-run}.ts`, `tsconfig.json`
- `docs/handoffs/agent-b.md`

## live_or_fixture and live-run instructions

The offline research tests use explicitly fictional data and an injected HTTP transport. Mode live
in those assertions exercises the production adapter path but is **not live provider evidence**.
The initial implementation used no provider calls. After the user supplied configuration, B executed
the live research runs documented below. No workspace writes, servers, dependency installations,
pushes or deployments were made by B.

## checks_and_results (final B state, 2026-09-12)

All following commands were executed from the repository root and exited 0:

```powershell
node --import tsx --test --test-reporter=dot apps/api/tests/research/research.test.ts
node node_modules/typescript/bin/tsc -p apps/api/tests/research/tsconfig.json --noEmit
npm run typecheck -w @agentlayer/api
npm exec --no -- tsup apps/api/src/adapters/research.ts apps/api/src/research/drafts.ts --format esm --platform node --target node22 --out-dir apps/api/dist/research
```

Results: **30/30 offline tests pass**, research test typecheck and API typecheck pass, ESM module build
succeeds (final build 249 ms). This explicitly builds the B entrypoints; it is not an end-to-end browser
or provider check. Shared D profile/incomplete-profile/selection fixtures with provenance methods also
pass through research and the shared brief/proposal schemas. Oversized note content fails before writes.

Tests cover profile/selection drafts, query refinement, URL deduplication, namesakes/company/person
mismatch, unknown fields, exact-profile corroboration, invented source IDs/quotes, unsafe URLs,
page/tool injections attempting workspace writes, model/tool/byte/evidence budgets, missing config,
both providers' 401/429/503 and timeout paths, cancellation, overall deadline, refusal/incomplete output,
encrypted reasoning replay, multi-call rejection, context mutation and shared-contract compatibility.

The fixture runner's sub-second execution times are not provider latency evidence. No live quality
or integration completion is inferred from these tests. The shared root build/browser gates remain D's.

Once D configures Exa/OpenAI/model, supply a local JSON array of 3–10 actual v1 contexts, including
both profile and selection. Do not commit private input. Execute from repository root:

```powershell
node --env-file-if-exists=apps/api/.env --import tsx apps/api/tests/research/live-run.ts <contexts.json>
```

The runner executes sequential research calls only and emits JSON with briefs, public citation URLs,
UTC timestamp, safe error codes and measured latency/call counts. It omits raw provider bodies,
headers, keys and input page text. Review output for private details before storing/sharing it.
It does not mark acceptance automatically; manually assess evidence relevance and claim meaning.

## blockers / next_dependency

- The initial missing-configuration blocker is resolved and both providers were exercised successfully.
- D owns final HTTP error mapping, proposal registration, final shared checks and acceptance.
- B's three-case live evidence is available below; integrated J1/J2/browser/workspace acceptance remains D's.

## Implementation references

Checked official references on 2026-09-12:
[OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling),
[OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs),
[Exa search](https://exa.ai/docs/reference/search).

## Configuration update from user

The user supplied the Exa credential and selected GPT-5.6 Luna. Saved EXA_API_KEY and
OPENAI_MODEL=gpt-5.6-luna in apps/api/.env, preserving other existing settings.
Verified env loading reports Exa and OpenAI credentials present and the requested model;
git check-ignore confirms apps/api/.env is ignored. No secret values are recorded here.
The earlier missing-Exa/model blocker is resolved. Provider connectivity and B06 live
research acceptance remain unverified; configuration presence alone is not live evidence.

## B06 live completion evidence — supersedes initial configuration-only status

Both providers were exercised on 2026-09-12: OpenAI returned HTTP 200 for the user-selected
`gpt-5.6-luna`; Exa returned two real documentation sources through the production adapter.
Six complete research runs then used actual OpenAI Responses and Exa requests. The first three
exposed a restrictive people-category search problem; the final three verify its correction.

Evidence directory: `apps/api/tests/research/live-evidence/`.
Read `README.md` there for input provenance, source-by-source review, limitations and commands.
`initial-report.json` is preserved; `broad-search-report.json` is the actual post-fix output;
`draft-validation.json` validates both follow-up drafts and the selection note without workspace writes.

Final cases: Simon Willison (matched, 3 claims, 13,147 ms), Andrej Karpathy (matched, 6 claims,
8,319 ms), W3C selection (1 supported claim, 4,389 ms). All accepted claims point to their original
public pages. Claims were manually checked against those pages; historical affiliations remain dated.
Simon retains warnings about discarded evidence. Rate-limit, empty-result and timeout coverage remains
explicitly offline; the original live run also demonstrates real namesake ambiguity.

After the fix: 30/30 research tests, research-test typecheck, API typecheck and explicit research ESM
build all passed. Evidence files were checked against both configured credentials and contain neither.
B01–B06 are ready for D's acceptance/status update. This does not prove a LinkedIn toolbar/Save journey
or any persistent Ambiguous result, and B has not changed DELIVERY-PLAN flags.

### Copy/evidence handoff for newly listed SB tasks

The current plan also lists SB01–SB03 but still assigns submission paths to D. The existing submission
draft currently says live research is unverified; D can replace that statement with this supported copy:

> AgentLayer uses GPT-5.6 Luna with bounded Exa searches to produce source-linked research from a
> profile or selected passage. Three live backend runs have been verified, including two public
> profiles and a selection from a W3C article. Contact/follow-up and research-note drafts validate
> against the shared schemas. Native browser journeys and persistent workspace results remain
> separate acceptance gates.

Evidence for each sentence: user-configured model plus `broad-search-report.json`; manual review in
`live-evidence/README.md`; `draft-validation.json`. This supports actual OpenAI/Exa attribution only.
It does not establish sponsor eligibility, CopilotKit use, or Best Use of Ambiguous workspace evidence.
SB03's final cross-product copy still depends on D06; do not publish a full J1/J2 claim from B's report.

## Submission ownership and copy update

Rechecked the complete coordination block: `submission_ownership_rule` explicitly assigns DRAFT.md
and SPONSOR-STRATEGY.md to B and overrides the older general D ownership. The previous handoff's
assumption that those paths still belonged to D is superseded.

Updated both owned documents with the verified GPT-5.6 Luna/Exa evidence, a short and full English
description, a claim-to-evidence map, and explicit live-backend versus browser/workspace limits.
The sponsor strategy now records actual OpenAI/Exa use and distinguishes it from unproven Ambiguous
results, unused optional integrations, prize eligibility and mandatory partner tags.
No portal or social publication occurred; no DELIVERY-PLAN flags changed.

SB01 still needs D's actual submission field limits for final size adaptation. SB02's strategy and
attribution are prepared with evidence. SB03 remains unlocked pending D06 and final URLs/video;
full J1/J2 success must not be inferred from the research report.
Copy validation: short 223 characters / 31 words; full 1,073 characters / 156 words. All 19 local
links in the two submission documents resolved. No application code changed in this copy pass.

## Remaining dependency audit

Rechecked current D handoff and submission requirements after preparing the copy: D06 has no accepted
real-browser/workspace evidence and actual team-form limits remain unspecified. A direct read of
`https://sf.aitinkerers.org/hackathons/h_XWWQL5eKfJM` returned HTTP 403. Browser inventory exposed no
browsers, and creating an in-app browser returned `Browser is not available: iab`.
This proves the current inspection path is unavailable, not that the user lacks portal access.
No form limits are inferred from this failure. SB01 size adaptation and SB03 lock require the actual
field constraints and D06 evidence; B's implementation/live research and draft copy are already handed off.

## User direction: finish copy with reasonable defaults

The user explicitly asked B to choose reasonable lengths and finish instead of blocking on unknown
form limits. DRAFT.md is now the canonical, ready copy for the currently verified scope, with a compact
160-character budget, short 280-character budget and full 1,500-character budget. These are editorial
choices, not invented portal rules. The existing source/evidence qualifications are preserved.

The earlier form-limit blocker is removed. D06 remains a full-product acceptance dependency, not a
reason to leave the current writing task unfinished. Publication and stronger workspace claims remain
separate; no external post or submission was made. D owns DELIVERY-PLAN flags.

## Final B delivery audit

The assigned B implementation and writing deliverables are finished. This closes B's work, not
the entire A/C/D product or its live browser/workspace acceptance. Central done flags remain D-owned.

| Requirement | Completion evidence |
| --- | --- |
| B01 strategy/evals | Separate query purposes, evidence rules and matched/namesake/empty/injection cases in research sources and 30 passing tests |
| B02 provider runtime | One OpenAI Responses loop, user-selected gpt-5.6-luna, Exa adapter, server env, bounded HTTP, actual provider runs |
| B03 agent decisions/limits | Actual model/tool-call counts, query refinement, finite duration/results/text/bytes/token caps, sole read-only search tool |
| B04 citations/identity | Shared brief validation, fetched-source/quote checks, uncertainty handling, manual original-page review of three actual briefs |
| B05 proposals | Actual research briefs produce shared-schema contact/follow-up and selection-note drafts; unknown data/date preserved |
| B06 live handoff | Three final live runs including selection, measured latency, reviewed redacted artifacts; namesake evidence and clearly labeled fixture failures |
| SB01 title/descriptions | AgentLayer title; compact 150, short 223 and full 1,073 characters, within user-authorized editorial budgets |
| SB02 attribution | Sponsor strategy separates proven OpenAI/Exa use, intended Ambiguous value, optional integrations, prizes and partner tagging |
| SB03 canonical copy | DRAFT.md is ready for the currently verified scope, includes claim-to-evidence map and explicitly identifies unaccepted J1/J2 |

Final revalidation: 30 research tests passed; the saved final live report contains three successful
nonempty research briefs including selection, and each still validates with its generated proposal
against current shared schemas. No repeated paid live calls were needed. Config still selects the
requested model and contains both provider credentials. Typecheck/build evidence is recorded above.
No new B defect or requested correction was present in D's current handoff.

## Reactive Codex read-and-suggest delivery — 2026-09-12

User authorized the navigation-reactive Codex implementation. New B-owned files: `apps/api/src/research/codex.ts`, `codex.test.ts`, `codex.probe.ts`. No existing research, workspace, schema, manifest or D-owned integration files changed.

Public interface: `createCodexReactiveRunner({ executable?, model?, maxRunMs?, onDiagnostic? })` returns D's `ReactiveRunner`. Executable auto-discovery supports this Windows npm-native installation; non-Windows uses PATH. The synchronous factory validates `codex-cli 0.153.2`; other versions fail closed until their actual tool catalog is revalidated. This is deliberate because app-server/environment controls are experimental. No npm dependencies. D owns startup/environment/readiness wiring.

Each snapshot gets a fresh ephemeral Codex thread/process and isolated temporary working directory. Existing local Codex authentication stays server-side; no auth material is copied or printed. Current snapshot only, not cross-site conversation history. Thread and turn explicitly specify `environments: []`; shell, apps, plugins, MCP, browser, code execution and agent tools are disabled. Startup first reads effective config without starting a thread, then disables each inherited MCP server by name and rechecks; an empty MCP table alone does not override inherited entries. Unknown/non-simple MCP names fail closed. Model input is serialized untrusted snapshot data under fixed instructions. No automatic research tools or workspace writes. Responses are grounded in visible text with empty evidenceRefs (no invented source IDs).

Bounds: maximum two concurrent processes per factory, 55-second deadline, 12,000 output characters, 1 MB JSON-line buffer, 500 ms stream batching, strict unexpected tool-item/request rejection. AbortSignal sends `turn/interrupt`; cleanup allows its acknowledgement briefly, closes stdio, terminates the owned child if necessary and awaits actual exit before removing its own temp directory. No shared runtime is stopped by B. Late browser/server output filtering remains D/A responsibility.

Validation:

- `node --import tsx --test apps/api/src/research/codex.test.ts`: 3 passed. Includes invalid-version fail-closed and pre-abort no-event checks. Its catalog test runs the actual installed CLI against a local HTTP fixture, intercepts the real outgoing model request and asserts zero tools plus `readOnly`/`networkAccess:false`; it does not call a provider model.
- `npm run typecheck -w @agentlayer/api`: passed.
- `node --import tsx apps/api/src/research/codex.probe.ts --catalog`: actual CLI 0.153.2 request for gpt-5.6-terra contained toolCount 0, toolCatalog [], toolChoice auto; readOnly/networkAccess false. This validates policy mechanics against installed CLI, not model quality.
- `node --import tsx apps/api/src/research/codex.probe.ts --live`: actual Codex inference returned streamed Czech summary of the innocuous supplied library-hours snapshot, uncertainty and two useful suggested steps. Completed in 6,022 ms; process_exited observed, exit code 0. No tools/records/messages/real webpage access involved.
- `node --import tsx apps/api/src/research/codex.probe.ts --cancel`: aborted on first message delta; observed interrupt_requested, interrupt_acknowledged, process_exited; no completed event. Total 3,911 ms, exit code 0. Actual model turn cancellation, not only hiding its output.

Sources used: official https://learn.chatgpt.com/docs/app-server and https://learn.chatgpt.com/docs/config-schema.json; generated local experimental app-server TypeScript protocol. Local protocol uses thread sandbox `read-only` and returned policy `readOnly` (do not substitute documentation example casing). Browser-to-live-Codex integrated acceptance still belongs to A/D. Existing profile/research/save journeys remain separate gates.
