import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';
import type { GoogleCalendarService } from '../calendar/index.js';

test('calendar connection endpoints require pairing before invoking OAuth', async () => {
  let started = 0;
  const calendar = {
    status: () => ({ configured: true, connected: false }),
    beginConnect: async () => { started++; return { authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=fixture' }; },
  } as unknown as GoogleCalendarService;
  const app = createApp({ token: 'fixture-pairing', mode: 'live', calendar });
  assert.equal((await app.request('/api/calendar/status')).status, 401);
  assert.equal((await app.request('/api/calendar/connect', { method: 'POST' })).status, 401);
  assert.equal(started, 0);
  const connected = await app.request('/api/calendar/connect', { method: 'POST', headers: {
    Authorization: 'Bearer fixture-pairing', 'Content-Type': 'application/json',
  }, body: '{}' });
  assert.equal(connected.status, 200);
  assert.equal(started, 1);
  assert.equal((await connected.json()).authorizationUrl, 'https://accounts.google.com/o/oauth2/v2/auth?state=fixture');
});

test('OAuth callback passes state to verifier without exposing provider errors', async () => {
  let called = 0;
  const calendar = {
    completeConnect: async (code: string, state: string) => {
      called++; assert.equal(code, 'fixture-code'); assert.equal(state, 'fixture-state');
      throw new Error('sensitive-provider-response');
    },
  } as unknown as GoogleCalendarService;
  const app = createApp({ token: 'fixture-pairing', mode: 'live', calendar });
  assert.equal((await app.request('/oauth/google-calendar/callback?code=fixture-code')).status, 400);
  assert.equal(called, 0);
  const response = await app.request('/oauth/google-calendar/callback?code=fixture-code&state=fixture-state');
  assert.equal(response.status, 400);
  assert.equal(called, 1);
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.doesNotMatch(await response.text(), /sensitive-provider-response|fixture-code|fixture-state/);
});

test('demo mode does not connect a calendar even when a service is supplied', async () => {
  const app = createApp({ token: 'fixture-pairing', mode: 'demo', calendar: {
    status: () => ({ configured: true, connected: true }),
    beginConnect: () => { throw new Error('must not call'); },
  } as unknown as GoogleCalendarService });
  const response = await app.request('/api/calendar/status', { headers: { Authorization: 'Bearer fixture-pairing' } });
  assert.deepEqual(await response.json(), { configured: false, connected: false });
});
