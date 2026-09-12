import { CommitRequestSchema, CommitResultSchema, type CommitRequest, type CommitResult } from '@agentlayer/contracts/v1';

export interface SavedReview { request: CommitRequest; sourceUrl: string; result: CommitResult | null }
export function readSavedReview(value: unknown): SavedReview | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as SavedReview;
  const request = CommitRequestSchema.safeParse(item.request);
  const result = item.result == null ? null : CommitResultSchema.safeParse(item.result);
  if (!request.success || typeof item.sourceUrl !== 'string' || !/^https?:\/\//.test(item.sourceUrl)
    || (result && !result.success)) return null;
  if (result?.success && (result.data.requestId !== request.data.requestId || result.data.contextId !== request.data.contextId)) return null;
  return { request: request.data, sourceUrl: item.sourceUrl, result: result?.success ? result.data : null };
}
export function canRetrySavedReview(item: SavedReview) {
  return !!item.result && ['partial', 'failed'].includes(item.result.status)
    && !item.result.operations.some(op => op.status === 'unknown')
    && item.result.operations.some(op => op.status === 'failed' && op.retryable);
}
export function canDismissSavedReview(item: SavedReview) {
  const expected = item.request.actionKind === 'research_note' ? ['note'] : ['contact', 'task'];
  return (item.result?.status === 'succeeded' && item.result.operations.length === expected.length
    && expected.every(kind => item.result!.operations.some(op => op.kind === kind && ['created', 'reused', 'succeeded'].includes(op.status)))) || (item.result?.status === 'failed'
    && item.result.operations.length > 0 && item.result.operations.every(op => op.status === 'failed'));
}
export function assertSameReview(previous: SavedReview | null, request: CommitRequest) {
  if (!previous) return;
  if (previous.request.requestId !== request.requestId) {
    if (!canDismissSavedReview(previous)) throw new Error('A previous save needs a status check. Reopen AgentLayer to recover it before starting another save.');
  } else if (JSON.stringify(previous.request) !== JSON.stringify(request)) {
    throw new Error('This save reference belongs to a different reviewed payload.');
  }
}
