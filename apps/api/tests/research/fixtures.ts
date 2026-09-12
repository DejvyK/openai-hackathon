import type { ResearchContext } from '../../src/research/types.js';

// Fictional, explicitly offline fixtures. Never live-provider evidence.
export const profile: ResearchContext = {
  schemaVersion: 'v1', contextId: 'fixture-profile', kind: 'profile',
  url: 'https://www.linkedin.com/in/alex-fixture/', pageTitle: 'Alex Morgan',
  capturedAt: '2026-09-12T10:00:00.000Z',
  person: { name: 'Alex Morgan', company: 'Example Studio', role: null,
    profileUrl: 'https://www.linkedin.com/in/alex-fixture/' },
  selection: null, extractedEvidence: [],
};
export const selection: ResearchContext = {
  ...profile, contextId: 'fixture-selection', kind: 'selection', person: null,
  url: 'https://example.org/article', pageTitle: 'Research workflows',
  selection: { text: 'Small teams compare interview notes to identify recurring customer needs.' },
};
export const sourceText = 'Alex Morgan works at Example Studio. Example Studio develops customer research software.';
export const exaResult = { results: [{ url: 'https://example.org/team/alex', title: 'Team biography',
  text: sourceText, author: 'Editorial team', publishedDate: '2026-09-10T00:00:00Z' }] };
export const matchedOutput = {
  identityStatus: 'matched', identityMatches: [{ sourceId: 's1', name: 'Alex Morgan', company: 'Example Studio', profileUrl: null }],
  claims: [{ text: 'Alex Morgan works at Example Studio.', subject: 'person', sourceIds: ['s1'],
    quotes: [{ sourceId: 's1', text: 'Alex Morgan works at Example Studio.' }] }],
  suggestions: ['Review the company research before deciding whether to follow up.'],
};
export const emptyOutput = { identityStatus: 'insufficient', identityMatches: [], claims: [], suggestions: [] };
export function toolCall(purpose = 'person', query = 'Alex Morgan Example Studio', id = 'call-1') {
  return { status: 'completed', output: [{ type: 'function_call', call_id: id, name: 'exa_search',
    arguments: JSON.stringify({ purpose, query }) }] };
}
export function modelOutput(value: unknown) {
  return { status: 'completed', output: [{ type: 'message', role: 'assistant',
    content: [{ type: 'output_text', text: JSON.stringify(value) }] }] };
}
