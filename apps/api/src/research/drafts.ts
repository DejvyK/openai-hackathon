import type { ResearchBriefV1, ResearchContext } from './types.js';
import { ResearchError, validateContext } from './validation.js';
import { ReviewedPayloadSchema, type ActionProposal } from '@agentlayer/contracts/v1';

/** Reviewed draft material only. D assigns proposalId and binds mode/context;
 * C alone maps approved fields to workspace writes. Unknown fields stay null. */
export function prepareResearchDraft(input: ResearchContext, brief: ResearchBriefV1): Omit<ActionProposal, 'proposalId'> {
  const context = validateContext(input);
  if (brief.contextId !== context.contextId || brief.mode !== 'live') throw new ResearchError('INVALID_CONTEXT');
  const citedIds = new Set(brief.claims.flatMap(c => c.sourceIds));
  const citations = brief.sources.filter(s => citedIds.has(s.id));
  const content = [
    `Context: ${context.url}`,
    context.kind === 'selection' ? `Selected text (supplied by user):\n${context.selection!.text}` :
      `Identity assessment: ${brief.identityStatus}`,
    `Research:\n${brief.summary}`,
    ...brief.warnings.map(w => `Warning: ${w}`),
    ...brief.suggestions.map(s => `Suggestion: ${s}`),
    'Sources:', ...citations.map(s => `[${s.id}] ${s.title}: ${s.url}`),
  ].join('\n\n');
  const common = { schemaVersion: 'v1' as const, contextId: context.contextId, mode: 'live' as const,
    evidenceRefs: [...citedIds], userEditedFields: [] as string[] };
  const payload = ReviewedPayloadSchema.safeParse(context.kind === 'selection' ? {
    actionKind: 'research_note',
    note: { title: `Research: ${context.pageTitle || 'selected text'}`.slice(0, 255), content },
  } : {
    actionKind: 'contact_followup', person: context.person,
    task: { title: `${brief.identityStatus === 'matched' ? 'Review follow-up for' : 'Verify identity of'} ${context.person!.name || 'profile'}`.slice(0, 255),
      description: content, dueAt: null },
  });
  // Never silently truncate quoted selection or citation URLs to fit a write.
  if (!payload.success) throw new ResearchError('RESEARCH_LIMIT');
  return { ...common, userEditedFields: [], actionKind: payload.data.actionKind, reviewedPayload: payload.data };
}
