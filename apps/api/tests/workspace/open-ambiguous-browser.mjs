import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory = resolve('apps/api/.agentlayer/browser-verification');
await mkdir(directory, { recursive: true });
const context = await chromium.launchPersistentContext(resolve(directory, 'profile'), {
  headless: false, args: ['--remote-debugging-port=9333'],
});
const page = context.pages()[0] || await context.newPage();
await page.goto('https://app.ambiguous.ai', { waitUntil: 'domcontentloaded' });
await writeFile(resolve(directory, 'session.json'), JSON.stringify({ pid: process.pid, cdp: 'http://127.0.0.1:9333', url: page.url(), purpose: 'User login and read-only verification of approved test records' }, null, 2));
console.log(JSON.stringify({ pid: process.pid, cdp: 'http://127.0.0.1:9333', url: page.url() }));
await new Promise(resolve => context.on('close', resolve));
