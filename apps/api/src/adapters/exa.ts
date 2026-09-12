import { postJson, type Fetch } from '../research/http.js';
import type { EvidenceSource, ResearchLimits } from '../research/types.js';
import { publicUrl, record, ResearchError, string } from '../research/validation.js';

export async function searchExa(
  query: string, purpose: 'person' | 'company' | 'selection',
  options: { apiKey: string; signal: AbortSignal; limits: ResearchLimits; fetcher?: Fetch },
): Promise<Omit<EvidenceSource, 'id'>[]> {
  if (!options.apiKey.trim()) throw new ResearchError('CONFIGURATION_MISSING', false, 'exa');
  string(query, 500);
  const { limits } = options;
  const payload = await postJson(options.fetcher ?? fetch, 'https://api.exa.ai/search', {
    'x-api-key': options.apiKey,
  }, {
    query, type: 'auto', numResults: limits.maxResults,
    // Person research must also reach first-party biographies and personal
    // sites. The people category alone can restrict results to namesakes on
    // professional networks even when the query names an authoritative URL.
    ...(purpose === 'company' ? { category: 'company' } : {}),
    contents: { text: { maxCharacters: limits.maxSourceCharacters } },
  }, { signal: options.signal, timeoutMs: limits.requestTimeoutMs, maxBytes: limits.maxResponseBytes, operation: 'exa' });
  const results = record(payload).results;
  if (!Array.isArray(results)) throw new ResearchError('PROVIDER_INVALID_RESPONSE', false, 'exa');
  const sources: Omit<EvidenceSource, 'id'>[] = [];
  for (const raw of results.slice(0, limits.maxResults)) {
    const r = record(raw);
    const url = publicUrl(r.url);
    if (!url || typeof r.text !== 'string' || !r.text.trim()) continue;
    sources.push({ url, title: typeof r.title === 'string' ? r.title.slice(0, 500) : new URL(url).hostname,
      text: r.text.slice(0, limits.maxSourceCharacters), retrievedAt: new Date().toISOString(),
      author: typeof r.author === 'string' ? r.author.slice(0, 200) : null,
      publishedDate: typeof r.publishedDate === 'string' ? r.publishedDate.slice(0, 50) : null });
  }
  return sources;
}
