import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const bundle = await build({ stdin: { contents: `import {observePageSnapshots} from './apps/extension/lib/page-snapshot';
window.startAudit=()=>{window.captures=[];window.stopAudit=observePageSnapshots(document,s=>window.captures.push(s),()=>{});};`,
  loader: 'ts', resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife' });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const html = await readFile('apps/extension/tests/fixtures/article.html', 'utf8');
  await page.route('https://example.org/article', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('https://example.org/article');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(() => { window.startAudit(); let i = 0; window.tick = setInterval(() => document.body.className = `tick-${i++}`, 100); });
  await page.waitForFunction(() => window.captures.length === 1, { timeout: 4000 });
  await page.waitForTimeout(2300);
  assert.equal(await page.evaluate(() => window.captures.length), 1, 'unchanged text must not trigger repeated inference');
  await page.evaluate(() => { document.querySelector('main, article, p').append(' Newly visible evidence'); });
  await page.waitForFunction(() => window.captures.length === 2, { timeout: 4000 });
  await page.evaluate(() => { window.stopAudit(); clearInterval(window.tick); });
  console.log('PASS: continuous mutations cannot starve capture; unchanged content stays deduplicated');
} finally { await browser.close(); }
