# Engineering artifact review

Coordinator freshness update after round 2: current `routes/actions.ts` now imports and calls `prepareResearchDraft`, then assigns a server UUID and stores the validated proposal. ENGINEERING was corrected against that code; earlier observations below about an unused helper describe the prior revision. The coordinator also inspected `tests/e2e/evidence/live-research-api.json`: two in-process authenticated API requests with live providers, profile HTTP 200/ambiguous/zero claims and selection HTTP 200/one claim, no browser test or workspace writes. These are additional recorded evidence, not newly executed checks. No application code or product acceptance was changed in this documentation update.

Reviewed 2026-09-12 against the current checkout. Scope: local documentation only. Outputs are `ENGINEERING.md` and this file; coordinator acceptance remains separate. No delivery-plan statuses were changed.

## Self-review and revision

The first draft was reread against the implementation and revised before completion:

1. Made cancellation precise: generation checks suppress stale UI results, but `sendMessage` does not propagate the card's AbortSignal into the background fetch. Added that navigation warns with the old request reference and that card reload loses its in-memory recovery handle.
2. Distinguished durable journal recovery from volatile proposals. A retained operation ID supports read-back after restart; it does not restore an expired proposal or authorize a fresh commit. An unknown write with no ID remains unresolved.
3. Kept the actual proposal builder attributed to `routes/actions.ts`. `research/drafts.ts` exists and is independently testable, but it is not called by the current HTTP route.
4. Moved Chromium installation before the browser-suite command, added the conditional Windows installation override and specified the npm-script journal location.
5. Replaced broad live-configuration wording with exact environment variable names and clarified that workspace scope is a local journal partition, not a provider tenant selector.

The example deliberately shows rejection of a never-issued proposal. It contains no real token, personal data, workspace identifier or fabricated successful provider response. Its response is labeled expected behavior, not captured HTTP evidence.

## Exact source inventory

Paths below are relative to the repository root. Implementation files listed here were read directly; no handoff or submission draft was used as implementation evidence.

| Area | Exact files inspected | What was checked |
| --- | --- | --- |
| Brief and authority | `docs/production/BRIEFS.md`; `docs/PROJECT-CONCEPT.md`; `docs/DELIVERY-PLAN.json`; `README.md` | Audience, ownership, J1/J2 scope, current acceptance and setup caveats. The plan was also parsed to inspect task acceptance fields. |
| Commands | `package.json`; `apps/api/package.json`; `apps/extension/package.json`; `packages/contracts/package.json`; `apps/api/tsconfig.json`; `packages/contracts/tsconfig.json` | Script names, workspace installation, Node minimum, no-emit checks and test side effects. |
| Public v1 | `packages/contracts/src/index.ts`; `packages/contracts/src/v1.ts`; `packages/contracts/src/v1.test.ts`; `packages/contracts/src/fixtures/v1.ts` | Strict schemas, limits, reviewed actions, error shapes, result aggregation and eight fixture scenarios. |
| API and configuration | `apps/api/src/index.ts`; `apps/api/src/app.ts`; `apps/api/src/routes/actions.ts`; `apps/api/src/routes/errors.ts`; `apps/api/src/config/integrations.ts`; `apps/api/src/config/readiness.ts` | Startup wiring, fixed listener, validation, proposal lifetime, integration availability, commit binding and status semantics. Startup source was read; it was not executed. |
| Research | `apps/api/src/adapters/research.ts`; `apps/api/src/adapters/exa.ts`; `apps/api/src/research/model.ts`; `apps/api/src/research/types.ts`; `apps/api/src/research/http.ts`; `apps/api/src/research/validation.ts`; `apps/api/src/research/evidence.ts`; `apps/api/src/research/drafts.ts` | Model tool loop, provider destinations, budgets, sanitization, evidence/identity checks and separation of helper versus route proposal construction. |
| Workspace | `apps/api/src/workspace/index.ts`; `apps/api/src/workspace/journal.ts`; `apps/api/src/workspace/mapping.ts`; `apps/api/src/workspace/model.ts`; `apps/api/src/workspace/v1.ts`; `apps/api/src/adapters/ambiguous.ts` | Journal hashing and locks, before-dispatch state, retries, read-back, URL matching, document mapping and provider paths. |
| Extension context | `apps/extension/adapters/index.ts`; `apps/extension/adapters/types.ts`; `apps/extension/adapters/linkedin.ts`; `apps/extension/adapters/selection.ts`; `apps/extension/adapters/demo.ts`; `apps/extension/lib/context-lifecycle.ts` | Extraction priority, supported shapes, provenance, limits and invalidation. |
| Extension workflow | `apps/extension/lib/api-bridge.ts`; `apps/extension/lib/workflow.ts`; `apps/extension/components/AgentCard.tsx`; `apps/extension/entrypoints/background.ts`; `apps/extension/entrypoints/agent.content/index.tsx`; `apps/extension/wxt.config.ts` | Validation, sender/destination boundaries, review snapshot, stale-response guards, request retention and text/link rendering. |
| Test implementations read in full | `apps/extension/tests/background-tests.mjs`; `tests/e2e/extension-smoke.mjs`; contract tests/fixtures above | Background fetch is stubbed and bundling uses `write: false`; smoke requires pairing material and produces a screenshot. |
| Test discovery only | `apps/api/src/app.test.ts`; `apps/api/tests/research/research.test.ts`; `apps/api/tests/workspace/workspace.test.ts`; `apps/extension/tests/browser-tests.mjs` | `rg` inspected named cases and fetch/filesystem hooks. These suites were not run or audited line by line; discovery is not a passing-test claim. |

## Checks actually executed

Environment returned Node `v22.22.0` and npm `10.9.4`. The validation commands below ran from the repository root using PowerShell without loading a shell profile.

```powershell
node --version
npm --version
npm run typecheck
$env:TSX_DISABLE_CACHE = '1'
npm run test -w @agentlayer/contracts
node apps/extension/tests/background-tests.mjs
```

| Check | Observed result | Evidential boundary |
| --- | --- | --- |
| Root typecheck | Exit 0; API, extension and contracts passed | Static TypeScript verification, not runtime acceptance. |
| Contract tests | Exit 0; six passed, zero failed | Local schema fixtures only. Cache disabled for this run. |
| Background suite | Exit 0; PASS | Fixture transport verifies sender restrictions, fixed origin, redirects disabled, pairing/error handling, validation and encoded status path. No real token or network request. |
| Artifact review | Draft reread and revised once | Human-readable source comparison; not independent coordinator acceptance. |

Round 1 artifact validation passed: both example JSON objects conform to `CommitRequestSchema` and `ApiErrorSchema`; all 50 local Markdown link targets existed; ENGINEERING contained 1,166 whitespace-delimited words and one Mermaid block. The diagram was structurally inspected, not rendered. `git diff --check -- docs/production/technical` returned exit 0, although newly created untracked files are outside ordinary diff coverage. Scoped status showed only the new technical directory.

The first inline Node validator failed before execution because Windows PowerShell stripped nested quotes. Re-running the same check by piping a literal here-string into `node --import tsx --input-type=module` passed. This was a command-quoting correction, not an application or schema failure; no network request was made.

## Acceptance checks

- [x] Product explanation precedes implementation; English handoff identifies David Král as solo builder.
- [x] Small architecture diagram and a safe, explicitly synthetic request/error example.
- [x] Source links accompany implementation claims; exported interfaces and current route names identified.
- [x] Reproducible setup/check sequences distinguished from commands executed during this review.
- [x] Actual journal persistence, same-ID retry rules, unknown outcomes, proposal expiry and restart limits described.
- [x] Context invalidation, stale-result suppression and remaining cancellation/reload limits described.
- [x] Single-workspace configuration and local-versus-provider evidence separated.
- [x] Self-review produced concrete revisions rather than a blanket approval claim.
- [ ] Coordinator acceptance and independent fresh setup reproduction.
- [ ] Live J1/J2, provider read-back and native-toolbar acceptance.

## Factual uncertainties and limits

Provider endpoints and schemas are described as implemented, not a comprehensive verification of current vendor contracts. This reviewer called no provider. Round 2 inspected recorded live research, including model attribution, run latency and the author's manual source review; it did not rerun research or independently revisit those public pages. Current tenant identity, credentials and ongoing model availability remain unchecked. No `.env`, auth file, pairing-token file or persisted journal was read.

Evidence substring checks do not prove that a claim follows logically from a quotation. Source-based identity checks and DOM selectors still need real-page evaluation. The backend cannot detect browser navigation independently; cancellation is not proof that an external write stopped. An ambiguous identity is displayed as a warning, not enforced as a server-side prohibition on saving a reviewed named contact.

New record success depends on implemented read-back checks; reused contacts are checked for person type and matching profile reference, not overwritten to match every edited field. Operation links remain null in the implementation. The journal offers one local writer per workspace directory, not distributed locking, cross-host deduplication or a multi-tenant account system. A new request ID can create another task/document. Reconciliation never resumes a skipped task automatically.

Installation, builds, full API/workspace tests, DOM browser tests and e2e were not executed: they produce files, require browser/service setup, or read pairing material. No service was started or restarted. No app code, root configuration, dependency file, shared plan or existing submission draft was edited. No deployment, push, publication, messaging, external record creation or additional agent/process delegation occurred.

## Round 2 — independent coordinator-requested iteration

The coordinator identified that the original closing limitation could imply no live research evidence existed. Read these newly available artifacts in full, directly from the checkout:

- [Evidence README](../../../apps/api/tests/research/live-evidence/README.md): records actual OpenAI/Exa runs, model `gpt-5.6-luna`, manually prepared contexts, manual source review and the explicit exclusion of browser/workspace proof.
- [Broad-search report](../../../apps/api/tests/research/live-evidence/broad-search-report.json): three runs, `transport: live`, captured at `2026-09-12T19:57:14.340Z`; two profile briefs and one selection brief, with claims, sources, warnings and metrics.
- [Draft-validation record](../../../apps/api/tests/research/live-evidence/draft-validation.json): three matching context IDs, validated contact/follow-up or research-note drafts, each explicitly recording `workspaceWrites: false`.

Revised ENGINEERING's introduction, diagram qualification and closing evidence section to distinguish this reviewer's local checks, existing genuine backend research records, and still-unverified native-toolbar/browser/workspace journeys. Added source links, exact per-run counts/latencies, manual input provenance and model attribution. Preserved uncertainty: all accepted claims cite `s1` within their respective runs; Simon retains warnings; the selection's insufficient identity is not a failed person match. Three examples cannot establish universal quality or prompt-injection resistance.

The report's runner-level `acceptance` text still requests manual review, while its accompanying README records that review. Both were inspected; the latter is an author's review record, not a new independent source-page audit. `draft-validation.json` contains validation metadata rather than full proposals, so this iteration can check consistency but cannot revalidate those original proposals from that file alone. Locally reviewed draft identifiers do not prove issuance by the HTTP proposal store, a Save action or persistence.

No provider commands from the evidence README were executed. Prior test results above remain attributed to round 1; round 2 uses read-only artifact/schema checks rather than rerunning unrelated application suites. Coordinator acceptance and all delivery-plan gates remain unchanged.

Round 2 validation passed using a literal PowerShell here-string piped into `node --import tsx --input-type=module`, with `TSX_DISABLE_CACHE=1`: three recorded briefs conform to `ResearchBriefSchema`; all three draft metadata entries match their run/context/action and report validated with no workspace writes; claim/source counts, latencies and `s1` references match ENGINEERING. Both synthetic example objects still validate. All 59 local Markdown link targets exist, neither document has trailing whitespace, and ENGINEERING contains 1,339 whitespace-delimited words and one Mermaid block. `git diff --check -- docs/production/technical` also returned exit 0; the direct whitespace check covers untracked documents too.

The initial JSON parser encountered a UTF-8 BOM in an evidence file. The successful validator stripped only that leading marker in memory before parsing; no evidence artifact was modified. The revised introduction, diagram qualification, evidence section and review limitations were reread for consistency. No application test result or external acceptance was inferred from the artifact checks.
