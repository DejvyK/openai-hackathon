import { ResearchRequestSchema, ResearchBriefSchema, CreateTaskRequestSchema, TaskResultSchema } from '@agentlayer/contracts';

export default defineBackground(() => {
  browser.action.onClicked.addListener(async (tab) => {
    if (!tab.id || !tab.url?.match(/^https?:/)) return;
    try {
      await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['content-scripts/agent.js'] });
      await browser.action.setBadgeText({ tabId: tab.id, text: '' });
    } catch {
      await browser.action.setBadgeText({ tabId: tab.id, text: '!' });
      await browser.runtime.openOptionsPage();
    }
  });
  browser.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== browser.runtime.id || !sender.tab || !sender.url?.match(/^https?:/)) return;
    if (message?.type === 'agentlayer:settings') {
      void browser.runtime.openOptionsPage(); respond({ ok: true }); return;
    }
    if (!['agentlayer:research', 'agentlayer:create-task'].includes(message?.type)) return;
    void (async () => {
      try {
        const research = message.type === 'agentlayer:research';
        const payload = research ? ResearchRequestSchema.parse(message.payload) : CreateTaskRequestSchema.parse(message.payload);
        const { pairingToken } = await browser.storage.local.get('pairingToken');
        if (typeof pairingToken !== 'string' || !pairingToken) throw new Error('Open Settings and enter your local API pairing token.');
        const response = await fetch(`http://127.0.0.1:4318/api/${research ? 'research' : 'tasks'}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pairingToken}` },
          body: JSON.stringify(payload), signal: AbortSignal.timeout(25000),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : `API error ${response.status}`);
        respond({ ok: true, data: research ? ResearchBriefSchema.parse(data) : TaskResultSchema.parse(data) });
      } catch (error) { respond({ ok: false, error: error instanceof Error ? error.message : 'Request failed' }); }
    })();
    return true;
  });
});
