import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SlackReviewService, SlackReviewError, type SlackContextBinding, type SlackReviewProvider } from '../../src/slack/review.js';
import type { SlackSendResult } from '../../src/slack/index.js';
const original: SlackContextBinding = { sessionId: 'session', contextId: 'context', revision: 1, goalRevision: 1, profileUrl: 'https://www.linkedin.com/in/person', userGoal: 'Find a collaborative lead' };
function setup(t: { after(fn: () => void): void }) {
  const directory = mkdtempSync(join(tmpdir(), 'agentlayer-slack-review-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  let current: SlackContextBinding | null = { ...original };
  let time = 1000;
  let calls = 0;
  let afterAccess: (() => void) | undefined;
  let afterDispatch: (() => Promise<void>) | undefined;
  let channelId = 'C123';
  let fail = false;
  const provider: SlackReviewProvider = {
    async checkConnection() { afterAccess?.(); return { status: 'ready', teamId: 'T123', teamName: 'Fixture', channelId, channelName: 'hiring' }; },
    async sendReviewed(message, beforePost) {
      if (beforePost && !beforePost({ teamId: 'T123', channelId })) return { status: 'failed', sendId: message.sendId, error: { code: 'invalid_input' } };
      calls++;
      await afterDispatch?.();
      if (fail) throw new Error('private provider failure');
      return { status: 'sent', sendId: message.sendId, channelId: 'C123', messageTs: '1.2', permalink: null, linkUnavailable: true };
    },
  };
  const service = () => new SlackReviewService({ directory, provider, getCurrent: () => current, now: () => time, ttlMs: 100 });
  return { directory, service, calls: () => calls, navigate: () => { current = { ...original, revision: 2 }; }, expire: () => { time = 1100; }, changeChannel: () => { channelId = 'C456'; }, onAccess: (fn: () => void) => { afterAccess = fn; }, onDispatch: (fn: () => Promise<void>) => { afterDispatch = fn; }, fail: () => { fail = true; } };
}
const request = (previewId: string, text = 'Reviewed brief') => ({ previewId, binding: { ...original }, text, approved: true as const });
test('immutable approved text sends once and replays terminal result after restart', async t => {
  const s = setup(t);
  const preview = await s.service().prepare({ binding: original, text: 'Reviewed brief' });
  assert.equal(preview.destination.channelId, 'C123'); assert.equal(preview.expiresAt, 1100);
  const first = await s.service().send(request(preview.previewId));
  assert.equal(first.status, 'sent');
  s.expire(); s.navigate();
  assert.deepEqual(await s.service().send(request(preview.previewId)), first);
  assert.equal(s.calls(), 1);
  for (const name of readdirSync(s.directory)) assert.ok(!readFileSync(join(s.directory, name), 'utf8').includes('token'));
});
test('changed text, binding, absent approval and invented IDs never dispatch', async t => {
  const s = setup(t); const service = s.service();
  const preview = await service.prepare({ binding: original, text: 'Reviewed brief' });
  for (const input of [request(preview.previewId, 'Tampered'), { ...request(preview.previewId), binding: { ...original, goalRevision: 2 } }, { ...request(preview.previewId), approved: false as true }, request('../escape')]) await assert.rejects(service.send(input), SlackReviewError);
  assert.equal(s.calls(), 0);
});
test('navigation, expiration and destination changes reject unsent previews', async t => {
  for (const kind of ['navigate', 'expire', 'changeChannel'] as const) {
    const s = setup(t); const service = s.service(); const preview = await service.prepare({ binding: original, text: 'Reviewed brief' });
    s[kind](); await assert.rejects(service.send(request(preview.previewId)), SlackReviewError); assert.equal(s.calls(), 0);
  }
});
test('navigation while awaiting connection invalidates prepare and send', async t => {
  const s = setup(t); const service = s.service();
  const preview = await service.prepare({ binding: original, text: 'Reviewed brief' });
  s.onAccess(s.navigate);
  await assert.rejects(service.send(request(preview.previewId)), /stale_context/);
  await assert.rejects(service.prepare({ binding: original, text: 'Reviewed brief' }), /stale_context/);
  assert.equal(s.calls(), 0);
});
test('concurrent processes reserve one write, in-flight restart returns unknown', async t => {
  const s = setup(t);
  let unblock!: () => void;
  const gate = new Promise<void>(resolve => { unblock = resolve; });
  let started!: () => void;
  const dispatched = new Promise<void>(resolve => { started = resolve; });
  s.onDispatch(async () => { started(); await gate; });
  const preview = await s.service().prepare({ binding: original, text: 'Reviewed brief' });
  const first = s.service().send(request(preview.previewId));
  await dispatched;
  const replay = await s.service().send(request(preview.previewId));
  assert.equal(replay.status, 'unknown'); assert.equal(s.calls(), 1);
  unblock(); assert.equal((await first).status, 'sent');
  assert.equal((await s.service().send(request(preview.previewId))).status, 'sent');
  assert.equal(s.calls(), 1);
});
test('unknown network delivery persists and never posts again', async t => {
  const s = setup(t); s.fail(); const preview = await s.service().prepare({ binding: original, text: 'Reviewed brief' });
  const result: SlackSendResult = await s.service().send(request(preview.previewId));
  assert.equal(result.status, 'unknown');
  assert.deepEqual(await s.service().send(request(preview.previewId)), result); assert.equal(s.calls(), 1);
});
test('corrupt preview fails closed, including restart', async t => {
  const s = setup(t); const preview = await s.service().prepare({ binding: original, text: 'Reviewed brief' });
  const file = join(s.directory, `${preview.previewId}.preview.json`);
  const row = JSON.parse(readFileSync(file, 'utf8')); row.preview.text = 'Changed on disk'; writeFileSync(file, JSON.stringify(row));
  await assert.rejects(s.service().send(request(preview.previewId)), /journal_error/); assert.equal(s.calls(), 0);
});
