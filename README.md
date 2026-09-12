# AgentLayer

**Every app becomes agent-native.**

AgentLayer adds contextual research and reviewed workspace actions beside a professional profile or selected article text. The implementation includes a Chrome extension, a bounded OpenAI/Exa research module and an Ambiguous contact/task/document module. **Live J1/J2 acceptance is not yet proven.** See [delivery status](docs/DELIVERY-PLAN.json) and [D handoff](docs/handoffs/agent-d.md).

## Run locally

Requires Node.js 22.18+ and npm. Install once at the repository root:

```powershell
npm install
npm run build
npm run dev:api
```

If this Windows x64 machine's inherited npm `os=linux` override is still present, use `npm install --os=win32 --cpu=x64` instead. Do not apply those flags on Linux/macOS. All workspaces share the root lockfile.

The API listens on `http://127.0.0.1:4318`; `/ready` reports process readiness and protocol v1, not provider connectivity. `/` opens the fictional `/demo` profile. Default `AGENTLAYER_MODE=demo` permits pairing and extraction checks but **v1 research/writes fail closed**. No simulated saved record is returned. There is no legacy `/api/tasks` route.

1. Open `chrome://extensions`, enable Developer mode and load `apps/extension/.output/chrome-mv3` unpacked.
2. Open the extension's Options. Enter the local pairing token from `apps/api/.pairing-token`, save, then select **Test connection**. Never enter provider keys in the extension.
3. Open `/demo`, a supported LinkedIn personal profile, or select text on an HTTP(S) article. Click AgentLayer in Chrome's toolbar.
4. Enter a task in the sidebar. The agent offers contextual actions and can research with Exa. The task persists across navigation; **New task** clears it. See the [current sidebar behavior](docs/MINIMAL-SIDEBAR.md).
5. In configured live mode, an explicit workspace task can create contacts, linked follow-ups or notes without intermediate forms. Passive page observations cannot write. Slack still requires an exact message/destination preview and a separate **Send**. Inspect the returned result links; an ID alone does not prove the complete live/browser gate.

No email or outreach is sent. Unknown facts remain empty. Browser settings pages, editable fields and the Chrome Web Store are unsupported. LinkedIn selectors still require live browser acceptance; fixture checks alone do not establish reliability.

## Live server configuration

Copy `apps/api/.env.example` to `apps/api/.env` and configure it locally:

- `AGENTLAYER_MODE=live`
- `AGENTLAYER_TOKEN`: optional fixed local pairing token; otherwise startup generates a new token file.
- `OPENAI_API_KEY`, `OPENAI_MODEL`, `EXA_API_KEY`
- `AMBIGUOUS_API_KEY`, `AMBIGUOUS_WORKSPACE_ID`
- `COPILOTKIT_API_KEY`: server-side project verification; the CopilotKit SSE runtime bridge is enabled by default. This does not enable cloud conversation persistence.
- `SLACK_BOT_TOKEN`, `SLACK_TEAM_ID`, `SLACK_CHANNEL_ID`: configured Slack destination; credentials stay on the server.

The model must be chosen explicitly. Settings distinguish missing configuration from configured values; configured does not mean verified. The workspace identifier scopes the local journal and does not select or prove the tenant associated with the Ambiguous key. Confirm that tenant and explicitly designate the demo-write scope before integration demo writes. Do not commit `.env`, pairing tokens, journals or provider secrets.

Research uses at most four Exa tool calls and a 60-second overall limit. Requests are authenticated and limited to 64 KB. The server binds proposals to their original context, mode and source evidence. Review dates use calendar `YYYY-MM-DD` with no timezone conversion.

For production-built local API use `npm run start -w @agentlayer/api`. For extension development use `npm run dev:extension`; `npm run dev` starts both development processes. Rebuild and reload the unpacked extension after production-source edits.

## Save recovery

The single-workspace journal resides under `apps/api/.agentlayer/` when started through npm workspace scripts. Confirmed IDs and uncertain writes survive restart. Keep the same request ID for retries; a new ID can create a new task/document. Changed payload under the same ID is rejected. A timeout with no record ID remains unknown and must not be blindly replayed. Use **Check save status**; only explicitly retryable failed operations expose Retry.

An abrupt process death may leave a workspace `writer.lock` directory. Before removing only that empty lock directory, verify that no process still uses the journal. Never delete journal records to recover a lock. Server-held proposals currently expire after 30 minutes and do not survive restart; reconciliation still reads existing journal entries, while a new commit needs a valid proposal. This recovery limitation remains part of integration acceptance.

## Checks and evidence

```powershell
npm run typecheck
npm test
npm run build
node apps/extension/tests/browser-tests.mjs
npm run test:e2e
```

The final command requires the freshly built API running in default demo mode and built extension. Install its Chromium with `npx playwright install chromium` if needed. It uses a temporary browser profile, real extension service-worker injection and real local HTTP to check pairing, extraction, missing-integration feedback, SPA invalidation and authentication. It does **not** test the native toolbar click or successful provider writes. Screenshot: `.agentlayer/extension-smoke.png`.

`npm test` includes API and contract tests plus extension state, goal, connection and CopilotKit bridge tests. It also covers conversational workspace execution, the three-operation bound and uncertain-write handling. The extension browser suite uses synthetic DOM and provider responses. API tests additionally exercise the workspace journal through HTTP, partial retry and restart reconciliation. These are local fixture evidence, never live OpenAI/Exa/Ambiguous evidence.

Generated screenshots, live provider responses and media snapshots are intentionally ignored in this public repository. Evidence links to those files refer to local run artifacts and may be absent in a fresh clone. Test scripts and public input fixtures remain versioned; a cloned repository does not include proof of someone else's provider run.

## Ownership and remaining delivery

- `apps/extension`: A, context adapters and UI.
- `apps/api/src/research` and research/Exa adapters: B.
- `apps/api/src/workspace` and Ambiguous adapter: C.
- Contracts, server routes/configuration, manifests, integration tests and delivery: D.

[PROJECT-CONCEPT](docs/PROJECT-CONCEPT.md) describes the vision; [DELIVERY-PLAN](docs/DELIVERY-PLAN.json) controls implementation acceptance. Live OpenAI/Exa research is now accepted against [B's three-run evidence](apps/api/tests/research/live-evidence/README.md). The [additional API probe](tests/e2e/evidence/live-research-api.json) preserves a profile ambiguity and a sourced selection result. C has verified read-only access to the configured AgentLayer workspace. These do not prove native browser-to-workspace journeys.

Remaining work includes approved workspace demo writes, actual profile/article journeys, verified record links, native toolbar acceptance and recorded submission materials. [Event requirements](docs/submission/EVENT-REQUIREMENTS.md) document the inspected rules; team registration and project eligibility still need confirmation. No deployment, publication or submission of the final local changes has been performed.

## Source attribution and local release audit

The extension began with the WXT React starter. Retain its [upstream license](apps/extension/UPSTREAM-LICENSE) and the [UI component license](apps/extension/components/ui/LICENSE.md) when sharing code. These notices do not establish a blanket license for all original project code or proof of hackathon eligibility. Preserve actual history when identifying starter code versus work completed during the event.

`node tests/e2e/release-audit.mjs` checks candidate files and reachable commit diffs for exact currently configured credentials without printing their values. It writes `.agentlayer/release-audit.json`. It does not replace a general private-data review or a clean-clone check of the final commit, and never commits or pushes.
