import { randomUUID } from 'node:crypto';
import { prepareResearchDraft } from '../research/drafts.js';
import { apiError as failure } from './errors.js';
import { ResearchError } from '../research/validation.js';
import { WorkspaceError } from '../workspace/model.js';
import {
  ActionProposalSchema, CommitRequestSchema, CommitResultSchema, ResearchBriefSchema,
  ResearchRequestSchema, ResearchResponseSchema, StatusRequestSchema,
  type ActionProposal, type CommitRequest, type CommitResult, type PageContext, type ResearchBrief,
} from '@agentlayer/contracts/v1';

export interface IntegrationPorts {
  research?: (context: PageContext, options: { signal: AbortSignal }) => Promise<ResearchBrief>;
  commit?: (request: CommitRequest, options: { signal: AbortSignal; context: PageContext; brief: ResearchBrief }) => Promise<CommitResult>;
  reconcile?: (requestId: string, options: { signal: AbortSignal }) => Promise<CommitResult>;
}

export function createActionRoutes(mode: 'demo' | 'live', ports: IntegrationPorts = {}) {
  const proposals = new Map<string, { context: PageContext; brief: ResearchBrief; proposal: ActionProposal; expires: number }>();
  const active = new Set<string>();
  const timeoutMs = 60_000;
  const signalFor = (signal: AbortSignal) => AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
  return {
    async research(body: unknown, signal: AbortSignal) {
      const parsed = ResearchRequestSchema.safeParse(body);
      if (!parsed.success) return failure('INVALID_CONTEXT', 'Invalid page context.', 400, 'research');
      for (const [key, value] of proposals) if (value.expires <= Date.now()) proposals.delete(key);
      if (proposals.size + active.size >= 1000 || active.size >= 4) return failure('RESEARCH_LIMIT', 'Research capacity reached. Try again later.', 429, 'research', true);
      if (mode !== 'live' || !ports.research) return failure('INTEGRATION_UNAVAILABLE', 'Live research is not configured. No external research was performed.', 503, 'research');
      const { context } = parsed.data;
      if (active.has(context.contextId)) return failure('RESEARCH_IN_PROGRESS', 'Research for this context is already running.', 409, 'research');
      active.add(context.contextId);
      const boundedSignal = signalFor(signal);
      try {
        const brief = ResearchBriefSchema.parse(await ports.research(context, { signal: boundedSignal }));
        boundedSignal.throwIfAborted();
        if (brief.contextId !== context.contextId || brief.mode !== mode) return failure('INVALID_PROVIDER_RESULT', 'Research result does not match this context.', 502, 'research');
        const proposal = ActionProposalSchema.parse({ ...prepareResearchDraft(context, { ...brief, mode: 'live' }), proposalId: randomUUID() });
        const response = ResearchResponseSchema.parse({ brief, proposal });
        proposals.set(proposal.proposalId, { context, brief, proposal, expires: Date.now() + 30 * 60_000 });
        return Response.json(response);
      } catch (error) {
        if (error instanceof ResearchError && !boundedSignal.aborted) {
          const status = error.code === 'PROVIDER_RATE_LIMIT' ? 429 : error.code === 'CONFIGURATION_MISSING' ? 503 : error.code === 'RESEARCH_TIMEOUT' ? 504 : 502;
          return failure(error.code, 'Research could not be completed. Check connection settings or try again later.', status, 'research', error.retryable);
        }
        return failure(boundedSignal.aborted ? 'RESEARCH_TIMEOUT' : 'RESEARCH_FAILED', boundedSignal.aborted ? 'Research was cancelled or timed out.' : 'Research could not be completed.', boundedSignal.aborted ? 504 : 502, 'research', true);
      } finally { active.delete(context.contextId); }
    },
    async commit(body: unknown, signal: AbortSignal) {
      const parsed = CommitRequestSchema.safeParse(body);
      if (!parsed.success) return failure('INVALID_COMMIT', 'Invalid reviewed action.', 400, 'commit');
      const request = parsed.data;
      const stored = proposals.get(request.proposalId);
      if (!stored || stored.expires <= Date.now()) return failure('PROPOSAL_EXPIRED', 'Research and review this context again.', 409, 'commit');
      if (stored.context.contextId !== request.contextId || stored.proposal.actionKind !== request.actionKind || stored.proposal.mode !== mode) return failure('PROPOSAL_MISMATCH', 'The reviewed action does not match its original context.', 409, 'commit');
      if (request.reviewedPayload.actionKind === 'contact_followup' && request.reviewedPayload.person.profileUrl !== stored.context.person?.profileUrl) return failure('IMMUTABLE_FIELD', 'Profile reference cannot be changed in a proposal.', 409, 'commit');
      if (request.reviewedPayload.actionKind === 'contact_followup' && !request.reviewedPayload.person.name) return failure('CONTACT_NAME_REQUIRED', 'Review and enter the contact name before saving.', 400, 'commit');
      if (mode !== 'live' || !ports.commit) return failure('INTEGRATION_UNAVAILABLE', 'Workspace writes are not configured.', 503, 'commit');
      try {
        const result = CommitResultSchema.parse(await ports.commit(request, { signal: signalFor(signal), context: stored.context, brief: stored.brief }));
        if (result.requestId !== request.requestId || result.contextId !== request.contextId) throw new Error('Mismatched result');
        const expectedKinds = request.actionKind === 'contact_followup' ? ['contact', 'task'] : ['note'];
        if (result.operations.length !== expectedKinds.length || expectedKinds.some(kind => !result.operations.some(op => op.kind === kind))) throw new Error('Mismatched operations');
        return Response.json(result);
      } catch (error) {
        if (error instanceof WorkspaceError && error.code === 'REQUEST_ID_CONFLICT') return failure(error.code, 'Request ID already belongs to a different reviewed payload.', 409, 'commit', false, request.requestId);
        // A thrown exception is not evidence that a dispatched write failed.
        return failure('COMMIT_UNCONFIRMED', 'Write outcome could not be confirmed. Check status before retrying.', 502, 'commit', false, request.requestId);
      }
    },
    async reconcile(requestId: string, signal: AbortSignal) {
      if (!StatusRequestSchema.safeParse({ requestId }).success) return failure('INVALID_REQUEST_ID', 'Invalid request ID.', 400, 'reconcile');
      if (!ports.reconcile || mode !== 'live') return failure('INTEGRATION_UNAVAILABLE', 'Workspace status is not configured.', 503, 'reconcile');
      try {
        const result = CommitResultSchema.parse(await ports.reconcile(requestId, { signal: signalFor(signal) }));
        if (result.requestId !== requestId) throw new Error('Mismatched result');
        return Response.json(result);
      } catch (error) {
        if (error instanceof WorkspaceError && error.code === 'REQUEST_NOT_FOUND') return failure(error.code, 'No saved request with this ID was found.', 404, 'reconcile', false, requestId);
        return failure('STATUS_UNAVAILABLE', 'Status could not be confirmed. Do not repeat an uncertain write.', 502, 'reconcile', false, requestId);
      }
    },
  };
}
