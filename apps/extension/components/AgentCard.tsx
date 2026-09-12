import { useEffect, useRef, useState } from 'react';
import { ResearchBriefSchema, TaskResultSchema, type PageContext, type ResearchBrief, type TaskResult } from '@agentlayer/contracts';

function pageContext(): PageContext {
  return { contextId: crypto.randomUUID(), url: location.href, title: document.title.slice(0, 500),
    name: document.querySelector('h1')?.textContent?.trim().slice(0, 200) || '',
    company: document.querySelector('[data-agentlayer-company]')?.textContent?.trim().slice(0, 200) || null,
    selection: window.getSelection()?.toString().slice(0, 4000) || '' };
}
export function AgentCard() {
  const [context, setContext] = useState(pageContext);
  const [brief, setBrief] = useState<ResearchBrief | null>(null);
  const [result, setResult] = useState<TaskResult | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const requestId = useRef(crypto.randomUUID());
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (location.href !== context.url) {
        generation.current++; setContext(pageContext()); setBrief(null); setResult(null); setBusy(false); setSubmitted(false);
        setError('Page changed. Review the new context before continuing.');
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [context.url]);
  function editContext(field: 'name' | 'company', value: string) {
    generation.current++; setContext({ ...context, contextId: crypto.randomUUID(), [field]: field === 'company' ? value || null : value });
    setBrief(null); setResult(null); setBusy(false); setSubmitted(false);
  }
  async function run(save: boolean) {
    if (location.href !== context.url) { setError('Page changed. Review the new context before continuing.'); return; }
    if (save && brief?.contextId !== context.contextId) { setError('Research this context first.'); return; }
    const current = generation.current;
    if (save) setSubmitted(true);
    setBusy(true); setError('');
    try {
      const payload = save ? { requestId: requestId.current, contextId: context.contextId, title, description } : { context };
      const response = await browser.runtime.sendMessage({ type: save ? 'agentlayer:create-task' : 'agentlayer:research', payload });
      if (current !== generation.current || location.href !== context.url) return;
      if (!response?.ok) throw new Error(response?.error || 'No response from extension. Reload the page and activate AgentLayer again.');
      if (save) setResult(TaskResultSchema.parse(response.data));
      else {
        const next = ResearchBriefSchema.parse(response.data);
        if (next.contextId !== context.contextId) throw new Error('Context changed. Please research again.');
        setBrief(next); setTitle(next.task.title); setDescription(next.task.description); setResult(null); setSubmitted(false);
        requestId.current = crypto.randomUUID();
      }
    } catch (e) { if (current === generation.current) setError(e instanceof Error ? e.message : 'Request failed'); }
    finally { if (current === generation.current) setBusy(false); }
  }
  return <section className="agent-card" aria-label="AgentLayer">
    <header><h2>AgentLayer</h2><button onClick={() => void browser.runtime.sendMessage({ type: 'agentlayer:settings' })}>Settings</button></header>
    <p className="status">Page context → research → follow-up. Review detected details before sending.</p>
    <label>Person / subject<input disabled={busy || (submitted && !result)} maxLength={200} value={context.name} onChange={e => editContext('name', e.target.value)} /></label>
    <label>Company<input disabled={busy || (submitted && !result)} maxLength={200} value={context.company ?? ''} onChange={e => editContext('company', e.target.value)} /></label>
    {context.selection && <p>Selected: {context.selection.slice(0, 180)}</p>}
    <button disabled={busy || (submitted && !result) || !context.name.trim()} onClick={() => void run(false)}>{busy ? 'Working…' : 'Research'}</button>
    {brief && <>
      <p><strong>{brief.mode === 'demo' ? 'Demo data — research is simulated' : 'Live research'}</strong></p>
      <p>{brief.summary}</p>
      <ul>{brief.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul>
      <label>Follow-up title<input maxLength={300} value={title} disabled={submitted || busy} onChange={e => { setTitle(e.target.value); requestId.current = crypto.randomUUID(); }} /></label>
      <label>Description<textarea maxLength={15000} value={description} disabled={submitted || busy} onChange={e => { setDescription(e.target.value); requestId.current = crypto.randomUUID(); }} /></label>
      <button disabled={busy || !!result || !title.trim()} onClick={() => void run(true)}>{brief.mode === 'demo' ? 'Save demo task' : 'Create follow-up task'}</button>
      {submitted && !result && !busy && <p>Retry saving the same task to confirm its status. Editing is paused to prevent duplicate writes.</p>}
    </>}
    {result && <p role="status">{result.mode === 'demo' ? 'Demo task saved locally' : 'Task created'}: {result.title} {result.url && <a href={result.url} target="_blank" rel="noreferrer">Open task</a>}</p>}
    {error && <p role="alert" className="error">{error}</p>}
  </section>;
}
