import { createCodexReactiveRunner, type CodexRunnerOptions } from '../research/codex.js';
import type { ReactiveRunner } from '../routes/reactive.js';
import { searchExa } from '../adapters/exa.js';
import { DEFAULT_LIMITS } from '../research/types.js';

/** Runtime settings are server-owned; page requests never select a command or model. */
export function configuredCodex(env: Record<string, string | undefined>, enableResearch = false, workspaceTools?: CodexRunnerOptions['workspaceTools'], assessProfile?: CodexRunnerOptions['assessProfile'], calendar?: CodexRunnerOptions['calendar']): ReactiveRunner | undefined {
  if (env.AGENTLAYER_CODEX_ENABLED === '0') return undefined;
  try {
    return createCodexReactiveRunner({
      executable: env.CODEX_EXECUTABLE?.trim() || undefined,
      model: env.CODEX_MODEL?.trim() || undefined,
      workspaceTools, calendar,
      useMcp: env.AGENTLAYER_MCP_ENABLED !== '0', assessProfile,
      ...(enableResearch && env.EXA_API_KEY?.trim() ? { searchExa: async (query: string, purpose: 'person' | 'company' | 'selection', { signal }: { signal: AbortSignal }) => {
        const sources = await searchExa(query, purpose, { apiKey: env.EXA_API_KEY!, signal,
          limits: { ...DEFAULT_LIMITS, maxResults: 4, maxSourceCharacters: 3000, requestTimeoutMs: 15000 } });
        return sources.map((source, index) => ({ ...source, id: `exa-${index + 1}` }));
      } } : {}),
    });
  } catch {
    // Do not print process errors: they can contain local paths or configuration.
    console.warn('Codex page analysis is unavailable. Check the local Codex installation and server configuration.');
    return undefined;
  }
}
