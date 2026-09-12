# Live research acceptance — 2026-09-12

These are actual OpenAI + Exa runs, not injected transports. The model was
`gpt-5.6-luna`, explicitly selected by the user and loaded from the ignored server env.
No contact, task, note or message was written to an external workspace.

## Input provenance and scope

`contexts.json` contains manually prepared v1 contexts based on inspected public pages:
[Simon Willison](https://simonwillison.net/about/),
[Andrej Karpathy](https://karpathy.ai/),
and a short passage from [W3C accessibility introduction](https://www.w3.org/WAI/fundamentals/accessibility-intro/).
`method:user_edit` records that these were supplied directly to the research module.
This is B's provider/research proof, not proof of LinkedIn extraction, native toolbar operation,
the extension journey, Save, or workspace persistence. Unprovided role/company values remain null.

## Observed issue and correction

`initial-report.json` preserves the first three real runs. The person searches forced Exa's
people category, returning professional-network namesakes instead of the supplied first-party sites.
The two profiles consequently yielded no accepted claims: one ambiguous, one insufficient.
This was an honest uncertainty result but inadequate useful research for those inputs.

The adapter now leaves person search unrestricted by category. Company searches still use the
company category; purpose remains explicit. The prompt asks for a query containing the supplied
profile URL/domain and prefers first-party evidence. It also excludes jokes/fantasy biographies
and clarifies that identityMatches should concern the target rather than every returned person.
The regression assertion verifies person searches do not force the restrictive category.

## Final live run review

`broad-search-report.json` is the unmodified runner output after that change.

| Context | Identity | Claims | Sources | Model / Exa calls | Latency |
| --- | --- | ---: | ---: | --- | ---: |
| Simon Willison | matched | 3 | 4 | 3 / 2 | 13,147 ms |
| Andrej Karpathy | matched | 6 | 4 | 2 / 1 | 8,319 ms |
| W3C selection | insufficient (no person to identify) | 1 | 1 | 2 / 1 | 4,389 ms |

Manual review against the linked original pages:

- Simon: all three accepted claims concern his projects and stated professional history and
  are supported by the About page. The result retains warnings for discarded identity/claim
  assessments; it does not imply that all returned sources independently corroborate him.
- Andrej: all six accepted claims concern the biography, educational work, and dated employment
  history shown on his personal site. Historical affiliations are dated rather than presented
  as current employment. The site's fantasy/unicorn paragraph did not enter the brief.
- W3C: the single accepted definition is supported by the original section. Empty suggestions
  are valid; the useful result is the source-backed note, not an invented next action.
- Every accepted claim cites s1, the corresponding original public page. Source IDs/URLs and
  retrieval timestamps are preserved in the actual report. This small sample does not establish
  universal research quality or prompt-injection resistance.

`draft-validation.json` records successful shared ResearchBrief/ActionProposal schema validation
for all three actual briefs. The contact drafts have no invented email/phone/date, and the note
retains the original selected text. Those proposal IDs were local review identifiers only.

## Failure evaluation

The first live report exercised a real namesake/retrieval ambiguity. The final adapter is also
covered by deterministic tests for different names/companies, insufficient identity, empty results,
both providers' 401/429/503, per-request timeout and overall cancellation/deadline. All 30 tests
passed after the correction. Rate limiting and outages were simulated at the HTTP boundary;
we did not intentionally exhaust a live provider quota or claim those simulations as live outages.

## Reproduction

From repository root, with the user's server configuration:

```powershell
node --env-file=apps/api/.env --import tsx apps/api/tests/research/live-run.ts apps/api/tests/research/live-evidence/contexts.json
node --import tsx --test --test-reporter=dot apps/api/tests/research/research.test.ts
```

Search results and model wording can change. Inspect each new report before accepting it.
Only public evidence and safe metadata are stored here; keys, headers and raw provider bodies
are excluded. D owns DELIVERY-PLAN acceptance flags and integrated product/browser gates.
