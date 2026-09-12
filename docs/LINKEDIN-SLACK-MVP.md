# AgentLayer — goal-driven LinkedIn → Slack MVP

UI update (2026-09-13): [Minimal task sidebar](MINIMAL-SIDEBAR.md) supersedes the visible goal/chat/forms layout and individual workspace-save confirmations below. The exact Slack preview and explicit Send remain required.

Status: `done:false`. This is the latest requested MVP scope. It supersedes the earlier contact/task/note demo priority, without deleting that implementation or its evidence. David Král is the sole human team member. Planning and implementation evidence must stay separate.

Implementation checkpoint: the goal UI, bounded Exa/model assessment, sourced findings UI and reviewed Slack API/UI are now wired in local code. See [integration evidence and remaining live acceptance](handoffs/linkedin-slack-integration.md). This does not change the live acceptance steps to done: actual LinkedIn profiles and Slack sending remain unverified.

## Desired result

David opens the actual LinkedIn URL of a Darth Vader profile with AgentLayer active. At the top of the existing right sidebar he enters a hiring goal. AgentLayer researches the visible profile using Exa and explains evidence-backed concerns relative to that goal. David follows an ordinary link or navigates to the second actual LinkedIn profile. The same goal remains active; the old analysis is cancelled and cleared. The new research produces a useful candidate brief and, if supported, a recommendation to discuss the person. David previews a message, chooses the designated Slack channel, and sends it. The interface shows the confirmed Slack result.

No new test pages, local imitation profiles, fake LinkedIn routes, profile creation, or prerecorded success masquerading as a live result. Existing fixture tests are not proof that these actual LinkedIn pages work.

David supplied the exact demo profiles:

- First: https://www.linkedin.com/in/darth-vader/
- Second: https://www.linkedin.com/in/william-bryk/ — David's intended positive candidate. The software must still base its recommendation on the applied goal and retrieved evidence, without a name-specific verdict.

The Slack destination is still awaiting David's input. Profile URLs are now known; live DOM access and end-to-end acceptance remain unverified.

## Sidebar behavior

The goal appears above the live assistant and action results:

```text
AgentLayer                                Pause

ENTER YOUR GOAL
[Find a team lead with demonstrated ...       ]
[Apply goal]   Clear
Goal active across this tab's navigation

CURRENT PROFILE
Name · role · source profile link

Researching / Findings / Needs more evidence
• Relevant experience, with source
• Concerns against your stated criteria, with source
• Unknowns to discuss in an interview

[Research profile]  [Prepare Slack message]
```

An example goal, not a prefilled claim about David's company: “Find a collaborative operations lead with demonstrated team leadership and constructive conflict resolution. Research each profile and suggest who is worth discussing with the team.” David can enter a different role and criteria.

With an applied goal, explain how each sourced finding relates to its criteria. Without a goal, provide up to three page-specific suggestions such as researching the profile, summarizing experience or preparing a shareable brief. Do not infer an unstated hiring role or label someone suitable without criteria. Suggested actions must be backed by available capabilities.

Apply changes the goal only when clicked; typing does not start repeated research. Clear restores suggestions mode. The goal persists in the active tab/session across navigation and sidebar reinjection, including temporary connection recovery. Separate tabs retain separate goals. Close ends the active session. A changed goal gets a new goal revision and invalidates previous research and unsent Slack proposals just as a changed profile does. Pause stops new automatic work and cancels the active run.

## Research and recommendations

Exa retrieves information; the reasoning layer compares evidence with the user's goal. Do not hardcode “Vader bad / second person good” from a name. The desired demo contrast must come from the chosen criteria and actual retrieved evidence. If evidence does not support the positive result, show uncertainty and keep the preview a neutral brief.

Separate visible LinkedIn data from external findings, and attach source URLs to the latter. Ambiguous identity must remain explicit: a fictional character or parody profile must not be conflated with a real person sharing the name. For the joke, use sourced professional conduct and leadership concerns relevant to the goal, not appearance, disability, age or other protected characteristics. The user makes interview decisions; the agent prepares reasons and discussion material.

On a new supported profile with an applied research goal, run one bounded assessment after the snapshot stabilizes. Retain the existing 750 ms debounce and cancellation semantics. Deduplicate by profile/context revision plus goal revision. No goal means page-grounded suggestions by default; Exa runs when the user chooses a research action. Failures and empty sources must not become invented recommendations.

The current Codex runner intentionally has no tools and sees only a page snapshot. It cannot currently call Exa. Reuse the existing bounded Exa research service behind the API, then pass the resulting cited evidence and the goal into the assessment step. Preserve the restricted Codex runtime; do not enable an unrestricted shell or arbitrary tools to add research.

## Slack handoff

Prepare an editable message containing the exact current profile URL, the user's goal, a concise assessment, supporting links, open questions, and a suggested next step. Preview the exact text and the workspace/channel before Send. For a positive candidate, recommend a team discussion rather than claim an interview has been scheduled.

Only explicit Send transmits the previewed message. Navigation or a goal edit invalidates an unsent preview. Server-side credentials and channel configuration never come from page content. The server binds the send request to the approved preview and its profile/goal revisions. A stable send ID prevents duplicate messages on retry; a timeout is unknown until reconciled, not a reason to blindly post again. Success requires the provider response and a usable message reference/link; retain per-operation uncertainty.

Slack connection method and destination remain to be confirmed. Do not replace Slack with Ambiguous, an in-memory message or a copied text blob and call the MVP complete. A preview is useful intermediate work, not proof of sending.

## Four independent owners

| Owner | Files / responsibility | Deliverable | Dependency |
| --- | --- | --- | --- |
| A — extension | Existing LiveAssistant, reactive background/state/connection, LinkedIn adapter and sidebar styles | Goal input, two-profile navigation, source-backed cards, editable Slack preview | D's versioned contract; actual profile URLs for DOM acceptance |
| B — research | Existing research modules and Exa adapter; new bounded goal-assessment module | Profile evidence, criteria assessment, neutral suggestions without a goal | D's contract; consume actual captured context |
| C — Slack | New isolated Slack adapter/service and its handoff; do not repurpose existing Ambiguous implementation | Connection check, approved-message send, deduplication and uncertain-send handling | Workspace/channel details; D's send contract |
| D — integration/QA | Shared schemas, API route wiring/configuration, shared manifests, acceptance plan | End-to-end contracts and actual LinkedIn → Exa → Slack evidence | Integrate A/B/C outputs |

All agents share the checkout. Do not revert others' changes. D owns shared contracts and root configuration. Owners may begin against agreed fixtures for request/response data; none should create replacement web pages. Existing Ambiguous features stay outside this demo's critical path.

## Required contract changes, proposed for D

- Session goal: explicit `userGoal` text separate from untrusted page snapshot; trim whitespace, use empty as no goal, cap at 2,000 characters; track `goalRevision` independently from navigation revision.
- Every assessment and actionable result binds session, context/profile, navigation revision, goal revision and run ID. D must include goal changes in deduplication and stale-result checks.
- Structured assessment: goal criteria, findings linked to evidence IDs, concerns, unknowns, and verdict `worth_discussing`, `concerns`, or `insufficient_evidence`. No unsupported numeric fit score.
- Suggestions mode: bounded list of supported action kinds, short user-facing labels and reasons. Never dispatch model-supplied arbitrary URLs, tools or commands.
- Slack preview/send: server-issued preview ID, bounded editable message, configured workspace/channel ID, stable send ID and explicit result `sent`, `failed`, or `unknown`. Reuse validation/auth conventions without claiming existing v1 workspace schemas already cover Slack.

## Delivery order and acceptance

1. `done:false` — D freezes the new contracts; A and B agree on goal/change semantics; C isolates the Slack interface. No provider writes in this step.
2. `done:false` — A adds the top goal field and session persistence; B adds goal-aware research and useful no-goal suggestions. Verify goal edits, clearing, cancellation and stale outputs without creating new web pages.
3. `done:false` — Inspect the two supplied real LinkedIn pages in David's authorized browser session. Correct extraction from actual visible DOM; show missing fields rather than filling them from assumptions. Do not copy browser profiles or automate login challenges.
4. `done:false` — Run Vader research with a recorded goal. Preserve actual Exa calls, source links and evidence supporting each concern. No name-based predetermined result.
5. `done:false` — Navigate to the second actual profile. Verify that the same goal persists, old analysis disappears, and research is based on the new person. Preserve evidence for the positive/uncertain assessment actually returned.
6. `done:false` — C/D validate Slack access for the named destination; A presents exact editable preview. Confirm missing connection, denied channel and uncertain delivery states are honest.
7. `done:false` — Explicit Send posts the reviewed message to the selected channel. Verify its actual text, profile/source links and message reference; retry must not create a second copy.
8. `done:false` — Clear the goal on an actual page and demonstrate relevant suggestions. Confirm there is no automatic message or hidden hiring decision.
9. `done:false` — Record one complete two-minute demo, then align the public repository, submission description and social post to this final scope. Historical evidence videos remain historical.

## Two-minute story

0–15 s: explain the goal and show its entry on the actual Vader LinkedIn page. 15–45 s: show Exa research, a source and goal-related concerns. 45–75 s: navigate to the second actual LinkedIn profile; show preserved goal and new findings. 75–105 s: review and send the Slack message, then open the confirmed message. 105–120 s: briefly clear the goal and show contextual suggestions. These are planned shots, not claims of completed functionality.

If the true source results, login state or Slack access prevent the intended demonstration, record the blocker. Do not swap in a local fake profile or manufacture an external success to meet the storyline.
