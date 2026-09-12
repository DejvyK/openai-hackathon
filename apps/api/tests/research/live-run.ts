/** Explicit opt-in live acceptance runner. Not included in offline tests.
 * Usage from root (requires server credentials + an approved model):
 * node --env-file-if-exists=apps/api/.env --import tsx apps/api/tests/research/live-run.ts <contexts.json>
 * Input: JSON array, at least three real v1 contexts including profile and selection.
 * Output: reviewable JSON report; no raw provider bodies, headers, keys or page text.
 * No workspace writes. Do not commit private input or unreviewed output.
 */
import { readFile } from 'node:fs/promises';
import { createResearcher, ResearchError } from '../../src/adapters/research.js';
import { validateContext } from '../../src/research/validation.js';
import type { RunMetrics } from '../../src/research/types.js';

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error('Provide a JSON file containing at least three real contexts, including profile and selection.');
  const raw: unknown = JSON.parse(await readFile(inputPath, 'utf8'));
  if (!Array.isArray(raw) || raw.length < 3 || raw.length > 10) throw new Error('Expected 3–10 real contexts.');
  const contexts = raw.map(validateContext);
  if (!contexts.some(c => c.kind === 'profile') || !contexts.some(c => c.kind === 'selection')) {
    throw new Error('Include both profile and selection contexts.');
  }
  const metrics: RunMetrics[] = [];
  const researcher = createResearcher({
    openaiApiKey: process.env.OPENAI_API_KEY ?? '',
    exaApiKey: process.env.EXA_API_KEY ?? '',
    model: process.env.OPENAI_MODEL ?? '',
  }, { onMetrics: m => metrics.push(m) });
  const runs: unknown[] = [];
  let failures = 0;
  for (const context of contexts) {
    try {
      const brief = await researcher.research(context);
      runs.push({ contextId: context.contextId, kind: context.kind, brief, metrics: metrics.at(-1) });
    } catch (error) {
      failures++;
      runs.push({ contextId: context.contextId, kind: context.kind,
        errorCode: error instanceof ResearchError ? error.code : 'RESEARCH_FAILED', metrics: metrics.at(-1) });
    }
  }
  console.log(JSON.stringify({ capturedAt: new Date().toISOString(), transport: 'live', model: process.env.OPENAI_MODEL, runs,
    acceptance: 'Manual review of source relevance, identity and claim entailment still required.' }, null, 2));
  if (failures) process.exitCode = 1;
}

main().catch(error => {
  // Input paths and JSON parser errors can contain private data; keep diagnostics bounded.
  console.error(error instanceof ResearchError ? error.code : 'LIVE_RUN_INPUT_OR_CONFIGURATION_ERROR');
  process.exitCode = 1;
});
