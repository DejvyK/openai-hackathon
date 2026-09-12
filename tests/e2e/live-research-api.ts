// Explicit live, read-only provider probe. No workspace port is installed.
// node --env-file=apps/api/.env --import tsx tests/e2e/live-research-api.ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createApp } from '../../apps/api/src/app.js';
import { createResearcher } from '../../apps/api/src/adapters/research.js';
import { PageContextSchema, ResearchResponseSchema } from '@agentlayer/contracts/v1';

const contexts = JSON.parse(await readFile('apps/api/tests/research/live-evidence/contexts.json', 'utf8'));
const researcher = createResearcher({ openaiApiKey: process.env.OPENAI_API_KEY ?? '', exaApiKey: process.env.EXA_API_KEY ?? '', model: process.env.OPENAI_MODEL ?? '' });
const token = randomUUID();
const app = createApp({ token, mode: 'live', integrations: { research: (context, options) => researcher.research(context, options) } });
const runs = [];
for (const input of [contexts.find((c: {kind: string}) => c.kind === 'profile'), contexts.find((c: {kind: string}) => c.kind === 'selection')]) {
  const context = PageContextSchema.parse({ ...input, contextId: randomUUID(), capturedAt: new Date().toISOString() });
  const start = performance.now();
  const response = await app.request('/api/research', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ context }) });
  const data = await response.json();
  if (response.status !== 200) throw new Error(`Research HTTP ${response.status}: ${typeof data.code === 'string' ? data.code : 'INVALID_RESPONSE'}`);
  const result = ResearchResponseSchema.parse(data);
  assert.equal(result.brief.mode, 'live');
  assert.equal(result.proposal.contextId, context.contextId);
  assert.equal(result.proposal.actionKind, context.kind === 'profile' ? 'contact_followup' : 'research_note');
  if (result.proposal.reviewedPayload.actionKind === 'contact_followup') assert.equal(result.proposal.reviewedPayload.task.dueAt, null);
  else assert.ok(result.proposal.reviewedPayload.note.content.includes(context.selection!.text));
  runs.push({ kind: context.kind, pageUrl: context.url, status: response.status, elapsedMs: Math.round(performance.now() - start), ...result });
}
const report = { capturedAt: new Date().toISOString(), model: process.env.OPENAI_MODEL, transport: 'live providers through in-process authenticated API request handler', browserTested: false, workspaceWrites: 0, runs };
const serialized = JSON.stringify(report, null, 2);
for (const key of ['OPENAI_API_KEY', 'EXA_API_KEY', 'AMBIGUOUS_API_KEY']) {
  const secret = process.env[key];
  if (secret) assert.equal(serialized.includes(secret), false, 'Report must not contain provider credentials');
}
await mkdir('.agentlayer', { recursive: true });
await writeFile('.agentlayer/live-research-api.json', serialized + '\n');
console.log(JSON.stringify({ report: '.agentlayer/live-research-api.json', workspaceWrites: 0, runs: runs.map(r => ({ kind: r.kind, status: r.status, elapsedMs: r.elapsedMs, claims: r.brief.claims.length, identity: r.brief.identityStatus })) }));
