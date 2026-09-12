import { CommitRequestSchema, CommitResultSchema, type CommitRequest, type CommitResult, type PageContext, type ResearchBrief } from '@agentlayer/contracts/v1';
import { WorkspaceActions, WorkspaceError, type ReviewedAction, type CommitResult as InternalResult } from './index.js';
import { digest } from './journal.js';

/** Server-owned evidence fetched from proposal storage, never from client request fields. */
export type ApprovedWorkspaceEvidence = { context: PageContext; brief: ResearchBrief };
function result(value: InternalResult): CommitResult {
  return CommitResultSchema.parse({ ...value, operations: value.operations.map(({ reused, ...op }) => ({ ...op, status: op.status === 'succeeded' ? reused ? 'reused' : 'created' : op.status === 'pending' ? 'skipped' : op.status })) });
}
export function createWorkspaceCommitter(actions: WorkspaceActions) {
  return {
    async commitReviewedAction(input: CommitRequest, options: { workspace: ApprovedWorkspaceEvidence; signal?: AbortSignal }): Promise<CommitResult> {
      const request = CommitRequestSchema.parse(input);
      const { context, brief } = options.workspace;
      if (brief.mode !== 'live' || context.contextId !== request.contextId || brief.contextId !== request.contextId) throw new WorkspaceError('PROPOSAL_CONTEXT_MISMATCH');
      const base = { sourceUrl: context.url, sources: brief.sources.map(({ title, url }) => ({ title, url })) };
      let reviewedPayload: ReviewedAction['reviewedPayload'];
      if (request.reviewedPayload.actionKind === 'contact_followup') {
        const { person, task } = request.reviewedPayload;
        if (context.kind !== 'profile' || context.person?.profileUrl !== person.profileUrl || !person.name) throw new WorkspaceError('INVALID_PROFILE_PROPOSAL');
        reviewedPayload = { ...base, person: { ...person, name: person.name }, task: { ...task, dueAt: task.dueAt } };
      } else {
        if (context.kind !== 'selection' || !context.selection) throw new WorkspaceError('INVALID_SELECTION_PROPOSAL');
        reviewedPayload = { ...base, note: { ...request.reviewedPayload.note, selection: context.selection.text } };
      }
      return result(await actions.commitReviewedAction({ ...request, approvedRequestHash: digest(request), reviewedPayload }, { signal: options.signal }));
    },
    async reconcile(requestId: string, options: { signal?: AbortSignal } = {}): Promise<CommitResult> {
      return result(await actions.reconcile(requestId, options));
    },
  };
}
