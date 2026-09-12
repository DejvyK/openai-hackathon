import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoalAssessor, validateGoalAssessment } from './goal-assessment.js';
import type { Fetch } from './http.js';
import type { EvidenceSource } from './types.js';

const input = { userGoal: 'Find a collaborative operations lead', snapshot: {
  url: 'https://www.linkedin.com/in/research-subject/', pageTitle: 'Alex Example | LinkedIn',
  mainText: 'Alex Example leads the Example Organization operations team.', selectedText: '',
  capturedAt: '2026-09-12T10:00:00.000Z', extractedEvidence: [],
} };
const source: EvidenceSource = { id: 's1', url: 'https://example.org/team', title: 'Team biography', retrievedAt: '2026-09-12T10:00:00.000Z',
  text: 'Alex Example at Example Organization led a collaborative operations team.', author: null, publishedDate: null };
const candidate = () => ({ identityStatus: 'matched', identityKind: 'person',
  identityMatches: [{ sourceId: 's1', name: 'Alex Example', anchor: 'Example Organization' }],
  verdict: 'worth_discussing', criteria: ['Collaborative operations leadership'],
  findings: [{ criterion: 'Collaborative operations leadership', text: 'Evidence of collaborative operations leadership.', stance: 'supports',
    sourceIds: ['s1'], quotes: [{ sourceId: 's1', text: 'led a collaborative operations team' }] }], unknowns: ['What was the scope of this role?'] });
const config = { exaApiKey: 'injected-exa', openaiApiKey: 'injected-openai', model: 'configured-model' };
const modelResponse = (result: unknown) => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(result) }] }] });

test('assesses through fixed Exa and tool-free reasoning transports; preserves goal separately from page', async () => {
  const calls: { url: string; body: Record<string, unknown>; options: RequestInit }[] = [];
  const fetcher: Fetch = async (url, options) => {
    const body = JSON.parse(String(options?.body));
    calls.push({ url: String(url), body, options: options! });
    return Response.json(String(url).includes('exa.ai') ? { results: [source] } : modelResponse(candidate()));
  };
  const result = await createGoalAssessor(config, { fetcher }).assess(input);
  assert.equal(result.verdict, 'worth_discussing');
  assert.equal(result.sources.length, 1);
  assert.deepEqual(calls.map(c => c.url), ['https://api.exa.ai/search', 'https://api.exa.ai/search', 'https://api.openai.com/v1/responses']);
  assert(calls.every(c => c.options.redirect === 'error'));
  assert.equal(calls[2].body.tool_choice, 'none');
  assert.deepEqual(calls[2].body.tools, []);
  const content = JSON.parse((calls[2].body.input as { content: string }[])[0].content);
  assert.equal(content.userGoal, input.userGoal);
  assert.deepEqual(content.untrustedPageSnapshot, input.snapshot);
  assert.equal(content.untrustedExternalSources[0].id, 's1');
});

test('no evidence produces insufficient result without a model call', async () => {
  let calls = 0;
  const fetcher: Fetch = async () => { calls++; return Response.json({ results: [] }); };
  const result = await createGoalAssessor(config, { fetcher }).assess(input);
  assert.equal(calls, 2);
  assert.equal(result.verdict, 'insufficient_evidence');
  assert.deepEqual(result.findings, []);
});

test('namesake-only and ambiguous sources cannot produce recommendations', () => {
  const nameOnly = candidate();
  nameOnly.identityMatches[0].anchor = 'Alex Example';
  const result = validateGoalAssessment(nameOnly, input, [source]);
  assert.equal(result.identityStatus, 'insufficient');
  assert.equal(result.verdict, 'insufficient_evidence');
  assert.deepEqual(result.findings, []);
  const ambiguous = candidate(); ambiguous.identityStatus = 'ambiguous';
  assert.equal(validateGoalAssessment(ambiguous, input, [source]).verdict, 'insufficient_evidence');
});

test('fabricated quotations, source IDs, criteria and nonmatched sources are discarded', () => {
  for (const mutate of [
    (c: ReturnType<typeof candidate>) => { c.findings[0].quotes[0].text = 'This quotation was never in any evidence'; },
    (c: ReturnType<typeof candidate>) => { c.findings[0].sourceIds = ['invented']; },
    (c: ReturnType<typeof candidate>) => { c.findings[0].criterion = 'Unstated criterion'; },
    (c: ReturnType<typeof candidate>) => { c.identityMatches = []; },
  ]) {
    const c = candidate(); mutate(c);
    assert.equal(validateGoalAssessment(c, input, [source]).verdict, 'insufficient_evidence');
  }
});

test('positive verdict cannot override concerns; fictional status stays visible without name heuristics', () => {
  const c = candidate(); c.findings[0].stance = 'concern';
  assert.equal(validateGoalAssessment(c, input, [source]).verdict, 'insufficient_evidence');
  c.verdict = 'concerns'; c.identityKind = 'fictional_or_parody';
  const result = validateGoalAssessment(c, input, [source]);
  assert.equal(result.verdict, 'concerns');
  assert(result.unknowns.some(u => u.includes('fictional or parody')));
});

test('pre-cancelled research and unsupported pages never contact a provider', async () => {
  let calls = 0;
  const assessor = createGoalAssessor(config, { fetcher: async () => { calls++; throw Error('unexpected'); } });
  await assert.rejects(assessor.assess(input, { signal: AbortSignal.abort() }), { code: 'RESEARCH_CANCELLED' });
  await assert.rejects(assessor.assess({ ...input, userGoal: ' ' }), { code: 'INVALID_CONTEXT' });
  await assert.rejects(assessor.assess({ ...input, snapshot: { ...input.snapshot, url: 'https://linkedin.com.evil.test/in/alex' } }), { code: 'INVALID_CONTEXT' });
  assert.equal(calls, 0);
});

test('research respects query count, source count and total evidence budgets', async () => {
  let calls = 0;
  const fetcher: Fetch = async (url, options) => {
    calls++;
    if (String(url).includes('exa.ai')) return Response.json({ results: Array.from({ length: 10 }, (_, i) => ({ ...source, url: `https://example.org/${i}` })) });
    const body = JSON.parse(String(options?.body));
    const evidence = JSON.parse(body.input[0].content).untrustedExternalSources as EvidenceSource[];
    assert(evidence.length <= 8);
    assert(evidence.reduce((n, s) => n + s.text.length, 0) <= 200);
    return Response.json(modelResponse({ ...candidate(), identityStatus: 'insufficient', identityMatches: [], findings: [] }));
  };
  await createGoalAssessor({ ...config, limits: { maxToolCalls: 1, maxResults: 10, maxEvidenceCharacters: 200 } }, { fetcher }).assess(input);
  assert.equal(calls, 2);
});

test('abort during Exa stops the pipeline and sanitizes failure', async () => {
  const controller = new AbortController();
  const fetcher: Fetch = async () => { controller.abort('private reason'); throw Error('private provider body'); };
  await assert.rejects(createGoalAssessor(config, { fetcher }).assess(input, { signal: controller.signal }), error => {
    assert.equal((error as { code: string }).code, 'RESEARCH_CANCELLED');
    assert(!String(error).includes('private'));
    return true;
  });
});

test('provider tool requests cannot dispatch anything from assessment output', async () => {
  let calls = 0;
  const fetcher: Fetch = async url => {
    calls++;
    return Response.json(String(url).includes('exa.ai') ? { results: [source] } :
      { status: 'completed', output: [{ type: 'function_call', name: 'send_slack', arguments: '{}' }] });
  };
  await assert.rejects(createGoalAssessor(config, { fetcher }).assess(input), { code: 'PROVIDER_INVALID_RESPONSE' });
  assert.equal(calls, 3);
});

test('overall deadline aborts a pending transport and prevents reasoning', async () => {
  let calls = 0;
  const fetcher: Fetch = async (_url, options) => {
    calls++;
    return await new Promise<Response>((_resolve, reject) => {
      options!.signal!.addEventListener('abort', () => reject(new Error('transport interrupted')), { once: true });
    });
  };
  await assert.rejects(createGoalAssessor({ ...config, limits: { maxDurationMs: 15 } }, { fetcher }).assess(input), { code: 'RESEARCH_TIMEOUT' });
  assert.equal(calls, 1);
});

test('model context never exceeds eight deduplicated sources across searches', async () => {
  let search = 0;
  const fetcher: Fetch = async (url, options) => {
    if (String(url).includes('exa.ai')) {
      search++;
      return Response.json({ results: Array.from({ length: 10 }, (_, i) => ({ ...source, url: `https://example.org/${search}-${i}` })) });
    }
    const body = JSON.parse(String(options?.body));
    const sources = JSON.parse(body.input[0].content).untrustedExternalSources;
    assert.equal(sources.length, 8);
    return Response.json(modelResponse(candidate()));
  };
  const result = await createGoalAssessor({ ...config, limits: { maxResults: 10 } }, { fetcher }).assess(input);
  assert.equal(result.sources.length, 8);
});
