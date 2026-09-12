import assert from 'node:assert/strict';
import http from 'node:http';
import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Two real local HTTP documents, real built extension, actual paired API/Codex.
// This does not prove LinkedIn extraction, external research or workspace writes.
const pages = {
  '/one': '<title>AgentLayer reading demo</title><h1>Automatic page reading</h1><p>AgentLayer reads the visible text of an activated browser tab. It should suggest next steps without saving workspace records automatically.</p><a href="/two">Next page</a>',
  '/two': '<title>Navigation demo</title><h1>Following navigation</h1><p>When a person navigates to another page, the assistant should cancel outdated analysis and respond to the new page. Pause stops automatic reading; Resume reads the current content.</p><a href="/one">Previous page</a>',
};
const server = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(`<!doctype html><html><head><meta charset="utf-8"><style>body{font:18px/1.7 system-ui;margin:80px;max-width:650px}a{color:#111}h1{font-size:38px}</style></head><body><main>${pages[request.url] ?? pages['/one']}</main></body></html>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const extension = path.resolve('apps/extension/.output/chrome-mv3');
const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
context.setDefaultTimeout(80000);
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const token = (await readFile('apps/api/.pairing-token', 'utf8')).trim();
  await worker.evaluate(async pairingToken => {
    await chrome.storage.local.set({ pairingToken });
    globalThis.reactiveLiveRequests = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const response = await original(url, options);
      if (String(url).includes('/api/reactive/')) globalThis.reactiveLiveRequests.push({ path: new URL(String(url)).pathname, status: response.status });
      return response;
    };
  }, token);
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/one`);
  await worker.evaluate(async url => {
    const [tab] = await chrome.tabs.query({ url });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['/content-scripts/agent.js'] });
  }, `${origin}/one`);
  async function awaitAnswer() {
    await page.locator('.live-assistant').getByRole('status').filter({ hasText: 'Choose an option or tell me what you would like to do.' }).waitFor();
    const answer = await page.getByLabel('Codex response').last().innerText();
    assert.ok(answer.length > 20); return answer;
  }
  const firstAnswer = await awaitAnswer();
  const suggestions = await page.getByLabel('Suggested next steps').getByRole('button').allTextContents();
  assert.ok(suggestions.length >= 1 && suggestions.length <= 3);
  await page.getByLabel('Suggested next steps').getByRole('button').first().click();
  const optionAnswer = await awaitAnswer();
  const userMessage = 'What question should I ask next about this page? Do not send or save anything.';
  await page.getByLabel('What would you like to do?', { exact: true }).fill(userMessage);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  const conversationAnswer = await awaitAnswer();
  assert.equal(await page.locator('.conversation-message[data-role="user"]').count(), 2);
  await page.getByRole('link', { name: 'Next page', exact: true }).click();
  const secondAnswer = await awaitAnswer();
  assert.equal(await page.locator('agentlayer-ui').count(), 1);
  assert.equal(await page.locator('.live-source').getAttribute('href'), `${origin}/two`);
  assert.equal(await page.locator('.conversation-message[data-role="user"]').count(), 0);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  const transport = await worker.evaluate(() => reactiveLiveRequests);
  assert.ok(transport.filter(request => request.path.endsWith('/snapshots') && request.status === 200).length >= 4);
  assert.ok(transport.filter(request => request.path.endsWith('/events') && request.status === 200).length >= 4);
  const report = { mode: 'live Codex, real local HTTP sample pages', nativeToolbar: false, workspaceWrites: false,
    checks: ['first-page agent question/options', 'clicking a generated option continues the conversation', 'free-text user turn receives an actual Codex reply', 'hard navigation without reinjection command clears previous conversation', 'real authenticated snapshot/SSE transport', 'source follows new page', 'pause'],
    firstAnswer, suggestions, optionAnswer, userMessage, conversationAnswer, secondAnswer, transport, pageErrors: errors };
  await mkdir('apps/extension/tests/evidence', { recursive: true });
  await page.screenshot({ path: 'apps/extension/tests/evidence/reactive-live-sidebar.png', fullPage: true });
  await writeFile('apps/extension/tests/evidence/reactive-live-browser.json', JSON.stringify(report, null, 2));
  await page.getByRole('button', { name: 'Close AgentLayer', exact: true }).click();
  await page.waitForTimeout(300);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  const page = context.pages().at(-1);
  console.error(JSON.stringify({ failed: true, sidebar: await page?.getByRole('region', { name: 'AgentLayer', exact: true }).innerText({ timeout: 1000 }).catch(() => ''), reason: error.message }));
  throw error;
} finally { await context.close(); await new Promise(resolve => server.close(resolve)); }
