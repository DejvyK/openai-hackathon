import { ConnectionStatusSchema } from '@agentlayer/contracts/v1';

// Configuration presence is deliberately never reported as verified connectivity.
export function connectionStatus(mode: 'demo' | 'live', env: Record<string, string | undefined>) {
  const requirements = {
    openai: ['OPENAI_API_KEY', 'OPENAI_MODEL'],
    exa: ['EXA_API_KEY'],
    ambiguous: ['AMBIGUOUS_API_KEY', 'AMBIGUOUS_WORKSPACE_ID'],
  } as const;
  return ConnectionStatusSchema.parse({
    mode,
    providers: Object.entries(requirements).map(([provider, keys]) => {
      const missing = keys.filter(key => !env[key]?.trim());
      return { provider, status: missing.length ? 'missing_configuration' : 'configured', missing, checkedAt: null };
    }),
    workspaceConfigured: Boolean(env.AMBIGUOUS_WORKSPACE_ID?.trim()),
  });
}
