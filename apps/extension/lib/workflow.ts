import type { BrowserContext } from '../adapters/types';
import type { CommitResult } from '@agentlayer/contracts/v1';

// UI models only. packages/contracts owns the wire format and validation.
export interface ReviewDraft { name: string; role: string; company: string; title: string; content: string; dueAt: string }
export interface ResearchView {
  contextId: string; proposalId: string; mode: 'demo' | 'live';
  action: 'contact_followup' | 'research_note';
  summary: string; identity: 'matched' | 'ambiguous' | 'insufficient';
  sources: { id: string; title: string; url: string }[];
  claims: { text: string; sourceIds: string[] }[];
  warnings: string[]; suggestions: string[]; draft: ReviewDraft;
}
export interface ReviewSubmission {
  requestId: string; contextId: string; proposalId: string; action: ResearchView['action'];
  draft: ReviewDraft; editedFields: (keyof ReviewDraft)[];
}
export type CommitView = Omit<CommitResult, 'operations'> & {
  operations: (CommitResult['operations'][number] & { error: string | null })[];
};
export interface WorkflowBridge {
  research(context: BrowserContext, signal: AbortSignal): Promise<ResearchView>;
  commit(submission: ReviewSubmission, signal: AbortSignal): Promise<CommitView>;
  reconcile(submission: ReviewSubmission, signal: AbortSignal): Promise<CommitView>;
}
export function safeHttpUrl(value: string | null): string | undefined {
  if (!value) return undefined;
  try { const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}
export function supportsSlackProfile(value: string): boolean {
  try {
    const url = new URL(value);
    return value.length <= 2048 && url.protocol === 'https:' && !url.username && !url.password && !url.port
      && (url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com')) && /^\/in\/[^/]+\/?$/.test(url.pathname);
  } catch { return false; }
}
