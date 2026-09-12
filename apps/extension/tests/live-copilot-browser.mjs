import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Actual public page + actual model + built extension. No external writes or test profile pages.
const url = 'https://www.w3.org/WAI/fundamentals/accessibility-intro/';
const extension = path.resolve('apps/extension/.output/chrome-mv3');
const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
context.setDefaultTimeout(80000);
let page;
const errors = [];
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await worker.evaluate(async token => {
    await chrome.storage.local.set({ pairingToken: token });
    globalThis.copilotProof = { requests: [] };
    const original = fetch;
    globalThis.fetch = async (url, options) => {
      const response = await original(url, options);
      const pathname = new URL(String(url)).pathname;
      const body = options?.body ? JSON.parse(options.body) : undefined;
      copilotProof.requests.push({ path: pathname, status: response.status, userMessage: body?.conversation?.userMessage,
        pageUrl: body?.snapshot?.url, goalRevision: body?.goalRevision });
      return response;
    };
  }, (await readFile('apps/api/.pairing-token', 'utf8')).trim());
  page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' }); assert.equal(response?.status(), 200);
  const pageCdp = await context.newCDPSession(page);
  const { targetInfo } = await pageCdp.send('Target.getTargetInfo');
  const cdp = await context.browser().newBrowserCDPSession();
  const { targetInfos } = await cdp.send('Target.getTargets', { filter: [{ type: 'tab' }, { exclude: true }] });
  const target = targetInfos.find(item => item.targetId === targetInfo.parentId || item.url === page.url());
  assert.ok(target);
  await cdp.send('Extensions.triggerAction', { id: new URL(worker.url()).host, targetId: target.targetId });
  await page.getByRole('region', { name: 'AgentLayer', exact: true }).waitFor();
  await page.getByText('Choose an option or tell me what you would like to do.', { exact: true }).waitFor();
  const prompt = 'Summarize the main points of this page in a summary card with source references, and show two useful next-step buttons. Use only this page; no external search or sending.';
  await page.getByLabel('What would you like to do?', { exact: true }).fill(prompt);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await page.getByRole('article', { name: 'Agent summary', exact: true }).waitFor();
  await page.getByLabel('Agent next steps', { exact: true }).waitFor();
  const summary = await page.getByRole('article', { name: 'Agent summary', exact: true }).innerText();
  const steps = await page.getByLabel('Agent next steps', { exact: true }).getByRole('button').allTextContents();
  const sources = await page.getByLabel('Summary sources', { exact: true }).getByRole('link').evaluateAll(links => links.map(link => link.href));
  assert.ok(summary.length > 80); assert.ok(steps.length > 0); assert.ok(sources.includes(url));
  const proof = await worker.evaluate(() => copilotProof);
  assert.ok(proof.requests.some(request => request.path === '/api/reactive/snapshots' && request.userMessage === prompt && request.pageUrl === url && request.status === 200));
  assert.equal(proof.requests.some(request => request.path.includes('/send') || request.path.includes('/commit')), false);
  assert.deepEqual(errors, []);
  await page.getByRole('article', { name: 'Agent summary', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'apps/extension/tests/evidence/live-copilot-sidebar.png' });
  await writeFile('apps/extension/tests/evidence/live-copilot-browser.json', JSON.stringify({ url, actualPage: true, actualModel: true,
    actualCopilotKitHooks: true, nativeToolbarClick: false, externalWrites: false, summary, sources, steps, ...proof, pageErrors: errors }, null, 2));
  console.log(JSON.stringify({ actualPage: true, actualModel: true, actualCopilotKitHooks: true, externalWrites: false, summary, steps, sources, ...proof, pageErrors: errors }, null, 2));
  await page.getByRole('button', { name: 'Close AgentLayer', exact: true }).click();
} catch (error) {
  console.error(JSON.stringify({ error: error.message, errors, url: page?.url(), sidebar: await page?.getByRole('region', { name: 'AgentLayer', exact: true }).innerText({ timeout: 1000 }).catch(() => '') }));
  throw error;
} finally { await context.close(); }
