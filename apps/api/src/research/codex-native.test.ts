import test from 'node:test';
import assert from 'node:assert/strict';
import { validateNativeMcpReply } from './codex.js';
import type { ReactiveSnapshotRequest } from '@agentlayer/contracts/reactive-v1';
import type { RuntimeMcp } from '../mcp/runtime-server.js';
const request: ReactiveSnapshotRequest = { schemaVersion: 'reactive-v1', sessionId: 'test', contextId: 'page', revision: 1,
  snapshot: { url: 'https://www.linkedin.com/in/william-bryk/', pageTitle: 'Profile URL supplied by user', mainText: 'User supplied this profile URL for research. No live DOM captured in this unit test.', selectedText: '', capturedAt: '2026-09-13T00:00:00Z', extractedEvidence: [] },
  conversation: { messageId: 'm1', userMessage: 'Research this profile and prepare a Slack draft.', history: [] },
};
const runtime: Pick<RuntimeMcp, 'sources' | 'slackDraft' | 'assessment'> = { sources: () => [], slackDraft: () => undefined, assessment: () => undefined };
test('native replies cannot dispatch legacy JSON tool requests or inject unexecuted drafts', async () => {
  for (const payload of [
    { toolRequest: { name: 'exa_search', query: 'test', purpose: 'person' } },
    { slackDraft: `An unexecuted draft ${request.snapshot.url}` },
    { frontendIntents: [{ type: 'tool', name: 'prepare_slack_draft', arguments: { text: request.snapshot.url } }] },
  ]) {
    await assert.rejects(validateNativeMcpReply(request, JSON.stringify({ text: 'Result', suggestions: [], ...payload }), runtime, new AbortController().signal), /CODEX_NON_NATIVE_TOOL_REQUEST/);
  }
});
test('the native reply carries only server-observed MCP evidence and draft results', async () => {
  const source = { id: 'exa-1', url: 'https://example.org/source', title: 'Test evidence', retrievedAt: '2026-09-13T00:00:00Z', text: 'Test text, not live profile facts', author: null, publishedDate: null };
  const draft = `Research pending: ${request.snapshot.url}`;
  const reply = await validateNativeMcpReply(request, JSON.stringify({ text: 'Evidence is available [exa-1].', suggestions: [] }), { ...runtime, sources: () => [source], slackDraft: () => draft }, new AbortController().signal);
  assert.equal(reply.slackDraft, draft); assert.deepEqual(reply.evidenceRefs, ['exa-1']);
  assert.equal('text' in reply.sources[0], false);
  await assert.rejects(validateNativeMcpReply(request, JSON.stringify({ text: 'Invented [exa-99]', suggestions: [] }), runtime, new AbortController().signal), /CODEX_UNKNOWN_SOURCE/);
});

test('native model input distinguishes calendar connection from initial executable tools and supplies fresh time/page', async () => {
  const { buildNativeCodexConversationInput } = await import('./codex.js');
  for (const connected of [false, true]) {
    const input = JSON.parse(buildNativeCodexConversationInput({ ...request, conversation: undefined, userGoal: 'Manage my appointments' }, {
      calendar: { status: () => ({ configured: true, connected }), createEvent: async () => assert.fail('input construction never writes') },
      toolNames: [], evidence: [],
    }));
    assert.deepEqual(input.trustedCapabilityStatus.googleCalendar, { configured: true, connected });
    assert.deepEqual(input.nativeMcpTools, []);
    assert.equal(input.untrustedPageSnapshot.mainText, request.snapshot.mainText);
    assert.ok(Math.abs(Date.now() - Date.parse(input.trustedTimeContext.now)) < 5000);
    assert.equal(typeof input.trustedTimeContext.serverTimeZone, 'string');
  }
  const absent = JSON.parse(buildNativeCodexConversationInput(request, { toolNames: ['prepare_slack_draft'], evidence: [] }));
  assert.deepEqual(absent.trustedCapabilityStatus.googleCalendar, { configured: false, connected: false });
});
