import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const extension = path.resolve('apps/extension/.output/chrome-mv3');
const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
context.setDefaultTimeout(15000);
const errors = [];
const checks = [];
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await worker.evaluate(async () => {
    await chrome.storage.local.set({ pairingToken: 'reactive-fixture-token' });
    // Test-only service-worker HTTP transport. Real built extension/parser/lifecycle run unchanged.
    globalThis.fixture = { snapshots: [], controls: [], streams: 0, sessions: new Map(), denyAccess: false };
    globalThis.fixturePorts = [];
    chrome.runtime.onConnect.addListener(port => { if (port.name === 'agentlayer:reactive') fixturePorts.push(port); });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options = {}) => {
      const requestUrl = new URL(String(url));
      if (!requestUrl.pathname.startsWith('/api/reactive/')) return originalFetch(url, options);
      if (options.headers.Authorization !== 'Bearer reactive-fixture-token') return new Response('{}', { status: 401 });
      if (requestUrl.pathname.endsWith('/snapshots')) {
        const request = JSON.parse(options.body); fixture.snapshots.push(request);
        const run = { ...request, runId: crypto.randomUUID(), sequence: 0, cancelled: false };
        fixture.sessions.set(request.sessionId, run);
        if (request.snapshot.pageTitle === 'SlowAck') await new Promise(resolve => setTimeout(resolve, 2500));
        return Response.json({ schemaVersion: 'reactive-v1', sessionId: request.sessionId, contextId: request.contextId, revision: request.revision, goalRevision: request.goalRevision ?? 0, runId: run.runId, status: 'accepted' });
      }
      if (requestUrl.pathname.endsWith('/control')) {
        const command = JSON.parse(options.body); fixture.controls.push(command);
        const run = fixture.sessions.get(command.sessionId);
        if (!run) return Response.json({ code: 'SESSION_NOT_FOUND', message: 'Page analysis session was not found.', retryable: false, requestId: null, operation: 'research' }, { status: 409 });
        if (run && command.action !== 'resume') run.cancelled = true;
        return Response.json({ schemaVersion: 'reactive-v1', sessionId: command.sessionId, action: command.action, status: 'accepted' });
      }
      const run = fixture.sessions.get(requestUrl.pathname.split('/')[4]);
      fixture.streams++;
      let timer;
      const stream = new ReadableStream({
        start(controller) {
          const emit = data => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ schemaVersion: 'reactive-v1', sessionId: run.sessionId, contextId: run.contextId, revision: run.revision, goalRevision: run.goalRevision ?? 0, runId: run.runId, sequence: run.sequence++, ...data })}\r\n\r\n`));
          emit({ type: 'started' }); emit({ type: 'progress', message: 'Fixture: reading supplied page' });
          timer = setTimeout(() => {
            if (run.conversation?.userMessage === 'Retry fixture question' && !fixture.failedOnce) {
              fixture.failedOnce = true;
              emit({ type: 'error', error: { code: 'REACTIVE_RUN_FAILED', message: 'Fixture transient failure', retryable: true, requestId: null, operation: 'research' } });
              controller.close(); return;
            }
            const text = run.conversation ? `Fixture reply: ${run.conversation.userMessage}` : `Fixture read: ${run.snapshot.pageTitle}\n<img src=x onerror=alert(1)>`;
            emit({ type: 'message_delta', text });
            emit({ type: 'completed', text, evidenceRefs: run.conversation ? ['exa-1'] : [],
              ...(run.conversation ? { sources: [{ id: 'exa-1', title: '<img src=x onerror=alert(1)> Source title', url: 'https://www.w3.org/', retrievedAt: new Date().toISOString() }] } : {}),
              suggestions: [{ id: 'ask', label: 'Discuss this page', prompt: 'What could I do with this page?' }] }); controller.close();
          }, run.snapshot.pageTitle.includes('Slow') ? 4000 : 150);
          options.signal?.addEventListener('abort', () => { clearTimeout(timer); try { controller.close(); } catch {} }, { once: true });
        }, cancel() { clearTimeout(timer); },
      });
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
    };
  });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await context.route('http://127.0.0.1:4318/reactive-fixture-*', route => {
    const title = new URL(route.request().url()).pathname.replace('/reactive-fixture-', '');
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html><title>${title}</title><main><h1>${title}</h1><p>Visible source information for ${title}.</p><form><p>FORM_SECRET</p><input value="INPUT_SECRET"><textarea>TEXTAREA_SECRET</textarea></form><div contenteditable>EDIT_SECRET</div><p hidden>HIDDEN_SECRET</p><p style="display:none">CSS_SECRET</p></main>` });
  });
  const snapshots = () => worker.evaluate(() => fixture.snapshots);
  const controls = () => worker.evaluate(() => fixture.controls);
  await page.goto('http://127.0.0.1:4318/reactive-fixture-First');
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'http://127.0.0.1:4318/reactive-fixture-First' });
    fixture.tabId = tab.id;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['/content-scripts/agent.js'] });
  });
  await page.getByLabel('Codex response').filter({ hasText: 'Fixture read: First' }).waitFor();
  const first = (await snapshots())[0];
  assert.equal((await snapshots()).length, 1);
  assert.match(first.snapshot.mainText, /Visible source information/);
  assert.doesNotMatch(JSON.stringify(first.snapshot), /FORM_SECRET|INPUT_SECRET|TEXTAREA_SECRET|EDIT_SECRET|HIDDEN_SECRET|CSS_SECRET|Connecting to Codex|YOUR WORKSPACE/);
  assert.equal(await page.locator('agentlayer-ui img').count(), 0);
  await page.evaluate(() => document.querySelector('main').className = 'unchanged-content');
  await page.waitForTimeout(1100);
  assert.equal((await snapshots()).length, 1);
  checks.push('bounded visible text; form/editable/hidden/sidebar exclusion; safe response text; unchanged content deduplication');

  await page.locator('main h1').click();
  const selectedPassage = await page.evaluate(() => {
    const paragraph = document.querySelector('main > p');
    const range = document.createRange(); range.selectNodeContents(paragraph);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    return selection.toString();
  });
  for (let attempt = 0; attempt < 80 && (await snapshots()).length < 2; attempt++) await page.waitForTimeout(50);
  assert.equal((await snapshots()).at(-1).snapshot.selectedText, selectedPassage);
  await page.locator('.live-assistant').getByRole('status').filter({ hasText: 'Choose an option or tell me what you would like to do.' }).waitFor();

  await page.getByRole('button', { name: 'Discuss this page', exact: true }).click();
  await page.getByLabel('Codex response').filter({ hasText: 'Fixture reply: What could I do with this page?' }).waitFor();
  const optionTurn = (await snapshots()).at(-1);
  assert.equal(optionTurn.conversation.userMessage, 'What could I do with this page?');
  assert.equal(optionTurn.snapshot.selectedText, selectedPassage);
  assert.equal(optionTurn.conversation.history.length, 1);
  assert.equal(optionTurn.conversation.history[0].role, 'assistant');
  assert.ok(optionTurn.revision > first.revision);
  await page.getByLabel('What would you like to do?', { exact: true }).fill('Help me prepare a question.');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await page.getByLabel('Codex response').filter({ hasText: 'Fixture reply: Help me prepare a question.' }).waitFor();
  const freeTurn = (await snapshots()).at(-1);
  assert.equal(freeTurn.conversation.userMessage, 'Help me prepare a question.');
  assert.deepEqual(freeTurn.conversation.history.map(item => item.role), ['assistant', 'user', 'assistant']);
  assert.notEqual(freeTurn.conversation.messageId, optionTurn.conversation.messageId);
  await page.waitForTimeout(1100);
  assert.equal((await snapshots()).filter(item => item.conversation).length, 2);
  assert.equal(freeTurn.snapshot.selectedText, selectedPassage);
  assert.match(await page.getByLabel('Conversation', { exact: true }).innerText(), /Help me prepare a question/);
  checks.push('page selection survives option/composer focus and a single submitted conversation turn without recapture cancellation');
  assert.equal(await page.getByLabel('Research sources').count(), 2);
  assert.equal(await page.getByLabel('Research sources').first().getByRole('link').getAttribute('href'), 'https://www.w3.org/');
  assert.equal(await page.locator('agentlayer-ui img').count(), 0);
  const conversationCount = (await snapshots()).filter(item => item.conversation).length;
  checks.push('model-generated option sends its prompt as a user turn; free-text turn includes bounded history/new revision; safe research links stay attached to their replies');

  await worker.evaluate(() => { fixturePorts.at(-1).disconnect(); });
  await page.waitForTimeout(1200);
  await page.getByLabel('Codex response').filter({ hasText: 'Fixture read: First' }).waitFor();
  assert.equal(await page.locator('agentlayer-ui').getAttribute('data-agentlayer-connection'), 'connected');
  assert.equal(await page.locator('agentlayer-ui').count(), 1);
  assert.ok(await worker.evaluate(() => fixturePorts.length >= 2));
  assert.equal((await snapshots()).filter(item => item.conversation).length, conversationCount);
  checks.push('temporary background-port disconnection reconnects automatically without duplicating the sidebar');

  // Reproduce an invalidated old context: the activation path must replace the inert host.
  await page.evaluate(() => {
    const host = document.querySelector('agentlayer-ui');
    host.setAttribute('data-agentlayer-connection', 'invalidated');
    host.setAttribute('data-test-old-host', 'true');
  });
  await worker.evaluate(async () => { await chrome.scripting.executeScript({ target: { tabId: fixture.tabId }, files: ['/content-scripts/agent.js'] }); });
  await page.getByLabel('Codex response').filter({ hasText: 'Fixture read: First' }).waitFor();
  assert.equal(await page.locator('[data-test-old-host]').count(), 0);
  assert.equal(await page.locator('agentlayer-ui').count(), 1);
  checks.push('activation replaces an invalidated sidebar instead of merely focusing its inert controls');

  await page.evaluate(() => { document.title = 'Replaced entity'; document.querySelector('main h1').textContent = 'Different entity at the same URL'; });
  await page.getByLabel('Codex response').filter({ hasText: 'Fixture read: Replaced entity' }).waitFor();
  assert.doesNotMatch(await page.getByLabel('Conversation', { exact: true }).innerText(), /Help me prepare a question/);
  assert.equal(await page.getByLabel('Research sources').count(), 0);
  assert.equal((await snapshots()).at(-1).conversation, undefined);
  checks.push('meaningful visible-content replacement at the same URL clears previous conversation; timestamp-only recapture preserves it');

  await page.locator('main h1').click();
  await page.evaluate(() => getSelection().removeAllRanges());
  for (let attempt = 0; attempt < 80 && (await snapshots()).at(-1).snapshot.selectedText; attempt++) await page.waitForTimeout(50);
  assert.equal((await snapshots()).at(-1).snapshot.selectedText, '');
  checks.push('explicit page interaction clears retained selection; sidebar focus alone does not');
  await page.locator('.live-assistant').getByRole('status').filter({ hasText: 'Choose an option or tell me what you would like to do.' }).waitFor();
  await page.getByLabel('What would you like to do?', { exact: true }).fill('Retry fixture question');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await page.getByRole('button', { name: 'Retry this message', exact: true }).waitFor();
  const failedTurnCount = (await snapshots()).filter(item => item.conversation?.userMessage === 'Retry fixture question').length;
  await page.waitForTimeout(900);
  assert.equal((await snapshots()).filter(item => item.conversation?.userMessage === 'Retry fixture question').length, failedTurnCount);
  await page.getByRole('button', { name: 'Retry this message', exact: true }).click();
  await page.getByLabel('Codex response').filter({ hasText: 'Fixture reply: Retry fixture question' }).waitFor();
  assert.equal((await snapshots()).filter(item => item.conversation?.userMessage === 'Retry fixture question').length, failedTurnCount + 1);
  checks.push('failed conversation waits for explicit Retry this message click; no hidden replay');

  await page.evaluate(() => { history.pushState({}, '', '/reactive-fixture-SlowAck'); document.title = 'SlowAck'; document.querySelector('main h1').textContent = 'Delayed acknowledgement'; });
  for (let attempt = 0; attempt < 100 && (await snapshots()).at(-1).snapshot.pageTitle !== 'SlowAck'; attempt++) await page.waitForTimeout(50);
  assert.equal((await snapshots()).at(-1).snapshot.pageTitle, 'SlowAck');
  await page.evaluate(() => { history.pushState({}, '', '/reactive-fixture-AfterAck'); document.title = 'AfterAck'; document.querySelector('main h1').textContent = 'Newest context before old acknowledgement'; });
  await page.getByLabel('Codex response').filter({ hasText: 'Fixture read: AfterAck' }).waitFor();
  assert.ok((await controls()).some(command => command.action === 'cancel'));
  checks.push('navigation during pending snapshot acknowledgement cancels old run and starts only latest queued context');

  await page.goto('http://127.0.0.1:4318/reactive-fixture-Second');
  await page.getByLabel('Codex response').filter({ hasText: 'Fixture read: Second' }).waitFor();
  const second = (await snapshots()).at(-1);
  assert.equal(second.conversation, undefined);
  assert.doesNotMatch(await page.getByLabel('Conversation', { exact: true }).innerText(), /Help me prepare a question/);
  assert.equal(first.sessionId, second.sessionId); assert.ok(second.revision > first.revision);
  assert.equal(await page.locator('agentlayer-ui').count(), 1);
  checks.push('hard navigation automatically reinjects in activated permitted tab, retains session, increases revision');

  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
  const pausedCount = (await snapshots()).length;
  await page.evaluate(() => { document.title = 'Paused-change'; document.querySelector('main h1').textContent = 'Paused content'; });
  await page.waitForTimeout(1100); assert.equal((await snapshots()).length, pausedCount);
  await worker.evaluate(() => fixture.sessions.clear()); // Simulate API restart while paused.
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByLabel('Codex response').filter({ hasText: 'Paused-change' }).waitFor();
  assert.ok((await controls()).some(command => command.action === 'pause'));
  assert.ok((await controls()).some(command => command.action === 'resume'));
  checks.push('Pause stops capture and sends cancellation control; Resume recovers missing server session after API restart');

  await page.evaluate(() => { history.pushState({}, '', '/reactive-fixture-Slow'); document.title = 'Slow'; document.querySelector('main').innerHTML = '<h1>Slow context</h1><p>Waiting for slow response.</p>'; });
  await page.getByRole('status').filter({ hasText: 'Fixture: reading supplied page' }).waitFor();
  await page.evaluate(() => { history.pushState({}, '', '/reactive-fixture-Latest'); document.title = 'Latest'; document.querySelector('main').innerHTML = '<h1>Latest context</h1><p>Newest page content.</p>'; });
  await page.getByLabel('Codex response').filter({ hasText: 'Fixture read: Latest' }).waitFor();
  await page.waitForTimeout(4100);
  assert.doesNotMatch(await page.getByLabel('Codex response').innerText(), /Slow/);
  assert.ok((await controls()).some(command => command.action === 'cancel'));
  checks.push('SPA navigation cancels old run; late old-page output never replaces new-page response');

  await mkdir('apps/extension/tests/evidence', { recursive: true });
  await page.screenshot({ path: 'apps/extension/tests/evidence/reactive-sidebar.png', fullPage: true });
  const beforeDenied = (await snapshots()).length;
  await context.route('https://permission-denied.invalid/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Not permitted</title><main>Do not capture this website.</main>' }));
  await page.goto('https://permission-denied.invalid/page'); await page.waitForTimeout(1100);
  assert.equal(await page.locator('agentlayer-ui').count(), 0);
  assert.equal((await snapshots()).length, beforeDenied);
  assert.equal(await worker.evaluate(() => chrome.action.getBadgeText({ tabId: fixture.tabId })), '!');
  await page.goto('http://127.0.0.1:4318/reactive-fixture-Returned');
  await page.getByLabel('Codex response').filter({ hasText: 'Fixture read: Returned' }).waitFor();
  checks.push('unpermitted origin is not captured or injected; toolbar indicates missing access; returning to permitted origin restores sidebar');
  await page.getByRole('button', { name: 'Close AgentLayer', exact: true }).click();
  await page.waitForTimeout(250);
  assert.ok((await controls()).some(command => command.action === 'close'));
  await page.goto('http://127.0.0.1:4318/reactive-fixture-Closed'); await page.waitForTimeout(1000);
  assert.equal(await page.locator('agentlayer-ui').count(), 0);
  checks.push('Close ends backend session and prevents automatic reopening');
  assert.deepEqual(errors, []);
  const report = { mode: 'fixture transport only; no Codex inference', checks, errors, browser: context.browser()?.version() };
  await writeFile('apps/extension/tests/evidence/reactive-browser-results.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await context.close(); }
