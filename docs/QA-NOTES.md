# Current v1 QA ? 2026-09-12

The scaffold runbook below is archived historical evidence. Use README for current commands and configuration.

Current local evidence:
- `npm test`: 55 API/research/workspace and 6 contracts tests passed.
- `npm run typecheck`: passed across all workspaces.
- `npm run build`: API and extension passed; dependency annotation warnings only.
- `node apps/extension/tests/browser-tests.mjs`: five grouped synthetic browser scenarios passed, no page errors. Includes three profile variants, selection note, literal text, optional date, partial/reused retry, timeout reconciliation and context changes.
- `npm run test:e2e`: built extension and local API passed options pairing, v1 settings, extraction, no duplicate mounting, fail-closed research, SPA invalidation and invalid-token feedback. Screenshot `.agentlayer/extension-smoke.png`.
- `/ready`: local-api, protocol v1, demo. This is process readiness, not provider connectivity.

Unverified: native toolbar click, three actual profiles/two actual articles, live OpenAI/Exa research, actual Ambiguous contact/task/document links and read-back, clean-profile full live journey, event rules and submission assets. No external writes were made in this verification.

For live acceptance, record the actual context URL and timestamp, model/Exa run metadata and citations, reviewed fields/date, save request ID, actual contact/task/note IDs, authoritative read-back and opened URLs. Redact secrets. Record partial/unknown separately; never substitute fixture IDs for provider records.

---

## Archived scaffold QA (not current instructions)

# AgentLayer scaffold QA

This is a manual runbook, not a completed test report. QA author inspected source only; no browser session, install, server launch or external provider request was performed. Record actual results below after execution.

## Windows setup

Use Node 22 or newer. Run commands from the repository root in PowerShell. The coordinator owns the single workspace install and lockfile.

```powershell
npm install --os=win32 --cpu=x64
npm run typecheck
npm test
npm run build
```

Keep the API running in a separate terminal:

```powershell
$env:AGENTLAYER_MODE = 'demo'
npm run dev:api
```

The API binds to `http://127.0.0.1:4318`. Check it from another terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:4318/ready
```

Expected: `status: ready`, `scope: scaffold`, `mode: demo`, `integrations: not-implemented`. Readiness confirms only the local server, not OpenAI, Exa or Ambiguous connectivity. Development and production start commands automatically load `apps/api/.env` when present. The explicit PowerShell environment variable above takes precedence over that file.

1. Open Chrome at `chrome://extensions`, enable **Developer mode**, select **Load unpacked** and choose `apps/extension/.output/chrome-mv3` under this checkout. Use the built output for a repeatable manual test.
2. Pin AgentLayer. Right-click its toolbar icon and choose **Options**. With no configured `AGENTLAYER_TOKEN`, startup writes the token to `apps/api/.pairing-token`. Open this local file in an editor, paste its contents into **Pairing token** on the options page, then click **Save**. Do not include the token in screenshots or reports. Restarting the API can rotate the generated token and require pairing again.
3. Open `http://127.0.0.1:4318/demo`, reload the page after loading/reloading the extension, then click the AgentLayer toolbar icon to inject its inline card. There is no popup. The card's **Settings** action also opens Options. If a development build is used instead, load its actual output directory and keep its WXT process running.
4. After code changes, rebuild, reload the extension in `chrome://extensions` and reload the test page. Reloading only one can leave stale scripts attached.

## Manual checks

| Check | Steps | Expected evidence |
| --- | --- | --- |
| Context and activation | Activate on `/demo`; inspect **Person / subject** and **Company**. | Fictional Alex Morgan and Example Studio are extracted; one card appears near the profile. No research request or task write occurs before its explicit action. |
| Research | Click **Research**. | Loading state resolves to **Demo data — research is simulated**. The brief says no external research occurred. Its supplied-page source opens `/demo`; this is not independent Exa evidence. |
| Edit and save | Edit **Follow-up title** and **Description**, then click **Save demo task** once. | **Demo task saved locally** reports the edited title. Result is demo with a `demo-` identifier; no Ambiguous workspace link is fabricated because API returns `url: null`. The task is held in API process memory only. |
| Repeated save | Double-click save during a request; retry the same request after a recoverable failure. | No concurrent duplicate write; a retry uses the same request ID. Backend returns the same result for identical request ID and payload. Altering payload under an already used ID returns HTTP 409 rather than another task. |
| Pairing error | Temporarily replace the token with a wrong value and request research. Restore valid token afterward. | HTTP 401 produces a readable error and no success card. Do not mistake a successful public `/ready` request for proof of valid pairing. |
| Server unavailable | Stop the local API, request research, then restart and re-pair if needed. | Visible recoverable connection error; no simulated success on transport failure. |
| Input validation | Try an empty name or empty task title. | UI prevents the request or shows the API validation error; no task result is reported. |
| Profile navigation | Prepare a proposal, then navigate to another profile or change the URL through SPA navigation. Repeat while research is pending. | Old proposal is removed/disabled; a late response cannot render or save under the new page context. Navigation must invalidate the context before save. |
| Repeated activation | Activate twice on the same page. | One inline card remains; there are no duplicate listeners or overlapping cards. |
| Safe rendering | Put `<img src=x onerror=alert(1)>` in an editable text field and research/save in demo mode. | Text appears literally; no HTML executes. Source links only use schema-approved HTTP(S) URLs. |

The scaffold uses a generic `h1` extraction fallback. Company extraction uses the fixture marker; it is not a completed LinkedIn company adapter. On other pages, correct the context manually and record those limitations.

For a repeatable local SPA invalidation check, use page DevTools on `/demo` after preparing a proposal: `history.pushState({}, '', '/demo?profile=second')`. Expect invalidation even though this fixture still shows the same fictional person. For a pending-result check, temporarily pause the extension background worker at its fetch response handling, change the page URL, then resume. Record whether this was performed; a full page reload alone does not prove SPA handling.

## Live integration gate

The scaffold's `live` mode intentionally returns HTTP 501 for research and task creation. Real provider credentials are not consumed yet; an invalid OpenAI/Exa/Ambiguous key cannot meaningfully be tested until adapters exist. Switching to live must display that missing-integration error and must never silently fall back to demo.

A future live check needs actual sourced research and a real task verified in the designated workspace. Do not create external records merely to verify this scaffold. A separately requested integration demo can authorize its named demo writes. Local fixture success does not prove LinkedIn DOM extraction, Exa research, AI reasoning or persistent Ambiguous actions.

## Result record

- Revision / date:
- Commands run and exit codes:
- Chrome version and loaded output directory:
- `/ready` result (without credentials):
- Checks passed / failed / not run:
- Failure reproduction and visible error:
- Evidence classification: local demo / actual supported website / live provider:

### Coordinator verification — 2026-09-12

- Local environment: Windows x64, Node 22.22.0. Existing global npm `os=linux` caused incompatible native dependency installation. Corrected this workspace install with `--os=win32 --cpu=x64`; global settings were not changed.
- `npm install --os=win32 --cpu=x64 --include=optional --no-audit --no-fund`: exit 0 after correcting native packages and pinning compatible Vite/module versions.
- `npm run typecheck`: exit 0 across API, extension and contracts.
- `npm run build`: exit 0 across API and Chrome MV3 extension. Rollup emitted non-blocking annotation warnings from Zod dependency comments.
- `npm test -w @agentlayer/api`: six tests passed, including authentication, bad URL/payload, size limit, idempotency and fail-closed live mode.
- Built API started with `npm run start -w @agentlayer/api`. Verified loopback listener on port 4318, `/ready` response `{status:"ready",scope:"scaffold",mode:"demo",integrations:"not-implemented"}`, and `/demo` HTTP 200.
- Real local HTTP requests completed research → demo task. Repeating the same task request returned the same ID, with `mode: demo` and `url: null`.
- Built manifest inspected: activeTab, scripting and storage; loopback-only host permission; no automatic content scripts. Output: `apps/extension/.output/chrome-mv3`.
- Browser loading, injected card interaction and real LinkedIn extraction were **not tested**. OpenAI, Exa and Ambiguous integrations are **not implemented**. This evidence confirms the local scaffold and demo API only.

### Follow-up: reported Not found fixed and browser tested — 2026-09-12

- Playwright reproduced `GET /` returning HTTP 404 with `Not found.`. `/demo` already worked. Added `/` → `/demo` redirect; after rebuilding/restarting, Playwright received final HTTP 200 and the Alex Morgan profile heading. Unknown routes still return 404.
- API regression suite now passes 7/7. Full workspace typecheck and affected API/extension builds pass.
- Added `tests/e2e/extension-smoke.mjs` / `npm run test:e2e` using Playwright Chromium with the real built extension and real demo backend, no mocked API responses. It passed Options pairing, script injection, duplicate-mount prevention, research, edited task save, SPA invalidation, invalid-token feedback and absence of page errors.
- The browser test found an ambiguous accessible label for the populated Description textarea. The label now references the field explicitly; exact-label lookup and editing pass.
- Screenshot inspected: `.agentlayer/extension-smoke.png`. It shows the edited task saved and explicit demo labels.
- Scope supersedes the earlier browser-unverified note for the local demo. The test injects the bundled script through the real extension service worker because Playwright does not control the native toolbar surface. Actual toolbar clicking, LinkedIn extraction and live provider integrations remain unverified.
