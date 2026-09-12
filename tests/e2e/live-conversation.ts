import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createApp } from '../../apps/api/src/app.js';
import { createCodexReactiveRunner } from '../../apps/api/src/research/codex.js';
import { configuredReactive } from '../../apps/api/src/config/reactive.js';
import { ReactiveEventSchema, ConversationReplySchema } from '@agentlayer/contracts/reactive-v1';

// Actual Codex inference through authenticated API handlers, using the existing
// library snapshot. No new browser pages and no external message/write calls.
let close = () => {};
const exa = process.argv.includes('--exa');
const env = { ...process.env, ...parseEnv(await readFile('apps/api/.env', 'utf8')) };
const app = createApp({ token: 'local-conversation-test', mode: exa ? 'live' : 'demo', reactiveRunner: exa ? configuredReactive(env, 'live') : createCodexReactiveRunner(), onShutdown: value => { close = value; } });
const request = { schemaVersion: 'reactive-v1', sessionId: 'conversation-proof', contextId: 'library', revision: 1,
  snapshot: { url: 'https://example.com/library', pageTitle: 'Library hours', capturedAt: new Date().toISOString(), mainText: 'The town library opens Monday to Friday from 9:00 to 17:00. Borrowing requires a library card.', selectedText: '', extractedEvidence: [] } };
if (exa) {
  const contexts = JSON.parse(await readFile('apps/api/tests/research/live-evidence/contexts.json', 'utf8'));
  const context = contexts.find((item: { kind: string }) => item.kind === 'selection');
  assert.ok(context?.selection?.text);
  Object.assign(request.snapshot, { url: context.url, pageTitle: context.pageTitle, mainText: context.selection.text, selectedText: context.selection.text });
}
const headers = { authorization: 'Bearer local-conversation-test', 'content-type': 'application/json' };
async function turn(body: unknown) {
  const response = await app.request('/api/reactive/snapshots', { method: 'POST', headers, body: JSON.stringify(body) });
  assert.equal(response.status, 200);
  const ack = await response.json();
  assert.equal(ack.status, 'accepted');
  const stream = await app.request('/api/reactive/sessions/conversation-proof/events', { headers });
  const reader = stream.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const timeout = setTimeout(() => { close(); void reader.cancel(); }, 65000);
  try {
    while (true) {
      const chunk = await reader.read();
      assert.equal(chunk.done, false, 'No completed response');
      buffer += decoder.decode(chunk.value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        const line = block.split('\n').find(line => line.startsWith('data: '));
        if (!line) continue;
        const event = ReactiveEventSchema.parse(JSON.parse(line.slice(6)));
        assert.equal(event.runId, ack.runId);
        assert.ok(!['error', 'cancelled'].includes(event.type), JSON.stringify(event));
        if (event.type === 'completed') return { ...ConversationReplySchema.parse({ text: event.text, suggestions: event.suggestions, ...(event.slackDraft ? { slackDraft: event.slackDraft } : {}) }), sources: event.sources ?? [], evidenceRefs: event.evidenceRefs };
      }
    }
  } finally { clearTimeout(timeout); await reader.cancel(); }
}
try {
  const initial = await turn(request);
  assert.ok(initial.suggestions.length >= 2);
  assert.ok(initial.text.includes('?'), 'Initial response should ask the user');
  const userMessage = exa ? 'Use Exa now to research the W3C guidance relevant to this selection. Find external sources and cite them in your answer.' : 'Prepare a message about this page for my Slack channel. What do you need from me?';
  const followup = await turn({ ...request, revision: 2, conversation: { messageId: 'tool-request', userMessage, history: [{ role: 'assistant', text: initial.text }] } });
  if (exa) { assert.ok(followup.sources.length > 0, 'Exa must return actual source metadata'); assert.ok(followup.evidenceRefs.length > 0); }
  else assert.match(followup.text, /channel|Slack/i);
  const continuation = exa ? await turn({ ...request, contextId: 'new-turn-same-page', revision: 3, conversation: { messageId: 'use-existing-sources', userMessage: 'Using only the sources already found, give me two practical next steps. Do not run another search.', history: [{ role: 'user', text: userMessage }, { role: 'assistant', text: followup.text }] } }) : undefined;
  if (continuation) assert.deepEqual(continuation.sources, followup.sources, 'Source evidence must survive same-page follow-ups with a new context ID');
  const evidence = { checkedAt: new Date().toISOString(), mode: exa ? 'real Codex and Exa through configured authenticated API handlers; saved public W3C selection' : 'real Codex through API handlers, existing synthetic snapshot', initial, userMessage, followup, continuation, externalWrites: 0 };
  await mkdir('tests/e2e/evidence', { recursive: true });
  await writeFile(`tests/e2e/evidence/${exa ? 'live-exa-conversation' : 'live-conversation'}.json`, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
} finally { close(); }
