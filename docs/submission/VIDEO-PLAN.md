# AgentLayer: 120-second submission video plan

Status: `done:false`. Planning only; no footage, recording, export, upload or submission has been completed by this document. The user-supplied competition rules require a two-minute video. Target an exported duration of **00:02:00.000**; other portal upload constraints still require confirmation.

Evidence sources: [submission draft](DRAFT.md), [delivery acceptance plan](../DELIVERY-PLAN.json), and the latest sections of [D's handoff](../handoffs/agent-d.md) and [A's handoff](../handoffs/agent-a.md). These sources currently accept local automated and bundled-extension/local-HTTP checks. They do **not** accept live research, real Ambiguous records/read-back, native toolbar operation, or J1/J2. The current demo API does not generate successful simulated research/save results. Recheck these sources before choosing a script.

## Current recording branch

Use [the revised 120-second script](../production/story/VOICEOVER.md) for the currently available evidence. Three [recorded live backend research runs](../../apps/api/tests/research/live-evidence/README.md) now exist, using manually supplied contexts. Earlier statements here about no live research are superseded for those runs. They still do not prove current-page capture, workspace persistence or J1/J2. The older unavailable-provider fallback below is historical and must not be recorded unchanged. The primary live script remains conditional on actual complete-journey evidence.

## Recording readiness

The primary script is **conditional on a newly verified live J1**, with scene 6 additionally conditional on accepted live J2. Its present-tense statements are planned narration, not claims about current completion.

- `done:false` — Confirm native toolbar activation and context extraction on the actual supported profile to be filmed; keep the address bar and relevant profile details visible.
- `done:false` — Complete live research acceptance with the configured model and Exa. Preserve run metadata, source URLs and one claim-to-source match for this recording. Show uncertainty rather than inventing missing identity details.
- `done:false` — Confirm the designated Ambiguous demo workspace and authorized recording writes. Review the actual person, task and optional date before Save; retain proposal/request IDs privately with evidence.
- `done:false` — Complete J1: read back the actual contact and linked task, compare the reviewed fields/date/source reference and verify record URLs in the real workspace. A success toast or HTTP create response alone is insufficient.
- `done:false` — Complete J2 before filming its success: actual article selection, live research, reviewed note, saved document and authoritative read-back of the selection and sources. A task cannot stand in for a note.
- `done:false` — Rehearse the complete journey using the final build. Record actual latency, operation states and any cuts. If the result is partial or unknown, use the matching reduced script instead of narrating success.
- `done:false` — Choose the script branch against accepted evidence, check it against final submission text and remove any unsupported sentence before recording.

## Primary script: accepted live J1 and J2

The cue sheet is exactly **120 seconds**: 10 + 15 + 20 + 20 + 25 + 20 + 10. Read the quoted English voiceover within each interval; leave remaining time for cursor movement and readable evidence. Rehearse narration to these boundaries and hold the last frame to the endpoint. Do not speed up speech merely to cover provider waiting time.

| Time | Duration | Actual screen recording / shot | English voiceover |
| --- | ---: | --- | --- |
| 00:00–00:10 | 10 s | Actual supported profile, then native AgentLayer toolbar activation. Simple title overlay: “AgentLayer · Contextual browser actions”. | “AgentLayer brings an agent to the page where you already work. Here, a professional profile becomes the starting point for a useful follow-up.” |
| 00:10–00:25 | 15 s | Inline card next to the profile. Show person, role, company and URL; correct one field only if an actual correction is needed. Click **Research & prepare follow-up**. | “The profile supplies the person, company, and source context. I review the extracted details here, then ask the agent to research this person and prepare the next step.” |
| 00:25–00:45 | 20 s | Actual result from this run. Show a sourced claim, open its real source and return to the same proposal. Keep an uncertainty or suggestion label visible where relevant. | “The agent uses Exa to gather relevant sources, then prepares a brief with OpenAI. Here is one claim and the page supporting it. Suggestions remain distinguishable from sourced facts, and missing information stays empty.” |
| 00:45–01:05 | 20 s | Editable contact and linked follow-up. Edit task wording, explicitly select a date, review source reference, then click **Save contact + follow-up** once. | “Before anything is saved, I review the contact and the linked task. I can change the wording and deliberately choose a follow-up date. This Save action approves the reviewed records; it does not send a message to the person.” |
| 01:05–01:30 | 25 s | Show actual operation results, then real Ambiguous contact and task in the authorized workspace. Confirm linkage, edited wording, selected date and source reference against the recorded review. Use authoritative read-back as evidence if a verified navigable link is unavailable, and revise narration accordingly. | “These are the actual records in our Ambiguous workspace. The task is linked to this contact. Its wording, selected date, and source reference match what I reviewed. We have read the records back, so this demonstrates persisted work beyond the extension's success message.” |
| 01:30–01:50 | 20 s | **Only if J2 is accepted:** actual different article, highlighted passage, **Research selection**, note review, **Save research note**, then actual saved document/read-back containing the selection and sources. Use a labeled montage if the real run is longer. | “On an article, selecting text changes the available action to a research note. I review that note and save it. The resulting document preserves the selected passage and its sources. The context determines the kind of work.” |
| 01:50–02:00 | 10 s | Return to actual UI; final scope caption: “Chrome desktop · Supported profiles + explicit text selection”. | “This prototype supports selected browser workflows, with review before saving. AgentLayer makes the current page useful context for an agent that can act.” |

### If J1 works but J2 is not accepted

Replace only 01:30–01:50, preserving the **120-second total**. Keep the actual J1 contact/task on screen, then show a plain status card reading “Live profile journey verified · Selection-to-note journey not yet verified”. Do not show a successful note result.

Voiceover: “The verified workflow today is the profile-to-contact-and-follow-up journey. We also have a selection-to-note implementation, but its live journey is not yet accepted, so it is not part of this demonstration. The records you just saw are the verified result.”

Replace the last ten seconds with: “This prototype demonstrates one supported Chrome workflow, with review before saving. AgentLayer turns page context into research and verified follow-up work.”

This is an honest reduced submission, **not completion of the full J1 + J2 target**. Leave J2 and its unfulfilled gates open.

## Fallback: live J1 or Ambiguous read-back is blocked

Use this complete alternative if the primary success claims cannot be verified. A local prototype video can satisfy the video deliverable while openly showing incomplete product functionality; it does not satisfy live acceptance. Do not join a live research clip to a fixture save and imply one live journey.

The same intervals total **120 seconds**. Keep a persistent “Local prototype · live journey not verified” caption. Show only actual current UI/test evidence, never fabricated screenshots, provider replies, IDs or record pages.

| Time | Duration | Actual screen recording / shot | English voiceover |
| --- | ---: | --- | --- |
| 00:00–00:10 | 10 s | Actual local sample page, with its fictional-data label visible. | “AgentLayer is a contextual browser-agent prototype. This recording shows our working local integration; the complete live research and workspace journey is not yet verified.” |
| 00:10–00:25 | 15 s | Actual local injected card. If injection uses the automated browser harness, label it “Automated injection · native toolbar not verified”. Show editable detected fields. | “On this clearly labeled fictional profile, the extension places its controls beside the relevant content. The local checks exercise extraction and editing. This is evidence of the interface integration, not proof of a real LinkedIn journey.” |
| 00:25–00:45 | 20 s | Actual Settings/connection status, with token and secrets excluded; show current missing-configuration feedback. Do not change configuration merely to manufacture an error. | “The backend distinguishes local readiness from provider readiness. In the current configuration, live research and saving are unavailable. The interface reports that limitation instead of manufacturing a research brief or showing a successful save.” |
| 00:45–01:05 | 20 s | Actual labeled synthetic UI-test recording or fresh test results for editable review and optional date. If no safe visual harness is available, show the real test result and relevant test name. | “Separate synthetic tests cover the review form, the optional follow-up date, and the exact payload submitted after review. Those tests validate local behavior. They do not establish that a real contact or task has been created in Ambiguous.” |
| 01:05–01:30 | 25 s | Actual recent test output for contact/task linkage, journal and reconciliation; plain caption “Synthetic provider tests · no live record read-back”. | “Our workspace tests cover linked records, partial failures, stable retries, and journal recovery. We still need authoritative read-back in the designated Ambiguous workspace. No live record ID or success claim is substituted here for that missing integration evidence.” |
| 01:30–01:50 | 20 s | Actual labeled selection UI fixture/test evidence, or current passing selection test output. Show no invented saved document. | “Selected text has a different interface for preparing a research note. Local tests cover that change in context and reject stale responses when the page changes. A real article-to-saved-document journey remains an acceptance task.” |
| 01:50–02:00 | 10 s | Plain scope/status card matching actual remaining blockers. | “The next milestone is a verified live profile journey. AgentLayer's aim is contextual research and reviewed actions, directly where people already work.” |

If live research succeeds but workspace writes remain blocked, the actual research clip may replace 00:25–00:45 with this narration: “This is a live research result from the current page. Here is a supporting source. The workspace action remains unverified, so I am showing research only and will not claim that a record was saved.” Keep the blocked-write explanation and the 120-second timeline.

## Evidence-preserving edit and delivery checklist

- `done:false` — Confirm the portal's allowed video host or upload format, file-size limits, access requirements and deadline from the supplied rules/portal. Two minutes is confirmed by the user's instructions; the remaining constraints are not established here.
- `done:false` — Record the chosen branch at readable desktop resolution with real cursor actions. Capture source context, reviewed proposal and authoritative read-back from the same successful run. Keep private credentials and unrelated personal/workspace data outside the frame.
- `done:false` — Record English narration to the fixed cue windows; rehearse and check pronunciation, audibility and readability. Keep a separate raw recording as evidence.
- `done:false` — Edit only for time and legibility. Label sped-up or removed waits with “Wait shortened; actual elapsed: [measured duration]”. Preserve operation order and identity; do not imply a pre-existing record came from a failed Save. Repeated recordings may reuse records only when the footage and narration truthfully show reuse.
- `done:false` — Export a **120.000-second** master, for example MP4/H.264 with AAC audio if accepted by the portal. Verify duration from the exported file and play the complete file to check audio, text and cuts; change encoding if the portal requires another format.
- `done:false` — Upload the finished video to the accepted destination once publication is authorized. Uploading/link verification is a separate action; this plan does not perform it.
- `done:false` — Open the final link in a signed-out/private browser, confirm permission-free playback for judges, start-to-finish duration and audio, and verify that the link points to the final version rather than an editing page.
- `done:false` — Add the verified video URL to the final submission draft/portal field and compare every claim with accepted evidence. Record the final URL, export duration and verification timestamp in the submission handoff; do not mark submitted before the actual portal confirmation.
