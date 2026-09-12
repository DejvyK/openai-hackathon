import { emptyContext, visibleText, type ContextCapture, type ExtractedField } from './types';

// Deliberately narrow top-card selectors. These require live verification; fixtures
// prove behavior against these shapes, not coverage of LinkedIn's changing DOM.
export const profileSelectors = {
  name: 'main h1',
  role: '.text-body-medium.break-words',
  company: 'button[aria-label*="Current company"] .text-body-small, button[aria-label*="Současná společnost"] .text-body-small',
} as const;

export function extractLinkedIn(doc: Document): ContextCapture | null {
  const url = new URL(doc.URL);
  if (!(url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com')) || !/^\/in\/[^/]+\/?$/.test(url.pathname)) return null;
  const heading = Array.from(doc.querySelectorAll(profileSelectors.name)).find(el => visibleText(el) && !el.closest('form, [role="dialog"]'));
  if (!heading) return null;
  const topCard = heading.closest('section');
  // Public top cards include nested, hidden sign-in dialogs. Their password fields
  // do not invalidate the visible profile heading; never extract a dialog heading.
  if (!topCard) return null;
  const name = visibleText(heading);
  const role = visibleText(topCard?.querySelector(profileSelectors.role) ?? null);
  const company = visibleText(topCard?.querySelector(profileSelectors.company) ?? null);
  const profileUrl = `${url.origin}${url.pathname.replace(/\/$/, '')}`;
  const evidence: ExtractedField[] = [];
  for (const field of ['name', 'role', 'company'] as const) {
    const value = { name, role, company }[field];
    if (value) evidence.push({ field, value, sourceUrl: doc.URL, selector: profileSelectors[field], origin: 'visible_dom' });
  }
  evidence.push({ field: 'profileUrl', value: profileUrl, sourceUrl: doc.URL, selector: null, origin: 'visible_dom' });
  return { context: { ...emptyContext(doc), kind: 'profile', adapter: 'linkedin',
    person: { name, role, company, profileUrl }, extractedEvidence: evidence }, anchor: topCard ?? heading };
}
