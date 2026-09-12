import { useEffect, useRef, useState } from 'react';
import { useAgent, useComponent, useCopilotKit, useFrontendTool, useRenderToolCall } from '@copilotkit/react-core/v2/headless';
import { FrontendIntentSchema, FrontendIntentsSchema, type PageSnapshot } from '@agentlayer/contracts/reactive-v1';
import type { ReactiveView } from '../lib/reactive-state';
import { safeHttpUrl, supportsSlackProfile } from '../lib/workflow';
import { Button } from './ui/primitives';
import { SlackReview } from './SlackReview';

const summarySchema = FrontendIntentSchema.options[0].shape.props;
const stepsSchema = FrontendIntentSchema.options[1].shape.props;
const draftSchema = FrontendIntentSchema.options[2].shape.arguments;

export function CopilotActions(props: { compact?: boolean; view: ReactiveView; snapshot: PageSnapshot | null; disabled: boolean;
  send: (message: unknown) => void; onMessage: (text: string) => void }) {
  const { view, snapshot, disabled } = props;
  const current = useRef(props); current.current = props;
  const { copilotkit } = useCopilotKit();
  const { agent } = useAgent();
  const renderToolCall = useRenderToolCall();
  const processed = useRef(new Set<string>());
  const [rendered, setRendered] = useState<{ runId: string; ids: string[] }>({ runId: '', ids: [] });
  const [error, setError] = useState('');
  const last = view.transcript.at(-1);
  const runId = view.status === 'completed' && last?.role === 'assistant' ? last.id : '';
  function source(id: string) {
    const state = current.current;
    const external = state.view.transcript.at(-1)?.sources?.find(item => item.id === id);
    if (external) return external;
    const page = state.snapshot?.extractedEvidence.find(item => item.id === id);
    return page ? { title: `Current page [${id}]`, url: page.sourceUrl } : undefined;
  }
  useComponent({ name: 'sourced_summary', description: 'Show a concise summary grounded in supplied source IDs.', parameters: summarySchema, followUp: false,
    render: ({ title, text, sourceIds = [] }) => current.current.compact ? null : <article className="source-card" aria-label="Agent summary"><h4>{title}</h4><p className="live-response">{text}</p>
      <ul aria-label="Summary sources">{sourceIds.map(id => { const item = source(id); const url = safeHttpUrl(item?.url ?? null);
        return <li key={id}>{url ? <a href={url} target="_blank" rel="noreferrer">{item?.title}</a> : 'Source unavailable'}</li>; })}</ul></article>,
  }, []);
  useComponent({ name: 'next_steps', description: 'Offer up to three conversation continuations for the current page.', parameters: stepsSchema, followUp: false,
    render: ({ items = [] }) => current.current.compact ? null : <div className="conversation-options" aria-label="Agent next steps">{items.map(item =>
      <Button key={item.id} variant="outline" size="sm" disabled={current.current.disabled} onClick={() => current.current.onMessage(item.prompt)}>{item.label}</Button>)}</div>,
  }, []);
  useFrontendTool({ name: 'prepare_slack_draft', description: 'Open an editable Slack draft. This does not send a message or approve a send.',
    parameters: draftSchema, followUp: false,
    handler: async ({ text }) => {
      const state = current.current;
      if (state.disabled || state.view.status !== 'completed' || !supportsSlackProfile(state.view.sourceUrl) || state.view.slackDraft !== text) {
        throw new Error('This draft no longer belongs to the current profile.');
      }
      return { status: 'draft_prepared', sent: false };
    },
    render: ({ args, status, result }) => status === 'complete' && result?.includes('draft_prepared')
      ? <SlackReview compact={current.current.compact} initialDraft={args.text} slack={current.current.view.slack} disabled={current.current.disabled} send={current.current.send} /> : null,
  }, []);
  useEffect(() => {
    if (!runId || disabled || !snapshot || snapshot.url !== view.sourceUrl || processed.current.has(runId)) return;
    const intents = FrontendIntentsSchema.safeParse(view.frontendIntents ?? []);
    if (!intents.success) { setError('The proposed interface could not be validated.'); return; }
    processed.current.add(runId);
    if (processed.current.size > 32) processed.current.delete(processed.current.values().next().value!);
    setError('');
    void (async () => {
      const ids: string[] = [];
      for (const intent of intents.data) {
        const state = current.current;
        if (state.disabled || state.view.status !== 'completed' || state.view.transcript.at(-1)?.id !== runId || state.view.sourceUrl !== snapshot.url) return;
        if (intent.name === 'sourced_summary' && intent.props.sourceIds.some(id => !source(id))) throw new Error('A summary references an unavailable source.');
        const result = await copilotkit.runTool({ name: intent.name, agentId: 'default', parameters: intent.type === 'component' ? intent.props : intent.arguments, followUp: false });
        if (result.error) throw new Error(result.error);
        ids.push(result.toolCallId);
      }
      if (current.current.view.transcript.at(-1)?.id === runId) setRendered({ runId, ids });
    })().catch(() => { if (current.current.view.transcript.at(-1)?.id === runId) setError('The proposed interface could not be prepared. Ask the assistant to try again.'); });
  }, [runId, disabled, snapshot, view.sourceUrl, view.frontendIntents, copilotkit]);
  if (!runId || !snapshot || snapshot.url !== view.sourceUrl) return null;
  return <div className="agent-components" aria-label="Agent components">
    {error && <p role="alert">{error}</p>}
    {rendered.runId === runId && agent.messages.flatMap(message => message.role === 'assistant' ? (message.toolCalls ?? []).flatMap(toolCall => {
      if (!rendered.ids.includes(toolCall.id)) return [];
      const toolMessage = agent.messages.find(item => item.role === 'tool' && item.toolCallId === toolCall.id);
      return <div key={toolCall.id}>{renderToolCall({ toolCall, toolMessage: toolMessage?.role === 'tool' ? toolMessage : undefined })}</div>;
    }) : [])}
  </div>;
}
