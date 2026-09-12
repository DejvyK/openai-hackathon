import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { extractPageContext, resolveActions } from '../adapters';
import type { BrowserContext, ContextCapture } from '../adapters/types';
import { watchContext } from '../lib/context-lifecycle';
import { createApiBridge } from '../lib/api-bridge';
import { safeHttpUrl, type CommitView, type ResearchView, type ReviewDraft, type ReviewSubmission, type WorkflowBridge } from '../lib/workflow';
import { Button, Input, Textarea, Card, CardContent } from './ui/primitives';
import { Sidebar, SidebarHeader, SidebarContent, SidebarFooter } from './ui/sidebar';
import { LiveAssistant } from './LiveAssistant';
import { SaveRecovery } from './SaveRecovery';

interface Props {
  initialCapture?: ContextCapture;
  bridge?: WorkflowBridge;
  onContextChange?: (capture: ContextCapture) => void;
  onClose?: () => void;
  reactive?: boolean;
}

export function AgentCard({ initialCapture, bridge: suppliedBridge, onContextChange, onClose, reactive = false }: Props = {}) {
  const closeRef = useRef<(() => void) | null>(null);
  if (reactive) return <LiveAssistant closeRef={closeRef} onClose={onClose} />;
  return <LegacyAgentCard initialCapture={initialCapture} bridge={suppliedBridge} onContextChange={onContextChange} onClose={onClose} />;
}

function LegacyAgentCard({ initialCapture, bridge: suppliedBridge, onContextChange, onClose, reactive = false }: Props) {
  const closeReactive = useRef<(() => void) | null>(null);
  function close() { closeReactive.current?.(); onClose?.(); }
  const defaultBridge = useRef<WorkflowBridge | null>(null);
  defaultBridge.current ??= createApiBridge();
  const bridge = suppliedBridge ?? defaultBridge.current;
  const initial = useRef(initialCapture ?? extractPageContext(document));
  const [context, setContext] = useState(initial.current.context);
  const [brief, setBrief] = useState<ResearchView | null>(null);
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const [result, setResult] = useState<CommitView | null>(null);
  const [busy, setBusy] = useState<'research' | 'save' | 'status' | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [recoveryBlocked, setRecoveryBlocked] = useState(!suppliedBridge);
  const generation = useRef(0);
  const request = useRef<ReviewSubmission | null>(null);
  const active = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const watcher = useRef<ReturnType<typeof watchContext> | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const changed = useRef(onContextChange);
  changed.current = onContextChange;

  function reset(next: BrowserContext) {
    generation.current++; active.current?.abort(); inFlight.current = false;
    setContext(next); setBrief(null); setDraft(null); setResult(null); setBusy(null); setSubmitted(false);
    request.current = null; setError('');
  }
  useEffect(() => {
    heading.current?.focus();
    watcher.current = watchContext(document, initial.current, next => {
      const previousRequest = request.current?.requestId;
      reset(next.context);
      setNotice(`Page changed. Review the new context before continuing.${previousRequest ? ` A previous save may have reached the workspace (reference: ${previousRequest}). Check its record before starting another save.` : ''}`);
      changed.current?.(next);
    });
    return () => { watcher.current?.stop(); watcher.current = null; generation.current++; active.current?.abort(); };
  }, []);

  function editContext(field: 'name' | 'role' | 'company' | 'selection', value: string) {
    const next = { ...context, contextId: crypto.randomUUID(), capturedAt: new Date().toISOString() };
    if (field === 'selection') next.selection = { text: value };
    else if (next.person) next.person = { ...next.person, [field]: value.trim() || null };
    next.extractedEvidence = [...context.extractedEvidence.filter(item => item.field !== field),
      { field, value, origin: 'user', sourceUrl: context.url, selector: null }];
    reset(next); setNotice('Context corrected. Run research again to prepare a new proposal.');
  }
  async function run(action: 'research' | 'save' | 'status') {
    const beforeCheck = generation.current;
    watcher.current?.check();
    if (generation.current !== beforeCheck) return;
    if (inFlight.current) return;
    if (action === 'save' && recoveryBlocked) return;
    if (context.url !== location.href || context.kind === 'unsupported') { setError('Page changed. Review the new context before continuing.'); return; }
    if (action !== 'research' && (!brief || !draft || brief.contextId !== context.contextId)) return;
    if (action === 'research' && request.current) return;
    const current = generation.current;
    const controller = new AbortController(); active.current = controller;
    inFlight.current = true; setBusy(action); setError(''); setNotice('');
    try {
      if (action === 'research') {
        const next = await bridge.research(context, controller.signal);
        if (current !== generation.current || context.url !== location.href) return;
        if (next.contextId !== context.contextId || !next.proposalId) throw new Error('Research belongs to a different context. Please research again.');
        if ((context.kind === 'selection' && next.action !== 'research_note')
          || (context.kind === 'profile' && next.action !== 'contact_followup')) {
          throw new Error('The proposed action does not match this page context.');
        }
        setBrief(next); setDraft({ ...next.draft, dueAt: '' }); setResult(null); setSubmitted(false);
      } else {
        if (!request.current) {
          const editedFields = (Object.keys(draft!) as (keyof ReviewDraft)[]).filter(key => draft![key] !== brief!.draft[key]);
          request.current = { requestId: crypto.randomUUID(), contextId: context.contextId, proposalId: brief!.proposalId,
            action: brief!.action, draft: { ...draft! }, editedFields };
          setSubmitted(true);
        }
        const next = await (action === 'status' ? bridge.reconcile(request.current, controller.signal) : bridge.commit(request.current, controller.signal));
        if (current !== generation.current || context.url !== location.href) return;
        if (next.contextId !== context.contextId || next.requestId !== request.current.requestId) throw new Error('Save response could not be matched. Check its status before retrying.');
        setResult(next);
      }
    } catch (cause) {
      if (current !== generation.current || controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : 'Request failed. Please check the connection.');
      if (action !== 'research' && request.current) setResult({ requestId: request.current.requestId, contextId: context.contextId,
        status: 'unknown', operations: [], warnings: ['The save outcome is unknown. Check status; do not start another write.'] });
    } finally {
      if (current === generation.current) { setBusy(null); inFlight.current = false; }
    }
  }
  const action = resolveActions(context)[0];
  const locked = !!busy || submitted;
  const retryable = result && ['partial', 'failed'].includes(result.status)
    && result.operations.some(op => op.status === 'failed' && op.retryable)
    && !result.operations.some(op => op.status === 'unknown');
  function field(key: keyof ReviewDraft, label: string, multiline = false) {
    if (!draft) return null;
    const props = { 'aria-label': label, value: draft[key], disabled: locked, maxLength: key === 'content' ? 15000 : key === 'title' ? 255 : 200,
      onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft({ ...draft, [key]: e.target.value }) };
    return <label>{label}{multiline ? <Textarea {...props} /> : <Input {...props} />}</label>;
  }
  return <Sidebar aria-label="AgentLayer" aria-busy={!!busy} onKeyDown={e => {
    if (e.key === 'Escape' && onClose) { e.preventDefault(); e.stopPropagation(); close(); }
  }}>
    <SidebarHeader><div className="brand"><span className="brand-mark" aria-hidden="true">a</span><h2 tabIndex={-1} ref={heading}>AgentLayer</h2></div><div className="header-actions">
      <Button variant="ghost" size="sm" onClick={() => void browser.runtime.sendMessage({ type: 'agentlayer:settings' })}>Settings</Button>
      {onClose && <Button variant="ghost" size="icon" onClick={close} aria-label="Close AgentLayer" title="Close (Esc)">×</Button>}
    </div></SidebarHeader>
    <nav className="workflow-steps" aria-label="Workflow progress">
      <span data-active={!brief}>01 <b>Context</b></span><span data-active={!!brief && !submitted}>02 <b>Review</b></span><span data-active={submitted}>03 <b>Save</b></span>
    </nav>
    <SidebarContent>
    {reactive && <LiveAssistant closeRef={closeReactive} />}
    {!suppliedBridge && <SaveRecovery onBlocked={setRecoveryBlocked} />}
    <div className="section-intro"><span className="eyebrow">{reactive ? 'WORKSPACE ACTIONS' : 'YOUR WORKSPACE ASSISTANT'}</span><h3>{context.kind === 'selection' ? 'Turn ideas into notes.' : reactive ? 'Prepare your next step.' : 'A thoughtful next step.'}</h3></div>
    <Card className="source-card"><CardContent>
    <p className="status">{context.adapter === 'demo' ? 'Local sample profile · fictional data' : context.kind === 'profile' ? 'Profile → research → contact + follow-up' : context.kind === 'selection' ? 'Selected text → research → note' : reactive ? 'Select a passage to research and prepare a workspace note.' : 'Select text on this page to begin, or open a supported LinkedIn profile.'}</p>
    {safeHttpUrl(context.url) && <a href={safeHttpUrl(context.url)} target="_blank" rel="noreferrer">Source page</a>}
    </CardContent></Card>
    {context.person && <fieldset disabled={locked}><legend>Review detected details</legend>
      {(['name', 'role', 'company'] as const).map(key => <label key={key}>{key === 'name' ? 'Person / subject' : key === 'role' ? 'Role / headline' : 'Company'}
        <Input maxLength={200} value={context.person![key] ?? ''} placeholder="Unknown" onChange={e => editContext(key, e.target.value)} /></label>)}
      <p className="status">Unknown facts stay empty. Correct the context before research.</p>
    </fieldset>}
    {context.selection && <label>Selected text<Textarea aria-label="Selected text" disabled={locked} maxLength={10000} value={context.selection.text} onChange={e => editContext('selection', e.target.value)} /></label>}
    {action && <Button className="primary-action" disabled={locked || (context.kind === 'profile' ? !context.person?.name?.trim() : !context.selection?.text.trim())}
      onClick={() => void run('research')}>{busy === 'research' ? 'Researching…' : context.adapter === 'demo' ? 'Research' : action.label}</Button>}
    {busy && <p role="status">{busy === 'research' ? 'Researching this context…' : busy === 'status' ? 'Checking the existing save…' : 'Saving the reviewed proposal…'}</p>}
    {brief && draft && <>
      <p><strong>{brief.mode === 'demo' ? 'Demo data — research is simulated' : 'Live research'}</strong></p>
      <p>{brief.summary}</p>
      <p className="status">{brief.identity === 'matched' ? 'Identity matched against sources.' : brief.identity === 'ambiguous' ? 'Identity is ambiguous. Review the sources and correct the context if needed.' : 'Insufficient evidence to verify identity or facts.'}</p>
      {brief.claims.length > 0 && <ul>{brief.claims.map((claim, i) => <li key={i}>{claim.text} {claim.sourceIds.map(id => {
        const source = brief.sources.find(item => item.id === id); const url = safeHttpUrl(source?.url ?? null);
        return url ? <a key={id} href={url} target="_blank" rel="noreferrer">[{id}] </a> : <span key={id}>[unverified source] </span>;
      })}</li>)}</ul>}
      {brief.sources.length ? <ul aria-label="Research sources">{brief.sources.map(source => <li key={source.id}>{safeHttpUrl(source.url)
        ? <a href={safeHttpUrl(source.url)} target="_blank" rel="noreferrer">{source.title}</a> : <span>{source.title} (link unavailable)</span>}</li>)}</ul> : <p>No sources returned. These facts are not independently verified.</p>}
      {brief.warnings.map((warning, i) => <p className="warning" key={i}>{warning}</p>)}
      {brief.suggestions.length > 0 && <div><h3>Suggested next steps</h3><ul>{brief.suggestions.map((text, i) => <li key={i}>{text}</li>)}</ul></div>}
      <fieldset disabled={locked}><legend>{brief.action === 'research_note' ? 'Review research note' : 'Review contact and follow-up'}</legend>
        {brief.action === 'contact_followup' && <>{field('name', 'Contact name')}{field('role', 'Contact role')}{field('company', 'Contact company')}</>}
        {field('title', brief.action === 'research_note' ? 'Note title' : 'Follow-up title')}
        {field('content', brief.action === 'research_note' ? 'Note content' : 'Description', true)}
        {brief.action === 'contact_followup' && <label>Follow-up date (optional)<Input type="date" value={draft.dueAt} onChange={e => setDraft({ ...draft, dueAt: e.target.value })} /></label>}
      </fieldset>
      {!submitted && <><p>Save only after reviewing this proposal. No messages will be sent.</p>
        <Button className="primary-action" disabled={recoveryBlocked || !!busy || !draft.title.trim() || (brief.action === 'contact_followup' && !draft.name.trim())} onClick={() => void run('save')}>
          {brief.mode === 'demo' ? 'Save demo proposal' : brief.action === 'research_note' ? 'Save research note' : 'Save contact + follow-up'}</Button></>}
    </>}
    {result && <div role="status"><h3>{result.status === 'succeeded' ? (brief?.mode === 'demo' ? 'Demo proposal saved — simulated records' : 'Save completed') : result.status === 'partial' ? 'Partially saved' : result.status === 'failed' ? 'Save failed' : 'Save outcome unknown'}</h3>
      <ul>{result.operations.map((op, i) => <li key={i}>{op.kind}: {op.status}{op.id && ` (${op.id})`}{' '}
        {safeHttpUrl(op.url) && <a href={safeHttpUrl(op.url)} target="_blank" rel="noreferrer">Open {op.kind}</a>}{op.error && <p>{op.error}</p>}</li>)}</ul>
      {result.warnings.map((warning, i) => <p key={i}>{warning}</p>)}
    </div>}
    {submitted && result?.status !== 'succeeded' && <><p>Editing is locked to the reviewed payload. Status checks and permitted retries use the same request ID.</p>
      <Button variant="outline" disabled={!!busy} onClick={() => void run('status')}>Check save status</Button>
      {retryable && <Button disabled={!!busy} onClick={() => void run('save')}>Retry failed operations</Button>}
    </>}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert" className="error">{error}</p>}
    </SidebarContent>
    <SidebarFooter><span className="footer-dot" aria-hidden="true" />You review. You decide.<span className="footer-hint">{busy ? 'Working…' : 'AgentLayer'}</span></SidebarFooter>
  </Sidebar>;
}
