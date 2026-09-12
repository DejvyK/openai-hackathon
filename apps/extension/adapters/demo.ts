import { emptyContext, visibleText, type ContextCapture, type ExtractedField } from './types';

/** Explicitly confined to the scaffold fixture, never a general profile detector. */
export function extractDemo(doc: Document): ContextCapture | null {
  const url = new URL(doc.URL);
  if (url.origin !== 'http://127.0.0.1:4318' || url.pathname !== '/demo') return null;
  const root = doc.querySelector('[data-agentlayer-profile]');
  if (!root) return null;
  const evidence: ExtractedField[] = [];
  const values = { name: null, role: null, company: null } as Record<'name' | 'role' | 'company', string | null>;
  for (const field of ['name', 'role', 'company'] as const) {
    const selector = `[data-agentlayer-${field}]`;
    values[field] = visibleText(root.querySelector(selector));
    if (values[field]) evidence.push({ field, value: values[field]!, sourceUrl: doc.URL, selector, origin: 'visible_dom' });
  }
  return { context: { ...emptyContext(doc), kind: 'profile', adapter: 'demo',
    person: { ...values, profileUrl: doc.URL }, extractedEvidence: evidence }, anchor: root };
}
