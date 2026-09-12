import { ResearchRequestSchema, ResearchResponseSchema, CommitRequestSchema, CommitResultSchema, StatusRequestSchema, ConnectionStatusSchema, ApiErrorSchema, LIMITS } from '@agentlayer/contracts/v1';
import { installReactiveBackground } from '../lib/reactive-background';
import { assertSameReview, canDismissSavedReview, readSavedReview } from '../lib/save-recovery';
import { CalendarConnectionStatusSchema, CalendarConnectResponseSchema } from '@agentlayer/contracts/calendar-v1';

const baseUrl = 'http://127.0.0.1:4318';

export default defineBackground(() => {
  installReactiveBackground();
  const savingTabs = new Set<number>();
  const recoveryKey = (tabId: number) => `agentlayer:save:${tabId}`;
  browser.tabs.onRemoved.addListener(tabId => { void browser.storage.session.remove(recoveryKey(tabId)); });
  browser.action.onClicked.addListener(async tab => {
    if (!tab.id || !tab.url?.match(/^https?:/)) { await browser.runtime.openOptionsPage(); return; }
    try {
      await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['/content-scripts/agent.js'] });
      await browser.action.setBadgeText({ tabId: tab.id, text: '' });
    } catch {
      await browser.action.setBadgeText({ tabId: tab.id, text: '!' });
      await browser.runtime.openOptionsPage();
    }
  });
  browser.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== browser.runtime.id) return;
    const fromPage = !!sender.tab && /^https?:/.test(sender.url ?? '');
    const fromSettings = sender.url === browser.runtime.getURL('/options.html');
    if (!fromPage && !fromSettings) return;
    if (message?.type === 'agentlayer:settings' && fromPage) {
      void browser.runtime.openOptionsPage(); respond({ ok: true }); return;
    }
    if (['agentlayer:calendar-status', 'agentlayer:calendar-connect', 'agentlayer:calendar-disconnect'].includes(message?.type)) {
      if (!fromSettings) return;
      void (async () => {
        try {
          const { pairingToken } = await browser.storage.local.get('pairingToken');
          if (typeof pairingToken !== 'string' || !pairingToken) throw new Error('Enter the local API pairing token first.');
          const action = message.type.slice('agentlayer:calendar-'.length);
          const response = await fetch(`${baseUrl}/api/calendar/${action}`, {
            method: action === 'status' ? 'GET' : 'POST', redirect: 'error',
            headers: { Authorization: `Bearer ${pairingToken}`, 'Content-Type': 'application/json' },
            ...(action !== 'status' ? { body: '{}' } : {}), signal: AbortSignal.timeout(15000),
          });
          if (!response.ok) throw new Error(response.status === 401 ? 'Pairing token rejected. Test the local API connection.'
            : response.status === 503 ? 'Configure the Google OAuth client on the API server, then refresh.' : 'Google Calendar connection request failed. Try refreshing its status.');
          const data = await response.json();
          if (action === 'connect') {
            const approved = CalendarConnectResponseSchema.parse(data);
            await browser.tabs.create({ url: approved.authorizationUrl });
            respond({ ok: true });
          } else respond({ ok: true, data: CalendarConnectionStatusSchema.parse(data) });
        } catch (error) { respond({ ok: false, error: error instanceof TypeError ? 'Cannot reach the local API. Start it and try again.'
          : error instanceof Error && error.name !== 'ZodError' ? error.message : 'The calendar connection response could not be validated.' }); }
      })();
      return true;
    }
    if (fromPage && ['agentlayer:recover-save', 'agentlayer:dismiss-save'].includes(message?.type)) {
      void (async () => {
        try {
          const key = recoveryKey(sender.tab!.id!);
          const item = readSavedReview((await browser.storage.session.get(key))[key]);
          if (message.type === 'agentlayer:dismiss-save') {
            if (!item || item.request.requestId !== message.requestId || !canDismissSavedReview(item) || savingTabs.has(sender.tab!.id!)) {
              throw new Error('Check the previous save status before dismissing it.');
            }
            await browser.storage.session.remove(key);
          }
          respond({ ok: true, data: message.type === 'agentlayer:recover-save' ? item : null });
        } catch { respond({ ok: false, error: 'Previous save could not be recovered. Reopen AgentLayer and try again.' }); }
      })();
      return true;
    }
    const connection = message?.type === 'agentlayer:connection';
    if (connection ? !fromSettings : !fromPage) return;
    if (!['agentlayer:research', 'agentlayer:commit', 'agentlayer:reconcile', 'agentlayer:connection'].includes(message?.type)) return;
    void (async () => {
      let lockedTab: number | undefined;
      try {
        const research = message.type === 'agentlayer:research';
        const commit = message.type === 'agentlayer:commit';
        const parsed = connection ? null : (research ? ResearchRequestSchema : commit ? CommitRequestSchema : StatusRequestSchema).safeParse(message.payload);
        if (parsed && !parsed.success) throw new Error('The request is invalid. Review the context and proposal, then try again.');
        const payload = parsed?.success ? parsed.data : null;
        const { pairingToken } = await browser.storage.local.get('pairingToken');
        if (typeof pairingToken !== 'string' || !pairingToken) throw new Error('Open Settings and enter the pairing token from your local API server.');
        if (commit) {
          const tabId = sender.tab!.id!;
          if (savingTabs.has(tabId)) throw new Error('A save is already in progress. Check its status before retrying.');
          savingTabs.add(tabId); lockedTab = tabId;
          const key = recoveryKey(tabId);
          const previous = readSavedReview((await browser.storage.session.get(key))[key]);
          const request = CommitRequestSchema.parse(payload);
          assertSameReview(previous, request);
          // Persist before fetch: closing the content script must not lose the reviewed request.
          await browser.storage.session.set({ [key]: { request,
            sourceUrl: previous?.request.requestId === request.requestId ? previous.sourceUrl : sender.url, result: null } });
        }
        const path = connection ? '/api/settings/connection' : research ? '/api/research' : commit ? '/api/actions/commit'
          : `/api/actions/${encodeURIComponent(StatusRequestSchema.parse(payload).requestId)}`;
        const response = await fetch(`${baseUrl}${path}`, {
          method: research || commit ? 'POST' : 'GET', redirect: 'error',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pairingToken}` },
          ...(research || commit ? { body: JSON.stringify(payload) } : {}),
          signal: AbortSignal.timeout(research ? LIMITS.researchTimeoutMs + 5000 : 30000),
        });
        const data: unknown = await response.json();
        if (!response.ok) {
          const apiError = ApiErrorSchema.safeParse(data);
          if (response.status === 401) throw new Error('Pairing token rejected. Open Settings, replace it with the server pairing token, and test the connection.');
          if (response.status === 429) throw new Error('The service is busy or its rate limit was reached. Wait before trying again.');
          throw new Error(apiError.success ? apiError.data.message : `API request failed (${response.status}). Check the local server and its configuration.`);
        }
        const validated = (connection ? ConnectionStatusSchema : research ? ResearchResponseSchema : CommitResultSchema).safeParse(data);
        if (!validated.success) throw new Error('The server response uses an incompatible format. Update the server and extension together.');
        if (!connection && !research) {
          const result = CommitResultSchema.parse(validated.data);
          const expectedId = commit ? CommitRequestSchema.parse(payload).requestId : StatusRequestSchema.parse(payload).requestId;
          if (result.requestId !== expectedId) throw new Error('Save response belongs to another request. Check status again.');
          const key = recoveryKey(sender.tab!.id!);
          const saved = readSavedReview((await browser.storage.session.get(key))[key]);
          if (saved?.request.requestId === result.requestId) {
            if (saved.request.contextId !== result.contextId) throw new Error('Save response belongs to another page context.');
            await browser.storage.session.set({ [key]: { ...saved, result } });
          }
        }
        respond({ ok: true, data: validated.data });
      } catch (cause) {
        const timeout = cause instanceof Error && ['TimeoutError', 'AbortError'].includes(cause.name);
        respond({ ok: false, error: timeout ? 'The request timed out. If this was a save, check its status before retrying.'
          : cause instanceof TypeError ? 'Cannot reach the local API. Start the server at 127.0.0.1:4318, then test the connection in Settings.'
          : cause instanceof Error ? cause.message : 'Request failed. Check Settings.' });
      } finally { if (lockedTab !== undefined) savingTabs.delete(lockedTab); }
    })();
    return true;
  });
});
