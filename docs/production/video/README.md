# AgentLayer historical evidence review

Local 120-second review of an immutable repository source snapshot. **This is historical evidence review, not a live browser demo, provider run, publication, or journey acceptance.** The snapshot date and hash prefix appear on every slide. J1/J2 were unaccepted in this snapshot.

## Reproduce locally

From the repository root, using the existing Windows tools:

```powershell
node scripts/production/video/build.mjs
node scripts/production/video/verify.mjs
node scripts/production/video/verify.mjs --require-current
node scripts/production/video/test.mjs
```

Ordinary builds read `active-snapshot.json` and only the validated bytes under `snapshots/<sha256>/files/`. They do not recapture worktree inputs. To deliberately capture a new snapshot **after reviewing the changed evidence and narration**:

```powershell
node scripts/production/video/build.mjs --refresh-snapshot-after-review
```

Refresh preserves older snapshots. Capture copies exactly the 13 text/SVG paths in `snapshot.mjs`'s allowlist, with their original bytes, sizes and SHA-256 hashes. It re-reads all inputs and compares file identity, size, timestamps and bytes after collection, failing on an observed concurrent change. This detects changes during collection; it is not a filesystem transaction or a guarantee against adversarial changes restored between observations. No repository-wide capture, credentials, provider access, or installation occurs.

`snapshot.json` preserves start/capture UTC times and provenance. Its SHA-256 is the directory name and is pinned in the final manifest. Snapshot content and metadata are never rewritten by ordinary builds or verification. If either snapshot J1/J2 flag is accepted, missing or invalid, this script's unaccepted-journey narration is rejected: review and revise the production before rendering a newly accepted scope.

Requires installed Playwright/Chromium, FFmpeg/FFprobe on PATH, Windows PowerShell/System.Speech, and local Arial/Consolas fonts. Chromium requests are blocked. Narration uses an installed English stock voice (preferring Microsoft Zira Desktop), not an imitation of David. Speech receives 0.15 seconds leading silence and at least 0.20 seconds trailing margin. Synthesis failure produces an explicitly labeled silent rough cut.

The build writes named outputs and intermediates only beneath `docs/production/video/`. Snapshot evidence makes future rebuilding independent of changes to the original source files. Rendering still depends on fonts, browser, speech voice and encoder versions; **toolchain-independent identical MP4 bytes are not promised**.

## Integrity versus freshness

Default verification checks internal historical integrity and reports `freshness.state` as `current`, `stale`, or `unknown`, with every changed/missing/unreadable source listed. An intact historical artifact can pass while stale. `--require-current` fails unless all 13 worktree files still match: there are no exceptions for delivery plans, handoffs, or undisplayed context.

Verification never updates the manifest or expected hashes. It writes a separate `integrity-check.json` receipt, including the manifest and snapshot hashes, current media probe, failures and freshness. The receipt is intentionally outside the manifest's artifact hashes. `verification.json` is the original build receipt; it is hashed but never substitutes for current verification.

Checks performed:

- Snapshot metadata hash, exact allowlist, original file byte lengths/hashes and provenance consistency.
- Every quotation against original snapshot bytes; exact original-byte hash/offsets and actual displayed start/end line references. CRLF is normalized only for display. Separate ranges remain separate cards.
- Narration/manifest scene equality, contiguous 120-second timeline and speech margin.
- Exact artifact and production-script inventory and byte hashes.
- Fresh `ffprobe -count_frames`: 120 seconds, 3,600 frames, H.264, 1600 x 900, 30 fps, yuv420p, AAC mono at 48 kHz.
- Fresh full `ffmpeg -v error -xerror` decode of the actual MP4 on every verification.
- Build-time browser layout overflow checks and decoded contact-sheet boundary frames.

The temporary-copy regression suite checks every source changed and missing, strict/default behavior, capture-time mutation, both accepted journey flags, snapshot metadata/byte corruption, excerpt text/line corruption, MP4 truncation, image/script corruption, and that verification does not rewrite manifests/artifacts. It never edits real source inputs or final artifacts; disposable copies stay beneath this video directory.

## Files and limitations

`AgentLayer-evidence-review.mp4` is the narrated 120-second artifact. `poster.png` is its first frame. `contact-sheet.png` contains 14 actual decoded frames: first, before/after each of six internal window boundaries, last. `narration.json` records the 14 scenes, exact excerpts and measured voice timings. `manifest.json` pins the snapshot, scripts and generated artifacts. Intermediates contain slides, WAVs, clips and layout diagnostics.

The source reports document earlier research and local synthetic-provider checks; this production does not independently repeat those checks, reopen cited pages, or verify saved workspace records. Poster crops are original illustrations, not product UI. Native toolbar, real-page extraction and workspace read-back are not demonstrated by this video. The hashes detect inconsistency but are not signed authenticity guarantees; the manifest excludes its own hash to avoid circularity.

Narration is synthetic. **Manual listening remains pending.** Visual contact-sheet inspection and successful decoding are media QA, not listening or product acceptance.

Standalone checks:

```powershell
ffprobe -v error -count_frames -show_streams -show_format -of json docs/production/video/AgentLayer-evidence-review.mp4
ffmpeg -v error -xerror -i docs/production/video/AgentLayer-evidence-review.mp4 -f null -
git diff --check -- docs/production/video scripts/production/video
```

## Latest local production check (2026-09-12)

The captured snapshot is `169a4c08290d3de84c00d194b4a160f2376278cc291e66cf00af855a0909c291`, captured at `2026-09-12T20:29:54.666Z`. An ordinary rebuild from this snapshot completed after the live handoff and delivery plan had changed.

- `node scripts/production/video/build.mjs`: passed; actual 120.000-second narrated export, 3,600 frames.
- `node scripts/production/video/verify.mjs`: passed historical integrity, explicitly reported stale handoff and delivery plan.
- `node scripts/production/video/verify.mjs --require-current`: expected exit 1 for those source differences, with every integrity check passed. Preserved in `strict-current-check.json`; the default receipt is `integrity-check.json`. Both reference the same unchanged manifest hash.
- Final decoded contact sheet and full-resolution poster/excerpt frame inspected: snapshot labels, quoted source ranges, captions, opening/ending and all six window boundaries visible without detected clipping.

These are local media checks only. Manual listening is still pending.

Regression result: `node scripts/production/video/test.mjs` passed all **12 test groups**, including individual changed/missing checks across all 13 source paths, grouped strict/default checks, capture-race rejection, J1/J2 conflict rejection, snapshot/excerpt/media/image/script corruption, and unchanged manifest/artifact hashes after verification. The successful suite removed its temporary copies. `git diff --check -- docs/production/video scripts/production/video` also passed.

An interrupted earlier test copy remains ignored at `test-temp-inTp4r/`: automatic approval review rejected its cleanup command with "blocked by policy" and gave no more specific reason. It is not part of the export or its manifest.
