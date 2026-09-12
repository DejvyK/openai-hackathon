# Story production review

Reviewed locally on 12 September 2026. Author credit throughout: **David Král, solo builder**. Outputs are drafts for coordinator acceptance, not published artifacts. Only `docs/production/story/**` was written by this production pass; shared files and status flags were left alone.

## Copy and evidence review

Read `docs/PROJECT-CONCEPT.md`, the active `docs/DELIVERY-PLAN.json`, `docs/production/BRIEFS.md`, current README, and submission `DRAFT.md`, `VIDEO-PLAN.md`, `EVENT-REQUIREMENTS.md`, `EVIDENCE.md`, and `SOCIAL-POST.md`, plus the top sections of all four agent handoffs. Also inspected the research evidence README, final report entries, and draft-validation JSON. No provider was called and no secret file was opened.

| Claim or decision | Evidence used | Review result |
| --- | --- | --- |
| Three recorded live research runs, two profiles and one selection | `apps/api/tests/research/live-evidence/README.md`, `broad-search-report.json`; current `docs/submission/DRAFT.md` | Supported as recorded backend evidence. Inputs were manually prepared. Not a new run, browser extraction, or accepted complete journey. |
| Valid proposals, unknown fields and no invented date | Research evidence README and `draft-validation.json` | Three validated drafts; every entry records `workspaceWrites:false`. No saved-record claim. |
| Chrome interface and workspace local coverage | Current A/D handoff sections; README checks | Described as documented local results. Tests were not rerun for this writing task. |
| Full live journey remains unverified | Current draft, evidence index, A/C/D limitations | Explicit in both pitch versions for current use, all video shots and the poster. Native toolbar and real record read-back remain open. |
| Conditional release paragraph | J1/J2 acceptance requirements in delivery plan | Physically separate section with prerequisite evidence. Not usable as current copy; task-only or J1-only delivery requires narrower wording. |
| Team and deadline | User instruction and `EVENT-REQUIREMENTS.md` | David Král alone; no AI teammates. Recorded SF cutoff is 12 September 16:30 PDT / 13 September 01:30 CEST, internal target 16:00 PDT / 01:00 CEST. Team registration and applicable deadline remain unconfirmed. |

Source disagreements were handled explicitly: older README/handoff configuration notes, the video plan and social fallback describe missing live research. Newer research reports and the current submission draft document actual backend runs. The evidence index still has open acceptance flags. Copy reports the recorded research result without promoting a formal gate to accepted or asserting current runtime readiness. Public repository/final commit, eligibility and submission completion are not claimed.

## One revision pass completed

After drafting all three artifacts, shortened the pitch opening to “keeps the next step tied to the page” and replaced an abstract closing with “carry the source through every step.” Reduced the poster's workspace label and status sentence to give them more space. Tightened the uncertain-save narration while preserving its meaning. Kept the current-state qualification even where stronger launch wording would be shorter.

Final whitespace-delimited counts: **88 words** in the short description (required 70–100), **210 words** in the judge description (required 180–250). Headings and production notes are excluded. Conditional text is a separate section and does not inflate either count.

## Voiceover review

Chosen branch uses an explainer and actual local evidence documents. It does not promise an available browser recording. Seven continuous shot windows total **120 seconds**. Spoken copy totals **253 words**, with **23 / 33 / 45 / 42 / 45 / 42 / 23** words per interval. At those windows, the fastest segment is approximately 138 words per minute; the overall average is 126.5. This leaves some reading and transition time, but rehearsal must confirm it.

Every shot names its actual capture source. Research report captions explicitly say recorded results and manually prepared contexts; local test captions explicitly say documented/synthetic evidence. No fake success shot, invented ID, provider response, or screen is requested. Document evidence is less direct than a working product demo; the script says so. Final footage, narration, precise export duration and playback have not been produced or verified.

## SVG review

`POSTER.svg` is an original static vector composition, with a `1600 × 900` canvas and matching `viewBox`. Four numbered cards read left to right: context, research, review, workspace. The workspace card has a dashed outline, a target label and “Live saves still to verify”; a high-contrast full-width band states the complete-journey boundary. The footer credits the solo builder and calls the visual a supporting illustration, not a screenshot.

Source review checked explicit text positions, card padding, hierarchy, status visibility, colors and line lengths. Palette: warm off-white, dark green, pale green, muted sand. Text uses a local Arial/Helvetica/sans-serif stack, with no font download. Main headline is 64 px, card titles 34 px, body 23 px, metadata 17–20 px. Manual line breaks keep copy inside intentional rows. No provider logos or app-like success badges are present.

PowerShell XML parsing passed. Structural inspection found **33 text elements**, **zero script/image/foreignObject/use elements**, and **zero href, CSS URL, font import or event-handler references**. SVG contains accessible title/description elements. This validates structure and self-containment, not rendered appearance.

Verification methods actually used:

```powershell
[xml]$svg = Get-Content -Raw -Encoding utf8 docs/production/story/POSTER.svg
$svg.DocumentElement | Select-Object width, height, viewBox
$svg.GetElementsByTagName('text').Count
$svg.SelectNodes("//*[local-name()='script' or local-name()='image' or local-name()='foreignObject' or local-name()='use']").Count
git diff --check -- docs/production/story
```

Additional read-only PowerShell checks counted words with `[regex]::Matches($text,'\S+')`, scanned SVG references, and resolved Markdown link targets with `Test-Path`. All checked link targets existed. `git diff --check` returned no errors, but these new files were untracked, so that command alone is not comprehensive content validation. No dependencies were installed.

## Coordinator review still required

Render the SVG at 1600 × 900 and inspect every card and the long boundary line for clipping, text wrapping/font substitution and optical balance. Also inspect at 800 × 450 for presentation readability. This pass did **not** render or visually inspect the image; source geometry is not pixel proof. Confirm the exact final evidence before recording or reusing copy. Rehearse and export the actual 120-second video, check portal field limits and the team's deadline, and handle acceptance/publication separately. No public link, upload, push, post, workspace write or submission was created.
