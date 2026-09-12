# AgentLayer production pack

Prepared for **David Král**, solo builder. This folder contains local reviewable artifacts with different audiences and acceptance requirements.

| Artifact | Best use | Do not use it as |
| --- | --- | --- |
| [Engineering handoff](technical/ENGINEERING.md) | Technical review, architecture, setup and recovery reference | Proof that every live integration has passed |
| [Pitch copy](story/PITCH.md) | Current-state submission description and spoken introduction | An unconditional announcement of planned features |
| [120-second voiceover](story/VOICEOVER.md) | Recording guide for the evidence available today | A finished video or a continuous live product demonstration |
| [120-second evidence video](video/AgentLayer-evidence-review.mp4) / [production notes](video/README.md) | Narrated review of actual repository evidence, with source excerpts and captions | A recording of a successful browser-to-workspace journey |
| [Poster PNG](story/POSTER.png) / [editable SVG](story/POSTER.svg) | Supporting illustration, slide or social visual | A screenshot of a successful live workspace action |
| [Production briefs](BRIEFS.md) | Requirements for future iterations | A replacement for the product delivery plan |

The current story reflects recorded OpenAI/Exa backend research on manually prepared contexts. Full native-toolbar-to-workspace acceptance remains separate. A conditional live-release paragraph is intentionally kept apart from copy suitable for current use.

## Iteration tools

Original CLI task prompts are in `prompts/`. Technical and story production used independent `codex exec` runs; the technical document received an additional coordinator-requested revision in the same CLI session. Raw process logs remain ignored under `.agentlayer/production/`.

Re-render the vector poster and check canvas/text bounds with:

```powershell
node scripts/production/render-poster.mjs
```

The renderer uses the installed Playwright Chromium, rejects active/external SVG content and writes `story/POSTER.png`. A passing geometry check still needs visual inspection.

See [ACCEPTANCE.md](ACCEPTANCE.md) for reviewed requirements and remaining steps. Nothing in this folder has been posted, uploaded or submitted by the production runs.

## Evidence added after the video snapshot

The current [integration handoff](../handoffs/agent-d.md) and [HTTP/SSE report](../../tests/e2e/evidence/live-codex-http.json) record actual Codex inference through the running API on synthetic library-page text, completed in 6,983 ms. This extends the backend evidence; it does not prove native-toolbar activation or a real browser journey. The historical video does not include this later result.

A separate [read-only task audit](../../tests/e2e/evidence/optional-date-audit.json) found a persisted due date of 2026-09-26 where the reviewed proposal had `dueAt: null`. The audit records zero writes and identifies the observed date source as `sla`. This is evidence about that specific demo task, not a general provider guarantee. Until corrected and rechecked, submission copy must not claim that optional-date absence is preserved end to end. The task has been handed to the workspace owner; this documentation pass did not alter the provider record or application code.

Keep the video as a dated evidence review. Final live-release copy and footage must follow the accepted final product state, including resolution of this mismatch.
