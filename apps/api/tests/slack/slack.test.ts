import test from 'node:test';
import assert from 'node:assert/strict';
import { SlackProvider } from '../../src/slack/index.js';

const config = { token: 'fixture-token', channelId: 'C123', expectedTeamId: 'T123' };
const auth = { ok: true, team_id: 'T123', team: 'Fixture' };
const channel = { ok: true, channel: { id: 'C123', name: 'hiring', is_member: true } };
const sent = { ok: true, channel: 'C123', ts: '123.456' };
const link = { ok: true, permalink: 'https://fixture.slack.com/archives/C123/p123456' };
function fixture(rows: (object | Response | Error)[]) {
  const calls: { url: string; init: RequestInit; body: any }[] = [];
  const fetcher = (async (url, init) => {
    calls.push({ url: String(url), init: init!, body: JSON.parse(String(init!.body)) });
    const row = rows.shift();
    if (row instanceof Error) throw row;
    if (!row) throw new Error('unexpected fetch');
    return row instanceof Response ? row : Response.json(row);
  }) as typeof fetch;
  return { provider: new SlackProvider(config, fetcher), calls };
}
test('exact visible text, pinned destination, disabled parsing, confirmed reference and link', async () => {
  const { provider, calls } = fixture([auth, channel, sent, link]);
  const text = 'Candidate <@U123> & <!channel>\nhttps://linkedin.com/in/example';
  assert.deepEqual(await provider.sendReviewed({ sendId: 'send_1', text }), { status: 'sent', sendId: 'send_1', channelId: 'C123', messageTs: '123.456', permalink: link.permalink, linkUnavailable: false });
  assert.equal(calls.length, 4);
  for (const call of calls) { assert.equal(new URL(call.url).origin, 'https://slack.com'); assert.equal(call.init.redirect, 'error'); }
  const payload = calls[2].body;
  assert.equal(payload.blocks[0].text.text, text);
  assert.equal(payload.blocks[0].text.type, 'plain_text');
  assert.equal(payload.text, 'Candidate &lt;@U123&gt; &amp; &lt;!channel&gt;\nhttps://linkedin.com/in/example');
  assert.equal(payload.mrkdwn, false); assert.equal(payload.link_names, false); assert.equal(payload.parse, 'none');
  assert.equal(payload.unfurl_links, false); assert.equal(payload.channel, 'C123');
});
test('HTTP 200 ok:false denied is failure, not success', async () => {
  const { provider } = fixture([auth, channel, { ok: false, error: 'not_in_channel' }]);
  assert.deepEqual(await provider.sendReviewed({ sendId: 's', text: 'Reviewed' }), { status: 'failed', sendId: 's', error: { code: 'denied' } });
});
test('rate limit exposes bounded retry delay and does not retry', async () => {
  const { provider, calls } = fixture([auth, channel, new Response('', { status: 429, headers: { 'retry-after': '12' } })]);
  assert.deepEqual(await provider.sendReviewed({ sendId: 's', text: 'Reviewed' }), { status: 'failed', sendId: 's', error: { code: 'rate_limited', retryAfterSeconds: 12 } });
  assert.equal(calls.length, 3);
});
test('denied channel and wrong workspace never post', async () => {
  for (const rows of [[auth, { ok: false, error: 'channel_not_found' }], [{ ...auth, team_id: 'T999' }], [auth, { ok: true, channel: { id: 'C123', is_member: false } }]]) {
    const { provider, calls } = fixture(rows);
    assert.equal((await provider.sendReviewed({ sendId: 's', text: 'Reviewed' })).status, 'failed');
    assert.ok(calls.every(c => !c.url.endsWith('chat.postMessage')));
  }
});
test('network and ambiguous provider failures are unknown, never auto retried or leaked', async () => {
  for (const failure of [new Error('secret-token raw body'), { ok: false, error: 'internal_error' }, { ok: false, error: 'new_unrecognized_failure' }, { ok: true }, new Response('bad', { status: 502 }), new Response('{', { status: 200 })]) {
    const { provider, calls } = fixture([auth, channel, failure]);
    const result = await provider.sendReviewed({ sendId: 's', text: 'Reviewed' });
    assert.equal(result.status, 'unknown'); assert.equal(calls.length, 3); assert.ok(!JSON.stringify(result).includes('secret-token'));
  }
});
test('permalink failure remains sent and allows read-only link retry', async () => {
  const { provider, calls } = fixture([auth, channel, sent, { ok: false, error: 'missing_scope' }, link]);
  const result = await provider.sendReviewed({ sendId: 's', text: 'Reviewed' });
  assert.equal(result.status, 'sent');
  if (result.status === 'sent') { assert.equal(result.permalink, null); assert.equal(result.linkUnavailable, true); }
  assert.equal(await provider.getPermalink('123.456'), link.permalink);
  assert.equal(calls.filter(c => c.url.endsWith('chat.postMessage')).length, 1);
});
test('unsafe permalink is not exposed', async () => {
  const { provider } = fixture([{ ok: true, permalink: 'https://slack.com.evil.test/archives/a' }]);
  assert.equal(await provider.getPermalink('123.456'), null);
});
test('invalid message fails locally without trimming or truncating reviewed text', async () => {
  const { provider, calls } = fixture([]);
  for (const text of ['', ' ', 'a'.repeat(3001), 'hi\u0000']) assert.equal((await provider.sendReviewed({ sendId: 's', text })).status, 'failed');
  assert.equal(calls.length, 0);
});
test('timeout remains bounded even if injected fetch ignores abort', async () => {
  const provider = new SlackProvider({ ...config, timeoutMs: 10 }, (() => new Promise(() => {})) as typeof fetch);
  const before = Date.now();
  assert.equal((await provider.checkConnection()).status, 'failed');
  assert.ok(Date.now() - before < 1000);
});
test('final context guard runs after awaited checks and prevents the post', async () => {
  const { provider, calls } = fixture([auth, channel]);
  const result = await provider.sendReviewed({ sendId: 's', text: 'Reviewed' }, () => {
    assert.equal(calls.length, 2);
    return false;
  });
  assert.equal(result.status, 'failed');
  assert.equal(calls.length, 2);
});
