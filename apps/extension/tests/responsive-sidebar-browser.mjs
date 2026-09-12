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
          type: 'completed', text: 'Responsive fixture: ' + 'Long result with evidence. '.repeat(80) + 'https://example.org/' + 'x'.repeat(600),
          evidenceRefs: [], suggestions: [{ id: 'research', label: 'ResearchThisPageAndReviewTheEvidenceWithoutLosingTheCurrentTaskContext', prompt: 'Research this page' },
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
  await page.getByLabel('Task result').waitFor();
  const measurements = [];
  for (const [width, height] of [[320,568],[360,640],[390,844],[768,1024],[1024,768],[1440,900],[1920,1080],[844,390],[360,240],[720,450]]) {
    await page.setViewportSize({width,height});
    await sidebar.locator('[data-slot="sidebar-content"]').evaluate(el => el.scrollTop = 0);
    const measure = await sidebar.evaluate(el => {
      const rect = el.getBoundingClientRect();
      const content = el.querySelector('[data-slot="sidebar-content"]');
      const input = el.querySelector('textarea').getBoundingClientRect();
      return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,clientWidth:content.clientWidth,scrollWidth:content.scrollWidth,
        clientHeight:content.clientHeight,scrollHeight:content.scrollHeight,inputWidth:input.width};
    });
    assert.ok(measure.x >= -1 && measure.y >= -1 && measure.width <= width+1 && measure.height <= height+1, JSON.stringify({width,height,measure}));
    assert.ok(measure.scrollWidth <= measure.clientWidth+1, `Horizontal overflow at ${width}x${height}: ${JSON.stringify(measure)}`);
    assert.ok(measure.inputWidth > 200);
    await page.getByLabel('AgentLayer menu',{exact:true}).click();
    const menu = await sidebar.locator('.agent-menu-items').boundingBox();
    assert.ok(menu.x >= 0 && menu.y >= 0 && menu.x+menu.width <= width+1 && menu.y+menu.height <= height+1, `Menu clipped: ${JSON.stringify({width,height,menu})}`);
    await page.getByLabel('AgentLayer menu',{exact:true}).click();
    const action = sidebar.getByRole('button',{name:'Save a note',exact:true});
    await action.scrollIntoViewIfNeeded();
    const box = await action.boundingBox();
    assert.ok(box.y >= 72 && box.y+box.height <= height+1, `Last action unreachable at ${width}x${height}`);
    const hit = await action.evaluate(el => { const r=el.getBoundingClientRect(); return el.getRootNode().elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button') === el; });
    assert.equal(hit,true,'Action is obscured');
    measurements.push({viewport:{width,height},...measure,menuFits:true,lastActionReachable:true});
    if (width===320 || width===1440) await page.screenshot({path:`apps/extension/tests/evidence/responsive-${width}.png`});
  }
  await sidebar.locator('[data-slot="sidebar-content"]').evaluate(el => el.scrollTop = 0);
  await page.getByLabel('AgentLayer menu',{exact:true}).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  assert.equal(await sidebar.getByRole('button',{name:'Pause',exact:true}).evaluate(el=>el===el.getRootNode().activeElement),true);
  await page.emulateMedia({reducedMotion:'reduce'});
  const reducedMotion = await sidebar.evaluate(el=>getComputedStyle(el).transitionDuration);
  await page.getByRole('button',{name:'Close AgentLayer'}).click();
  await sidebar.waitFor({state:'detached'});
  assert.deepEqual(errors,[]);
  const report={fixtureOnly:true,builtExtension:true,measurements,keyboardMenu:true,reducedMotion,errors};
  await writeFile('apps/extension/tests/evidence/responsive-sidebar.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally { await context.close(); }
