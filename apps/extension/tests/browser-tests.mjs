import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = 'apps/extension/tests';
await mkdir(`${root}/evidence`, { recursive: true });
const built = await build({ entryPoints: [`${root}/browser-harness.tsx`], bundle: true, write: false, format: 'iife', jsx: 'automatic',
  loader: { '.css': 'text' },
});
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const checks = [];
async function load(file, url = 'https://www.linkedin.com/in/alex-example') {
  const html = await readFile(`${root}/fixtures/${file}.html`, 'utf8');
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
  await page.goto(url);
  await page.addScriptTag({ content: built.outputFiles[0].text });
  await page.evaluate(() => {
    window.calls = []; window.saveScenario = 'success'; window.delayResearch = false;
    window.browser = { runtime: { sendMessage: async message => {
      window.calls.push(structuredClone(message));
      if (message.type === 'agentlayer:recover-save') return { ok: true, data: window.savedReview ?? null };
      if (message.type === 'agentlayer:dismiss-save') { window.savedReview = null; return { ok: true }; }
      if (message.type === 'agentlayer:research') {
        if (window.delayResearch) await new Promise(resolve => window.releaseResearch = resolve);
        const ctx = message.payload.context;
        const actionKind = ctx.kind === 'profile' ? 'contact_followup' : 'research_note';
        return { ok: true, data: {
          brief: { schemaVersion: 'v1', contextId: ctx.contextId, mode: 'demo', summary: '<img src=x onerror=alert(1)> Fixture brief',
            claims: [{ text: 'Fixture claim', sourceIds: ['s1'] }], sources: [{ id: 's1', title: 'Fixture source', url: 'https://example.org/evidence', retrievedAt: new Date().toISOString() }],
            identityStatus: 'ambiguous', warnings: ['Fixture uncertainty'], suggestions: ['Review evidence before outreach.'] },
          proposal: { schemaVersion: 'v1', proposalId: `proposal-${ctx.contextId}`, contextId: ctx.contextId, mode: 'demo', actionKind,
            reviewedPayload: actionKind === 'contact_followup'
              ? { actionKind, person: ctx.person, task: { title: 'Follow up', description: 'Fixture task', dueAt: '2026-10-01' } }
              : { actionKind, note: { title: 'Research note', content: ctx.selection.text } }, evidenceRefs: ['s1'], userEditedFields: [] },
        } };
      }
      if (message.type === 'agentlayer:commit' || message.type === 'agentlayer:reconcile') {
        const request = message.type === 'agentlayer:commit' ? message.payload : window.calls.find(c => c.type === 'agentlayer:commit').payload;
        if (message.type === 'agentlayer:commit') window.savedReview = { request: structuredClone(request), sourceUrl: location.href, result: null };
        if (window.saveScenario === 'timeout' && message.type === 'agentlayer:commit') throw new Error('Fixture network timeout');
        const partial = window.saveScenario === 'partial';
        const response = { ok: true, data: { requestId: request.requestId, contextId: request.contextId, status: partial ? 'partial' : 'succeeded',
          operations: request.actionKind === 'research_note' ? [{ kind: 'note', status: 'created', id: 'fixture-note', url: 'https://example.org/note/1', errorCode: null, retryable: false }]
            : [{ kind: 'contact', status: 'reused', id: 'fixture-contact', url: 'https://example.org/contact/1', errorCode: null, retryable: false },
              { kind: 'task', status: partial ? 'failed' : 'created', id: partial ? null : 'fixture-task', url: partial ? null : 'https://example.org/task/1', errorCode: partial ? 'RATE_LIMIT' : null, retryable: partial }], warnings: ['Fixture result, no records created.'] } };
        if (window.savedReview) window.savedReview.result = structuredClone(response.data);
        return response;
      }
      return { ok: true };
    } } };
  });
}
try {
  for (const [file, expected] of [['profile-complete', ['Alex Example', 'Founder', 'Example Studio']], ['profile-missing-company', ['Jamie Example', 'Independent researcher at Unknown', null]], ['profile-localized', ['Robin Example', 'Výzkumník', 'Ukázková firma']]]) {
    await load(file);
    const capture = await page.evaluate(() => window.inspectWireContext());
    assert.deepEqual([capture.person.name, capture.person.role, capture.person.company], expected);
    assert.equal(capture.schemaVersion, 'v1'); assert.ok(capture.extractedEvidence.length > 0);
  }
  checks.push('three synthetic profile variants, null company and v1 provenance');
  await load('profile-complete');
  await page.evaluate(() => {
    const modal = document.createElement('div'); modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = '<form><h1>Sign in</h1><input type="password"></form>';
    document.querySelector('main section').prepend(modal);
  });
  assert.equal((await page.evaluate(() => window.inspectContext())).person.name, 'Alex Example');
  await page.evaluate(() => {
    document.querySelector('main section').innerHTML = '<div role="dialog"><form><h1>Sign in</h1><input type="password"></form></div>';
  });
  assert.equal((await page.evaluate(() => window.inspectContext())).kind, 'unsupported');
  checks.push('nested sign-in form does not invalidate visible profile; dialog-only heading is never a person');
  await load('article', 'https://example.org/article');
  assert.equal(await page.evaluate(() => window.inspectContext().kind), 'unsupported');
  await page.evaluate(() => { const range = document.createRange(); range.selectNodeContents(document.querySelector('#selection')); getSelection().removeAllRanges(); getSelection().addRange(range); });
  const selected = await page.evaluate(() => window.inspectWireContext());
  assert.equal(selected.kind, 'selection'); assert.equal(selected.person, null);
  await page.evaluate(() => window.mountCard());
  await page.getByRole('button', { name: 'Research selection', exact: true }).click();
  await page.getByLabel('Note title').fill('Edited note');
  await page.getByLabel('Note content').fill('User reviewed evidence');
  assert.equal(await page.getByLabel('Contact name').count(), 0);
  await page.getByRole('button', { name: 'Save demo proposal' }).click();
  await page.getByRole('link', { name: 'Open note', exact: true }).waitFor();
  const note = await page.evaluate(() => window.calls.find(c => c.type === 'agentlayer:commit').payload);
  assert.equal(note.reviewedPayload.note.content, 'User reviewed evidence');
  assert.equal(await page.locator('#native').inputValue(), 'unchanged');
  checks.push('selection-only note review and exact payload; native form retained');

  await load('profile-complete'); await page.evaluate(() => window.mountCard());
  await page.getByRole('heading', { name: 'AgentLayer', exact: true }).waitFor();
  const sidebarBounds = await page.getByRole('region', { name: 'AgentLayer', exact: true }).boundingBox();
  assert.equal(sidebarBounds.x + sidebarBounds.width, page.viewportSize().width);
  assert.equal(sidebarBounds.y, 0);
  assert.equal(sidebarBounds.height, page.viewportSize().height);
  assert.equal(sidebarBounds.width, 400);
  assert.equal(await page.locator('agentlayer-ui').evaluate(el => el.parentElement.tagName), 'HTML');
  await page.screenshot({ path: `${root}/evidence/sidebar-desktop.png` });
  assert.equal(await page.evaluate(() => document.querySelector('agentlayer-ui').shadowRoot.activeElement?.tagName), 'H2');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.querySelector('agentlayer-ui').shadowRoot.activeElement?.textContent), 'Settings');
  await page.evaluate(() => document.querySelector('main section').outerHTML = '<section><h1>Alex Example</h1><div class="text-body-medium break-words">Founder</div><button aria-label="Current company"><span class="text-body-small">Example Studio</span></button></section>');
  await page.getByRole('status').filter({ hasText: 'Page changed' }).waitFor();
  assert.equal(await page.locator('agentlayer-ui').count(), 1);
  await page.getByLabel('Company', { exact: true }).fill('Corrected Company');
  await page.getByRole('button', { name: 'Research & prepare follow-up', exact: true }).click();
  await page.getByLabel('Contact company').waitFor();
  assert.equal(await page.getByLabel('Contact company').inputValue(), 'Corrected Company');
  assert.equal(await page.getByLabel('Follow-up date (optional)').inputValue(), '');
  assert.equal(await page.locator('agentlayer-ui img').count(), 0);
  await page.getByLabel('Contact role').fill('Reviewed role');
  await page.getByLabel('Follow-up date (optional)').fill('2026-10-04');
  await page.getByLabel('Follow-up title').fill('Reviewed follow-up');
  await page.evaluate(() => window.saveScenario = 'partial');
  await page.getByRole('button', { name: 'Save demo proposal' }).click();
  await page.getByRole('heading', { name: 'Partially saved', exact: true }).waitFor();
  assert.equal(await page.getByLabel('Follow-up title').isDisabled(), true);
  await page.evaluate(() => window.saveScenario = 'success');
  await page.getByRole('button', { name: 'Retry failed operations' }).click();
  await page.getByRole('link', { name: 'Open task', exact: true }).waitFor();
  const commits = await page.evaluate(() => window.calls.filter(c => c.type === 'agentlayer:commit'));
  assert.equal(commits.length, 2); assert.deepEqual(commits[0].payload, commits[1].payload);
  assert.equal(commits[0].payload.reviewedPayload.person.role, 'Reviewed role');
  assert.equal(commits[0].payload.reviewedPayload.task.title, 'Reviewed follow-up');
  assert.equal(commits[0].payload.reviewedPayload.task.dueAt, '2026-10-04');
  await mkdir(`${root}/evidence`, { recursive: true });
  await page.screenshot({ path: `${root}/evidence/profile-review-fixture.png`, fullPage: true });
  checks.push('keyboard focus; context correction; safe text; optional date; partial/reused operations; same-payload retry');

  await load('profile-complete'); await page.evaluate(() => window.mountCard());
  await page.getByRole('button', { name: 'Research & prepare follow-up', exact: true }).click();
  await page.getByLabel('Contact name').waitFor();
  await page.evaluate(() => window.saveScenario = 'timeout');
  await page.getByRole('button', { name: 'Save demo proposal' }).click();
  await page.getByRole('heading', { name: 'Save outcome unknown', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Retry failed operations' }).count(), 0);
  await page.getByRole('button', { name: 'Check save status' }).click();
  await page.getByRole('link', { name: 'Open task', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.calls.filter(c => c.type === 'agentlayer:commit').length), 1);
  checks.push('timeout uses reconciliation without a second write');

  await load('profile-complete'); await page.evaluate(() => { window.delayResearch = true; window.mountCard(); });
  await page.getByRole('button', { name: 'Research & prepare follow-up', exact: true }).click();
  await page.evaluate(() => document.querySelector('main h1').textContent = 'New Person');
  await page.getByRole('status').filter({ hasText: 'Page changed' }).waitFor();
  await page.evaluate(() => window.releaseResearch());
  assert.equal(await page.getByLabel('Person / subject').inputValue(), 'New Person');
  assert.equal(await page.getByLabel('Contact name').count(), 0);
  await page.evaluate(() => history.pushState({}, '', '/in/another-person'));
  await page.waitForFunction(() => document.querySelector('agentlayer-ui').shadowRoot.querySelector('a').href.endsWith('/in/another-person'));
  await page.getByRole('button', { name: 'Close AgentLayer' }).click();
  assert.equal(await page.locator('agentlayer-ui').count(), 0);
  await page.evaluate(() => { window.mountCard(); window.mountCard(); });
  assert.equal(await page.locator('agentlayer-ui').count(), 1);
  checks.push('same-URL entity replacement and URL navigation invalidate late response; close/remount');
  await page.setViewportSize({ width: 375, height: 812 });
  const narrow = await page.getByRole('region', { name: 'AgentLayer', exact: true }).boundingBox();
  assert.equal(narrow.x, 0); assert.equal(narrow.width, 375); assert.equal(narrow.height, 812);
  assert.equal(await page.locator('[data-slot="sidebar-content"]').evaluate(el => el.scrollWidth <= el.clientWidth), true);
  await page.screenshot({ path: `${root}/evidence/sidebar-narrow.png` });
  await page.getByRole('button', { name: 'Close AgentLayer' }).focus();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('agentlayer-ui').count(), 0);
  checks.push('fixed-right 400px sidebar, viewport height, document-root mounting, narrow viewport and Escape close');
  await load('profile-complete'); await page.evaluate(() => window.mountCard());
  await page.getByRole('button', { name: 'Research & prepare follow-up', exact: true }).click();
  await page.evaluate(() => { window.saveScenario = 'timeout'; });
  await page.getByRole('button', { name: 'Save demo proposal' }).click();
  await page.getByRole('heading', { name: 'Save outcome unknown' }).waitFor();
  const originalSave = await page.evaluate(() => structuredClone(window.savedReview.request));
  await page.getByRole('button', { name: 'Close AgentLayer' }).click();
  await page.evaluate(() => window.mountCard());
  await page.getByRole('heading', { name: 'Previous reviewed save' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Retry previous reviewed save' }).count(), 0);
  await page.getByRole('button', { name: 'Research & prepare follow-up', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Save demo proposal' }).isDisabled(), true);
  await page.getByRole('button', { name: 'Check previous save status' }).click();
  await page.getByRole('link', { name: 'Open saved task' }).waitFor();
  assert.equal(await page.evaluate(() => window.calls.filter(c => c.type === 'agentlayer:commit').length), 1);
  assert.deepEqual(await page.evaluate(() => window.calls.find(c => c.type === 'agentlayer:reconcile').payload), { requestId: originalSave.requestId });
  await page.getByRole('button', { name: 'Continue with current page' }).click();
  await page.waitForFunction(() => window.savedReview === null);
  await page.waitForFunction(() => [...document.querySelector('agentlayer-ui').shadowRoot.querySelectorAll('button')].some(button => button.textContent === 'Save demo proposal' && !button.disabled));
  assert.equal(await page.getByRole('button', { name: 'Save demo proposal' }).isEnabled(), true);
  checks.push('timeout survives sidebar close; status uses original request without another write; new save gated until acknowledged');
  await load('profile-complete'); await page.evaluate(() => window.mountCard());
  await page.getByRole('button', { name: 'Research & prepare follow-up', exact: true }).click();
  await page.getByLabel('Description', { exact: true }).fill('Reviewed content retained after closing');
  await page.evaluate(() => { window.saveScenario = 'partial'; });
  await page.getByRole('button', { name: 'Save demo proposal' }).click();
  await page.getByRole('heading', { name: 'Partially saved' }).waitFor();
  await page.getByRole('button', { name: 'Close AgentLayer' }).click();
  await page.evaluate(() => window.mountCard());
  await page.getByRole('button', { name: 'Retry previous reviewed save' }).waitFor();
  await page.evaluate(() => { window.saveScenario = 'success'; });
  await page.getByRole('button', { name: 'Retry previous reviewed save' }).click();
  await page.getByRole('link', { name: 'Open saved task' }).waitFor();
  const recoveredWrites = await page.evaluate(() => window.calls.filter(c => c.type === 'agentlayer:commit').map(c => c.payload));
  assert.equal(recoveredWrites.length, 2); assert.deepEqual(recoveredWrites[0], recoveredWrites[1]);
  checks.push('partial save survives remount and retries byte-equivalent reviewed request including request ID');
  assert.deepEqual(errors, []);
  const report = { fixtureOnly: true, browser: browser.version(), checks, pageErrors: errors, liveToolbarTested: false, liveProvidersTested: false };
  await writeFile(`${root}/evidence/browser-results.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(JSON.stringify(await page.evaluate(() => ({ text: document.querySelector('agentlayer-ui')?.shadowRoot?.textContent, calls: window.calls, context: window.inspectContext?.() })), null, 2));
  throw error;
} finally { await browser.close(); }
