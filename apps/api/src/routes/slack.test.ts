import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../app.js';
import { createGoalReactiveRunner } from '../research/goal-runner.js';
import type { GoalAssessment, ReactiveSnapshotRequest } from '@agentlayer/contracts/reactive-v1';
import type { SlackReviewProvider } from '../slack/review.js';

const request: ReactiveSnapshotRequest = { schemaVersion: 'reactive-v1', sessionId: 's', contextId: 'c', revision: 1, goalRevision: 1, userGoal: 'Review leadership evidence', snapshot: {
  url: 'https://www.linkedin.com/in/example/', pageTitle: 'Profile', capturedAt: '2026-09-12T00:00:00Z', mainText: 'Visible profile data', selectedText: '', extractedEvidence: [],
} };
const assessment: GoalAssessment = { profileUrl: request.snapshot.url, userGoal: request.userGoal!, identityStatus: 'insufficient', identityKind: 'unknown', verdict: 'insufficient_evidence', criteria: [], findings: [], sources: [], unknowns: ['Verify identity'] };
const binding = { sessionId: 's', contextId: 'c', revision: 1, goalRevision: 1, userGoal: request.userGoal!, profileUrl: request.snapshot.url };
async function setup(mode: 'live' | 'demo' = 'live', conversational = false) {
  const directory = await mkdtemp(join(tmpdir(), 'agentlayer-slack-route-'));
  let sends = 0, close = () => {};
  const provider: SlackReviewProvider = {
    checkConnection: async () => ({ status: 'ready', teamId: 'T123', teamName: 'Team', channelId: 'C123', channelName: 'review' }),
    sendReviewed: async ({ sendId }, beforePost) => { assert.equal(beforePost?.({ teamId: 'T123', channelId: 'C123' }), true); sends++; return { status: 'sent', sendId, channelId: 'C123', messageTs: '123.456', permalink: 'https://team.slack.com/archives/C123/p123456', linkUnavailable: false }; },
  };
  const app = createApp({ token: 'test-token', mode, slack: { provider, directory }, reactiveRunner: conversational ? async (input, { runId, emit }) => {
    emit({ schemaVersion: 'reactive-v1', sessionId: input.sessionId, contextId: input.contextId, revision: input.revision, goalRevision: input.goalRevision,
      runId, sequence: 0, type: 'completed', text: 'Review this draft before sending.', evidenceRefs: [], slackDraft: `Profile: ${input.snapshot.url}` });
  } : createGoalReactiveRunner(undefined, async () => assessment), onShutdown: callback => { close = callback; } });
  const post = (path: string, body: unknown, token = 'test-token') => app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const ack = await (await post('/api/reactive/snapshots', conversational ? { ...request, userGoal: '', goalRevision: 0, conversation: { messageId: 'share', userMessage: 'Share this profile with the team', history: [] } } : request)).json();
  await new Promise(resolve => setImmediate(resolve));
  return { post, ack, sends: () => sends, cleanup: async () => { close(); await rm(directory, { recursive: true, force: true }); } };
}

test('conversational Slack draft without a goal supports review and only sends after explicit approval', async () => {
  const env = await setup('live', true);
  try {
    const input = { binding: { ...binding, userGoal: '', goalRevision: 0 }, text: `Profile: ${request.snapshot.url}` };
    const response = await env.post('/api/slack/preview', input);
    assert.equal(response.status, 200); assert.equal(env.sends(), 0);
    const preview = await response.json();
    assert.equal((await env.post('/api/slack/send', { ...input, previewId: preview.previewId })).status, 400);
    const sent = await env.post('/api/slack/send', { ...input, previewId: preview.previewId, approved: true });
    assert.equal((await sent.json()).status, 'sent'); assert.equal(env.sends(), 1);
  } finally { await env.cleanup(); }
});
test('authenticated review plus explicit send posts once; replay returns the same message reference', async () => {
  const env = await setup();
  try {
    const input = { binding, text: 'Review this profile; identity remains uncertain.' };
    assert.equal((await env.post('/api/slack/preview', input, 'wrong')).status, 401);
    const previewResponse = await env.post('/api/slack/preview', input); assert.equal(previewResponse.status, 200);
    const preview = await previewResponse.json(); assert.equal(preview.destination.channelId, 'C123'); assert.equal(env.sends(), 0);
    const send = { ...input, previewId: preview.previewId, approved: true };
    assert.equal((await env.post('/api/slack/send', { ...send, approved: false })).status, 400);
    assert.equal((await env.post('/api/slack/send', { ...send, text: 'Changed text' })).status, 409);
    const first = await (await env.post('/api/slack/send', send)).json(); assert.equal(first.status, 'sent');
    assert.deepEqual(await (await env.post('/api/slack/send', send)).json(), first); assert.equal(env.sends(), 1);
  } finally { await env.cleanup(); }
});
test('navigation cancellation invalidates a completed assessment before the next snapshot arrives', async () => {
  const env = await setup();
  try {
    const input = { binding, text: 'Reviewed profile context' };
    const preview = await (await env.post('/api/slack/preview', input)).json();
    const cancel = await env.post('/api/reactive/control', { schemaVersion: 'reactive-v1', sessionId: 's', contextId: 'c', revision: 1, goalRevision: 1, runId: env.ack.runId, action: 'cancel' });
    assert.equal(cancel.status, 200);
    assert.equal((await env.post('/api/slack/send', { ...input, previewId: preview.previewId, approved: true })).status, 409);
    assert.equal((await env.post('/api/slack/preview', input)).status, 409); assert.equal(env.sends(), 0);
  } finally { await env.cleanup(); }
});
test('demo mode cannot prepare or send Slack messages even with an injected provider', async () => {
  const env = await setup('demo');
  try { assert.equal((await env.post('/api/slack/preview', { binding, text: 'Message' })).status, 503); assert.equal(env.sends(), 0); }
  finally { await env.cleanup(); }
});
