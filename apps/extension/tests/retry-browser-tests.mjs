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
        if (run.conversation && !fixture.failed) { fixture.failed=true; return new Response('', {headers:{'Content-Type':'text/event-stream'}}); }
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
  await page.getByRole('button',{name:'Retry',exact:true}).waitFor();
  const before=await worker.evaluate(()=>fixture.requests.length);
  await page.getByRole('button',{name:'Retry',exact:true}).click(); await page.waitForTimeout(900);
  await page.getByLabel('Task result').filter({hasText:'Completed fixture task:'}).waitFor();
  assert.equal(await worker.evaluate(()=>fixture.requests.length), before+1);
  assert.deepEqual(errors,[]);
  console.log('PASS: explicit Retry after SSE EOF sends one new request and completes');
}finally{await context.close();}