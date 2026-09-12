import { searchExa } from './exa.js';
import { buildBrief } from '../research/evidence.js';
import type { Fetch } from '../research/http.js';
import { modelTurn } from '../research/model.js';
import type { EvidenceSource, ResearchConfig, ResearchOptions, RunMetrics } from '../research/types.js';
import { list, record, ResearchError, resolveLimits, string, validateContext } from '../research/validation.js';

export { ResearchError } from '../research/validation.js';
export type { ResearchConfig, ResearchOptions, ResearchContext, ResearchBriefV1, RunMetrics } from '../research/types.js';

/** Server-only factory. Inject fetch/metrics for fixture tests; never from HTTP input. */
export function createResearcher(config: ResearchConfig, dependencies: {
  fetcher?: Fetch;
  onMetrics?: (metrics: Readonly<RunMetrics>) => void;
} = {}) {
  if (!config.openaiApiKey?.trim() || !config.exaApiKey?.trim() || !config.model?.trim()) {
    throw new ResearchError('CONFIGURATION_MISSING');
  }
  const settings = { ...config, limits: resolveLimits(config.limits) };
  const fetcher = dependencies.fetcher ?? fetch;
  return {
    async research(inputContext: unknown, options: ResearchOptions = {}) {
      const context = validateContext(inputContext);
      const limits = resolveLimits(settings.limits, options.limits);
      const started = performance.now();
      const metrics: RunMetrics = { elapsedMs: 0, modelCalls: 0, toolCalls: 0, sourceCount: 0, evidenceCharacters: 0, outcome: 'failed' };
      const controller = new AbortController();
      const cancel = () => controller.abort();
      options.signal?.addEventListener('abort', cancel, { once: true });
      if (options.signal?.aborted) cancel();
      const timer = setTimeout(cancel, limits.maxDurationMs);
      const sources: EvidenceSource[] = [];
      const seenUrls = new Set<string>();
      const callIds = new Set<string>();
      // Select only relevant context fields. Extracted/page content cannot add
      // privileged messages, tool definitions, credentials or backend URLs.
      const input: unknown[] = [{ role: 'user', content: JSON.stringify({
        kind: context.kind, url: context.url, pageTitle: context.pageTitle,
        person: context.person, selection: context.selection,
        searchBudget: limits.maxToolCalls,
      }) }];
      try {
        for (let turn = 0; turn <= limits.maxToolCalls; turn++) {
          if (controller.signal.aborted) throw new ResearchError('RESEARCH_TIMEOUT', true);
          const remaining = limits.maxToolCalls - metrics.toolCalls;
          metrics.modelCalls++;
          const output = await modelTurn(input, remaining === 0 ? 'none' : turn === 0 ? 'required' : 'auto', {
            config: settings, limits, signal: controller.signal, fetcher,
          });
          const calls = output.filter(item => item.type === 'function_call');
          if (!calls.length) {
            if (!metrics.toolCalls) throw new ResearchError('PROVIDER_INVALID_RESPONSE', false, 'openai');
            const texts = output.filter(item => item.type === 'message').flatMap(item => list(item.content, 10))
              .map(record).filter(item => item.type === 'output_text').map(item => string(item.text, 40000));
            let result: unknown;
            try { result = JSON.parse(texts.join('')); }
            catch { throw new ResearchError('PROVIDER_INVALID_RESPONSE', false, 'openai'); }
            const brief = buildBrief(context, result, sources);
            metrics.outcome = 'succeeded';
            return brief;
          }
          // One tool per turn, validated before any search. A hostile model
          // cannot execute an extra call or a different tool through this loop.
          if (calls.length !== 1 || remaining < 1) throw new ResearchError('RESEARCH_LIMIT');
          const call = calls[0];
          const id = string(call.call_id, 200);
          if (call.name !== 'exa_search' || callIds.has(id)) throw new ResearchError('PROVIDER_INVALID_RESPONSE', false, 'openai');
          callIds.add(id);
          let args: Record<string, unknown>;
          try { args = record(JSON.parse(string(call.arguments, 2000))); }
          catch { throw new ResearchError('PROVIDER_INVALID_RESPONSE', false, 'openai'); }
          if (Object.keys(args).some(k => !['query', 'purpose'].includes(k)) ||
            !(context.kind === 'selection' ? ['selection'] : ['person', 'company']).includes(String(args.purpose))) {
            throw new ResearchError('PROVIDER_INVALID_RESPONSE', false, 'openai');
          }
          const query = string(args.query, 500);
          metrics.toolCalls++;
          const results = await searchExa(query, args.purpose as 'person' | 'company' | 'selection', {
            apiKey: settings.exaApiKey, limits, signal: controller.signal, fetcher,
          });
          const evidence: EvidenceSource[] = [];
          for (const result of results) {
            if (seenUrls.has(result.url)) {
              const existing = sources.find(s => s.url === result.url);
              if (existing) evidence.push(existing);
              continue;
            }
            if (sources.length >= 20) break;
            const available = limits.maxEvidenceCharacters - metrics.evidenceCharacters;
            if (available <= 0) break;
            const source = { ...result, id: `s${sources.length + 1}`, text: result.text.slice(0, available) };
            sources.push(source); evidence.push(source); seenUrls.add(source.url);
            metrics.evidenceCharacters += source.text.length;
          }
          metrics.sourceCount = sources.length;
          input.push(...output, { type: 'function_call_output', call_id: id,
            output: JSON.stringify({ evidence, remainingSearches: remaining - 1,
              evidenceBudgetExhausted: metrics.evidenceCharacters >= limits.maxEvidenceCharacters }) });
        }
        throw new ResearchError('RESEARCH_LIMIT');
      } catch (error) {
        const safe = options.signal?.aborted ? new ResearchError('RESEARCH_CANCELLED') :
          controller.signal.aborted ? new ResearchError('RESEARCH_TIMEOUT', true) :
            error instanceof ResearchError ? error : new ResearchError('PROVIDER_INVALID_RESPONSE');
        metrics.errorCode = safe.code;
        throw safe;
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', cancel);
        metrics.elapsedMs = Math.round(performance.now() - started);
        // Telemetry failures must not change research success or disclose data.
        try { dependencies.onMetrics?.(Object.freeze({ ...metrics })); } catch { /* observer only */ }
      }
    },
  };
}
