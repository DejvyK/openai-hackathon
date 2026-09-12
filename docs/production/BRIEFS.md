# AgentLayer — production briefs

Owner: David Král, solo builder. These briefs authorize local artifact production and iteration. They do not authorize publishing, provider writes, or changing application behavior.

## Track 1: engineering handoff

Audience: a technical judge or developer who has not followed the conversation.

Purpose: understand the actual system, run it, identify its trust boundaries, and reproduce the accepted evidence.

Deliverables: `docs/production/technical/ENGINEERING.md` and `REVIEW.md`.

Requirements:

- Explain context capture, structured research, reviewed proposal, commit and reconciliation using actual paths and exported interfaces.
- Include one small architecture diagram and a concise request/response example without secrets or fabricated provider results.
- Document exact local setup and checks; distinguish implemented, locally tested, and live-verified.
- Describe the current failure semantics and limits, including proposal expiry, journal recovery and unknown writes.
- Every implementation claim has a source pointer. No claims from an old handoff if current code contradicts it.
- Prefer a readable 900–1500-word handoff over an exhaustive API dump.

Acceptance: coordinator checks source references, command names and live/demo statements. Errors must be revised before use.

## Track 2: judge-facing story and visual

Audience: a hackathon judge or potential user; minimal implementation detail.

Purpose: explain why an agent belongs on the page and show the value of reviewed workspace actions.

Deliverables: `docs/production/story/PITCH.md`, `VOICEOVER.md`, `POSTER.svg`, and `REVIEW.md`.

Requirements:

- Write in English, credit David Král as a solo builder; AI tools are not human teammates.
- Produce a concise current-state description ready for review and a separately labeled live-release variant conditional on evidence.
- Fit narration into the required 120-second sequence; mark the chosen evidence branch explicitly.
- Create a polished 1600×900 original SVG explainer, with no external fonts/assets, no invented sponsor logos, and a visible prototype/evidence status.
- The visual should explain context → research → review → workspace action. Treat missing live acceptance honestly; do not render a fake success screen as evidence.
- Use restrained typography and concise useful copy. No generic AI buzzwords or universal-support claim.

Acceptance: coordinator reviews copy against evidence, renders the SVG and inspects readability/clipping. The result must be usable as a supporting illustration, not mislabeled as a recording of the product.

## Execution and iteration

Two concurrent Codex CLI workers, each with exclusive ownership of its output directory. Prompts live in `prompts/`; temporary logs and final receipts live under ignored `.agentlayer/production/`. Workers do not edit shared plans, manifests or application code. The coordinator reviews and requests focused revisions using the same task context.

Status: outputs are not accepted merely because a CLI process exits successfully. Record checked requirements and remaining publication/live-evidence dependencies in `ACCEPTANCE.md`.
