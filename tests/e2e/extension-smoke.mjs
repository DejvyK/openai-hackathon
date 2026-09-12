import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

// Uses the real built extension and local v1 API. Negative configuration smoke only.
// No provider requests or API mocks; successful journeys have separate fixture/live gates.
const base = 'http://127.0.0.1:4318';
const extensionPath = path.resolve('apps/extension/.output/chrome-mv3');
const token = process.env.AGENTLAYER_TOKEN || (await readFile('apps/api/.pairing-token', 'utf8')).trim();
const ready = await (await fetch(`${base}/ready`)).json();
assert.equal(ready.mode, 'demo', 'Run the local demo backend before this test.');
assert.equal(ready.protocol, 'v1', 'Rebuild and restart the API before this test.');
await mkdir('.agentlayer', { recursive: true });
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});
context.setDefaultTimeout(15000);
const pageErrors = [];
context.on('page', page => page.on('pageerror', error => pageErrors.push(error.message)));
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.getByLabel('Pairing token').fill(token);
  await options.getByRole('button', { name: 'Save', exact: true }).click();
  await options.getByRole('status').filter({ hasText: 'Token saved' }).waitFor();

  await options.getByRole('button', { name: 'Test connection', exact: true }).click();
  await options.getByRole('status').filter({ hasText: 'Pairing accepted' }).waitFor();

  const page = await context.newPage();
  const response = await page.goto(`${base}/`);
  assert.equal(response.status(), 200);
  assert.equal(page.url(), `${base}/demo`);
  assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), 'Alex Morgan');

  // Playwright has no toolbar surface: use the real service worker's scripting API
  // and exact bundled file used by onClicked. This does not test the native toolbar click.
  async function inject() {
    await worker.evaluate(async (url) => {
      const [tab] = await chrome.tabs.query({ url });
      if (!tab?.id) throw new Error('Demo tab not found');
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['/content-scripts/agent.js'] });
    }, page.url());
  }
  await inject();
  await page.getByRole('region', { name: 'AgentLayer' }).waitFor();
  assert.equal(await page.getByLabel('Person / subject').inputValue(), 'Alex Morgan');
  assert.equal(await page.getByLabel('Company', { exact: true }).inputValue(), 'Example Studio');
  await inject();
  assert.equal(await page.locator('agentlayer-ui').count(), 1, 'Repeated activation must not duplicate the card.');
  await page.getByRole('button', { name: 'Research', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Live research is not configured' }).waitFor();
  assert.equal(await page.getByRole('button', { name: /Save (contact|research|demo)/ }).count(), 0);
  await page.screenshot({ path: '.agentlayer/extension-smoke.png', fullPage: true });

  await page.evaluate(() => history.pushState({}, '', '/demo?profile=second'));
  await page.getByRole('status').filter({ hasText: 'Page changed' }).waitFor();
  assert.equal(await page.getByRole('button', { name: /Save (contact|research|demo)/ }).count(), 0);
  await options.getByLabel('Pairing token').fill('invalid-test-token');
  await options.getByRole('button', { name: 'Save', exact: true }).click();
  await options.getByRole('status').filter({ hasText: 'Token saved' }).waitFor();
  await page.getByRole('button', { name: 'Research', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Pairing token rejected.' }).waitFor();
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ passed: true, checks: ['root redirect', 'options pairing', 'bundled script injection', 'no duplicate mount', 'authenticated v1 connection', 'missing integration fails closed', 'no fabricated save', 'SPA invalidation', 'invalid token feedback', 'no page errors'], screenshot: '.agentlayer/extension-smoke.png', toolbarClickTested: false }));
} finally {
  await context.close();
}
