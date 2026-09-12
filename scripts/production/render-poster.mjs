import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const source = path.resolve('docs/production/story/POSTER.svg');
const output = path.resolve('docs/production/story/POSTER.png');
const svg = await readFile(source, 'utf8');
if (/<script\b|<foreignObject\b|\bon\w+\s*=|(?:href|src)\s*=\s*["']https?:/i.test(svg)) {
  throw new Error('Poster must be a self-contained SVG without active or external content.');
}
await mkdir(path.dirname(output), { recursive: true });
const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, javaScriptEnabled: false });
  await page.goto(pathToFileURL(source).href);
  const audit = await page.evaluate(() => {
    const root = document.querySelector('svg');
    if (!root || document.querySelector('parsererror')) throw new Error('Invalid SVG');
    const box = root.getBoundingClientRect();
    const outside = [...document.querySelectorAll('text')].map(node => ({ text: node.textContent, rect: node.getBoundingClientRect().toJSON() })).filter(({ rect }) => rect.left < box.left || rect.top < box.top || rect.right > box.right || rect.bottom > box.bottom);
    return { width: box.width, height: box.height, textElements: document.querySelectorAll('text').length, outside };
  });
  if (audit.width !== 1600 || audit.height !== 900 || audit.outside.length) throw new Error(JSON.stringify(audit));
  await page.screenshot({ path: output });
  console.log(JSON.stringify({ ...audit, source, output }));
} finally {
  await browser.close();
}
