import type { GoalAssessment as Assessment } from '@agentlayer/contracts/reactive-v1';
import { safeHttpUrl } from '../lib/workflow';

const verdictLabel = {
  worth_discussing: 'Worth discussing with your team',
  concerns: 'Concerns against your goal',
  insufficient_evidence: 'More evidence needed',
};
const stanceLabel = { supports: 'Supports the goal', concern: 'Concern', neutral: 'Context' };

export function GoalAssessment({ assessment }: { assessment: Assessment }) {
  const sources = new Map(assessment.sources.map(source => [source.id, source]));
  return <section className="goal-assessment" aria-label="Sourced profile assessment">
    <h3>{verdictLabel[assessment.verdict]}</h3>
    <p><strong>Your goal:</strong> {assessment.userGoal}</p>
    {assessment.identityStatus !== 'matched' && <p className="warning">{assessment.identityStatus === 'ambiguous'
      ? 'Identity is ambiguous. These sources may refer to a different person.'
      : 'There is not enough evidence to verify this profile’s identity.'}</p>}
    {assessment.identityKind === 'fictional_or_parody' && <p className="warning">This appears to be a fictional or parody profile. Findings describe that character or profile, not a verified real person.</p>}
    {safeHttpUrl(assessment.profileUrl) && <a href={safeHttpUrl(assessment.profileUrl)} target="_blank" rel="noreferrer">Open assessed profile</a>}
    {assessment.criteria.length > 0 && <details><summary>Criteria considered</summary><ul>{assessment.criteria.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul></details>}
    {assessment.findings.map((finding, index) => <article key={index} aria-label={stanceLabel[finding.stance]}>
      <h4>{stanceLabel[finding.stance]} · {finding.criterion}</h4>
      <p>{finding.text}</p>
      {finding.quotes.map((quote, quoteIndex) => <blockquote key={quoteIndex}>
        <p>{quote.text}</p><cite>{sources.get(quote.sourceId)?.title ?? quote.sourceId}</cite>
      </blockquote>)}
      <ul aria-label="Supporting sources">{finding.sourceIds.map(id => {
        const source = sources.get(id); const url = source && safeHttpUrl(source.url);
        return <li key={id}>{source && url ? <a href={url} target="_blank" rel="noreferrer">{source.title || source.url}</a> : 'Source unavailable'}</li>;
      })}</ul>
    </article>)}
    {assessment.findings.length === 0 && <p>No supported findings are available yet.</p>}
    {assessment.unknowns.length > 0 && <><h4>Open questions</h4><ul>{assessment.unknowns.map((unknown, index) => <li key={index}>{unknown}</li>)}</ul></>}
    <p className="status">Use these sources to guide a discussion. You decide the next step.</p>
  </section>;
}
