import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Real Chromium context invalidation. Paused sessions ensure no model/provider calls.
// Remount/activation is separately covered by reactive-browser-tests.mjs.
const extension = path.resolve('apps/extension/.output/chrome-mv3');
const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true,
  ignoreDefaultArgs: ['--disable-extensions'] });
context.setDefaultTimeout(15000);
try {
  const cdp = await context.browser().newBrowserCDPSession();
  const firstWorker = context.waitForEvent('serviceworker');
  const installed = await cdp.send('Extensions.loadUnpacked', { path: extension });
  let worker = await firstWorker;
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const url = 'http://127.0.0.1:4318/runtime-reload-fixture';
  await page.route(url, route => route.fulfill({ contentType: 'text/html', body: '<title>Reload check</title><main><h1>Browser runtime recovery</h1><p>Paused local fixture. No inference or writes.</p></main>' }));
  await page.goto(url);
  async function injectPaused() {
    await worker.evaluate(async url => {
      const [tab] = await chrome.tabs.query({ url });
      await chrome.storage.session.set({ [`reactive-tab-${tab.id}`]: { sessionId: 'reload-fixture', revision: 0, paused: true } });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['/content-scripts/agent.js'] });
    }, url);
    await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
    assert.equal(await page.locator('agentlayer-ui').getAttribute('data-agentlayer-connection'), 'connected');
  }
  await injectPaused();
  await page.locator('agentlayer-ui').evaluate(host => host.setAttribute('data-test-old-host', 'true'));
  const extensionId = new URL(worker.url()).host;
  assert.equal(installed.id, extensionId);
  await Promise.race([worker.evaluate(() => chrome.runtime.reload()).catch(error => {
    if (!/closed|destroyed|Target/i.test(error.message)) throw error;
  }), new Promise(resolve => setTimeout(resolve, 1000))]);
  await page.locator('agentlayer-ui[data-agentlayer-connection="invalidated"]').waitFor({ state: 'attached' });
  await page.getByRole('status').filter({ hasText: 'Click the AgentLayer toolbar icon to reconnect' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Retry page analysis', exact: true }).count(), 0);
  assert.equal(await page.locator('agentlayer-ui').count(), 1);
  assert.deepEqual(errors, []);
  const report = { mode: 'actual Chromium runtime invalidation of test-loaded extension; paused fixture, no inference/writes', browser: context.browser()?.version(),
    checks: ['runtime.reload invalidates original content context', 'invalidated runtime is detected without page error', 'toolbar activation instruction is visible', 'inert retry is not offered'],
    limitation: 'This test-loaded extension is unloaded by runtime.reload; fresh activation/remount is tested separately with fixture transport. This is not native toolbar or user-profile reload proof.',
    nativeToolbar: false, pageErrors: errors };
  await mkdir('apps/extension/tests/evidence', { recursive: true });
  await writeFile('apps/extension/tests/evidence/runtime-reload-browser.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await context.close(); }
