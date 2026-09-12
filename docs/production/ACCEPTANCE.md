# Production acceptance

Two bounded CLI jobs were launched using `codex exec --dangerously-bypass-approvals-and-sandbox --json`, with UTF-8 prompts passed through stdin and independent output directories. Local CLI version observed: 0.153.2. No model override was supplied. The requested CLI permission mode does not expand the publication or provider-write scope of the task.

## Required evidence

| Artifact | Intended use | Acceptance | Current state |
| --- | --- | --- | --- |
| Technical handoff | Reviewer/developer setup and architecture | Current-code source references, correct commands, truthful runtime limitations | Accepted as a local handoff after round 2 and a coordinator freshness correction for shared draft construction and two later API-path probes; one architecture diagram |
| Pitch | Submission description and spoken introduction | Solo authorship, clear context value, verified current-state copy | Accepted as current-state draft: 88-word short copy and 210-word judge copy; portal limits pending |
| Voiceover | Recording guide | 120-second total, actual evidence branch, no fictional success | Accepted as a recording script: seven windows, 120 seconds, 253 spoken words; an adapted narrated export now exists in video/ |
| SVG + PNG | Supporting visual or social illustration | Self-contained 1600×900, readable, no clipping, clear prototype status | Accepted after Chromium render and visual inspection at 1600×900 and 800×450; use full resolution for reading the smaller evidence captions |
| Evidence-review MP4 | Narrated walkthrough of recorded evidence | Exact source excerpts, visible scope, 120-second export, captions, intact audio segments | Local export produced and technically checked; final listening/playback and submission suitability remain open |

## Scope of acceptance

Accepting these artifacts does not accept the product's live J1/J2 or mean the video/social/repository/portal has been published. Final recorded footage still needs to show actual accepted functionality, and posting needs the concrete destination/account. Technical and narrative artifacts must agree about what is implemented versus externally verified.

## Iteration log

1. Two initial bounded CLI jobs completed. Technical work used thread `01a09735-b826-7ff1-9ae8-68ba6905f3c9`; story work used thread `01a09735-f2bf-7233-b887-760162549957`. Detailed source inspections and local checks are recorded in each track's `REVIEW.md`.
2. Coordinator requested a technical revision because the original limitation paragraph could imply that no live research evidence existed. The same technical CLI thread was resumed with `prompts/technical-revision.md`; its process was polled to terminal exit 0. The revised document distinguishes local checks, three recorded live research runs with manual contexts, and missing browser/workspace proof.
3. Coordinator read the revised evidence section and both story documents. Current copy does not turn draft validation into a successful Save or claim that backend inputs came from extension capture. Conditional live-release copy remains explicitly gated.
4. Coordinator checked all 73 local Markdown links across this production pack, found no replacement characters, and independently counted 1,339 engineering words and one Mermaid diagram. The Mermaid source is provided; its rendered layout has not been reviewed.
5. `node scripts/production/render-poster.mjs` passed: width 1600, height 900, 33 text elements, zero text bounds outside the canvas. Coordinator inspected the PNG: four cards, status band and author footer are readable without visible clipping at full resolution. A separate 800×450 Chromium preview was also inspected: main hierarchy and status remain readable, while fine captions benefit from full resolution. Source SVG remains editable.

## Remaining delivery work

- Final snapshot-worker result: CLI process completed with exit 0. All 12 regression groups passed, covering all 13 source paths, changed/missing inputs, capture-time mutation, snapshot/excerpt/media/script corruption and non-mutating verification. Default verification passed historical integrity with explicit stale-source reporting; strict current-source verification returned the expected exit 1. No additional test rerun was needed for this receipt review.
- Local production is ready for review: technical handoff, pitch, poster, timed script, narrated evidence video, reproducible snapshot and LinkedIn preparation. Remaining items below require current product evidence, human listening or concrete publication/account details; they are not silently accepted by the media tests.
- Snapshot iteration: video sources are now preserved as 13 allowlisted original files under `video/snapshots/`. Ordinary rebuilds use that snapshot. Verification reads the actual MP4 and does not rewrite the manifest; historical integrity and worktree freshness are reported separately. The reviewed final export passes integrity while current-source parity is stale for the handoff and delivery plan; strict `--require-current` correctly fails. This does not close product or publication gates. Narration still needs manual listening.
- Freshness audit: a subsequent `verify.mjs` run correctly failed because `docs/handoffs/agent-d.md` gained a new reactive-sidebar contract section after rendering. Original media checks remain historical results; current-source parity is no longer green. See `VIDEO-FRESHNESS.json` for exact excerpt comparison and both hashes. Regenerate from the agreed final snapshot before calling the video current submission evidence. Do not replace stored render-time hashes merely to make this check pass.
- Video iteration: the final visual revision was independently checked with FFprobe (120.000000 seconds, 4,483,615 bytes), a full FFmpeg decode (exit 0), and all five generated-artifact hashes. Coordinator inspected the contact sheet and revised opening frame. The export uses stock Microsoft Zira narration, captions and 13 hashed source files. These checks do not establish subjective speech quality or public playback.
- `done:false` — Listen to and play through the generated evidence video in `video/`; it has a voiced local export, separate from a real product recording. Check pronunciation and judge-facing suitability before publication.
- `done:false` — Capture the complete real product journey when live acceptance exists; revise the script before replacing the evidence-review branch.
- `done:false` — Verify complete live J1/J2 before switching to conditional release copy. Recorded backend reports alone do not satisfy this.
- `done:false` — Check current evidence and portal field limits immediately before finalizing submission copy.
- `done:false` — Publish the authorized final repository/video/social artifacts and verify public links; complete the actual portal submission in the specified account.

No application changes, provider calls, workspace writes or publication were performed during coordinator artifact acceptance. Local acceptance here does not change product or submission task statuses.
