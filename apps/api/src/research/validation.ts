import type { ResearchContext, ResearchLimits } from './types.js';
import { DEFAULT_LIMITS } from './types.js';
import { PageContextSchema } from '@agentlayer/contracts/v1';

export class ResearchError extends Error {
  constructor(
    public readonly code: 'CONFIGURATION_MISSING' | 'INVALID_CONTEXT' | 'INVALID_LIMITS' |
      'PROVIDER_AUTH' | 'PROVIDER_RATE_LIMIT' | 'PROVIDER_UNAVAILABLE' | 'PROVIDER_INVALID_RESPONSE' |
      'RESEARCH_TIMEOUT' | 'RESEARCH_CANCELLED' | 'RESEARCH_LIMIT' | 'MODEL_REFUSAL',
    public readonly retryable = false,
    public readonly operation: 'research' | 'openai' | 'exa' = 'research',
  ) {
    // Never expose provider bodies, keys, context or abort reasons in errors.
    super(code.replaceAll('_', ' ').toLowerCase());
    this.name = 'ResearchError';
  }
}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ResearchError('PROVIDER_INVALID_RESPONSE');
  return value as Record<string, unknown>;
}

export function string(value: unknown, max: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) {
    throw new ResearchError('PROVIDER_INVALID_RESPONSE');
  }
  return value;
}

export function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new ResearchError('PROVIDER_INVALID_RESPONSE');
  return value;
}

export function publicUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    // URLs are displayed as citations, never fetched by this server. Drop local
    // destinations as well as active schemes so they are not actionable sources.
    if (!host.includes('.') || host.endsWith('.local') || host.endsWith('.localhost') ||
      host.includes(':') || /^\d+(\.\d+){3}$/.test(host)) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}

export function validateContext(input: unknown): ResearchContext {
  // Shared Zod schema is the only public boundary; parsing makes an independent
  // snapshot and rejects unexpected fields before any provider request.
  const parsed = PageContextSchema.safeParse(input);
  if (!parsed.success) throw new ResearchError('INVALID_CONTEXT');
  return parsed.data;
}

export function resolveLimits(...overrides: (Partial<ResearchLimits> | undefined)[]): ResearchLimits {
  const limits = Object.assign({}, DEFAULT_LIMITS, ...overrides);
  const ceilings: ResearchLimits = { maxToolCalls: 8, maxDurationMs: 180000, requestTimeoutMs: 60000,
    maxResults: 10, maxSourceCharacters: 10000, maxEvidenceCharacters: 60000,
    maxResponseBytes: 2000000, maxOutputTokens: 16000 };
  for (const key of Object.keys(limits) as (keyof ResearchLimits)[]) {
    if (!(key in ceilings) || !Number.isInteger(limits[key]) || limits[key] < 1 || limits[key] > ceilings[key]) {
      throw new ResearchError('INVALID_LIMITS');
    }
  }
  return limits;
}
