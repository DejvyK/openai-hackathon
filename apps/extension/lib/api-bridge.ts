import { PageContextSchema, ResearchResponseSchema, CommitRequestSchema, CommitResultSchema, type ActionProposal } from '@agentlayer/contracts/v1';
import type { z } from 'zod';
import type { BrowserContext } from '../adapters/types';
import type { ReviewSubmission, WorkflowBridge } from './workflow';

function validated<T extends z.ZodType>(schema: T, data: unknown, message: string): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) throw new Error(message);
  return result.data;
}
export function toPageContext(context: BrowserContext) {
  return validated(PageContextSchema, { schemaVersion: 'v1', contextId: context.contextId, kind: context.kind,
    url: context.url, pageTitle: context.pageTitle, capturedAt: context.capturedAt,
    person: context.person, selection: context.selection,
    extractedEvidence: context.extractedEvidence.map(item => ({ field: item.field, text: item.value,
      sourceUrl: item.sourceUrl, method: item.origin === 'user' ? 'user_edit' : item.origin })) }, 'The detected context is invalid. Check the person details or selected text.');
}
async function send(type: string, payload: unknown, signal: AbortSignal) {
  signal.throwIfAborted();
  const response = await browser.runtime.sendMessage({ type, payload });
  signal.throwIfAborted();
  if (!response?.ok) throw new Error(response?.error || 'No response from extension. Reload the page and activate AgentLayer again.');
  return response.data;
}
export function createApiBridge(): WorkflowBridge {
  let proposal: ActionProposal | null = null;
  function commitRequest(submission: ReviewSubmission) {
    if (!proposal || proposal.proposalId !== submission.proposalId || proposal.contextId !== submission.contextId
      || proposal.actionKind !== submission.action) throw new Error('The reviewed proposal no longer matches. Research this context again.');
    const draft = submission.draft;
    const original = proposal.reviewedPayload;
    return validated(CommitRequestSchema, { requestId: submission.requestId, contextId: submission.contextId,
      proposalId: submission.proposalId, actionKind: original.actionKind,
      reviewedPayload: original.actionKind === 'contact_followup'
        ? { actionKind: original.actionKind, person: { ...original.person, name: draft.name.trim() || null,
          role: draft.role.trim() || null, company: draft.company.trim() || null },
          task: { title: draft.title, description: draft.content, dueAt: draft.dueAt || null } }
        : { actionKind: original.actionKind, note: { title: draft.title, content: draft.content } } }, 'The reviewed proposal is invalid. Check the title, content and optional date.');
  }
  function resultView(data: unknown, submission: ReviewSubmission) {
    const result = validated(CommitResultSchema, data, 'The save response could not be verified. Check its status before retrying.');
    const expected = submission.action === 'contact_followup' ? ['contact', 'task'] : ['note'];
    const kinds = result.operations.map(op => op.kind);
    if (new Set(kinds).size !== kinds.length || kinds.some(kind => !expected.includes(kind))
      || (result.status === 'succeeded' && (expected.some(kind => !kinds.includes(kind as typeof kinds[number]))
        || result.operations.some(op => !['created', 'reused', 'succeeded'].includes(op.status))))) {
      throw new Error('The save result does not confirm all reviewed operations. Check its status before retrying.');
    }
    return { ...result, operations: result.operations.map(op => ({ ...op, error: op.errorCode })) };
  }
  return {
    async research(context, signal) {
      const response = validated(ResearchResponseSchema, await send('agentlayer:research', { context: toPageContext(context) }, signal), 'The research response could not be verified. Update the server and extension together.');
      if (response.brief.contextId !== context.contextId) throw new Error('Research response belongs to a different context.');
      proposal = response.proposal;
      const payload = proposal.reviewedPayload;
      return { contextId: proposal.contextId, proposalId: proposal.proposalId, mode: proposal.mode, action: proposal.actionKind,
        summary: response.brief.summary, identity: response.brief.identityStatus, sources: response.brief.sources,
        claims: response.brief.claims, warnings: response.brief.warnings, suggestions: response.brief.suggestions,
        draft: payload.actionKind === 'contact_followup'
          ? { name: payload.person.name ?? '', role: payload.person.role ?? '', company: payload.person.company ?? '',
            title: payload.task.title, content: payload.task.description, dueAt: '' }
          : { name: '', role: '', company: '', title: payload.note.title, content: payload.note.content, dueAt: '' } };
    },
    async commit(submission, signal) { return resultView(await send('agentlayer:commit', commitRequest(submission), signal), submission); },
    async reconcile(submission, signal) { return resultView(await send('agentlayer:reconcile', { requestId: submission.requestId }, signal), submission); },
  };
}
