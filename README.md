# AgentLayer

**Every app becomes agent-native.**

AgentLayer brings contextual agents into the web applications people already use. The first prototype turns a visible professional profile into sourced research and a concrete follow-up in a connected workspace.

## Quick start — local scaffold

Requires Node.js 22.18+ and npm. Run from the repository root:

```powershell
npm install --os=win32 --cpu=x64
npm run build
npm run dev:api
```

The install command above targets Windows x64 explicitly: this machine's npm configuration sets `os=linux`, which otherwise installs incompatible native build tools. Global npm settings are left unchanged. On a correctly configured machine, use `npm install` (or `npm ci` after checkout); Linux/macOS users should not pass the Windows override.

The API binds to `http://127.0.0.1:4318`. Check `/ready`; open `/demo` for a fictional profile fixture. Default mode is **demo**: research is simulated and tasks live only in server memory until restart. No API keys are needed and no external workspace records are created.

1. Open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**.
2. Select `apps/extension/.output/chrome-mv3`.
3. Open the extension's **Options** page. Copy the token from `apps/api/.pairing-token` into its pairing field and save. The token file is ignored by Git; do not publish it. The token can change when the server restarts.
4. Open `http://127.0.0.1:4318/demo` and click AgentLayer in the browser toolbar.
5. Review the detected context, run demo research, edit the task and save the demo result.

The extension injects after user activation. It is intended for regular HTTP(S) pages; browser settings pages cannot host its content script. Generic heading extraction is a starting point, not a verified LinkedIn adapter.

For extension development run `npm run dev:extension` in a second terminal. WXT's development runner may open a separate browser profile. `npm run dev` starts both workspaces together. For deterministic manual loading, use the production build steps above.

Optional backend config: copy `apps/api/.env.example` to `apps/api/.env`. Set `AGENTLAYER_TOKEN` to keep pairing stable across restarts. Provider variables are placeholders only. Setting `AGENTLAYER_MODE=live` intentionally returns **501** for unimplemented operations; it never silently returns demo results.

## Structure and checks

```text
apps/extension/     WXT + React extension and inline UI
apps/api/           Hono API and future provider adapters
packages/contracts/ Shared request/response schemas (Zod + TypeScript)
docs/               Concept, delivery plan and agent ownership
```

```powershell
npm run typecheck
npm test
npm run build
```

The extension starts from the [official WXT React template](https://github.com/wxt-dev/wxt/tree/main/templates/react). The backend uses the compact Node structure demonstrated by the [Hono starter](https://github.com/honojs/starter/tree/main/templates/nodejs). Versions resolved by npm are recorded in the root lockfile.

## Next work

Replace the demo research with a bounded OpenAI agent + Exa tool, implement and verify the Ambiguous task adapter, and validate the profile adapter on real pages. Keep the reviewed proposal, explicit Save and truthful demo/live states.

- [Agent ownership and implementation handoffs](docs/AGENT-TASKS.md)
- [Manual QA runbook](docs/QA-NOTES.md)
- [Project concept (English)](docs/PROJECT-CONCEPT.md)
- [Hackathon scope, schedule and acceptance checks (Czech)](docs/HACKATHON-PLAN.md)

Planning baseline: **11:15–15:30 for building (4 hours 15 minutes)**, then **15:30–16:00 for submission**. Team size, exact local timing and pre-event code rules remain unconfirmed. This scaffold was prepared at the user's request; eligibility must be checked against the event handbook.
