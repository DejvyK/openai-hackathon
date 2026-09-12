import { useEffect, useRef, useState } from 'react';
import { observePageSnapshots } from '../lib/page-snapshot';
import { initialReactiveView, type ReactiveView } from '../lib/reactive-state';
import { safeHttpUrl, supportsSlackProfile } from '../lib/workflow';
import { Button } from './ui/primitives';
import { createReactiveConnection, type ConnectionStatus } from '../lib/reactive-connection';
import { Sidebar, SidebarHeader, SidebarContent } from './ui/sidebar';
import { SlackReview } from './SlackReview';
import { SidebarCopilotProvider } from './SidebarCopilotProvider';
import { useAgentContext, useCopilotKit } from '@copilotkit/react-core/v2/headless';
import type { PageSnapshot } from '@agentlayer/contracts/reactive-v1';
import { SidebarAgentBridge } from '../lib/copilot-agent';
import { PAGE_CONTEXT_DESCRIPTION } from '../lib/sidebar-context';
import { CopilotActions } from './CopilotActions';

export function LiveAssistant({ closeRef, onClose }: { closeRef: { current: (() => void) | null }; onClose?: () => void }) {
  const [bridge] = useState(() => new SidebarAgentBridge());
  return <SidebarCopilotProvider agent={bridge.agent}>
    <LiveAssistantContent closeRef={closeRef} bridge={bridge} onClose={onClose} />
  </SidebarCopilotProvider>;
}

function LiveAssistantContent({ closeRef, bridge, onClose }: { closeRef: { current: (() => void) | null }; bridge: SidebarAgentBridge; onClose?: () => void }) {
  const { copilotkit } = useCopilotKit();
  const [view, setView] = useState<ReactiveView>(initialReactiveView);
  const [snapshot, setSnapshot] = useState<PageSnapshot | null>(null);
  useAgentContext({ description: PAGE_CONTEXT_DESCRIPTION, value: { snapshot, userGoal: view.userGoal ?? '', goalRevision: view.goalRevision ?? 0 } });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const connected = connectionStatus === 'connected';
  const [captureEpoch, setCaptureEpoch] = useState(0);
  const [messageDraft, setMessageDraft] = useState('');
  useEffect(() => setMessageDraft(''), [view.sourceUrl, view.goalRevision]);
  const connection = useRef<ReturnType<typeof createReactiveConnection> | null>(null);
  const stop = useRef<ReturnType<typeof observePageSnapshots> | null>(null);
  const closing = useRef(false);
  function send(message: unknown) { connection.current?.send(message); }
  bridge.send = send;
  bridge.refreshContext = context => {
    const fresh = stop.current?.refresh();
    if (!connected || view.paused || !fresh || fresh.url !== context.snapshot.url) throw new Error('Wait for the current page to finish reading.');
    setSnapshot(fresh);
    return { ...context, snapshot: fresh };
  };
  useEffect(() => {
    connection.current = createReactiveConnection({
      connect: () => {
        if (!browser.runtime?.id) throw new Error('Extension context invalidated.');
        return browser.runtime.connect({ name: 'agentlayer:reactive' });
      },
      onRecapture: () => setCaptureEpoch(value => value + 1),
      onState: next => { bridge.publish(next); setView(next); },
      onStatus: status => {
        setConnectionStatus(status);
        document.querySelector('agentlayer-ui')?.setAttribute('data-agentlayer-connection', status);
        if (status === 'connected') return;
        bridge.disconnect();
        stop.current?.();
        if (!closing.current) setView(previous => ({ ...previous, status: status === 'connecting' ? 'connecting' : 'error',
          message: status === 'invalidated' ? 'Extension restarted. Click the AgentLayer toolbar icon to reconnect.'
            : status === 'connecting' ? 'Reconnecting to AgentLayer…' : 'Connection interrupted.' }));
      },
    });
    closeRef.current = () => { closing.current = true; stop.current?.(); send({ type: 'close' }); };
    return () => { closeRef.current = null; bridge.disconnect(); stop.current?.(); connection.current?.dispose(); connection.current = null; };
  }, []);
  useEffect(() => {
    if (!connected || view.paused) return;
    stop.current = observePageSnapshots(document,
      snapshot => { setSnapshot(snapshot); send(snapshot ? { type: 'snapshot', snapshot } : { type: 'empty' }); },
      () => { setSnapshot(null); bridge.disconnect(); send({ type: 'invalidate', url: document.URL }); });
    return () => { stop.current?.(); stop.current = null; };
  }, [connected, view.paused, captureEpoch]);
  const working = ['connecting', 'reading', 'working'].includes(view.status);
  function applyGoal(goal: string) {
    stop.current?.();
    setView(previous => ({ ...previous, text: '', sourceUrl: '', sourceTitle: '', transcript: [], suggestions: [], assessment: undefined, slackDraft: undefined, slack: undefined }));
    send({ type: 'set-goal', userGoal: goal });
  }
  const canSend = connected && !view.paused && !working && !!view.sourceUrl && view.status !== 'empty';
  const lastUserMessage = view.transcript.at(-1)?.role === 'user' ? view.transcript.at(-1)?.text : undefined;
  function submitMessage(message: string) {
    if (!canSend || !message.trim()) return;
    // Conversation history is bounded and owned by the background; SDK messages
    // here carry the current turn and component render results only.
    bridge.agent.setMessages([]);
    bridge.agent.addMessage({ id: crypto.randomUUID(), role: 'user', content: message.trim() });
    void copilotkit.runAgent({ agent: bridge.agent }).catch(() => {
      // The authoritative background view reports cancellation/network errors.
      if (bridge.view?.status === 'completed') setView(previous => ({ ...previous, status: 'error', message: 'Could not send with the current page context. Reconnect to this page.' }));
    });
    setMessageDraft('');
    setView(previous => ({ ...previous, status: 'working', message: 'Sending your message…', suggestions: [], assessment: undefined, slackDraft: undefined, slack: undefined }));
  }
  const latest = view.transcript.filter(message => message.role === 'assistant').at(-1);
  const steps = view.frontendIntents?.find(intent => intent.name === 'next_steps');
  const suggestions = (steps?.name === 'next_steps' ? steps.props.items : view.suggestions).slice(0, 3);
  function close() { closeRef.current?.(); onClose?.(); }
  return <Sidebar className="minimal-sidebar" aria-label="AgentLayer" onKeyDown={event => {
    if (event.key === 'Escape' && onClose) { event.preventDefault(); event.stopPropagation(); close(); }
  }}>
    <SidebarHeader>
      <div className="brand"><span className="brand-mark" aria-hidden="true">a</span><h2 tabIndex={-1}>AgentLayer</h2></div>
      <div className="header-actions">
        <details className="agent-menu"><summary aria-label="AgentLayer menu">&middot;&middot;&middot;</summary><div className="agent-menu-items">
          <Button variant="ghost" size="sm" disabled={!connected} onClick={() => {
            if (!view.paused) stop.current?.(); send({ type: view.paused ? 'resume' : 'pause' });
          }}>{view.paused ? 'Resume' : 'Pause'}</Button>
          <Button variant="ghost" size="sm" disabled={!connected || working} onClick={() => { applyGoal(''); setMessageDraft(''); }}>New task</Button>
          <Button variant="ghost" size="sm" onClick={() => void browser.runtime.sendMessage({ type: 'agentlayer:settings' })}>Settings</Button>
          {!view.siteAccess && <Button variant="ghost" size="sm" onClick={() => void browser.runtime.sendMessage({ type: 'agentlayer:follow-sites' }).catch(() =>
            setView(previous => ({ ...previous, status: 'error', message: 'Could not request website access. Reopen AgentLayer.' })))}>Follow browsing</Button>}
        </div></details>
        {onClose && <Button variant="ghost" size="icon" onClick={close} aria-label="Close AgentLayer">&times;</Button>}
      </div>
    </SidebarHeader>
    <SidebarContent>
      <div className="live-assistant minimal-assistant">
        <form className="task-composer" onSubmit={event => { event.preventDefault(); submitMessage(messageDraft); }}>
          <label htmlFor="agentlayer-message">What would you like to do?</label>
          <textarea id="agentlayer-message" data-slot="textarea" rows={3} maxLength={2000} value={messageDraft}
            onChange={event => setMessageDraft(event.target.value)} placeholder={view.userGoal ? 'Refine the task...' : 'Describe the task...'} />
          <Button type="submit" size="sm" disabled={!canSend || !messageDraft.trim()} aria-label="Run task">&#8593;</Button>
        </form>
        {view.userGoal && <p className="active-task" title={view.userGoal}>{view.userGoal}</p>}
        {(working || view.paused || view.status === 'error' || view.status === 'empty') && <p className="status task-status" role="status">
          <span className="live-dot" data-working={working} aria-hidden="true" />{view.message}
        </p>}
        {connectionStatus === 'disconnected' && <Button variant="outline" size="sm" onClick={() => connection.current?.reconnect()}>Reconnect</Button>}
        {view.status === 'error' && connected && !view.paused && <Button variant="outline" size="sm"
          onClick={() => lastUserMessage ? submitMessage(lastUserMessage) : send({ type: 'resume' })}>Retry</Button>}
        {view.status === 'completed' && latest && <section className="task-result" aria-label="Task result">
          <div className="live-response" aria-label="Codex response">{latest.text.split(/(https?:\/\/[^\s<>]+)/g).map((part, index) => {
            const url = /^https?:\/\//.test(part) ? safeHttpUrl(part.replace(/[),.;]+$/, '')) : undefined;
            return url ? <a key={index} href={url} target="_blank" rel="noreferrer">{part}</a> : part;
          })}</div>
          {!!latest.sources?.length && <details className="result-sources"><summary>Sources</summary>
            <ul>{latest.sources.filter(source => safeHttpUrl(source.url)).map(source => <li key={source.id}>
              <a href={safeHttpUrl(source.url)} target="_blank" rel="noreferrer">{source.title}</a>
            </li>)}</ul>
          </details>}
        </section>}
        <CopilotActions compact view={view} snapshot={snapshot} disabled={!canSend} send={send} onMessage={submitMessage} />
        {view.slackDraft && !view.frontendIntents?.some(intent => intent.name === 'prepare_slack_draft') && supportsSlackProfile(view.sourceUrl) && <SlackReview compact
          key={`${view.goalRevision}:${view.sourceUrl}:${latest?.id}`} initialDraft={view.slackDraft} slack={view.slack} disabled={!canSend} send={send} />}
        {view.status === 'completed' && suggestions.length > 0 && <div className="conversation-options" aria-label="Suggested actions">
          {suggestions.map(suggestion => <Button key={suggestion.id} variant="outline" size="sm" disabled={!canSend}
            onClick={() => submitMessage(suggestion.prompt)}>{suggestion.label}</Button>)}
        </div>}
      </div>
    </SidebarContent>
  </Sidebar>;
}
