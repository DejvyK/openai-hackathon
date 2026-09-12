import { contextFingerprint, extractPageContext } from '../adapters';
import type { ContextCapture } from '../adapters/types';

/** Keep a selection while the user operates the card, but detect edits/removal
 * of its source node, profile replacement, URL changes and a new page selection. */
export function watchContext(doc: Document, initial: ContextCapture, onChange: (next: ContextCapture) => void) {
  let current = initial;
  let sourceText = initial.anchor?.textContent;
  let queued = false;
  const view = doc.defaultView!;
  function check() {
    queued = false;
    let next: ContextCapture;
    const selection = extractPageContext(doc);
    if (selection.context.kind === 'selection') next = selection;
    else if (current.context.kind === 'selection' && current.context.url === doc.URL
      && current.anchor?.isConnected && current.anchor.textContent === sourceText) return;
    else next = extractPageContext(doc, null);
    if (contextFingerprint(next.context) === contextFingerprint(current.context) && next.anchor === current.anchor) return;
    current = next; sourceText = next.anchor?.textContent; onChange(next);
  }
  function queue() {
    if (queued) return;
    queued = true; queueMicrotask(check);
  }
  const observer = new MutationObserver(records => {
    if (records.some(record => {
      const element = record.target.nodeType === 1 ? record.target as Element : record.target.parentElement;
      return !element?.closest('agentlayer-ui');
    })) queue();
  });
  observer.observe(doc.body, { childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ['class', 'hidden', 'aria-hidden', 'style'] });
  doc.addEventListener('selectionchange', queue);
  view.addEventListener('popstate', queue);
  // pushState does not emit popstate; polling also covers host framework updates.
  const timer = view.setInterval(check, 300);
  let stopped = false;
  function stop() {
    if (stopped) return;
    stopped = true; observer.disconnect(); doc.removeEventListener('selectionchange', queue);
    view.removeEventListener('popstate', queue); view.clearInterval(timer);
    onChange = () => {};
  }
  return { check, stop };
}
