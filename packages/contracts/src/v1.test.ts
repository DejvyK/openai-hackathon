import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CommitRequestSchema, CommitResultSchema, OperationResultSchema, PageContextSchema, ResearchBriefSchema, TaskDraftSchema } from './v1.js';
import * as fixtures from './fixtures/v1.js';

test('all eight shared scenarios load and retain uncertainty', () => {
  assert.equal(Object.keys(fixtures).length, 8);
  assert.equal(fixtures.incompleteProfile.person?.company, null);
  assert.equal(fixtures.unknownWrite.operations[1].retryable, false);
});
test('invalid context combinations and unsafe URLs fail', () => {
  assert.equal(PageContextSchema.safeParse({ ...fixtures.completeProfile, kind: 'selection' }).success, false);
  assert.equal(PageContextSchema.safeParse({ ...fixtures.completeProfile, url: 'javascript:alert(1)' }).success, false);
});
test('unbacked claims and duplicate evidence IDs fail', () => {
  assert.equal(ResearchBriefSchema.safeParse({ ...fixtures.noSources, claims: [{ text: 'Invented', sourceIds: ['missing'] }] }).success, false);
  const source = fixtures.namesakes.sources[0];
  assert.equal(ResearchBriefSchema.safeParse({ ...fixtures.noSources, sources: [source, source] }).success, false);
});
test('writes reject injected fields, mismatched action and provider limits', () => {
  const request = { requestId: 'r', proposalId: 'p', contextId: 'c', actionKind: 'research_note', reviewedPayload: { actionKind: 'research_note', note: { title: 'Note', content: 'Content' } } };
  assert.equal(CommitRequestSchema.safeParse(request).success, true);
  assert.equal(CommitRequestSchema.safeParse({ ...request, backendUrl: 'https://example.org' }).success, false);
  assert.equal(CommitRequestSchema.safeParse({ ...request, actionKind: 'contact_followup' }).success, false);
  assert.equal(TaskDraftSchema.safeParse({ title: 'x'.repeat(256), description: '', dueAt: null }).success, false);
});
test('unknown results cannot authorize blind retry; success needs ID', () => {
  assert.equal(OperationResultSchema.safeParse({ ...fixtures.unknownWrite.operations[1], retryable: true }).success, false);
  assert.equal(OperationResultSchema.safeParse({ ...fixtures.partialSuccess.operations[0], id: null }).success, false);
});
test('aggregate result cannot mask partial or unknown operations as success', () => {
  assert.equal(CommitResultSchema.safeParse({ ...fixtures.partialSuccess, status: 'succeeded' }).success, false);
  assert.equal(CommitResultSchema.safeParse({ ...fixtures.unknownWrite, status: 'failed' }).success, false);
  assert.equal(CommitResultSchema.safeParse({ ...fixtures.partialSuccess, operations: [fixtures.partialSuccess.operations[0], fixtures.partialSuccess.operations[0]] }).success, false);
});
