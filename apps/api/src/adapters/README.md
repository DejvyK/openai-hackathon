# Live integration ownership

These adapters are intentionally not implemented in the scaffold. `AGENTLAYER_MODE=live` returns 501; it never falls back to demo data.

- `research.ts` (next): one OpenAI Agents SDK agent, a bounded Exa search tool, structured ResearchBrief output, identity uncertainty and source validation. Do not provide workspace writes as research tools.
- `ambiguous.ts` (next): create the reviewed task, validate the real response, reconcile ambiguous timeouts, return actual ID and workspace link. Confirm account permissions and required fields before implementing contact creation.

Primary implementation references:

- Hono Node starter: https://github.com/honojs/starter/tree/main/templates/nodejs
- OpenAI SDK quickstart: https://developers.openai.com/api/docs/guides/agents/quickstart
- Exa Search API: https://exa.ai/docs/reference/search
- Ambiguous task recipe: https://www.ambiguous.ai/agents/recipes
- Ambiguous public schema: https://app.ambiguous.ai/api/openapi.json

Public OpenAPI fetched on 2026-09-12 confirms POST `/api/tasks`: only `title` is required (1–255 characters), `description` accepts markdown, and optional `contact_id` links a CRM contact. The response is `{ task }`. POST `/api/crm/contacts` is present with `ContactCreateInput`. Account credentials, permissions and actual writes have not been tested. Validate the task title against the provider's 255-character maximum before live writes; the scaffold contract currently allows 300.

Current demo task IDs are memory-only and disappear when this process restarts. No research provider or workspace API is called in this scaffold.
