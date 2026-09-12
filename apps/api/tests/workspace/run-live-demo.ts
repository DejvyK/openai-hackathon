import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AmbiguousProvider } from '../../src/adapters/ambiguous.js';
import { FileJournal, WorkspaceActions, WorkspaceError, type ReviewedAction, type WorkspaceProvider } from '../../src/workspace/index.js';

if (!process.argv.includes('--execute-approved-demo')) throw new Error('Explicit approved demo flag required');
const proposalPath = new URL('./live-demo-proposal.json', import.meta.url);
const proposal = JSON.parse(readFileSync(proposalPath, 'utf8'));
if (proposal.authorization !== 'approved_by_user') throw new Error('Demo authorization missing');
const key = process.env.AMBIGUOUS_API_KEY;
if (!key || process.env.AMBIGUOUS_WORKSPACE_ID !== proposal.workspaceId) throw new Error('Workspace configuration mismatch');
const response = await fetch('https://app.ambiguous.ai/api/workspaces', { headers: { Authorization: `Bearer ${key}` }, redirect: 'error', signal: AbortSignal.timeout(15000) });
if (!response.ok) throw new Error('Workspace verification failed');
const workspaces = await response.json() as { active_workspace_id: string };
if (workspaces.active_workspace_id !== proposal.workspaceId) throw new Error('Active provider workspace mismatch');
const events: unknown[] = [];
const provider = new AmbiguousProvider(key, async (url, init) => {
  const r = await fetch(url, init);
  events.push({ method: init?.method, path: new URL(String(url)).pathname, status: r.status });
  return r;
});
const journal = new FileJournal(resolve('apps/api/.agentlayer'), proposal.workspaceId);
let injectTaskFailure = true;
const testProvider: WorkspaceProvider = {
  contacts: signal => provider.contacts(signal), read: (kind, id, signal) => provider.read(kind, id, signal),
  clearTaskDueDate: (id, signal) => provider.clearTaskDueDate(id, signal),
  create: (kind, body, signal) => {
    if (kind === 'task' && injectTaskFailure) {
      injectTaskFailure = false;
      events.push({ injectedFailure: 'task before dispatch; not a provider failure' });
      throw new WorkspaceError('DEMO_INJECTED_PRE_DISPATCH_FAILURE', false, true);
    }
    return provider.create(kind, body, signal);
  },
};
const actions = proposal.actions as ReviewedAction[];
const results: unknown[] = [];
const evidencePath = new URL('./live-demo-result.json', import.meta.url);
const save = () => writeFileSync(evidencePath, JSON.stringify({ recordedAt: new Date().toISOString(), workspaceId: proposal.workspaceId, evidenceKind: proposal.evidenceKind, results, events }, null, 2) + '\n');
try {
  const first = await new WorkspaceActions(testProvider, journal).commitReviewedAction(actions[0]);
  results.push({ phase: 'profile_with_controlled_partial', result: first }); save();
  const service = new WorkspaceActions(provider, journal);
  for (const action of actions) {
    const result = await service.commitReviewedAction(action);
    results.push({ phase: 'commit', result }); save();
    console.log(JSON.stringify(result));
    if (result.status !== 'succeeded') continue;
    for (const op of result.operations) {
      const record = await provider.read(op.kind, op.id!);
      const fields = ['id', 'type', 'name', 'title', 'website', 'custom_properties', 'description', 'contact_id', 'due_date', 'content'];
      results.push({ phase: 'independent_read_back', kind: op.kind, record: Object.fromEntries(Object.entries(record).filter(([key]) => fields.includes(key))) }); save();
    }
    const writesBefore = events.filter((e: any) => e.method === 'POST').length;
    const repeated = await new WorkspaceActions(provider, new FileJournal(resolve('apps/api/.agentlayer'), proposal.workspaceId)).commitReviewedAction(action);
    const writesAfter = events.filter((e: any) => e.method === 'POST').length;
    results.push({ phase: 'new_service_same_journal_retry', result: repeated, extraPostRequests: writesAfter - writesBefore }); save();
  }
} finally { save(); }
