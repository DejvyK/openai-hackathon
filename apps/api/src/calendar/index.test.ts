import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createGoogleCalendarService, validateCalendarEvent } from './index.js';

const env = { GOOGLE_CALENDAR_CLIENT_ID: 'test-client', GOOGLE_CALENDAR_CLIENT_SECRET: 'test-secret' };
const event = { title: 'Haircut', description: 'Confirmed booking', location: 'Prague', start: '2026-09-18T14:00:00+02:00', end: '2026-09-18T15:00:00+02:00', timeZone: 'Europe/Prague' };
const options = { requestId: 'request-1', sourceUrl: 'https://example.com/confirmation' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const token = () => json({ access_token: 'access-private', refresh_token: 'refresh-private', expires_in: 3600, scope: 'https://www.googleapis.com/auth/calendar.events.owned' });
async function fixture(run: (service: ReturnType<typeof createGoogleCalendarService>, directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'agentlayer-calendar-'));
  const original = globalThis.fetch;
  try { await run(createGoogleCalendarService(env, directory), directory); }
  finally { globalThis.fetch = original; await rm(directory, { recursive: true, force: true }); }
}
async function connect(service: ReturnType<typeof createGoogleCalendarService>) {
  const url = new URL((await service.beginConnect()).authorizationUrl);
  await service.completeConnect('authorization-code', url.searchParams.get('state')!);
}

test('OAuth PKCE state is hashed on disk, bound, single-use and secrets stay server-side', async () => fixture(async (service, directory) => {
  assert.deepEqual(service.status(), { configured: true, connected: false });
  const url = new URL((await service.beginConnect()).authorizationUrl);
  const state = url.searchParams.get('state')!;
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:4318/oauth/google-calendar/callback');
  assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/calendar.events.owned');
  const files = await readdir(directory);
  assert.equal(files.some(name => name.includes(state)), false);
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'https://oauth2.googleapis.com/token');
    const params = init?.body as URLSearchParams;
    assert.equal(params.get('code'), 'authorization-code');
    assert.ok(params.get('code_verifier'));
    assert.equal(init?.redirect, 'error');
    return token();
  };
  assert.deepEqual(await service.completeConnect('authorization-code', state), { configured: true, connected: true });
  await assert.rejects(service.completeConnect('authorization-code', state), /calendar_invalid_oauth_state/);
  assert.deepEqual(service.status(), { configured: true, connected: true });
  assert.equal(JSON.stringify(service.status()).includes('private'), false);
}));

test('expired state is consumed; disconnect invalidates every pending callback', async () => fixture(async (service, directory) => {
  const url = new URL((await service.beginConnect()).authorizationUrl);
  const filename = (await readdir(directory)).find(name => name.startsWith('oauth-'))!;
  const data = JSON.parse(await readFile(join(directory, filename), 'utf8'));
  await writeFile(join(directory, filename), JSON.stringify({ ...data, expiresAt: Date.now() - 1 }));
  globalThis.fetch = async () => { throw new Error('must not reach Google'); };
  await assert.rejects(service.completeConnect('code', url.searchParams.get('state')!), /calendar_invalid_oauth_state/);
  const pending = new URL((await service.beginConnect()).authorizationUrl);
  await service.disconnect();
  await assert.rejects(service.completeConnect('code', pending.searchParams.get('state')!), /calendar_invalid_oauth_state/);
}));

test('dates must exist and offset must match named timezone, including DST', () => {
  assert.deepEqual(validateCalendarEvent(event), event);
  assert.throws(() => validateCalendarEvent({ ...event, start: '2026-02-30T14:00:00+01:00' }));
  assert.throws(() => validateCalendarEvent({ ...event, start: '2026-09-18T14:00:00' }));
  assert.throws(() => validateCalendarEvent({ ...event, timeZone: 'America/New_York' }), /timezone/);
  assert.throws(() => validateCalendarEvent({ ...event, start: '2026-03-29T02:30:00+01:00' }), /timezone/);
  assert.throws(() => validateCalendarEvent({ ...event, end: event.start }));
  assert.throws(() => validateCalendarEvent({ ...event, attendees: ['unexpected@example.com'] }));
});

test('create verifies Google readback; restart retries reuse same ID without a second POST', async () => fixture(async (service, directory) => {
  let actual: Record<string, any> | undefined, posts = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input).includes('/token')) return token();
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer access-private');
    if (init?.method === 'POST') {
      posts++;
      assert.ok(String(input).endsWith('?sendUpdates=none'));
      actual = { ...JSON.parse(String(init.body)), htmlLink: 'https://www.google.com/calendar/event?eid=test', status: 'confirmed' };
      assert.equal(actual!.attendees, undefined);
      assert.match(actual!.description, /Source: https:\/\/example.com\/confirmation$/);
      return json(actual);
    }
    return actual ? json(actual) : json({}, 404);
  };
  await connect(service);
  const result = await service.createEvent(event, options);
  assert.equal(result.status, 'created');
  const restarted = createGoogleCalendarService(env, directory);
  assert.deepEqual(await restarted.createEvent(event, options), { ...result, status: 'reused' });
  assert.equal(posts, 1);
  await assert.rejects(restarted.createEvent({ ...event, title: 'Changed' }, options), /calendar_request_conflict/);
  actual!.summary = 'Tampered';
  await assert.rejects(restarted.createEvent(event, options), /calendar_readback_mismatch/);
}));

test('uncertain write persists identity and retry reads back without blind duplicate', async () => fixture(async (service, directory) => {
  let posts = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input).includes('/token')) return token();
    if (init?.method === 'POST') { posts++; throw new Error('timeout after provider may have committed'); }
    return json({}, 404);
  };
  await connect(service);
  await assert.rejects(service.createEvent(event, options), /calendar_network_error/);
  await assert.rejects(createGoogleCalendarService(env, directory).createEvent(event, options), /calendar_readback_unavailable/);
  assert.equal(posts, 1);
}));

test('reconnecting cannot claim an old account event as a new account success', async () => fixture(async (service) => {
  let actual: Record<string, any> | undefined;
  globalThis.fetch = async (input, init) => {
    if (String(input).includes('/token')) return token();
    if (init?.method === 'POST') { actual = { ...JSON.parse(String(init.body)), htmlLink: 'https://calendar.google.com/calendar/event?eid=test' }; return json(actual); }
    return actual ? json(actual) : json({}, 404);
  };
  await connect(service);
  await service.createEvent(event, options);
  await connect(service);
  await assert.rejects(service.createEvent(event, options), /calendar_request_conflict/);
}));
