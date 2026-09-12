import { LIMITS, type PageContext, type ResearchBrief } from '@agentlayer/contracts/v1';

export type ResearchContext = PageContext;

export interface EvidenceSource {
  id: string;
  title: string;
  url: string;
  retrievedAt: string;
  text: string;
  publishedDate: string | null;
  author: string | null;
}

export type ResearchBriefV1 = ResearchBrief & { mode: 'live' };

export interface ResearchLimits {
  maxToolCalls: number;
  maxDurationMs: number;
  requestTimeoutMs: number;
  maxResults: number;
  maxSourceCharacters: number;
  maxEvidenceCharacters: number;
  maxResponseBytes: number;
  maxOutputTokens: number;
}

export const DEFAULT_LIMITS: Readonly<ResearchLimits> = Object.freeze({
  maxToolCalls: LIMITS.maxToolCalls,
  maxDurationMs: LIMITS.researchTimeoutMs,
  requestTimeoutMs: 25_000,
  maxResults: 4,
  maxSourceCharacters: 4_000,
  maxEvidenceCharacters: 24_000,
  maxResponseBytes: 512_000,
  maxOutputTokens: 4_000,
});

export interface ResearchConfig {
  openaiApiKey: string;
  exaApiKey: string;
  model: string;
  limits?: Partial<ResearchLimits>;
}

export interface RunMetrics {
  elapsedMs: number;
  modelCalls: number;
  toolCalls: number;
  sourceCount: number;
  evidenceCharacters: number;
  outcome: 'succeeded' | 'failed';
  errorCode?: string;
}

export interface ResearchOptions {
  signal?: AbortSignal;
  // Trusted server configuration only, never forwarded from a page/request body.
  limits?: Partial<ResearchLimits>;
}
