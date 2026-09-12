# Goal research handoff

Implemented, isolated module: `apps/api/src/research/goal-assessment.ts`.

```ts
const assessor = createGoalAssessor(
  { exaApiKey, openaiApiKey, model, limits },
  { fetcher }, // optional trusted injected Fetch, never request input
);
const assessment = await assessor.assess({ userGoal, snapshot }, { signal });
```

Input uses existing `PageSnapshot` and requires a nonempty goal (maximum 2,000 characters) and actual LinkedIn `/in/` URL shape. This validates the URL shape only; it does not prove the user visited a real page. Empty-goal suggestions and conversation turns remain coordinator-owned existing Codex behavior.

Output `GoalAssessment` includes profileUrl, userGoal, identityStatus (`matched`, `ambiguous`, `insufficient`), identityKind (`person`, `fictional_or_parody`, `unknown`), verdict (`worth_discussing`, `concerns`, `insufficient_evidence`), criteria, findings, unknowns, and sources. Findings carry criterion, text, stance, sourceIds and exact source quotations. Sources retain bounded evidence text for server reasoning; project only approved citation metadata to the browser when possible. Session/context/navigation/goal/run binding remains the coordinator's responsibility.

The module reuses the existing fixed-origin `searchExa` and bounded `postJson` transports. At most two Exa searches (fewer under maxToolCalls) precede one tool-free structured Responses assessment. Searches include the profile URL/visible context and goal text. Source count is capped at eight, duplicate URLs removed and the existing total evidence/response/time budgets enforced. Credentials stay in trusted server configuration. No arbitrary URL fetch, shell, model tool dispatch, write, or Slack action is available.

Assessment instructions distinguish fictional/parody identity from real people, use only goal-relevant professional conduct, exclude protected traits, and forbid name-based predetermined results. A matching name alone is insufficient: validated source and visible snapshot must share a name plus distinct discriminator. Findings require matched source IDs, known criteria, and exact quotations of at least 12 characters. Unsupported findings are omitted; ambiguity and missing sources force an insufficient verdict. Any remaining concern prevents a positive verdict. A fictional assessment carries an explicit demo warning.

Limit: quotation membership and identity anchors are structural checks, not semantic proof that prose follows from evidence. Human review, actual source quality, LinkedIn extraction, and the real two-profile demo still require live acceptance. This module does not manufacture a positive second candidate.

Verification:

- `npx tsx --test apps/api/src/research/goal-assessment.test.ts`: injected transports only; no provider calls, secrets, or test web pages.
- `npm run typecheck --workspace @agentlayer/api`: passed after module implementation.

Tests cover fixed transport/tool policy, goal isolation, empty evidence, ambiguous/name-only identity, unsupported quotes/IDs/criteria, positive-verdict gating, fictional labeling, cancellation, source/query/evidence budgets, deadline, sanitized failures, and rejection of model tool calls.

External acceptance remains `done:false`: actual LinkedIn DOM capture, live Exa/Responses results, user-reviewed Slack send and two-profile navigation.
