import type { EvidenceSource, ResearchBriefV1, ResearchContext } from './types.js';
import { list, publicUrl, record, ResearchError, string } from './validation.js';
import { ResearchBriefSchema } from '@agentlayer/contracts/v1';

function normalized(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en').replace(/\s+/g, ' ').trim();
}
function contains(haystack: string, needle: string): boolean {
  return normalized(haystack).includes(normalized(needle));
}
function sameUrl(a: string | null, b: string): boolean {
  const left = publicUrl(a), right = publicUrl(b);
  return !!left && !!right && left.replace(/\/$/, '') === right.replace(/\/$/, '');
}

export function buildBrief(context: ResearchContext, raw: unknown, sources: EvidenceSource[]): ResearchBriefV1 {
  const result = record(raw);
  if (!['matched', 'ambiguous', 'insufficient'].includes(String(result.identityStatus))) throw new ResearchError('PROVIDER_INVALID_RESPONSE');
  const byId = new Map(sources.map(s => [s.id, s]));
  const matchedSourceIds = new Set<string>();
  const companySourceIds = new Set<string>();
  const warnings = new Set<string>();
  let conflict = false;
  for (const rawMatch of list(result.identityMatches, 20)) {
    const m = record(rawMatch);
    const source = byId.get(string(m.sourceId, 80));
    const name = m.name === null ? null : string(m.name, 200);
    const company = m.company === null ? null : string(m.company, 200);
    const profileUrl = m.profileUrl === null ? null : string(m.profileUrl, 4096);
    if (!source || (name && !contains(source.text, name)) || (company && !contains(source.text, company)) ||
      (profileUrl && !sameUrl(profileUrl, source.url) && !source.text.includes(profileUrl))) {
      warnings.add('An unsupported identity assessment was discarded.');
      continue;
    }
    if (context.kind !== 'profile' || !context.person) continue;
    const person = context.person;
    const nameMatches = !!name && !!person.name && normalized(name) === normalized(person.name);
    const companyMatches = !!company && !!person.company && normalized(company) === normalized(person.company);
    if (companyMatches) companySourceIds.add(source.id);
    const profileMatches = !!profileUrl && sameUrl(profileUrl, person.profileUrl);
    if ((name && person.name && !nameMatches) ||
      (nameMatches && company && person.company && !companyMatches) ||
      (nameMatches && profileUrl && !profileMatches)) conflict = true;
    if (nameMatches && (companyMatches || profileMatches)) matchedSourceIds.add(source.id);
  }
  const identityStatus = context.kind === 'selection' ? 'insufficient' :
    conflict || result.identityStatus === 'ambiguous' ? 'ambiguous' :
      result.identityStatus === 'matched' && matchedSourceIds.size ? 'matched' : 'insufficient';
  if (context.kind === 'profile' && identityStatus !== 'matched') {
    warnings.add(identityStatus === 'ambiguous' ? 'Conflicting or ambiguous identity; verify the person before saving.' :
      'Insufficient evidence to confirm this person; unknown details remain empty.');
  }
  const claims: ResearchBriefV1['claims'] = [];
  for (const rawClaim of list(result.claims, 10)) {
    const claim = record(rawClaim);
    const text = string(claim.text, 1200);
    if (!['person', 'company', 'selection'].includes(String(claim.subject))) throw new ResearchError('PROVIDER_INVALID_RESPONSE');
    const sourceIds = [...new Set(list(claim.sourceIds, 10).map(id => string(id, 80)))];
    const quotes = list(claim.quotes, 10).map(q => {
      const quote = record(q);
      return { sourceId: string(quote.sourceId, 80), text: string(quote.text, 1500) };
    });
    const supported = sourceIds.length > 0 && sourceIds.every(id => {
      const source = byId.get(id);
      return !!source && quotes.some(q => q.sourceId === id && q.text.trim().length >= 12 && source.text.includes(q.text));
    });
    const subjectAllowed = context.kind === 'selection' ? claim.subject === 'selection' :
      claim.subject === 'person' ? identityStatus === 'matched' && sourceIds.every(id => matchedSourceIds.has(id)) :
        claim.subject === 'company' && sourceIds.every(id => companySourceIds.has(id));
    if (!supported || !subjectAllowed) { warnings.add('An unsupported or identity-uncertain claim was discarded.'); continue; }
    claims.push({ text, sourceIds });
  }
  // Free prose outside claims is not accepted; all factual summary text retains citations.
  const summary = claims.length ? claims.map(c => `${c.text} [${c.sourceIds.join(', ')}]`).join('\n') :
    'No sufficiently supported findings were established. Review the supplied context or refine the research.';
  if (!sources.length) warnings.add('No usable external evidence was returned.');
  const suggestions = list(result.suggestions, 5).map(s => string(s, 500));
  // Suggestions are only exposed when findings survived evidence checks. No
  // model-generated contact fields, dates or identifiers enter a write proposal.
  const brief: ResearchBriefV1 = { schemaVersion: 'v1', contextId: context.contextId, mode: 'live', summary, claims,
    sources: sources.map(({ id, title, url, retrievedAt }) => ({ id, title, url, retrievedAt })),
    identityStatus, warnings: [...warnings],
    suggestions: claims.length && (context.kind === 'selection' || identityStatus === 'matched') ?
      suggestions : ['Verify the context and identity before taking further action.'] };
  if (!ResearchBriefSchema.safeParse(brief).success) throw new ResearchError('PROVIDER_INVALID_RESPONSE');
  return brief;
}
