import { emptyContext, type ContextCapture } from './types';

export function extractSelection(doc: Document, selection: Selection | null): ContextCapture | null {
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const element = range.commonAncestorContainer.nodeType === 1
    ? range.commonAncestorContainer as Element : range.commonAncestorContainer.parentElement;
  if (!element || element.closest('agentlayer-ui, input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return null;
  if (Array.from(element.querySelectorAll('agentlayer-ui, input, textarea, [contenteditable]:not([contenteditable="false"])')).some(node => range.intersectsNode(node))) return null;
  const text = selection.toString().trim().slice(0, 10000);
  if (!text) return null;
  return { context: { ...emptyContext(doc), kind: 'selection', adapter: 'selection', selection: { text },
    extractedEvidence: [{ field: 'selection', value: text, sourceUrl: doc.URL, selector: null, origin: 'selection' }] },
    anchor: element.closest('p, article, section, blockquote, li, h1, h2, h3') ?? element };
}
