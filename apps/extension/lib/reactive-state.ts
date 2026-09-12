import { acceptsReactiveEvent, REACTIVE_LIMITS, type ReactiveEvent, type GoalAssessment, type SlackPreview, type SlackSendResult, type FrontendIntent } from '@agentlayer/contracts/reactive-v1';
import type { ResearchBrief } from '@agentlayer/contracts/v1';

export type ReactiveView = {
  status: 'connecting' | 'reading' | 'working' | 'completed' | 'paused' | 'error' | 'empty';
  message: string; text: string; sourceUrl: string; sourceTitle: string; siteAccess: boolean; paused: boolean;
  userGoal?: string; goalRevision?: number;
  assessment?: GoalAssessment;
  slackDraft?: string;
  frontendIntents?: FrontendIntent[];
  slack?: { status: 'reviewing' | 'ready' | 'sending' | 'sent' | 'failed' | 'unknown'; preview?: SlackPreview; result?: SlackSendResult; message?: string }; 
  transcript: ConversationMessage[];
  suggestions: { id: string; label: string; prompt: string }[];
};
export type ConversationMessage = { id: string; role: 'user' | 'assistant'; text: string; sources?: ResearchBrief['sources']; evidenceRefs?: string[] };
export const initialReactiveView: ReactiveView = { status: 'connecting', message: 'Connecting to your assistant…', text: '', sourceUrl: '', sourceTitle: '', siteAccess: false, paused: false, transcript: [], suggestions: [] };
export function appendConversation(messages: ConversationMessage[], message: ConversationMessage): ConversationMessage[] {
  if (message.role === 'assistant' && messages.at(-1)?.role === 'assistant' && messages.at(-1)?.text === message.text
    && JSON.stringify(messages.at(-1)?.sources ?? []) === JSON.stringify(message.sources ?? [])) return messages;
  return [...messages, { ...message, text: message.text.slice(0, 12000) }].slice(-12);
}
export function conversationHistory(messages: ConversationMessage[]) {
  let remaining = 24000;
  return messages.slice(-12).reverse().flatMap(({ role, text }) => {
    const bounded = text.slice(0, Math.min(12000, remaining));
    remaining -= bounded.length;
    return bounded ? [{ role, text: bounded }] : [];
  }).reverse();
}
export type RunCursor = { sessionId: string; contextId: string; revision: number; goalRevision?: number; runId: string; lastSequence: number; terminal: boolean };
export function applyReactiveEvent(view: ReactiveView, cursor: RunCursor, event: ReactiveEvent): ReactiveView {
  if (cursor.terminal || !acceptsReactiveEvent(cursor, event)) return view;
  cursor.lastSequence = event.sequence;
  if (event.type === 'message_delta') {
    if (view.text.length + event.text.length > REACTIVE_LIMITS.responseChars) throw new Error('The response exceeded its size limit.');
    return { ...view, assessment: undefined, slackDraft: undefined, status: 'working', text: view.text + event.text };
  }
  if (event.type === 'completed') { cursor.terminal = true; return { ...view, status: 'completed', message: 'Choose an option or tell me what you would like to do.', text: event.text,
    transcript: appendConversation(view.transcript, { id: event.runId, role: 'assistant', text: event.text, sources: event.sources, evidenceRefs: event.evidenceRefs }), suggestions: event.suggestions ?? [], assessment: event.assessment, slackDraft: event.slackDraft, frontendIntents: event.frontendIntents }; }
  if (event.type === 'error') { cursor.terminal = true; return { ...view, assessment: undefined, slackDraft: undefined, status: 'error', message: event.error.message }; }
  if (event.type === 'cancelled') { cursor.terminal = true; return { ...view, assessment: undefined, slackDraft: undefined, status: event.reason === 'paused' ? 'paused' : 'reading', message: event.reason === 'timeout' ? 'Analysis timed out. Pause and resume to retry.' : 'Waiting for the current page…', text: '' }; }
  return { ...view, assessment: undefined, slackDraft: undefined, status: 'working', message: event.type === 'progress' ? event.message : 'Codex is reading this page…' };
}
