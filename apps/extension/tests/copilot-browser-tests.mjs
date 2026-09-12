import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';

const snapshot = { url: 'https://www.linkedin.com/in/darth-vader/', pageTitle: 'Component fixture context', capturedAt: new Date().toISOString(),
  mainText: 'Fixture evidence only.', selectedText: '', extractedEvidence: [{ id: 'page-1', text: 'Fixture evidence only.', sourceUrl: 'https://www.linkedin.com/in/darth-vader/' }] };
const text = `Draft for review: ${snapshot.url}`;
const initial = { status: 'completed', message: 'Fixture response', text: 'Response', sourceUrl: snapshot.url, sourceTitle: snapshot.pageTitle,
  paused: false, siteAccess: true, userGoal: 'Summarize evidence', goalRevision: 1,
  transcript: [{ id: 'model-run-1', role: 'assistant', text: 'Response' }], suggestions: [], slackDraft: text,
  frontendIntents: [
    { type: 'component', name: 'sourced_summary', props: { title: 'Evidence summary', text: '<img src=x onerror=alert(1)> stays text', sourceIds: ['page-1'] } },
    { type: 'component', name: 'next_steps', props: { items: [{ id: 'more', label: 'Explore evidence', prompt: 'Explain the evidence' }] } },
    { type: 'tool', name: 'prepare_slack_draft', arguments: { text } },
  ] };
// Render SDK components on the existing article fixture; no fake LinkedIn browser page.
const bundle = await build({ stdin: { contents: `
  import React, { useState } from 'react'; import { createRoot } from 'react-dom/client';
  import { SidebarCopilotProvider } from './apps/extension/components/SidebarCopilotProvider';
  import { useAgentContext, useCopilotKit } from '@copilotkit/react-core/v2/headless';
  import { SidebarAgentBridge } from './apps/extension/lib/copilot-agent';
  import { PAGE_CONTEXT_DESCRIPTION } from './apps/extension/lib/sidebar-context';
  import { CopilotActions } from './apps/extension/components/CopilotActions';
  const bridge = new SidebarAgentBridge(); window.commands = []; window.sdkErrors = [];
  bridge.send = command => window.commands.push(command);
  const snapshot = ${JSON.stringify(snapshot)}; const initial = ${JSON.stringify(initial)};
  function App() {
    const [view, setView] = useState(initial); const { copilotkit } = useCopilotKit();
    useAgentContext({ description: PAGE_CONTEXT_DESCRIPTION, value: { snapshot, userGoal: view.userGoal, goalRevision: view.goalRevision } });
    window.updateView = next => { bridge.publish(next); setView(next); };
    window.sdkContext = () => Object.values(copilotkit.context);
    window.sdkToolCalls = () => bridge.agent.messages.filter(message => message.role === 'assistant').flatMap(message => message.toolCalls ?? []);
    function conversation(content) {
      bridge.agent.addMessage({ id: crypto.randomUUID(), role: 'user', content });
      void copilotkit.runAgent({ agent: bridge.agent }).catch(error => window.sdkErrors.push(error.message));
    }
    return <CopilotActions view={view} snapshot={snapshot} disabled={view.status !== 'completed' || view.paused} send={bridge.send} onMessage={conversation} />;
  }
  bridge.publish(initial); const host = document.createElement('div'); document.body.append(host);
  createRoot(host).render(<SidebarCopilotProvider agent={bridge.agent}><App /></SidebarCopilotProvider>);
`, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
const browser = await chromium.launch({ headless: true });
const errors = [], requests = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const html = await readFile('apps/extension/tests/fixtures/article.html', 'utf8');
  await page.route('**/*', route => {
    if (route.request().url() === 'https://example.org/article') return route.fulfill({ contentType: 'text/html', body: html });
    requests.push(route.request().url()); return route.abort();
  });
  await page.goto('https://example.org/article');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.getByRole('heading', { name: 'Evidence summary', exact: true }).waitFor();
  assert.equal(await page.getByRole('article', { name: 'Agent summary' }).locator('img').count(), 0);
  assert.equal(await page.getByRole('link', { name: 'Current page [page-1]' }).getAttribute('href'), snapshot.url);
  await page.getByLabel('Slack message', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Slack message', { exact: true }).inputValue(), text);
  assert.deepEqual(await page.evaluate(() => window.commands), []);
  const calls = await page.evaluate(() => window.sdkToolCalls());
  assert.deepEqual(calls.map(call => call.function.name), ['sourced_summary', 'next_steps', 'prepare_slack_draft']);
  const contexts = await page.evaluate(() => window.sdkContext());
  assert.deepEqual(JSON.parse(contexts[0].value).snapshot, snapshot);
  await page.getByRole('button', { name: 'Explore evidence', exact: true }).click();
  await page.waitForFunction(() => window.commands.length > 0);
  const command = await page.evaluate(() => window.commands[0]);
  assert.equal(command.type, 'conversation'); assert.equal(command.userMessage, 'Explain the evidence');
  assert.deepEqual(command.context.snapshot, snapshot); assert.equal(command.context.goalRevision, 1);
  await page.evaluate(initial => window.updateView({ ...initial, transcript: [...initial.transcript,
    { id: 'user-next', role: 'user', text: 'Explain the evidence' }, { id: 'model-run-2', role: 'assistant', text: 'Further explanation' }], frontendIntents: [], slackDraft: undefined }), initial);
  await page.getByRole('heading', { name: 'Evidence summary' }).waitFor({ state: 'detached' });
  assert.equal(await page.getByLabel('Slack message', { exact: true }).count(), 0);
  await page.evaluate(initial => window.updateView(initial), initial); // repeated completion must not replay a handler
  assert.equal((await page.evaluate(() => window.sdkToolCalls())).length, 3);
  await page.evaluate(initial => window.updateView({ ...initial, status: 'reading', transcript: [], sourceUrl: 'https://example.org/new-page' }), initial);
  assert.equal(await page.getByRole('heading', { name: 'Evidence summary' }).count(), 0);
  assert.deepEqual(await page.evaluate(() => window.sdkErrors), []);
  assert.deepEqual(errors, []); assert.deepEqual(requests, []);
  const report = { fixtureOnly: true, actualCopilotKitHooks: true, modelCalls: false, externalWrites: false,
    checks: ['registered source summary and next steps render through SDK tool messages', 'prepare tool opens exact editable Slack draft without sending',
      'useAgentContext reaches custom agent transport on next-step click', 'untrusted text stays text', 'new completion/navigation clears old components', 'repeated completion does not replay tools'], pageErrors: errors };
  await writeFile('apps/extension/tests/evidence/copilot-browser.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) { console.error({ errors, requests }); throw error; }
finally { await browser.close(); }
