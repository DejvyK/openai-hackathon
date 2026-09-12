import { z } from 'zod';
import { HttpUrlSchema, ApiErrorSchema, SourceSchema } from './v1.js';

export const REACTIVE_LIMITS = { mainTextChars: 16000, selectionChars: 10000, evidenceItems: 30, deltaChars: 4000, responseChars: 20000, debounceMs: 750, maxRunMs: 60000 } as const;
const id = z.string().trim().min(1).max(200);
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const evidence = z.object({ id, text: z.string().max(2000), sourceUrl: HttpUrlSchema }).strict();

// DOM data is untrusted content, not instructions, tool policy or transport configuration.
export const PageSnapshotSchema = z.object({
  url: HttpUrlSchema, pageTitle: z.string().max(500), capturedAt: z.string().datetime({ offset: true }),
  mainText: z.string().max(REACTIVE_LIMITS.mainTextChars),
  selectedText: z.string().max(REACTIVE_LIMITS.selectionChars),
  extractedEvidence: z.array(evidence).max(REACTIVE_LIMITS.evidenceItems),
}).strict().superRefine((value, ctx) => {
  if (!value.mainText.trim() && !value.selectedText.trim()) ctx.addIssue({ code: 'custom', message: 'A nonempty page snapshot is required' });
  if (new Set(value.extractedEvidence.map(e => e.id)).size !== value.extractedEvidence.length) ctx.addIssue({ code: 'custom', message: 'Evidence IDs must be unique within a snapshot' });
});
const session = { schemaVersion: z.literal('reactive-v1'), sessionId: id };
const context = { ...session, contextId: id, revision, goalRevision: revision.optional() };
export const GoalAssessmentSchema = z.object({
  profileUrl: HttpUrlSchema, userGoal: z.string().trim().min(1).max(2000),
  identityStatus: z.enum(['matched', 'ambiguous', 'insufficient']),
  identityKind: z.enum(['person', 'fictional_or_parody', 'unknown']),
  verdict: z.enum(['worth_discussing', 'concerns', 'insufficient_evidence']),
  criteria: z.array(z.string().min(1).max(500)).max(10),
  findings: z.array(z.object({
    criterion: z.string().min(1).max(500), text: z.string().min(1).max(2000),
    stance: z.enum(['supports', 'concern', 'neutral']), sourceIds: z.array(id).min(1).max(8),
    quotes: z.array(z.object({ sourceId: id, text: z.string().min(1).max(1000) }).strict()).min(1).max(8),
  }).strict()).max(12),
  unknowns: z.array(z.string().min(1).max(1000)).max(10),
  sources: z.array(SourceSchema).max(8),
}).strict().superRefine((value, ctx) => {
  const ids = new Set(value.sources.map(source => source.id));
  if (ids.size !== value.sources.length || value.findings.some(finding =>
    finding.sourceIds.some(sourceId => !ids.has(sourceId)) || finding.quotes.some(quote => !finding.sourceIds.includes(quote.sourceId)))) {
    ctx.addIssue({ code: 'custom', message: 'Findings must cite supplied sources and quotes' });
  }
  if (value.verdict !== 'insufficient_evidence' && (value.identityStatus !== 'matched' || !value.findings.length || !value.sources.length)) {
    ctx.addIssue({ code: 'custom', message: 'A recommendation requires matched identity and sourced findings' });
  }
});
export type GoalAssessment = z.infer<typeof GoalAssessmentSchema>;
export const SlackContextBindingSchema = z.object({
  sessionId: id, contextId: id, revision, goalRevision: revision, profileUrl: HttpUrlSchema, userGoal: z.string().max(2000),
}).strict();
export const SlackPreviewRequestSchema = z.object({ binding: SlackContextBindingSchema, text: z.string().min(1).max(3000) }).strict();
export const SlackPreviewSchema = SlackPreviewRequestSchema.extend({
  previewId: z.string().uuid(), expiresAt: z.number().int().positive(),
  destination: z.object({ teamId: id, teamName: z.string().max(200), channelId: id, channelName: z.string().max(200) }).strict(),
}).strict();
export const SlackSendRequestSchema = SlackPreviewRequestSchema.extend({ previewId: z.string().uuid(), approved: z.literal(true) }).strict();
export const SlackSendResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('sent'), sendId: id, channelId: id, messageTs: id, permalink: HttpUrlSchema.nullable(), linkUnavailable: z.boolean() }).strict(),
  ...(['failed', 'unknown'] as const).map(status => z.object({ status: z.literal(status), sendId: id,
    error: z.object({ code: z.enum(['invalid_input', 'not_configured', 'denied', 'rate_limited', 'provider_error', 'network_error', 'invalid_response']), retryAfterSeconds: z.number().nonnegative().optional() }).strict(),
  }).strict()),
]);
export type SlackContextBinding = z.infer<typeof SlackContextBindingSchema>;
export type SlackPreview = z.infer<typeof SlackPreviewSchema>;
export type SlackSendResult = z.infer<typeof SlackSendResultSchema>;
export const ConversationInputSchema = z.object({
  messageId: id,
  userMessage: z.string().trim().min(1).max(2000),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().min(1).max(12000) }).strict()).max(12),
}).strict().superRefine((value, ctx) => {
  if (value.history.reduce((sum, item) => sum + item.text.length, 0) > 24000) ctx.addIssue({ code: 'custom', message: 'Conversation history is too large' });
});
export const ConversationSuggestionSchema = z.object({ id, label: z.string().trim().min(1).max(120), prompt: z.string().trim().min(1).max(2000) }).strict();
/** Fixed, server-selected UI catalog. These intents never authorize an external write. */
export const FrontendIntentSchema = z.union([
  z.object({ type: z.literal('component'), name: z.literal('sourced_summary'), props: z.object({
    title: z.string().trim().min(1).max(120), text: z.string().trim().min(1).max(4000), sourceIds: z.array(id).max(8),
  }).strict() }).strict(),
  z.object({ type: z.literal('component'), name: z.literal('next_steps'), props: z.object({
    items: z.array(ConversationSuggestionSchema).min(1).max(3),
  }).strict() }).strict(),
  z.object({ type: z.literal('tool'), name: z.literal('prepare_slack_draft'), arguments: z.object({
    text: z.string().trim().min(1).max(3000),
  }).strict() }).strict(),
]);
export const FrontendIntentsSchema = z.array(FrontendIntentSchema).max(4).superRefine((value, ctx) => {
  if (new Set(value.map(intent => intent.name)).size !== value.length) ctx.addIssue({ code: 'custom', message: 'Frontend intent names must be unique' });
  for (const intent of value) {
    if (intent.name === 'sourced_summary' && new Set(intent.props.sourceIds).size !== intent.props.sourceIds.length) ctx.addIssue({ code: 'custom', message: 'Summary source IDs must be unique' });
    if (intent.name === 'next_steps' && new Set(intent.props.items.map(item => item.id)).size !== intent.props.items.length) ctx.addIssue({ code: 'custom', message: 'Next-step IDs must be unique' });
  }
});
export type FrontendIntent = z.infer<typeof FrontendIntentSchema>;
export const ConversationReplySchema = z.object({
  text: z.string().trim().min(1).max(12000),
  suggestions: z.array(ConversationSuggestionSchema).max(3),
  slackDraft: z.string().trim().min(1).max(3000).optional(),
  frontendIntents: FrontendIntentsSchema.optional(),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.suggestions.map(item => item.id)).size !== value.suggestions.length) ctx.addIssue({ code: 'custom', message: 'Suggestion IDs must be unique' });
  const draft = value.frontendIntents?.find(intent => intent.name === 'prepare_slack_draft');
  if (draft?.name === 'prepare_slack_draft' && value.slackDraft !== undefined && value.slackDraft !== draft.arguments.text) ctx.addIssue({ code: 'custom', message: 'Slack draft must match the frontend intent' });
});
// Server-only model decision. Never accepted as a browser action or tool policy.
export const ConversationDecisionSchema = ConversationReplySchema.safeExtend({
  toolRequest: z.discriminatedUnion('name', [
    z.object({ name: z.literal('exa_search'), query: z.string().trim().min(1).max(500), purpose: z.enum(['person', 'company', 'selection']) }).strict(),
    z.object({ name: z.enum(['ambiguous_create_contact', 'ambiguous_create_task', 'ambiguous_create_note']),
      arguments: z.record(z.string().max(100), z.union([z.string().max(15000), z.null()])) }).strict(),
  ]).optional(),
}).superRefine((value, ctx) => {
  if (value.toolRequest && value.frontendIntents?.length) ctx.addIssue({ code: 'custom', message: 'A backend tool request cannot also complete frontend intents' });
});
export const ReactiveSnapshotRequestSchema = z.object({ ...context, snapshot: PageSnapshotSchema, userGoal: z.string().trim().max(2000).optional(), conversation: ConversationInputSchema.optional() }).strict();
export const ReactiveControlRequestSchema = z.discriminatedUnion('action', [
  z.object({ ...session, action: z.literal('pause') }).strict(),
  z.object({ ...session, action: z.literal('resume') }).strict(),
  z.object({ ...context, action: z.literal('cancel'), runId: id }).strict(),
  z.object({ ...session, action: z.literal('close') }).strict(),
]);
const event = { ...context, runId: id, sequence: revision };
export const ReactiveEventSchema = z.discriminatedUnion('type', [
  z.object({ ...event, type: z.literal('started') }).strict(),
  z.object({ ...event, type: z.literal('progress'), message: z.string().min(1).max(500) }).strict(),
  z.object({ ...event, type: z.literal('message_delta'), text: z.string().min(1).max(REACTIVE_LIMITS.deltaChars) }).strict(),
  z.object({ ...event, type: z.literal('completed'), text: z.string().max(REACTIVE_LIMITS.responseChars), evidenceRefs: z.array(id).max(REACTIVE_LIMITS.evidenceItems), sources: z.array(SourceSchema).max(8).optional(), slackDraft: z.string().trim().min(1).max(3000).optional(), suggestions: z.array(ConversationSuggestionSchema).max(3).optional(), frontendIntents: FrontendIntentsSchema.optional(), assessment: GoalAssessmentSchema.optional() }).strict(),
  z.object({ ...event, type: z.literal('cancelled'), reason: z.enum(['navigation', 'paused', 'closed', 'superseded', 'user', 'timeout']) }).strict(),
  z.object({ ...event, type: z.literal('error'), error: ApiErrorSchema }).strict(),
]);
export const ReactiveAcknowledgementSchema = z.object({ ...context, runId: id.nullable(), status: z.enum(['accepted', 'unchanged', 'paused', 'stale']) }).strict();
export type PageSnapshot = z.infer<typeof PageSnapshotSchema>;
export type ReactiveSnapshotRequest = z.infer<typeof ReactiveSnapshotRequestSchema>;
export type ReactiveControlRequest = z.infer<typeof ReactiveControlRequestSchema>;
export type ReactiveEvent = z.infer<typeof ReactiveEventSchema>;

/** Both client and server use revision+run+sequence to exclude stale streamed output. */
export function acceptsReactiveEvent(current: { sessionId: string; contextId: string; revision: number; goalRevision?: number; runId: string; lastSequence: number }, candidate: ReactiveEvent): boolean {
  return candidate.sessionId === current.sessionId && candidate.contextId === current.contextId && candidate.revision === current.revision && (candidate.goalRevision ?? 0) === (current.goalRevision ?? 0) && candidate.runId === current.runId && candidate.sequence > current.lastSequence;
}
