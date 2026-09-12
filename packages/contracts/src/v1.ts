import { z } from 'zod';

export const LIMITS = { bodyBytes: 65536, selectionChars: 10000, textChars: 15000, taskTitleChars: 255, sources: 20, researchTimeoutMs: 60000, maxToolCalls: 4 } as const;
const id = z.string().trim().min(1).max(200);
export const HttpUrlSchema = z.string().url().max(4096).refine(v => /^https?:\/\//i.test(v), 'HTTP(S) URL required');
const timestamp = z.string().datetime({ offset: true });
const short = z.string().trim().min(1).max(200);
const text = z.string().max(LIMITS.textChars);
const mode = z.enum(['demo', 'live']);
export const PersonSchema = z.object({ name: short.nullable(), role: short.nullable(), company: short.nullable(), profileUrl: HttpUrlSchema }).strict();
export const PageContextSchema = z.object({
  schemaVersion: z.literal('v1'), contextId: id, kind: z.enum(['profile', 'selection']),
  url: HttpUrlSchema, pageTitle: z.string().max(500), capturedAt: timestamp,
  person: PersonSchema.nullable(), selection: z.object({ text: z.string().trim().min(1).max(LIMITS.selectionChars) }).strict().nullable(),
  extractedEvidence: z.array(z.object({ field: z.enum(['name', 'role', 'company', 'profileUrl', 'selection']), text: z.string().max(10000), sourceUrl: HttpUrlSchema, method: z.enum(['visible_dom', 'selection', 'user_edit']) }).strict()).max(30),
}).strict().superRefine((v, ctx) => {
  if (v.kind === 'profile' ? !v.person || v.selection !== null : !v.selection || v.person !== null) ctx.addIssue({ code: 'custom', message: 'Context kind and content must agree' });
});
export const SourceSchema = z.object({ id, title: z.string().max(500), url: HttpUrlSchema, retrievedAt: timestamp }).strict();
export const ResearchBriefSchema = z.object({
  schemaVersion: z.literal('v1'), contextId: id, mode, summary: text,
  claims: z.array(z.object({ text, sourceIds: z.array(id).min(1).max(20) }).strict()).max(50),
  sources: z.array(SourceSchema).max(LIMITS.sources), identityStatus: z.enum(['matched', 'ambiguous', 'insufficient']),
  warnings: z.array(z.string().max(1000)).max(20), suggestions: z.array(z.string().max(2000)).max(10),
}).strict().superRefine((v, ctx) => {
  const ids = new Set(v.sources.map(s => s.id));
  if (ids.size !== v.sources.length || v.claims.some(c => c.sourceIds.some(s => !ids.has(s)))) ctx.addIssue({ code: 'custom', message: 'Source IDs must be unique and every claim must reference supplied evidence' });
});
export const TaskDraftSchema = z.object({ title: z.string().trim().min(1).max(255), description: text, dueAt: z.iso.date().nullable() }).strict();
export const NoteDraftSchema = z.object({ title: z.string().trim().min(1).max(255), content: text }).strict();
export const ReviewedPayloadSchema = z.discriminatedUnion('actionKind', [
  z.object({ actionKind: z.literal('contact_followup'), person: PersonSchema, task: TaskDraftSchema }).strict(),
  z.object({ actionKind: z.literal('research_note'), note: NoteDraftSchema }).strict(),
]);
export const ActionProposalSchema = z.object({
  schemaVersion: z.literal('v1'), proposalId: id, contextId: id, mode,
  actionKind: z.enum(['contact_followup', 'research_note']), reviewedPayload: ReviewedPayloadSchema,
  evidenceRefs: z.array(id).max(20), userEditedFields: z.array(z.enum(['person.name', 'person.role', 'person.company', 'task.title', 'task.description', 'task.dueAt', 'note.title', 'note.content'])).max(8),
}).strict().refine(v => v.actionKind === v.reviewedPayload.actionKind, 'Action kinds must agree');
export const ResearchRequestSchema = z.object({ context: PageContextSchema }).strict();
export const ResearchResponseSchema = z.object({ brief: ResearchBriefSchema, proposal: ActionProposalSchema }).strict().refine(v => v.brief.contextId === v.proposal.contextId && v.brief.mode === v.proposal.mode && v.proposal.evidenceRefs.every(id => v.brief.sources.some(s => s.id === id)), 'Proposal must match research');
export const CommitRequestSchema = z.object({ requestId: id, proposalId: id, contextId: id, actionKind: z.enum(['contact_followup', 'research_note']), reviewedPayload: ReviewedPayloadSchema }).strict().refine(v => v.actionKind === v.reviewedPayload.actionKind, 'Action kinds must agree');
export const OperationResultSchema = z.object({ kind: z.enum(['contact', 'task', 'note']), status: z.enum(['created', 'reused', 'succeeded', 'failed', 'unknown', 'skipped']), id: id.nullable(), url: HttpUrlSchema.nullable(), errorCode: id.nullable(), retryable: z.boolean() }).strict().superRefine((v, ctx) => {
  if (['created', 'reused', 'succeeded'].includes(v.status) && !v.id) ctx.addIssue({ code: 'custom', message: 'Confirmed operation requires record ID' });
  if (v.status === 'unknown' && v.retryable) ctx.addIssue({ code: 'custom', message: 'Unknown writes require reconciliation, never blind retry' });
});
export const CommitResultSchema = z.object({ requestId: id, contextId: id, status: z.enum(['succeeded', 'partial', 'failed', 'unknown']), operations: z.array(OperationResultSchema).min(1).max(2), warnings: z.array(z.string().max(1000)).max(20) }).strict().superRefine((v, ctx) => {
  const confirmed = v.operations.filter(op => ['created', 'reused', 'succeeded'].includes(op.status)).length;
  const expected = v.operations.some(op => op.status === 'unknown') ? 'unknown' : confirmed === v.operations.length ? 'succeeded' : confirmed ? 'partial' : 'failed';
  const kinds = v.operations.map(op => op.kind);
  if (v.status !== expected || new Set(kinds).size !== kinds.length || !(kinds.length === 1 && kinds[0] === 'note' || kinds.length === 2 && kinds.includes('contact') && kinds.includes('task'))) {
    ctx.addIssue({ code: 'custom', message: 'Result must truthfully aggregate one note or contact/task operations' });
  }
});
export const ApiErrorSchema = z.object({ code: id, message: z.string().max(1000), retryable: z.boolean(), requestId: id.nullable(), operation: z.enum(['research', 'commit', 'reconcile', 'configuration']).nullable() }).strict();
export const StatusRequestSchema = z.object({ requestId: id }).strict();
export const ConnectionStatusSchema = z.object({ mode, providers: z.array(z.object({ provider: z.enum(['openai', 'exa', 'ambiguous']), status: z.enum(['missing_configuration', 'configured', 'verified']), missing: z.array(z.string()), checkedAt: timestamp.nullable() }).strict()), workspaceConfigured: z.boolean() }).strict();
export type PageContext = z.infer<typeof PageContextSchema>;
export type ResearchBrief = z.infer<typeof ResearchBriefSchema>;
export type ActionProposal = z.infer<typeof ActionProposalSchema>;
export type CommitRequest = z.infer<typeof CommitRequestSchema>;
export type CommitResult = z.infer<typeof CommitResultSchema>;
export type ResearchResponse = z.infer<typeof ResearchResponseSchema>;
export type ReviewedPayload = z.infer<typeof ReviewedPayloadSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
