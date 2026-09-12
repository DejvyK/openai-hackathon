import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyReactiveEvent, initialReactiveView, appendConversation, conversationHistory, type RunCursor } from '../lib/reactive-state';
import { readReactiveStream } from '../lib/reactive-stream';
import type { ReactiveEvent } from '@agentlayer/contracts/reactive-v1';
import { supportsSlackProfile } from '../lib/workflow';

const identity = { schemaVersion: 'reactive-v1' as const, sessionId: 'session', contextId: 'page', revision: 2, runId: 'run' };
test('rejects wrong page/run, duplicate sequence and post-terminal output', () => {
  const cursor: RunCursor = { ...identity, lastSequence: -1, terminal: false };
  const start = { ...initialReactiveView };
  const delta: ReactiveEvent = { ...identity, type: 'message_delta', sequence: 1, text: 'Current page' };
  assert.equal(applyReactiveEvent(start, cursor, { ...delta, contextId: 'old-page' }), start);
  assert.equal(applyReactiveEvent(start, cursor, { ...delta, runId: 'old-run' }), start);
  const next = applyReactiveEvent(start, cursor, delta);
  assert.equal(next.text, 'Current page');
  assert.equal(applyReactiveEvent(next, cursor, delta), next);
  const completed = applyReactiveEvent(next, cursor, { ...identity, type: 'completed', sequence: 2, text: 'Final answer', evidenceRefs: [] });
  assert.equal(applyReactiveEvent(completed, cursor, { ...delta, sequence: 3 }), completed);
});
test('bounds accumulated streamed text', () => {
  const cursor: RunCursor = { ...identity, lastSequence: -1, terminal: false };
  assert.throws(() => applyReactiveEvent({ ...initialReactiveView, text: 'x'.repeat(19999) }, cursor,
    { ...identity, type: 'message_delta', sequence: 0, text: 'more' }), /size limit/);
});
test('parses SSE split at every byte, CRLF delimiters and UTF-8 characters', async () => {
  const event: ReactiveEvent = { ...identity, type: 'message_delta', sequence: 0, text: 'Přečtená stránka ✓' };
  const bytes = new TextEncoder().encode(`: keepalive\r\n\r\ndata: ${JSON.stringify(event)}\r\n\r\n`);
  const response = new Response(new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close();
  } }), { headers: { 'Content-Type': 'text/event-stream' } });
  const events: ReactiveEvent[] = [];
  await readReactiveStream(response, value => events.push(value));
  assert.deepEqual(events, [event]);
});
test('rejects oversized unterminated SSE frames', async () => {
  const response = new Response(`data: ${'x'.repeat(150001)}`, { headers: { 'Content-Type': 'text/event-stream' } });
  await assert.rejects(readReactiveStream(response, () => {}), /size limit/);
});
test('completed reply preserves user turn and model suggestions once, with bounded history', () => {
  const cursor: RunCursor = { ...identity, lastSequence: -1, terminal: false };
  const transcript = appendConversation([], { id: 'message-1', role: 'user', text: 'Research this profile' });
  const suggestions = [{ id: 'next', label: 'Explore the sources', prompt: 'Which sources support this?' }];
  const event: ReactiveEvent = { ...identity, type: 'completed', sequence: 0, text: 'What would you like to know?', evidenceRefs: [], suggestions };
  const next = applyReactiveEvent({ ...initialReactiveView, transcript }, cursor, event);
  assert.deepEqual(next.suggestions, suggestions);
  assert.deepEqual(next.transcript.map(item => item.role), ['user', 'assistant']);
  assert.equal(applyReactiveEvent(next, cursor, event), next);
  const history = conversationHistory(Array.from({ length: 20 }, (_, index) => ({ id: String(index), role: 'user' as const, text: String(index).padEnd(12000, 'x') })));
  assert.equal(history.length, 2);
  assert.equal(history.reduce((sum, item) => sum + item.text.length, 0), 24000);
  assert.ok(history[0]);
  assert.ok(history[0].text.startsWith('18'));
  assert.deepEqual(Object.keys(history[0]), ['role', 'text']);
});
test('research sources stay attached to their assistant message and are excluded from replayed history metadata', () => {
  const sources = [{ id: 'exa-1', title: 'Official source', url: 'https://www.w3.org/', retrievedAt: new Date().toISOString() }];
  const cursor: RunCursor = { ...identity, lastSequence: -1, terminal: false };
  const view = applyReactiveEvent(initialReactiveView, cursor, { ...identity, type: 'completed', sequence: 0, text: 'Sourced answer [exa-1]', sources, evidenceRefs: ['exa-1'], slackDraft: 'A draft for review' });
  assert.deepEqual(view.transcript[0]?.sources, sources);
  assert.deepEqual(view.transcript[0]?.evidenceRefs, ['exa-1']);
  assert.equal(view.slackDraft, 'A draft for review');
  const transcript = appendConversation(view.transcript, { id: 'followup', role: 'user', text: 'What next?' });
  assert.deepEqual(transcript[0]?.sources, sources);
  assert.deepEqual(conversationHistory(transcript)[0], { role: 'assistant', text: 'Sourced answer [exa-1]' });
});
test('Slack review stays restricted to supported LinkedIn profile URLs', () => {
  assert.equal(supportsSlackProfile('https://www.linkedin.com/in/person'), true);
  assert.equal(supportsSlackProfile('https://linkedin.com.attacker.test/in/person'), false);
  assert.equal(supportsSlackProfile('https://www.linkedin.com/company/example'), false);
});
