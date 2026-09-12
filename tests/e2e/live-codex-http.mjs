import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';

// Real inference on a synthetic snapshot; never calls workspace write endpoints.
const base = 'http://127.0.0.1:4318';
let env = {};
try { env = parseEnv(readFileSync('apps/api/.env', 'utf8')); } catch {}
const token = process.env.AGENTLAYER_TOKEN || env.AGENTLAYER_TOKEN || readFileSync('apps/api/.pairing-token', 'utf8').trim();
const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const sessionId = `http-proof-${randomUUID()}`;
const inputPath = process.argv[2];
const captured = inputPath ? JSON.parse(readFileSync(inputPath, 'utf8')) : null;
const started = Date.now();
const events = [];
const post = (path, body) => fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(65000) });
let reader;
try {
  const ready = await (await fetch(base + '/ready')).json();
  assert.equal(ready.reactive.status, 'configured');
  const response = await post('/api/reactive/snapshots', captured ? { ...captured, sessionId } : {
    schemaVersion: 'reactive-v1', sessionId, contextId: 'library', revision: 1,
    snapshot: { url: 'https://example.com/library', pageTitle: 'Library hours', capturedAt: new Date().toISOString(), mainText: 'The town library opens Monday to Friday from 9:00 to 17:00. Borrowing requires a library card.', selectedText: '', extractedEvidence: [] },
  });
  assert.equal(response.status, 200);
  const acknowledgement = await response.json();
  assert.equal(acknowledgement.status, 'accepted');
  const stream = await fetch(`${base}/api/reactive/sessions/${sessionId}/events`, { headers, signal: AbortSignal.timeout(65000) });
  assert.equal(stream.status, 200);
  reader = stream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', complete = false;
  while (!complete) {
    const chunk = await reader.read();
    assert.equal(chunk.done, false, 'Stream ended before completion');
    buffer += decoder.decode(chunk.value, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
      const line = block.split('\n').find(line => line.startsWith('data: '));
      if (!line) continue;
      const event = JSON.parse(line.slice(6));
      assert.equal(event.runId, acknowledgement.runId);
      assert.equal(event.sessionId, sessionId);
      assert.ok(!events.length || event.sequence > events.at(-1).sequence);
      events.push(event);
      assert.ok(!['error', 'cancelled'].includes(event.type), JSON.stringify(event));
      if (event.type === 'completed') complete = true;
    }
  }
  assert.ok(events.at(-1).suggestions?.length >= 2, 'Initial turn must offer conversation options');
  assert.ok(events.at(-1).text.includes('?'), 'Initial turn must ask what the user wants');
  assert.ok(events.at(-1).text.length > 0);
  const evidence = { checkedAt: new Date().toISOString(), kind: captured ? 'real-codex-inference-captured-public-page-over-live-http' : 'real-codex-inference-synthetic-page-over-live-http', elapsedMs: Date.now() - started, ready, acknowledgement, events, workspaceWrites: 0 };
  mkdirSync('tests/e2e/evidence', { recursive: true });
  writeFileSync(`tests/e2e/evidence/${captured ? 'live-captured-page-http' : 'live-codex-http'}.json`, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, elapsedMs: evidence.elapsedMs, eventTypes: events.map(event => event.type), workspaceWrites: 0 }));
} finally {
  await reader?.cancel();
  await post('/api/reactive/control', { schemaVersion: 'reactive-v1', sessionId, action: 'close' });
}
