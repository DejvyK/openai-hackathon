// Visible, isolated browser for manual toolbar/login verification.
// Run from the repository root. No native computer-use integration is needed.
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';

const extensionPath = path.resolve('apps/extension/.output/chrome-mv3');
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium', headless: false,
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});
context.setDefaultTimeout(15000);
const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
const extensionId = new URL(worker.url()).host;
const settings = await context.newPage();
await settings.goto(`chrome-extension://${extensionId}/options.html`);
let pairing = 'not configured';
try {
  const token = (await readFile('apps/api/.pairing-token', 'utf8')).trim();
  await settings.getByLabel('Pairing token').fill(token);
  await settings.getByRole('button', { name: 'Save', exact: true }).click();
  await settings.getByRole('status').filter({ hasText: 'Token saved' }).waitFor();
  await settings.getByRole('button', { name: 'Test connection', exact: true }).click();
  await settings.getByRole('status').filter({ hasText: 'Pairing accepted' }).waitFor();
  pairing = 'accepted by local API';
} catch { pairing = 'connection check incomplete; inspect Settings'; }
const demo = await context.newPage();
await demo.goto('http://127.0.0.1:4318/demo').catch(() => {});
// Show the freshly built UI on the local sample page. This is programmatic
// injection, not proof of a native toolbar click.
if (demo.url().startsWith('http://127.0.0.1:4318/demo')) {
  await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: 'http://127.0.0.1:4318/demo' });
    if (tabs[0]?.id) await chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, files: ['/content-scripts/agent.js'] });
  });
  await demo.getByRole('region', { name: 'AgentLayer', exact: true }).waitFor();
}
await demo.bringToFront();
console.log(JSON.stringify({ ready: true, headed: true, pairing, extensionId, commands: ['pages', 'open', 'inspect', 'screenshot', 'close'], toolbarClickTested: false }));

const input = readline.createInterface({ input: process.stdin });
for await (const line of input) {
  try {
    const command = JSON.parse(line);
    const pages = context.pages();
    const page = pages[command.page ?? pages.length - 1];
    if (command.action === 'pages') {
      console.log(JSON.stringify(await Promise.all(pages.map(async (p, index) => ({ index, url: p.url(), title: await p.title().catch(() => '') })))));
    } else if (command.action === 'open') {
      if (!/^https?:\/\//.test(command.url)) throw new Error('HTTP(S) URL required');
      const next = await context.newPage(); await next.goto(command.url, { waitUntil: 'domcontentloaded' }); await next.bringToFront();
      console.log(JSON.stringify({ url: next.url(), title: await next.title() }));
    } else if (command.action === 'inspect') {
      console.log(JSON.stringify({ url: page.url(), title: await page.title(),
        headings: await page.locator('main h1').allTextContents(),
        agentCards: await page.locator('agentlayer-ui').count(),
        agentText: await page.locator('agentlayer-ui').innerText().catch(() => null) }));
    } else if (command.action === 'screenshot') {
      const destination = path.resolve('apps/extension/tests/evidence/manual-browser.png');
      await page.screenshot({ path: destination, fullPage: true }); console.log(JSON.stringify({ screenshot: destination }));
    } else if (command.action === 'close') { break; }
    else throw new Error('Unknown command');
  } catch (error) { console.log(JSON.stringify({ error: error instanceof Error ? error.message : 'Browser command failed' })); }
}
await context.close();
