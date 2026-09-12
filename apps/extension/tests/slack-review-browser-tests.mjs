import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

// Component checks on the existing article fixture. No replacement profile page or provider calls.
const bundled = await build({ stdin: { contents: `
  import React from 'react';
  import { createRoot } from 'react-dom/client';
  import { SlackReview } from './apps/extension/components/SlackReview';
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); window.commands = [];
  window.renderSlack = (props) => root.render(<SlackReview key={props.compact ? 'compact' : 'full'} {...props} send={message => window.commands.push(message)} />);
`, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', jsx: 'automatic' });
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.setContent(await readFile('apps/extension/tests/fixtures/article.html', 'utf8'));
  await page.addScriptTag({ content: bundled.outputFiles[0].text });
  const text = 'Reviewed message with source https://example.org/evidence';
  const preview = { previewId: 'preview-fixture', text, expiresAt: Date.now() + 60000,
    destination: { teamName: 'Fixture workspace', channelName: 'fixture-channel' } };
  const render = props => page.evaluate(props => window.renderSlack(props), props);
  await render({ initialDraft: text, slack: undefined, disabled: false });
  await page.getByLabel('Slack message', { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.commands), []);
  await page.getByRole('button', { name: 'Review in Slack', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.commands), [{ type: 'slack-preview', text }]);
  await render({ initialDraft: text, slack: { status: 'ready', preview }, disabled: false });
  const sendButton = page.getByRole('button', { name: 'Send to #fixture-channel', exact: true });
  await sendButton.waitFor();
  await page.getByLabel('Slack message', { exact: true }).fill('Edited after preview');
  assert.equal(await sendButton.isDisabled(), true);
  assert.equal((await page.evaluate(() => window.commands)).at(-1).type, 'slack-reset');
  await page.getByLabel('Slack message', { exact: true }).fill(text);
  await sendButton.click();
  assert.deepEqual((await page.evaluate(() => window.commands)).at(-1), { type: 'slack-send', previewId: preview.previewId, text, approved: true });
  await render({ initialDraft: text, slack: { status: 'unknown', preview, message: 'Delivery uncertain' }, disabled: false });
  await page.getByText('Delivery uncertain', { exact: true }).waitFor();
  assert.equal(await sendButton.count(), 0);
  assert.equal(await page.getByLabel('Slack message', { exact: true }).isDisabled(), true);
  await render({ initialDraft: text, slack: { status: 'ready', preview: { ...preview, previewId: 'expires-now', expiresAt: Date.now() + 600 } }, disabled: false });
  await sendButton.waitFor();
  await page.getByText('This preview expired. Review the message again before sending.', { exact: true }).waitFor();
  assert.equal(await sendButton.isDisabled(), true);
  await render({ initialDraft: text, slack: { status: 'ready', preview: { ...preview, previewId: 'fresh', expiresAt: Date.now() + 60000 } }, disabled: false });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent === 'Send to #fixture-channel' && !button.disabled));
  await page.getByLabel('Slack message', { exact: true }).fill('x'.repeat(3001));
  assert.equal(await page.getByRole('button', { name: 'Review in Slack', exact: true }).isDisabled(), true);
  assert.equal((await page.evaluate(() => window.commands)).filter(command => command.type === 'slack-send').length, 1);
  await render({ compact: true, initialDraft: text, slack: undefined, disabled: false });
  await page.getByRole('button', { name: 'Review message', exact: true }).waitFor();
  assert.equal(await page.getByLabel('Slack message', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Review message', exact: true }).click();
  assert.deepEqual((await page.evaluate(() => window.commands)).at(-1), { type: 'slack-preview', text });
  await render({ compact: true, initialDraft: text, slack: { status: 'ready', preview }, disabled: false });
  await page.getByLabel('Exact Slack message preview').waitFor();
  await sendButton.click();
  assert.deepEqual((await page.evaluate(() => window.commands)).at(-1), { type: 'slack-send', previewId: preview.previewId, text, approved: true });
  await render({ compact: true, initialDraft: text, slack: { status: 'sent', preview,
    result: { status: 'sent', permalink: 'https://example.org/message', messageTs: 'fixture' } }, disabled: false });
  await page.getByRole('link', { name: 'Open in Slack' }).waitFor();
  assert.equal(await page.getByLabel('Exact Slack message preview').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: draft does not send; exact approval required; edits invalidate preview; unknown locks; expiry disables Send without rerender; fresh preview restores Send; oversized draft blocked. Component fixture only, zero provider writes.');
} finally { await browser.close(); }
