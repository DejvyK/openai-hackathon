import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

// The user-supplied actual public profile. Read/research only; no workspace writes.
const url = 'https://www.linkedin.com/in/darth-vader/';
const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: false,
  args: [`--disable-extensions-except=${path.resolve('apps/extension/.output/chrome-mv3')}`, `--load-extension=${path.resolve('apps/extension/.output/chrome-mv3')}`] });
context.setDefaultTimeout(20000);
const report = { requestedUrl: url, nativeToolbarClick: false, workspaceWrites: false };
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await worker.evaluate(async token => {
    await chrome.storage.local.set({ pairingToken: token });
    globalThis.profileEvidence = { requests: [], research: null };
    const original = fetch;
    globalThis.fetch = async (url, options) => {
      const response = await original(url, options);
      const pathname = new URL(String(url)).pathname;
      profileEvidence.requests.push({ path: pathname, status: response.status });
      if (pathname === '/api/research' && response.ok) profileEvidence.research = await response.clone().json();
      return response;
    };
  }, (await readFile('apps/api/.pairing-token', 'utf8')).trim());
  const page = await context.newPage();
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
  report.httpStatus = response?.status(); report.url = page.url(); report.title = await page.title();
  if (report.httpStatus !== 200) throw new Error(`LinkedIn returned HTTP ${report.httpStatus}; stop rather than treat a registration page as the profile.`);
  await page.locator('main h1').waitFor({ state: 'visible' });
  report.dom = await page.locator('main h1').evaluateAll(headings => headings.map(heading => ({
    heading: heading.textContent.trim(), topCard: heading.closest('section')?.className ?? null,
    candidates: Array.from(heading.closest('section')?.querySelectorAll('h2,h3,a,span') ?? [])
      .filter(el => el.checkVisibility() && !el.closest('[aria-hidden="true"], [role="dialog"]'))
      .map(el => ({ tag: el.tagName, className: el.className, text: el.textContent.trim().replace(/\s+/g, ' '), href: el.getAttribute('href') }))
      .filter(item => item.text && item.text.length < 160),
  })));
  const pageCdp = await context.newCDPSession(page);
  const { targetInfo } = await pageCdp.send('Target.getTargetInfo');
  const cdp = await context.browser().newBrowserCDPSession();
  const { targetInfos } = await cdp.send('Target.getTargets', { filter: [{ type: 'tab' }, { exclude: true }] });
  const target = targetInfos.find(target => target.targetId === targetInfo.parentId || target.url === page.url());
  if (!target) throw new Error('No tab target found');
  await cdp.send('Extensions.triggerAction', { id: new URL(worker.url()).host, targetId: target.targetId });
  await page.getByRole('region', { name: 'AgentLayer', exact: true }).waitFor();
  report.activation = 'Extensions.triggerAction -> production action.onClicked';
  report.detected = {};
  for (const label of ['Person / subject', 'Role / headline', 'Company']) {
    const field = page.getByLabel(label, { exact: true });
    report.detected[label] = await field.count() ? await field.inputValue() : null;
  }
  if (process.argv.includes('--research')) {
    await page.getByRole('button', { name: 'Research & prepare follow-up', exact: true }).click();
    await page.getByText('Live research', { exact: true }).waitFor({ timeout: 100000 });
    report.reviewVisible = await page.getByLabel('Follow-up title', { exact: true }).isVisible();
  }
  report.evidence = await worker.evaluate(() => profileEvidence);
  await page.screenshot({ path: 'apps/extension/tests/evidence/live-profile-sidebar.png' });
} catch (error) { report.error = error.message; process.exitCode = 1; }
finally {
  await mkdir('apps/extension/tests/evidence', { recursive: true });
  await writeFile(`apps/extension/tests/evidence/live-profile-browser${report.error ? '-blocked' : ''}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, dom: report.dom?.map(item => ({ heading: item.heading, topCardCaptured: !!item.topCard })) }, null, 2));
  await context.close();
}
