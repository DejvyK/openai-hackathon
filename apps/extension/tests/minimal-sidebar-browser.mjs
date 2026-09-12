import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const extension = path.resolve('apps/extension/.output/chrome-mv3');
const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
context.setDefaultTimeout(15000);
const errors = [];
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await worker.evaluate(async () => {
    await chrome.storage.local.set({ pairingToken: 'minimal-fixture' });
    globalThis.fixture = { requests: [], runs: new Map() };
    globalThis.fetch = async (url, options = {}) => {
      const pathname = new URL(String(url)).pathname;
      if (pathname.endsWith('/snapshots')) {
        const request = JSON.parse(options.body);
        fixture.requests.push(request);
        const run = { ...request, runId: crypto.randomUUID() };
        fixture.runs.set(request.sessionId, run);
        return Response.json({ schemaVersion: 'reactive-v1', sessionId: run.sessionId, contextId: run.contextId,
          revision: run.revision, goalRevision: run.goalRevision, runId: run.runId, status: 'accepted' });
      }
      if (pathname.endsWith('/control')) {
        const command = JSON.parse(options.body);
        return Response.json({ schemaVersion: 'reactive-v1', sessionId: command.sessionId, action: command.action, status: 'accepted' });
      }
      if (pathname.endsWith('/events')) {
        const run = fixture.runs.get(pathname.split('/')[4]);
        const event = { schemaVersion: 'reactive-v1', sessionId: run.sessionId, contextId: run.contextId,
          revision: run.revision, goalRevision: run.goalRevision, runId: run.runId, sequence: 0,
          type: 'completed', text: run.conversation ? `Completed fixture task: ${run.conversation.userMessage}` : 'Ready for your task.',
          evidenceRefs: [], suggestions: [{ id: 'research', label: 'Research this page', prompt: 'Research this page' },
            { id: 'note', label: 'Save a note', prompt: 'Save a sourced note' }],
          sources: [{ id: 'exa-1', title: '<img src=x onerror=alert(1)> Evidence', url: 'http://127.0.0.1:4318/source', retrievedAt: new Date().toISOString() }] };
        return new Response(`data: ${JSON.stringify(event)}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
      }
      throw new Error(`Unexpected fixture request: ${pathname}`);
    };
  });
  const html = await readFile('apps/extension/tests/fixtures/article.html', 'utf8');
  await context.route('http://127.0.0.1:4318/**', route => route.fulfill({ contentType: 'text/html', body: html }));
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4318/article');
  const inject = () => worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'http://127.0.0.1:4318/*' });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['/content-scripts/agent.js'] });
  });
  await inject();
  const sidebar = page.getByRole('region', { name: 'AgentLayer', exact: true });
  await page.getByLabel('Task result').filter({ hasText: 'Ready for your task.' }).waitFor();
  assert.equal(await sidebar.locator('textarea').count(), 1);
  assert.equal(await sidebar.locator('fieldset, .workflow-steps, .section-intro, .conversation-transcript, [data-slot="sidebar-footer"]').count(), 0);
  assert.equal(await sidebar.getByRole('button', { name: 'Settings', exact: true }).isVisible(), false);
  assert.equal(await sidebar.locator('img').count(), 0);
  assert.equal(await sidebar.getByRole('link', { name: /Evidence/ }).isVisible(), false, 'sources collapsed by default');

  const task = 'Save this as a note';
  await page.getByLabel('What would you like to do?', { exact: true }).fill(task);
  await page.getByRole('button', { name: 'Run task' }).click();
  await page.getByLabel('Task result').filter({ hasText: `Completed fixture task: ${task}` }).waitFor();
  const firstTask = await worker.evaluate(() => fixture.requests.at(-1));
  assert.equal(firstTask.conversation.userMessage, task);
  assert.equal(firstTask.userGoal, task);
  assert.equal(firstTask.goalRevision, 1);
  assert.equal(await page.getByLabel('Task result').count(), 1);
  assert.equal(await sidebar.getByText('Ready for your task.', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Research this page', exact: true }).click();
  await page.getByLabel('Task result').filter({ hasText: 'Completed fixture task: Research this page' }).waitFor();
  const refined = await worker.evaluate(() => fixture.requests.at(-1));
  assert.equal(refined.userGoal, task);
  assert.ok(refined.conversation.history.length >= 2);
  assert.equal(await sidebar.locator('textarea').count(), 1);

  await page.goto('http://127.0.0.1:4318/next');
  await inject();
  await page.getByLabel('Task result').filter({ hasText: 'Ready for your task.' }).waitFor();
  const navigated = await worker.evaluate(() => fixture.requests.at(-1));
  assert.equal(navigated.userGoal, task);
  assert.equal(navigated.snapshot.url, 'http://127.0.0.1:4318/next');
  assert.equal(await page.getByText('Completed fixture task: Research this page', { exact: true }).count(), 0);

  await page.getByLabel('AgentLayer menu', { exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Run task' }).isDisabled(), true);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('agentlayer-ui').shadowRoot.querySelector('.active-task'));
  await page.getByLabel('Task result').filter({ hasText: 'Ready for your task.' }).waitFor();
  await page.getByLabel('AgentLayer menu', { exact: true }).click();
  await page.setViewportSize({ width: 360, height: 760 });
  await page.screenshot({ path: 'apps/extension/tests/evidence/minimal-sidebar.png' });
  const bounds = await sidebar.boundingBox();
  assert.ok(bounds.width <= 360);
  await page.getByRole('button', { name: 'Close AgentLayer' }).click();
  await sidebar.waitFor({ state: 'detached' });
  assert.deepEqual(errors, []);
  const report = { fixtureOnly: true, builtExtension: true, externalWrites: false,
    checks: ['one input; no legacy forms or chat transcript', 'menu and collapsed sources', 'first instruction persists as task',
      'suggested action carries conversation context', 'navigation removes prior result and retains task', 'pause/resume and new task', '360px layout and close'], errors };
  await writeFile('apps/extension/tests/evidence/minimal-sidebar.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await context.close(); }
