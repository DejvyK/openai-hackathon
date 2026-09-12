import { ResearchError } from './validation.js';

export type Fetch = typeof globalThis.fetch;

export async function postJson(
  fetcher: Fetch, url: string, headers: Record<string, string>, body: unknown,
  options: { signal: AbortSignal; timeoutMs: number; maxBytes: number; operation: 'openai' | 'exa' },
): Promise<unknown> {
  const controller = new AbortController();
  const relay = () => controller.abort();
  options.signal.addEventListener('abort', relay, { once: true });
  if (options.signal.aborted) relay();
  const timer = setTimeout(relay, options.timeoutMs);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    controller.signal.throwIfAborted();
    const response = await fetcher(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body), signal: controller.signal, redirect: 'error',
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      const code = response.status === 401 || response.status === 403 ? 'PROVIDER_AUTH' :
        response.status === 429 ? 'PROVIDER_RATE_LIMIT' : 'PROVIDER_UNAVAILABLE';
      throw new ResearchError(code, response.status === 429 || response.status >= 500, options.operation);
    }
    if (!response.body) throw new ResearchError('PROVIDER_INVALID_RESPONSE', false, options.operation);
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      controller.signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > options.maxBytes) throw new ResearchError('RESEARCH_LIMIT', false, options.operation);
      chunks.push(chunk.value);
    }
    controller.signal.throwIfAborted();
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new ResearchError('PROVIDER_INVALID_RESPONSE', false, options.operation); }
  } catch (error) {
    if (controller.signal.aborted) throw new ResearchError('RESEARCH_TIMEOUT', true, options.operation);
    if (error instanceof ResearchError) throw error;
    throw new ResearchError('PROVIDER_UNAVAILABLE', true, options.operation);
  } finally {
    clearTimeout(timer);
    options.signal.removeEventListener('abort', relay);
    if (reader) { void reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
}
