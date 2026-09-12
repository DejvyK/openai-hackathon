import { useEffect, useState } from 'react';
import { canDismissSavedReview, canRetrySavedReview, readSavedReview, type SavedReview } from '../lib/save-recovery';
import { safeHttpUrl } from '../lib/workflow';
import { Button, Card, CardContent } from './ui/primitives';

export function SaveRecovery({ onBlocked }: { onBlocked: (blocked: boolean) => void }) {
  const [saved, setSaved] = useState<SavedReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    void browser.runtime.sendMessage({ type: 'agentlayer:recover-save' }).then(response => {
      if (!active) return;
      if (!response?.ok) throw new Error('Unable to check previous saves. Reopen AgentLayer before saving.');
      const item = readSavedReview(response.data);
      setSaved(item); setLoaded(true); onBlocked(!!item);
    }).catch(() => { if (active) setError('Unable to check previous saves. Reopen AgentLayer before saving.'); });
    return () => { active = false; };
  }, [onBlocked]);
  async function run(action: 'status' | 'retry' | 'dismiss') {
    if (!saved || busy) return;
    setBusy(true); setError('');
    try {
      const response = await browser.runtime.sendMessage(action === 'dismiss'
        ? { type: 'agentlayer:dismiss-save', requestId: saved.request.requestId }
        : { type: action === 'status' ? 'agentlayer:reconcile' : 'agentlayer:commit',
          payload: action === 'status' ? { requestId: saved.request.requestId } : saved.request });
      if (!response?.ok) throw new Error(response?.error || 'Could not check the previous save.');
      if (action === 'dismiss') { setSaved(null); onBlocked(false); }
      else {
        const next = readSavedReview({ ...saved, result: response.data });
        if (!next) throw new Error('Previous save response could not be matched. Check its status again.');
        setSaved(next);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Previous save is still unresolved.'); }
    finally { setBusy(false); }
  }
  if (!saved && !error) return loaded ? null : <p role="status">Checking previous saves…</p>;
  return <Card><CardContent><h3>Previous reviewed save</h3>
    {saved && <>
      <p>This request was kept when the sidebar closed. Check its result before starting another save.</p>
      <p>Reference: {saved.request.requestId}</p>
      {safeHttpUrl(saved.sourceUrl) && <a href={safeHttpUrl(saved.sourceUrl)} target="_blank" rel="noreferrer">Original source page</a>}
      <p>{saved.request.reviewedPayload.actionKind === 'research_note' ? saved.request.reviewedPayload.note.title : saved.request.reviewedPayload.task.title}</p>
      <details><summary>Previously reviewed content</summary>
        {saved.request.reviewedPayload.actionKind === 'research_note'
          ? <p style={{ whiteSpace: 'pre-wrap' }}>{saved.request.reviewedPayload.note.content}</p>
          : <><p>{saved.request.reviewedPayload.person.name} · {saved.request.reviewedPayload.person.role} · {saved.request.reviewedPayload.person.company}</p>
            <p style={{ whiteSpace: 'pre-wrap' }}>{saved.request.reviewedPayload.task.description}</p>
            <p>Follow-up date: {saved.request.reviewedPayload.task.dueAt ?? 'Not set'}</p></>}
      </details>
      <p role="status">{saved.result ? `Recorded status: ${saved.result.status}` : 'Save outcome unknown'}</p>
      <ul>{saved.result?.operations.map(op => <li key={op.kind}>{op.kind}: {op.status}{' '}
        {safeHttpUrl(op.url) && <a href={safeHttpUrl(op.url)} target="_blank" rel="noreferrer">Open saved {op.kind}</a>}</li>)}</ul>
      <Button disabled={busy} onClick={() => void run('status')}>Check previous save status</Button>
      {canRetrySavedReview(saved) && <Button disabled={busy} onClick={() => void run('retry')}>Retry previous reviewed save</Button>}
      {canDismissSavedReview(saved) && <Button disabled={busy} onClick={() => void run('dismiss')}>Continue with current page</Button>}
    </>}
    {error && <p role="alert">{error}</p>}
  </CardContent></Card>;
}
