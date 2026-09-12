# AgentLayer scaffold QA

This is a manual runbook, not a completed test report. QA author inspected source only; no browser session, install, server launch or external provider request was performed. Record actual results below after execution.

## Windows setup

Use Node 22 or newer. Run commands from the repository root in PowerShell. The coordinator owns the single workspace install and lockfile.

```powershell
npm install
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

No execution results have been entered by the QA author.
