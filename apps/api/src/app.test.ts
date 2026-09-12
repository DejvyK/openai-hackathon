import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from './app.js';

const token = 'test-pairing-token';
const context = { contextId: 'profile-1', url: 'https://example.com/profile', title: 'Profile', name: 'Alex', company: null, selection: '' };
const task = { requestId: 'request-1', contextId: context.contextId, title: 'Follow up', description: 'Review the source profile.' };
function post(app: ReturnType<typeof createApp>, path: string, body: unknown, authorization = `Bearer ${token}`) {
  return app.request(path, { method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

test('API requires token; readiness does not disclose it', async () => {
  const app = createApp({ token, mode: 'demo' });
  assert.equal((await post(app, '/api/research', { context }, '')).status, 401);
  assert.equal((await post(app, '/api/tasks', task, 'Bearer wrong')).status, 401);
  const ready = await app.request('/ready');
  assert.equal(ready.status, 200);
  assert.equal((await ready.text()).includes(token), false);
});

test('invalid context and oversized input are rejected', async () => {
  const app = createApp({ token, mode: 'demo' });
  assert.equal((await post(app, '/api/research', { context: {} })).status, 400);
  assert.equal((await post(app, '/api/research', { context: { ...context, url: 'not-a-url' } })).status, 400);
  assert.equal((await post(app, '/api/research', { context: { ...context, selection: 'x'.repeat(40_000) } })).status, 413);
});

test('demo research is explicit and preserves context identity', async () => {
  const app = createApp({ token, mode: 'demo' });
  const response = await post(app, '/api/research', { context });
  assert.equal(response.status, 200);
  const brief = await response.json();
  assert.equal(brief.mode, 'demo');
  assert.equal(brief.contextId, context.contextId);
  assert.match(brief.summary, /No external research/);
  assert.equal(brief.sources[0].url, context.url);
});

test('same request ID returns same task; changed payload is conflict', async () => {
  const app = createApp({ token, mode: 'demo' });
  const first = await post(app, '/api/tasks', task);
  const second = await post(app, '/api/tasks', task);
  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.deepEqual(await first.json(), await second.json());
  assert.equal((await post(app, '/api/tasks', { ...task, title: 'Different task' })).status, 409);
});

test('live mode never substitutes demo research or workspace writes', async () => {
  const app = createApp({ token, mode: 'live' });
  assert.equal((await post(app, '/api/research', { context })).status, 501);
  assert.equal((await post(app, '/api/tasks', task)).status, 501);
});

test('malformed JSON and unsupported content type return JSON errors', async () => {
  const app = createApp({ token, mode: 'demo' });
  const malformed = await app.request('/api/research', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  assert.equal(typeof (await malformed.json()).error, 'string');
  const unsupported = await app.request('/api/research', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: '{}' });
  assert.equal(unsupported.status, 415);
});
