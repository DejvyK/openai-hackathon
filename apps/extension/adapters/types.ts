/** Browser extraction data. D's PageContext schema owns the eventual wire format. */
export interface ExtractedField {
  field: 'name' | 'role' | 'company' | 'profileUrl' | 'selection';
  value: string;
  sourceUrl: string;
  selector: string | null;
  origin: 'visible_dom' | 'selection' | 'user';
}

export interface BrowserContext {
  contextId: string;
  kind: 'profile' | 'selection' | 'unsupported';
  url: string;
  pageTitle: string;
  capturedAt: string;
  person: { name: string | null; role: string | null; company: string | null; profileUrl: string } | null;
  selection: { text: string } | null;
  extractedEvidence: ExtractedField[];
  adapter: 'linkedin' | 'selection' | 'demo' | 'unsupported';
}

export interface ContextCapture { context: BrowserContext; anchor: Element | null }

export function visibleText(element: Element | null, max = 200): string | null {
  if (!element || element.closest('[hidden], [aria-hidden="true"], agentlayer-ui')) return null;
  const view = element.ownerDocument.defaultView;
  const style = view?.getComputedStyle(element);
  if (style?.display === 'none' || style?.visibility === 'hidden' || !element.getClientRects().length) return null;
  return element.textContent?.replace(/\s+/g, ' ').trim().slice(0, max) || null;
}

export function emptyContext(doc: Document): BrowserContext {
  return { contextId: crypto.randomUUID(), kind: 'unsupported', url: doc.URL,
    pageTitle: doc.title.slice(0, 500), capturedAt: new Date().toISOString(),
    person: null, selection: null, extractedEvidence: [], adapter: 'unsupported' };
}
