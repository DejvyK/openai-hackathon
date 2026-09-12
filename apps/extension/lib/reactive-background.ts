import { PageSnapshotSchema, SlackPreviewSchema, SlackSendResultSchema, type SlackContextBinding, ReactiveAcknowledgementSchema, REACTIVE_LIMITS, type PageSnapshot, type ReactiveSnapshotRequest } from '@agentlayer/contracts/reactive-v1';
import { ApiErrorSchema } from '@agentlayer/contracts/v1';
import { initialReactiveView, applyReactiveEvent, appendConversation, conversationHistory, type ReactiveView, type RunCursor } from './reactive-state';
import { readReactiveStream } from './reactive-stream';
import { snapshotFingerprint } from './page-snapshot';
import { supportsSlackProfile } from './workflow';
import { SidebarContextSchema } from './sidebar-context';

const baseUrl = 'http://127.0.0.1:4318';
type Port = ReturnType<typeof browser.runtime.connect>;
type Stored = { sessionId: string; revision: number; paused: boolean; userGoal: string; goalRevision: number };
type Session = Stored & { slackRevision?: number; port?: Port; view: ReactiveView; cursor?: RunCursor; stream?: AbortController; generation: number; pending?: PageSnapshot; pendingConversation?: ReactiveSnapshotRequest['conversation']; lastSnapshot?: PageSnapshot; processing: boolean; fingerprint: string; closing: boolean };
const storageKey = (tabId: number) => `reactive-tab-${tabId}`;
const originPattern = (url: string) => `${new URL(url).origin}/*`;
class ReactiveApiError extends Error { constructor(message: string, readonly code?: string) { super(message); } }

export function installReactiveBackground() {
  const sessions = new Map<number, Session>();
  const loading = new Map<number, Promise<Session>>();
  async function sessionFor(tabId: number) {
    if (sessions.has(tabId)) return sessions.get(tabId)!;
    if (loading.has(tabId)) return loading.get(tabId)!;
    const promise = (async () => {
      const record = (await browser.storage.session.get(storageKey(tabId)))[storageKey(tabId)] as Stored | undefined;
      const session: Session = { sessionId: record?.sessionId ?? crypto.randomUUID(), revision: record?.revision ?? 0, paused: record?.paused ?? false,
        userGoal: record?.userGoal ?? '', goalRevision: record?.goalRevision ?? 0,
        view: { ...initialReactiveView }, generation: 0, processing: false, fingerprint: '', closing: false };
      sessions.set(tabId, session); return session;
    })();
    loading.set(tabId, promise);
    try { return await promise; } finally { loading.delete(tabId); }
  }
  async function persist(tabId: number, session: Session) {
    await browser.storage.session.set({ [storageKey(tabId)]: { sessionId: session.sessionId, revision: session.revision, paused: session.paused, userGoal: session.userGoal, goalRevision: session.goalRevision } });
  }
  function notify(session: Session, patch?: Partial<ReactiveView>) {
    if (patch) session.view = { ...session.view, ...patch };
    session.view.paused = session.paused;
    session.view.userGoal = session.userGoal;
    session.view.goalRevision = session.goalRevision;
    try { session.port?.postMessage({ type: 'state', view: session.view }); } catch { /* Page unloaded. */ }
  }
  async function api(path: string, body?: unknown, signal?: AbortSignal) {
    const { pairingToken } = await browser.storage.local.get('pairingToken');
    if (typeof pairingToken !== 'string' || !pairingToken) throw new Error('Enter the local API pairing token in Settings.');
    const response = await fetch(`${baseUrl}${path}`, { method: body ? 'POST' : 'GET', redirect: 'error',
      headers: { Authorization: `Bearer ${pairingToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: signal ?? AbortSignal.timeout(path === '/api/slack/send' ? 65000 : path === '/api/slack/preview' ? 25000 : 10000) });
    if (!response.ok) {
      const error = ApiErrorSchema.safeParse(await response.json().catch(() => null));
      if (path.startsWith('/api/slack/')) throw new ReactiveApiError(response.status === 401 ? 'Pairing token rejected. Check Settings.'
        : response.status === 503 ? 'Slack is not configured or temporarily unavailable on the local API.'
        : response.status === 409 ? 'This Slack preview or profile context is no longer current. Review it again.'
        : response.status === 403 ? 'Access to this Slack destination was denied.' : `Slack request failed (${response.status}).`, error.success ? error.data.code : undefined);
      throw new ReactiveApiError(response.status === 401 ? 'Pairing token rejected. Check Settings.' : response.status === 404 ? 'The local API does not have a reactive session. Restart the current API and resume.' : response.status === 503 ? 'Codex is not available on the local API. Check its runtime configuration.' : `Page analysis connection failed (${response.status}).`, error.success ? error.data.code : undefined);
    }
    return response;
  }
  async function control(session: Session, action: 'pause' | 'resume' | 'close') {
    try { await api('/api/reactive/control', { schemaVersion: 'reactive-v1', sessionId: session.sessionId, action }); }
    catch (error) { if (session.revision > 0 && !(error instanceof ReactiveApiError && error.code === 'SESSION_NOT_FOUND')) throw error; }
  }
  async function cancel(cursor: RunCursor | undefined) {
    if (!cursor) return;
    await api('/api/reactive/control', { schemaVersion: 'reactive-v1', sessionId: cursor.sessionId, contextId: cursor.contextId, revision: cursor.revision, goalRevision: cursor.goalRevision ?? 0, runId: cursor.runId, action: 'cancel' });
  }
  function invalidate(session: Session, preserveView = false) {
    session.generation++; session.pending = undefined; session.pendingConversation = undefined; session.stream?.abort();
    const cursor = session.cursor; session.cursor = undefined;
    const generation = session.generation;
    // A follow-up keeps completed server tool results for continuation/reconciliation.
    void (preserveView && cursor?.terminal ? Promise.resolve() : cancel(cursor)).catch(error => {
      if (generation === session.generation && !session.cursor && !session.processing && !session.closing) notify(session, { status: 'error', message: error instanceof Error ? error.message : 'Could not cancel the previous analysis.' });
    });
    notify(session, { assessment: undefined, slackDraft: undefined, slack: undefined, status: session.paused ? 'paused' : 'reading', message: session.paused ? 'Automatic reading is paused.' : 'Reading the current page…',
      ...(!preserveView ? { text: '', suggestions: [] } : {}) });
  }
  async function pump(tabId: number, session: Session) {
    if (session.processing) return;
    session.processing = true;
    try {
      while (session.pending && !session.paused && !session.closing) {
        const snapshot = session.pending; session.pending = undefined;
        const conversation = session.pendingConversation; session.pendingConversation = undefined;
        const generation = session.generation;
        const { capturedAt: _, ...content } = snapshot;
        const fingerprint = JSON.stringify({ content, userGoal: session.userGoal, goalRevision: session.goalRevision });
        if (!conversation && fingerprint === session.fingerprint) continue;
        const request: ReactiveSnapshotRequest = { schemaVersion: 'reactive-v1', sessionId: session.sessionId, contextId: crypto.randomUUID(), revision: ++session.revision, userGoal: session.userGoal, goalRevision: session.goalRevision, snapshot, ...(conversation ? { conversation } : {}) };
        await persist(tabId, session);
        if (generation !== session.generation || session.paused || session.closing) continue;
        notify(session, { assessment: undefined, slackDraft: undefined, slack: undefined, sourceUrl: snapshot.url, sourceTitle: snapshot.pageTitle, status: 'working', message: conversation ? 'Thinking about your request…' : 'Finding useful next steps…', text: '', suggestions: [] });
        const acknowledgement = ReactiveAcknowledgementSchema.parse(await (await api('/api/reactive/snapshots', request)).json());
        if ((acknowledgement.goalRevision ?? 0) !== request.goalRevision) throw new Error('The server returned an outdated goal. Pause and resume to retry.');
        if (acknowledgement.sessionId !== session.sessionId || acknowledgement.contextId !== request.contextId || acknowledgement.revision !== request.revision || !acknowledgement.runId || !['accepted', 'unchanged'].includes(acknowledgement.status)) throw new Error('The server did not accept the current page context. Pause and resume to retry.');
        const cursor: RunCursor = { ...acknowledgement, runId: acknowledgement.runId, lastSequence: -1, terminal: false };
        if (generation !== session.generation || session.paused || session.closing) { await cancel(cursor); continue; }
        session.fingerprint = fingerprint; session.cursor = cursor;
        session.stream?.abort();
        const stream = new AbortController(); session.stream = stream;
        function failRun(message: string) {
          if (generation !== session.generation || session.cursor !== cursor || cursor.terminal) return;
          cursor.terminal = true;
          session.cursor = undefined;
          stream.abort(); session.fingerprint = '';
          // Cancel the exact failed run; a new explicit retry gets its own identity.
          void cancel(cursor).catch(() => {});
          notify(session, { status: 'error', message });
        }
        const deadline = setTimeout(() => {
          failRun('Codex timed out. Retry your request.');
        }, REACTIVE_LIMITS.maxRunMs + 5000);
        void (async () => {
          const response = await api(`/api/reactive/sessions/${encodeURIComponent(session.sessionId)}/events`, undefined, stream.signal);
          await readReactiveStream(response, event => {
            if (generation !== session.generation || stream.signal.aborted || session.cursor !== cursor) return;
            const next = applyReactiveEvent(session.view, cursor, event);
            if (next !== session.view) notify(session, next);
            if (cursor.terminal) stream.abort();
          });
          if (!cursor.terminal && !stream.signal.aborted) throw new Error('The Codex stream disconnected. Pause and resume to retry.');
        })().catch(error => {
          if (!stream.signal.aborted && generation === session.generation) {
            failRun(error instanceof Error ? error.message : 'Cannot reach the local API.');
          }
        }).finally(() => clearTimeout(deadline));
      }
    } catch (error) { session.fingerprint = ''; notify(session, { status: 'error', message: error instanceof Error ? error.message : 'Cannot reach the local API.' }); }
    finally { session.processing = false; if (session.pending && !session.paused && !session.closing) void pump(tabId, session); }
  }
  browser.runtime.onConnect.addListener(port => {
    const tabId = port.sender?.tab?.id;
    if (port.name !== 'agentlayer:reactive' || port.sender?.id !== browser.runtime.id || tabId === undefined || (port.sender.frameId ?? 0) !== 0 || !/^https?:/.test(port.sender.url ?? '')) { port.disconnect(); return; }
    let connected = true;
    port.onDisconnect.addListener(() => { connected = false; const session = sessions.get(tabId); if (session?.port === port) { session.port = undefined; invalidate(session); } });
    void sessionFor(tabId).then(async session => {
      if (!connected) return;
      if (session.port && session.port !== port) session.port.disconnect();
      session.port = port; session.fingerprint = ''; session.closing = false;
      await persist(tabId, session);
      session.view.siteAccess = await browser.permissions.contains({ origins: ['http://*/*', 'https://*/*'] });
      notify(session, { status: session.paused ? 'paused' : 'reading', message: session.paused ? 'Automatic reading is paused.' : 'Reading the current page…' });
      port.onMessage.addListener(message => {
        if (session.port !== port || !connected) return;
        void (async () => {
          if (message?.type === 'snapshot' && !session.paused) {
            const snapshot = PageSnapshotSchema.parse(message.snapshot);
            const currentTab = await browser.tabs.get(tabId);
            if (snapshot.url !== currentTab.url) return;
            if (!session.lastSnapshot || snapshotFingerprint(session.lastSnapshot) !== snapshotFingerprint(snapshot)) notify(session, { assessment: undefined, slackDraft: undefined, slack: undefined, transcript: [], suggestions: [], text: '' });
            session.lastSnapshot = snapshot;
            // Refresh the page context without replaying a user's conversational turn.
            if (!session.userGoal && session.view.transcript.some(item => item.role === 'user')) {
              notify(session, { sourceUrl: snapshot.url, sourceTitle: snapshot.pageTitle, status: 'completed', message: 'Page context updated. What would you like to do next?' });
              return;
            }
            session.pending = snapshot; void pump(tabId, session);
          } else if (message?.type === 'conversation') {
            if (session.paused || session.closing || !session.lastSnapshot) throw new Error('Wait for the current page, then send your message.');
            if (session.processing || (session.cursor && !session.cursor.terminal)) throw new Error('Wait for the current response or pause it first.');
            if (typeof message.userMessage !== 'string' || !message.userMessage.trim() || message.userMessage.trim().length > 2000) throw new Error('Write a message within 2,000 characters.');
            const currentTab = await browser.tabs.get(tabId);
            if (session.lastSnapshot.url !== currentTab.url) throw new Error('The page changed. Wait for its new context.');
            if (message.context !== undefined) {
              const registered = SidebarContextSchema.parse(message.context);
              if (registered.userGoal !== session.userGoal || registered.goalRevision !== session.goalRevision
                || registered.snapshot.url !== currentTab.url) {
                throw new Error('The registered page context changed. Wait for the current page before sending.');
              }
              session.lastSnapshot = registered.snapshot;
            }
            const userMessage = message.userMessage.trim();
            // The first instruction is also the persistent task; one composer owns both.
            if (!session.userGoal) {
              session.userGoal = userMessage;
              session.goalRevision++;
              notify(session, { userGoal: session.userGoal, goalRevision: session.goalRevision });
            }
            const messageId = crypto.randomUUID();
            const history = conversationHistory(session.view.transcript);
            invalidate(session, true);
            notify(session, { transcript: appendConversation(session.view.transcript, { id: messageId, role: 'user', text: userMessage }), suggestions: [], text: '' });
            session.pendingConversation = { messageId, userMessage, history };
            session.pending = session.lastSnapshot;
            void pump(tabId, session);
          } else if (message?.type === 'slack-reset') {
            if (['sending', 'sent', 'unknown'].includes(session.view.slack?.status ?? '')) return;
            session.slackRevision = (session.slackRevision ?? 0) + 1;
            notify(session, { slack: undefined });
          } else if (message?.type === 'slack-preview' || message?.type === 'slack-send') {
            if (['sending', 'sent', 'unknown'].includes(session.view.slack?.status ?? '')) return;
            const generation = session.generation;
            const operation = (session.slackRevision ?? 0) + 1; session.slackRevision = operation;
            try {
              const cursor = session.cursor;
              if (!cursor?.terminal || session.view.status !== 'completed' || (!session.view.assessment && !session.view.slackDraft) || session.paused || session.closing) throw new Error('Ask the assistant to prepare a Slack message for the current profile first.');
              if (!supportsSlackProfile(session.view.sourceUrl)) throw new Error('Slack review requires a supported LinkedIn profile.');
              const currentTab = await browser.tabs.get(tabId);
              if (generation !== session.generation || operation !== session.slackRevision) return;
              if (currentTab.url !== session.view.sourceUrl) throw new Error('The profile changed. Research its current context first.');
              const binding: SlackContextBinding = { sessionId: session.sessionId, contextId: cursor.contextId, revision: cursor.revision,
                goalRevision: session.goalRevision, profileUrl: session.view.sourceUrl, userGoal: session.userGoal };
              if (typeof message.text !== 'string' || !message.text.trim() || message.text.length > 3000) throw new Error('Review a message within 3,000 characters.');
              if (message.type === 'slack-preview') {
                notify(session, { slack: { status: 'reviewing' } });
                const preview = SlackPreviewSchema.parse(await (await api('/api/slack/preview', { binding, text: message.text })).json());
                if (generation !== session.generation || operation !== session.slackRevision) return;
                if (preview.text !== message.text || Object.keys(binding).some(key => preview.binding[key as keyof SlackContextBinding] !== binding[key as keyof SlackContextBinding])) throw new Error('The preview does not match this profile and message.');
                notify(session, { slack: { status: 'ready', preview } });
              } else {
                const preview = session.view.slack?.preview;
                if (!preview || preview.previewId !== message.previewId || preview.text !== message.text || message.approved !== true || preview.expiresAt <= Date.now()) throw new Error('Review the exact current message again before sending.');
                if (session.view.slack?.status !== 'ready') throw new Error('This send is already in progress or has a recorded result.');
                notify(session, { slack: { status: 'sending', preview } });
                let result;
                try { result = SlackSendResultSchema.parse(await (await api('/api/slack/send', { binding, previewId: preview.previewId, text: preview.text, approved: true })).json()); }
                catch { if (generation === session.generation && operation === session.slackRevision) notify(session, { slack: { status: 'unknown', preview, message: 'Delivery could not be confirmed. Check Slack before trying again.' } }); return; }
                if (generation !== session.generation || operation !== session.slackRevision) return;
                notify(session, { slack: { status: result.status, preview, result, ...(result.status === 'sent' ? {} : { message: result.status === 'unknown' ? 'Delivery is uncertain. Check Slack before trying again.' : `Slack could not send this message (${result.error.code}).` }) } });
              }
            } catch (error) {
              if (generation === session.generation && operation === session.slackRevision) notify(session, { slack: { status: 'failed', message: error instanceof Error ? error.message : 'Slack review failed.' } });
            }
          } else if (message?.type === 'set-goal') {
            if (typeof message.userGoal !== 'string' || message.userGoal.trim().length > 2000) throw new Error('Keep your goal within 2,000 characters.');
            const goal = message.userGoal.trim();
            if (goal === session.userGoal) { notify(session); return; }
            session.userGoal = goal; session.goalRevision++;
            invalidate(session); session.fingerprint = '';
            notify(session, { transcript: [], suggestions: [] });
            await persist(tabId, session);
            if (!session.paused && !session.closing) session.port?.postMessage({ type: 'recapture' });
          } else if (message?.type === 'invalidate') {
            invalidate(session); session.fingerprint = '';
            if (message.url && message.url !== session.lastSnapshot?.url) {
              session.lastSnapshot = undefined;
              notify(session, { transcript: [], suggestions: [], sourceUrl: '', sourceTitle: '' });
            }
          }
          else if (message?.type === 'empty') { session.lastSnapshot = undefined; notify(session, { assessment: undefined, slackDraft: undefined, slack: undefined, status: 'empty', message: 'No readable page content found.', text: '', transcript: [], suggestions: [] }); }
          else if (message?.type === 'pause') { session.paused = true; invalidate(session, true); await persist(tabId, session); await control(session, 'pause'); }
          else if (message?.type === 'resume') {
            await control(session, 'resume'); session.paused = false; session.fingerprint = ''; await persist(tabId, session);
            notify(session, { status: 'reading', message: 'Reading the current page…', text: '' });
            session.port?.postMessage({ type: 'recapture' });
          } else if (message?.type === 'close') {
            session.closing = true; invalidate(session);
            try { await control(session, 'close'); }
            finally { sessions.delete(tabId); await browser.storage.session.remove(storageKey(tabId)); }
          }
        })().catch(error => notify(session, { status: 'error', message: error instanceof Error ? error.message : 'Page analysis failed.' }));
      });
    }).catch(() => { try { port.postMessage({ type: 'state', view: { ...initialReactiveView, status: 'error', message: 'Could not restore the browser session.' } }); } catch {} });
  });
  browser.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== 'agentlayer:follow-sites' || sender.id !== browser.runtime.id || sender.tab?.id === undefined || !/^https?:/.test(sender.url ?? '')) return;
    // Called directly by the user's Follow browsing button; browser shows its native permission prompt.
    void browser.permissions.request({ origins: ['http://*/*', 'https://*/*'] }).then(granted => {
      const session = sessions.get(sender.tab!.id!);
      if (session) notify(session, { siteAccess: granted, message: granted ? 'Following navigation on permitted websites.' : 'Site access was denied. Activate AgentLayer on each new website.' });
      respond({ ok: granted });
    }).catch(() => respond({ ok: false }));
    return true;
  });
  browser.tabs.onUpdated.addListener((tabId, change, tab) => {
    if (change.status !== 'complete') return;
    void (async () => {
      const stored = (await browser.storage.session.get(storageKey(tabId)))[storageKey(tabId)];
      if (!stored) return;
      if (tab.url?.match(/^https?:/) && await browser.permissions.contains({ origins: [originPattern(tab.url)] })) {
        await browser.scripting.executeScript({ target: { tabId }, files: ['/content-scripts/agent.js'] });
        await browser.action.setBadgeText({ tabId, text: '' });
      } else {
        await browser.action.setBadgeText({ tabId, text: '!' });
        await browser.action.setTitle({ tabId, title: 'AgentLayer needs access to this website. Click to activate.' });
      }
    })().catch(() => {});
  });
  browser.tabs.onRemoved.addListener(tabId => {
    void (async () => {
      const stored = (await browser.storage.session.get(storageKey(tabId)))[storageKey(tabId)] as Stored | undefined;
      const session = sessions.get(tabId);
      if (session) { session.closing = true; invalidate(session); }
      if (stored) await api('/api/reactive/control', { schemaVersion: 'reactive-v1', sessionId: stored.sessionId, action: 'close' }).catch(() => {});
      sessions.delete(tabId); await browser.storage.session.remove(storageKey(tabId));
    })();
  });
  browser.permissions.onRemoved.addListener(() => {
    for (const [tabId, session] of sessions) {
      session.paused = true; invalidate(session);
      notify(session, { siteAccess: false, message: 'Website access changed. Automatic reading is paused.' });
      void persist(tabId, session);
      void control(session, 'pause').catch(() => {});
    }
  });
}
