# AgentLayer — submission copy

Copy status: **ready for the currently verified scope**. Author: **David Král, solo builder**. Use the full description as the default submission text, the short description for summaries, and the compact version for tight fields. These local texts have not been submitted. Repository/video/social links and full product acceptance are separate delivery items.

Project title: **AgentLayer**. Tagline: **Every app becomes agent-native.** Sources and deadline: [EVENT-REQUIREMENTS.md](EVENT-REQUIREMENTS.md). The tagline states the product vision; the descriptions below state the demonstrated scope.

## Compact description

AgentLayer uses GPT-5.6 Luna and Exa for sourced research and editable proposals from profiles or selected text. Workspace saving is under validation.

## Short description

AgentLayer turns page context into sourced research and editable work proposals. Its GPT-5.6 Luna and Exa workflow has been verified on profiles and selected text; full browser-to-workspace journeys remain under validation.

## Full description — current verified scope

Founders and business development teams often move from a person's profile to web research, then copy their findings into a workspace. AgentLayer is built to keep that context attached to the work. A profile leads to a contact and follow-up proposal; selected article text leads to a research-note proposal.

The research backend uses GPT-5.6 Luna and bounded Exa searches. It checks source references, distinguishes uncertain identities, and separates suggested next steps from supported findings. Three live backend runs have been verified: two public profiles and one selected passage. Their resulting drafts pass the shared validation schemas, with unknown contact fields left empty and no invented follow-up date.

The Chrome extension and workspace adapters have local automated coverage. Native toolbar operation and complete real-page journeys through saved Ambiguous contacts, tasks and notes still require acceptance. The verified live result today is sourced research and valid work proposals; it is not yet proof of the complete browser-to-workspace experience.

Editorial budgets: compact up to 160 characters, short up to 280, full up to 1,500. These are chosen working sizes, not claimed portal restrictions. All three versions preserve the verified scope and are ready to use; unknown form limits do not block this copy. Use the longest version the actual field accepts.

## Problem and approach

Founders and business development teams repeatedly copy profile details, research a company, collect sources and enter follow-ups elsewhere. AgentLayer keeps the current person or selected passage as the working context. Its interface offers the action appropriate to that context and invalidates an old proposal when the page changes.

The implementation combines a Chrome extension, a local TypeScript API, an OpenAI reasoning workflow with bounded Exa search, and Ambiguous workspace adapters. The model receives research tools, while application code validates the reviewed proposal and controls writes. Unknown information remains empty; suggestions are distinguished from sourced claims. A persistent local journal retains confirmed record IDs and uncertain write states for reconciliation.

## What is currently demonstrated

Local automated checks cover versioned contracts, authentication, profile and selection UI fixtures, safe text rendering, review/date handling, late-response invalidation, contact/task linkage, note mapping, partial retry and journal restart reconciliation. The built extension has also been tested against real local HTTP for pairing, extraction, missing-configuration feedback and navigation. These are local and synthetic-provider results.

Actual GPT-5.6 Luna and Exa research is now documented in [B's live evidence](../../apps/api/tests/research/live-evidence/README.md). After a correction that allowed person searches to reach first-party sites, both public profiles had matched identities and supported claims; the selected W3C passage produced a supported note finding. Final measured durations were 13,147 ms, 8,319 ms and 4,389 ms. These were direct backend runs with manually prepared contexts, not browser extraction or Save demonstrations.

Ambiguous tenant behavior, record links, native toolbar operation and full real-page journeys are not yet accepted. No external workspace records or messages were created by B's research checks. Source relevance was reviewed against the original pages; the three-case sample does not establish universal quality or resistance to all prompt injection.

## Proposed recording sequence (not yet recorded)

1. Open a real supported profile and activate AgentLayer using the native toolbar. Show the visible entity and editable extracted context.
2. Run live research. Show relevant source links, identity uncertainty and a suggested next step. Explain one research decision supported by the run evidence.
3. Review the contact and follow-up, deliberately choose an optional date, then Save. Open the actual contact and linked task; verify the saved date and source reference.
4. Select text on a different real article. Show that the interface changes to a research note. Review, save and open the actual document containing that selection and its sources.
5. State the supported scope and limitations. If a live step is unavailable, explicitly label that portion incomplete; do not replace it with an unlabeled fixture.

The required video is two minutes. Use the exact shot/voiceover plan in [VIDEO-PLAN.md](VIDEO-PLAN.md); confirm file format and hosting in the portal.

## Product acceptance tracked separately from ready copy

| Requirement | Current evidence | Still required |
| --- | --- | --- |
| G1 real environment | Built-extension local HTTP smoke; synthetic DOM suite | Native toolbar and real profile/article checks |
| G2 real agent and sources | [Three reviewed live research runs](../../apps/api/tests/research/live-evidence/README.md), citations, measured latency and valid drafts | D's gate acceptance; integrated browser evidence is separate |
| G3 real workspace work | C's provider mapping and HTTP journal tests | Designated demo workspace, actual contact/task/note IDs, links and read-back |
| G4 control and reliability | Validation, partial retry, unknown/restart and navigation tests | Final integrated real-browser/failure acceptance |
| G5 handoff | Updated README and this draft | Clean-profile full journey, real screenshots/video, confirmed event format |

## Limitations for final submission

- Chrome desktop; supported personal profiles and explicit text selection, not universal site understanding.
- No automated outreach, email sending, background profile harvesting or production account system.
- Single local workspace journal. An abrupt crash can require operator recovery of a stale writer lock.
- Uncertain writes without a known record ID cannot be blindly retried.
- Server-held proposals expire after 30 minutes and do not survive restart; saved journal status remains available.
- Provider tenant identity, permissions and record URLs require live verification.
- The SF portal displayed September 12, 16:30 PDT as its submission deadline. Team registration, individual eligibility and video hosting/upload details still need confirmation; the five required submission artifacts are known.

The active product acceptance source is [DELIVERY-PLAN.json](../DELIVERY-PLAN.json). The descriptions above are finalized for the evidence currently available. Expand their claims only when additional implementation and recorded evidence support them.

## Claim-to-evidence map for SB03

| Copy claim | Authoritative evidence | Publication boundary |
| --- | --- | --- |
| GPT-5.6 Luna with Exa performs live research | User-selected model configuration; [live reports and review](../../apps/api/tests/research/live-evidence/README.md) | Backend research only; do not imply completed browser journeys |
| Two profiles and one selection were verified | [Final actual report](../../apps/api/tests/research/live-evidence/broad-search-report.json) and its manual source review | Public pages, manually prepared contexts, small sample |
| Research yields valid contact/follow-up and note proposals | [Draft validation](../../apps/api/tests/research/live-evidence/draft-validation.json); [draft helper](../../apps/api/src/research/drafts.ts) | Proposals are not persisted records |
| Unknown fields/date stay empty | Public input contexts, draft helper and schema validation | Do not claim additional extracted or researched contact fields |
| Research is bounded and workspace writes are unavailable to the model | [Research runtime](../../apps/api/src/adapters/research.ts), [model tools](../../apps/api/src/research/model.ts), research failure tests | Does not prove universal model accuracy or injection resistance |
| Extension/workspace modules have local coverage | [D's current integration handoff](../handoffs/agent-d.md), [evidence index](EVIDENCE.md) | Synthetic provider and local browser evidence, not live workspace acceptance |
| J1/J2 save real records and users can open them | Missing final D04–D06 acceptance | Exclude this completed-flow claim until actual IDs, links and read-back are available |

SB01 has a title and three completed descriptions within the chosen editorial budgets. This is the canonical copy for the current verified delivery and can be reused for README, portal and social. SB03's full-product acceptance remains tracked against D06, but does not prevent using this evidence-aligned version. No form-limit investigation is needed to finish the writing task. D retains ownership of acceptance flags and publication; stronger J1/J2 claims require actual browser/workspace evidence.
