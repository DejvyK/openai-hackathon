import { PageSnapshotSchema, REACTIVE_LIMITS, type PageSnapshot } from '@agentlayer/contracts/reactive-v1';

const excluded = 'agentlayer-ui,script,style,noscript,template,form,input,textarea,select,button,[contenteditable]:not([contenteditable="false"]),[hidden],[aria-hidden="true"]';
const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();

/** Read rendered text only. Never serialize DOM, fields, cookies or the sidebar. */
export function capturePageSnapshot(doc: Document, retainedSelection?: string): PageSnapshot | null {
  if (!/^https?:/.test(doc.URL)) return null;
  const root = doc.querySelector('main, [role="main"], article') ?? doc.body;
  if (!root) return null;
  const view = doc.defaultView!;
  function visible(element: Element | null): boolean {
    if (!element || element.closest(excluded)) return false;
    for (let current: Element | null = element; current; current = current.parentElement) {
      const style = view.getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return false;
    }
    return element.getClientRects().length > 0;
  }
  const walker = doc.createTreeWalker(root, 4);
  const chunks: string[] = [];
  let size = 0;
  let visited = 0;
  for (let node = walker.nextNode(); node && size < REACTIVE_LIMITS.mainTextChars && visited++ < 20000; node = walker.nextNode()) {
    if (!visible(node.parentElement)) continue;
    const text = normalize(node.textContent ?? '');
    if (text) { const chunk = text.slice(0, REACTIVE_LIMITS.mainTextChars - size); chunks.push(chunk); size += chunk.length + 1; }
  }
  // Only retain selections whose complete range avoids excluded elements.
  const selection = doc.getSelection();
  let selectedText = '';
  if (selection?.rangeCount && !selection.isCollapsed) {
    const range = selection.getRangeAt(0);
    const element = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer as Element : range.commonAncestorContainer.parentElement;
    if (visible(element) && !Array.from(element?.querySelectorAll(excluded) ?? []).some(item => range.intersectsNode(item))) {
      selectedText = normalize(selection.toString()).slice(0, REACTIVE_LIMITS.selectionChars);
    }
  }
  if (retainedSelection !== undefined) selectedText = retainedSelection;
  const mainText = chunks.join('\n').slice(0, REACTIVE_LIMITS.mainTextChars);
  const extractedEvidence = (selectedText ? [selectedText, ...chunks] : chunks)
    .slice(0, REACTIVE_LIMITS.evidenceItems).map((text, i) => ({ id: `page-${i + 1}`, text: text.slice(0, 2000), sourceUrl: doc.URL }));
  const result = PageSnapshotSchema.safeParse({ url: doc.URL, pageTitle: doc.title.slice(0, 500), capturedAt: new Date().toISOString(), mainText, selectedText, extractedEvidence });
  return result.success ? result.data : null;
}

export function snapshotFingerprint(snapshot: PageSnapshot): string {
  const { capturedAt: _, ...content } = snapshot;
  return JSON.stringify(content);
}

export function observePageSnapshots(doc: Document, emit: (snapshot: PageSnapshot | null) => void, invalidate: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let fingerprint = '';
  let url = doc.URL;
  let pageSelection: string | undefined;
  let sidebarInteraction = !!doc.activeElement?.closest('agentlayer-ui');
  function capture() {
    clearTimeout(timer); clearTimeout(deadline); deadline = undefined;
    if (stopped) return;
    if (doc.URL !== url) { url = doc.URL; pageSelection = undefined; sidebarInteraction = false; }
    const sidebarFocused = sidebarInteraction || !!doc.activeElement?.closest('agentlayer-ui');
    // Focusing the composer can collapse the browser selection. Keep the last
    // captured page selection while interacting with the sidebar, never its text.
    const snapshot = capturePageSnapshot(doc, sidebarFocused ? pageSelection : undefined);
    if (snapshot && (!sidebarFocused || pageSelection === undefined)) pageSelection = snapshot.selectedText;
    const next = snapshot ? snapshotFingerprint(snapshot) : `empty:${doc.URL}`;
    if (next === fingerprint) return;
    fingerprint = next;
    invalidate(); emit(snapshot);
  }
  function queue() {
    clearTimeout(timer); timer = setTimeout(capture, REACTIVE_LIMITS.debounceMs);
    // Dynamic pages may never stop mutating. Still read at least every two seconds.
    deadline ??= setTimeout(capture, 2000);
  }
  const observer = new MutationObserver(records => {
    if (records.some(record => !(record.target.nodeType === 1 ? record.target as Element : record.target.parentElement)?.closest('agentlayer-ui'))) queue();
  });
  observer.observe(doc.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'class', 'style'] });
  function interactionChanged(event: Event) {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('agentlayer-ui')) sidebarInteraction = true;
    // A submit button becoming disabled may blur to body without a user page
    // interaction. Only an actual page pointer/focus target releases selection.
    else if (event.type === 'pointerdown' || (target && target !== doc.body && target !== doc.documentElement)) sidebarInteraction = false;
  }
  function selectionChanged() { if (!sidebarInteraction && !doc.activeElement?.closest('agentlayer-ui')) queue(); }
  doc.addEventListener('pointerdown', interactionChanged, true);
  doc.addEventListener('focusin', interactionChanged, true);
  doc.addEventListener('selectionchange', selectionChanged);
  // Poll URL only; DOM extraction happens once after a stable change.
  const navigation = setInterval(() => { if (doc.URL !== url) { url = doc.URL; pageSelection = undefined; sidebarInteraction = false; fingerprint = ''; invalidate(); queue(); } }, 150);
  queue();
  const stop = () => { stopped = true; clearTimeout(timer); clearTimeout(deadline); clearInterval(navigation); observer.disconnect(); doc.removeEventListener('selectionchange', selectionChanged); doc.removeEventListener('pointerdown', interactionChanged, true); doc.removeEventListener('focusin', interactionChanged, true); };
  return Object.assign(stop, { refresh(): PageSnapshot | null {
    if (stopped) return null;
    // A click can arrive before the mutation debounce. Read now and acknowledge
    // this fingerprint so the pending timer cannot cancel the user's new turn.
    if (doc.URL !== url) { fingerprint = ''; invalidate(); queue(); return null; }
    clearTimeout(timer); clearTimeout(deadline); deadline = undefined;
    const sidebarFocused = sidebarInteraction || !!doc.activeElement?.closest('agentlayer-ui');
    const snapshot = capturePageSnapshot(doc, sidebarFocused ? pageSelection : undefined);
    if (snapshot) { pageSelection = snapshot.selectedText; fingerprint = snapshotFingerprint(snapshot); }
    return snapshot;
  } });
}
