import { useEffect, useState } from 'react';
import type { GoalAssessment } from '@agentlayer/contracts/reactive-v1';
import type { ReactiveView } from '../lib/reactive-state';
import { safeHttpUrl } from '../lib/workflow';
import { Button } from './ui/primitives';

export function buildSlackDraft(assessment: GoalAssessment): string {
  return [
    `Profile: ${assessment.profileUrl}`, `Goal: ${assessment.userGoal}`,
    `Assessment: ${assessment.verdict === 'worth_discussing' ? 'Worth discussing with the team' : assessment.verdict === 'concerns' ? 'Concerns against the goal' : 'More evidence needed'}`,
    `Identity: ${assessment.identityStatus}; ${assessment.identityKind}`,
    ...assessment.findings.map(finding => `${finding.stance}: ${finding.criterion} - ${finding.text}`),
    ...assessment.sources.map(source => `Source: ${source.title} ${source.url}`),
    ...assessment.unknowns.map(unknown => `Open question: ${unknown}`),
    'Next step: Review the evidence together before deciding on an interview.',
  ].join('\n\n');
}

export function SlackReview({ compact = false, assessment, initialDraft, slack, disabled, send }: {
  compact?: boolean; assessment?: GoalAssessment; initialDraft?: string; slack: ReactiveView['slack']; disabled: boolean; send: (message: unknown) => void;
}) {
  const [draft, setDraft] = useState<string | null>(initialDraft ?? null);
  useEffect(() => { if (initialDraft !== undefined) setDraft(initialDraft); }, [initialDraft]);
  const busy = slack?.status === 'reviewing' || slack?.status === 'sending';
  const locked = slack?.status === 'unknown' || slack?.status === 'sent' || slack?.status === 'sending';
  const preview = slack?.preview;
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    setExpired(!!preview && preview.expiresAt <= Date.now());
    if (!preview) return;
    const timer = setTimeout(() => setExpired(true), Math.max(0, preview.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [preview?.previewId, preview?.expiresAt]);
  const sent = slack?.result?.status === 'sent' ? slack.result : undefined;
  return <section aria-label="Share profile to Slack">
    {draft === null ? <Button variant="outline" size="sm" disabled={disabled || !assessment} onClick={() => assessment && setDraft(buildSlackDraft(assessment))}>Prepare Slack message</Button> : compact ? <>
      {!preview && !locked && <Button variant="outline" size="sm" disabled={disabled || !!busy || !draft.trim() || draft.length > 3000}
        onClick={() => send({ type: 'slack-preview', text: draft })}>Review message</Button>}
      {draft.length > 3000 && <p role="status">Ask the agent to shorten the message before sending.</p>}
      {expired && !locked && <Button variant="outline" size="sm" disabled={disabled || !!busy}
        onClick={() => send({ type: 'slack-preview', text: draft })}>Refresh preview</Button>}
    </> : <>
      <label htmlFor="agentlayer-slack-draft">Slack message</label>
      <textarea id="agentlayer-slack-draft" data-slot="textarea" rows={8} value={draft} disabled={disabled || !!busy || !!locked}
        onChange={event => { setDraft(event.target.value); send({ type: 'slack-reset' }); }} />
      <p className="status">{draft.length} / 3,000 characters. {draft.length > 3000 ? 'Shorten the message before review; source URLs have been kept intact.' : 'Review the destination and exact message before sending.'}</p>
      {!locked && <Button variant="outline" size="sm" disabled={disabled || !!busy || !draft.trim() || draft.length > 3000}
        onClick={() => send({ type: 'slack-preview', text: draft })}>Review in Slack</Button>}
    </>}
    {slack?.status === 'reviewing' && <p role="status">Preparing destination and message preview…</p>}
    {preview && slack?.status !== 'sent' && <div className="source-card">
      <h4>{preview.destination.teamName} · #{preview.destination.channelName}</h4>
      <div className="live-response" aria-label="Exact Slack message preview">{preview.text}</div>
      {slack?.status === 'ready' && expired && <p role="status">This preview expired. Review the message again before sending.</p>}
      {slack?.status === 'ready' && <Button size="sm" disabled={disabled || expired || draft !== preview.text || preview.expiresAt <= Date.now()}
        onClick={() => send({ type: 'slack-send', previewId: preview.previewId, text: preview.text, approved: true })}>Send to #{preview.destination.channelName}</Button>}
    </div>}
    {slack?.status === 'sending' && <p role="status">Sending the reviewed message…</p>}
    {slack?.message && <p role="status" className="warning">{slack.message}</p>}
    {sent && <p role="status">Message sent. {safeHttpUrl(sent.permalink ?? '')
      ? <a href={safeHttpUrl(sent.permalink ?? '')} target="_blank" rel="noreferrer">Open in Slack</a>
      : `Slack confirmed message ${sent.messageTs}; its link is unavailable.`}</p>}
  </section>;
}
