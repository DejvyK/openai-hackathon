import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Actual public content and live research; no workspace Save or messages.
const url = 'https://www.w3.org/WAI/fundamentals/accessibility-intro/';
const conversationMode = process.argv.includes('--conversation');
const selectPageText = !conversationMode || process.argv.includes('--selected-conversation');
const captureOnly = process.argv.includes('--capture-only');
const extension = path.resolve('apps/extension/.output/chrome-mv3');
const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
context.setDefaultTimeout(70000);
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  const token = (await readFile('apps/api/.pairing-token', 'utf8')).trim();
  await worker.evaluate(async ({ pairingToken, captureOnly }) => {
    await chrome.storage.local.set({ pairingToken });
    globalThis.selectionEvidence = { transport: [], research: null, conversationEvents: [], snapshots: [] };
    const original = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      if (captureOnly && new URL(String(url)).pathname === '/api/reactive/snapshots') {
        selectionEvidence.snapshots.push(JSON.parse(options.body));
        return Response.json({ code: 'CAPTURE_ONLY', message: 'Diagnostic snapshot captured without provider inference.', retryable: false, requestId: null, operation: 'research' }, { status: 503 });
      }
      const response = await original(url, options);
      const endpoint = new URL(String(url));
      if (endpoint.origin === 'http://127.0.0.1:4318') {
        if (endpoint.pathname === '/api/reactive/snapshots' && typeof options?.body === 'string') selectionEvidence.snapshots.push(JSON.parse(options.body));
        selectionEvidence.transport.push({ path: endpoint.pathname, method: options?.method ?? 'GET', status: response.status });
        if (endpoint.pathname === '/api/research' && response.ok) {
          const data = await response.clone().json();
          selectionEvidence.research = { mode: data.brief?.mode, contextId: data.brief?.contextId,
            summary: data.brief?.summary, sources: data.brief?.sources, identity: data.brief?.identityStatus,
            actionKind: data.proposal?.actionKind, proposalId: data.proposal?.proposalId };
        }
        if (endpoint.pathname.startsWith('/api/reactive/') && endpoint.pathname.endsWith('/events') && response.ok) {
          const reader = response.clone().body.getReader();
          void (async () => {
            const decoder = new TextDecoder(); let pending = '';
            try {
              while (true) {
                const { value, done } = await reader.read(); if (done) break;
                pending += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
                let separator;
                while ((separator = pending.indexOf('\n\n')) >= 0) {
                  const frame = pending.slice(0, separator); pending = pending.slice(separator + 2);
                  const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
                  if (!data) continue;
                  const event = JSON.parse(data);
                  if (event.type === 'progress' || event.type === 'completed' || event.type === 'error') selectionEvidence.conversationEvents.push(event);
                  if (['completed', 'error', 'cancelled'].includes(event.type)) return;
                }
              }
            } catch { /* The extension closes its stream at the terminal event. */ }
            finally { void reader.cancel().catch(() => {}); }
          })();
        }
      }
      return response;
    };
  }, { pairingToken: token, captureOnly });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
  assert.equal(response?.status(), 200);
  const selected = !selectPageText ? '' : await page.evaluate(() => {
    const paragraph = Array.from(document.querySelectorAll('main p')).find(element => element.textContent.trim().length > 100 && element.getClientRects().length);
    if (!paragraph) throw new Error('No readable paragraph found on the actual page.');
    const range = document.createRange(); range.selectNodeContents(paragraph);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    return selection.toString();
  });
  if (selectPageText) assert.ok(selected.trim(), 'The public paragraph selection must be nonempty');
  const pageCdp = await context.newCDPSession(page);
  const { targetInfo } = await pageCdp.send('Target.getTargetInfo');
  const browserCdp = await context.browser().newBrowserCDPSession();
  const { targetInfos } = await browserCdp.send('Target.getTargets', { filter: [{ type: 'tab' }, { exclude: true }] });
  const tabTarget = targetInfos.find(target => target.targetId === targetInfo.parentId || target.url === page.url());
  assert.ok(tabTarget, 'Chrome must expose the selected page tab target');
  await browserCdp.send('Extensions.triggerAction', { id: extensionId, targetId: tabTarget.targetId });
  await page.getByRole('region', { name: 'AgentLayer', exact: true }).waitFor();
  if (selectPageText) assert.equal((await page.getByLabel('Selected text', { exact: true }).inputValue({ timeout: 5000 })).trim(), selected.trim());
  assert.equal(await page.getByLabel('Contact name', { exact: true }).count(), 0);
  if (captureOnly) {
    let request;
    for (let attempt = 0; attempt < 80; attempt++) {
      request = await worker.evaluate(() => selectionEvidence.snapshots[0]);
      if (request) break;
      await page.waitForTimeout(100);
    }
    assert.ok(request, 'The built extension must capture the selected page request.');
    await mkdir('.agentlayer', { recursive: true });
    await writeFile('.agentlayer/w3c-selected-request.json', JSON.stringify(request, null, 2));
    console.log(JSON.stringify({ captured: true, inference: false, path: '.agentlayer/w3c-selected-request.json', selectedCharacters: request.snapshot.selectedText.length }));
    await page.getByRole('button', { name: 'Close AgentLayer', exact: true }).click();
  } else if (conversationMode) {
    const complete = () => Promise.race([
      page.locator('.live-assistant').getByRole('status').filter({ hasText: 'Choose an option or tell me what you would like to do.' }).waitFor(),
      page.getByRole('button', { name: /^(Reconnect to this page|Retry this message)$/ }).waitFor().then(() => { throw new Error('The live assistant reported a run error.'); }),
    ]);
    await complete();
    const initialQuestion = await page.getByLabel('Codex response').last().innerText();
    const userMessage = 'Use Exa to research authoritative W3C sources explaining web accessibility and its benefits. Give a concise answer with source links. Do not send or save anything.';
    await page.getByLabel('What would you like to do?', { exact: true }).fill(userMessage);
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await complete();
    const answer = await page.getByLabel('Codex response').last().innerText();
    assert.equal(await page.locator('.conversation-message[data-role="user"]').count(), 1, 'The submitted turn must survive composer focus and recapture.');
    const sourceLinks = await page.getByLabel('Research sources').last().getByRole('link').evaluateAll(links => links.map(link => ({ text: link.textContent, url: link.href })));
    assert.ok(sourceLinks.length > 0, 'The real conversational Exa response must render source links.');
    const evidence = await worker.evaluate(() => selectionEvidence);
    const completed = evidence.conversationEvents.filter(event => event.type === 'completed').at(-1);
    assert.ok(completed?.sources?.length > 0, 'The actual SSE completion must contain retrieved sources.');
    assert.ok(sourceLinks.every(link => completed.sources.some(source => source.url === link.url)));
    assert.ok(evidence.conversationEvents.some(event => event.type === 'progress' && /exa/i.test(event.message)));
    assert.equal(evidence.transport.some(request => ['/api/actions/commit', '/api/slack/send'].includes(request.path)), false);
    assert.deepEqual(errors, []);
    const report = { mode: 'actual public W3C page, built extension and live conversational Codex/Exa', url: page.url(), pageTitle: await page.title(),
      activation: 'Chrome Extensions.triggerAction -> actual action.onClicked', nativeToolbarClick: false, workspaceWrites: false,
      selectedExcerpt: selected.slice(0, 180), initialQuestion, userMessage, answer, sourceLinks, transport: evidence.transport, completed, progress: evidence.conversationEvents.filter(event => event.type === 'progress'), pageErrors: errors };
    await mkdir('apps/extension/tests/evidence', { recursive: true });
    await page.getByLabel('Research sources').last().scrollIntoViewIfNeeded();
    const artifact = selectPageText ? 'live-exa-selected-conversation-browser' : 'live-exa-conversation-browser';
    await page.screenshot({ path: `apps/extension/tests/evidence/${artifact}.png` });
    await writeFile(`apps/extension/tests/evidence/${artifact}.json`, JSON.stringify(report, null, 2));
    await page.getByRole('button', { name: 'Close AgentLayer', exact: true }).click();
    await page.waitForTimeout(300);
    console.log(JSON.stringify(report, null, 2));
  } else {
  await page.getByRole('button', { name: 'Research selection', exact: true }).click();
  await page.getByText('Live research', { exact: true }).waitFor();
  await page.getByLabel('Note title', { exact: true }).waitFor();
  assert.ok((await page.getByLabel('Note title', { exact: true }).inputValue()).trim());
  assert.ok((await page.getByLabel('Note content', { exact: true }).inputValue()).trim());
  assert.equal(await page.getByRole('button', { name: 'Save research note', exact: true }).isEnabled(), true);
  const evidence = await worker.evaluate(() => selectionEvidence);
  assert.equal(evidence.research?.mode, 'live'); assert.equal(evidence.research?.actionKind, 'research_note');
  assert.ok(evidence.research.sources.length > 0);
  assert.equal(evidence.transport.some(request => request.path === '/api/actions/commit'), false);
  assert.deepEqual(errors, []);
  const report = { url: page.url(), pageTitle: await page.title(), selectedExcerpt: selected.slice(0, 180),
    activation: 'Chrome Extensions.triggerAction -> actual action.onClicked; no direct script injection',
    nativeToolbarClick: false, workspaceWrites: false, ...evidence, pageErrors: errors };
  await mkdir('apps/extension/tests/evidence', { recursive: true });
  await page.getByRole('button', { name: 'Save research note', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'apps/extension/tests/evidence/live-selection-review.png' });
  await writeFile('apps/extension/tests/evidence/live-selection-browser.json', JSON.stringify(report, null, 2));
  await page.getByRole('button', { name: 'Close AgentLayer', exact: true }).click();
  await page.waitForTimeout(300);
  console.log(JSON.stringify(report, null, 2));
  }
} catch (error) {
  const page = context.pages().at(-1);
  const evidence = await context.serviceWorkers()[0]?.evaluate(() => selectionEvidence).catch(() => null);
  const failure = { error: error.message, url: page?.url(), sidebar: await page?.getByRole('region', { name: 'AgentLayer', exact: true }).innerText({ timeout: 1000 }).catch(() => ''),
    selection: await page?.evaluate(() => getSelection()?.toString().slice(0, 200)).catch(() => ''),
    evidence };
  if (conversationMode) {
    await mkdir('apps/extension/tests/evidence', { recursive: true });
    await writeFile('apps/extension/tests/evidence/live-exa-conversation-browser-failure.json', JSON.stringify(failure, null, 2));
  }
  console.error(JSON.stringify({ ...failure, evidence: evidence ? { ...evidence, snapshots: evidence.snapshots?.map(request => ({ revision: request.revision, url: request.snapshot.url, selectedCharacters: request.snapshot.selectedText.length })) } : null }));
  throw error;
} finally { await context.close(); }
