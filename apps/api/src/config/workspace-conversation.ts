import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { REACTIVE_LIMITS, type ReactiveSnapshotRequest } from '@agentlayer/contracts/reactive-v1';
import { AmbiguousProvider } from '../adapters/ambiguous.js';
import { FileJournal, WorkspaceActions } from '../workspace/index.js';
import { createWorkspaceConversationTools, type WorkspaceConversationCall, type WorkspaceConversationContext } from '../workspace/conversation-tools.js';
import type { ConversationWorkspaceTools } from '../research/codex.js';
import type { ReactiveRunner } from '../routes/reactive.js';
import type { PreparedWorkspaceTool } from '../workspace/agent-tools.js';

type Pending = { fingerprint: string; expires: number; prompt: string; hash: string; userMessage: string; call: WorkspaceConversationCall; context: WorkspaceConversationContext };
function fingerprint(request: ReactiveSnapshotRequest) {
  const { capturedAt: _, ...snapshot } = request.snapshot;
  return createHash('sha256').update(JSON.stringify({ sessionId: request.sessionId, snapshot,
    goal: request.userGoal ?? '', goalRevision: request.goalRevision ?? 0 })).digest('hex');
}
function reviewText(prepared: PreparedWorkspaceTool) {
  const value = prepared.arguments;
  if (prepared.toolName === 'ambiguous_create_contact') return `Save contact in Ambiguous\n\nName: ${value.name}`
    + (value.role ? `\nRole: ${value.role}` : '') + (value.company ? `\nCompany: ${value.company}` : '');
  if (prepared.toolName === 'ambiguous_create_task') return `Save task in Ambiguous\n\n${value.title}\n\n${value.description}\n\nDue date: ${value.dueAt ?? 'None'}`
    + (value.contactId ? `\nLinked contact: ${value.contactId}` : '');
  return `Save document in Ambiguous\n\n${value.title}\n\n${value.content}`;
}

/** The task runner grants exact server-retained workspace operations within an authenticated user task. */
export function configuredWorkspaceConversation(env: Record<string, string | undefined>, enabled: boolean, dependencies?: { actions: WorkspaceActions }) {
  if (!enabled || !env.AMBIGUOUS_API_KEY?.trim() || !env.AMBIGUOUS_WORKSPACE_ID?.trim()) return undefined;
  const pending = new Map<string, Pending>();
  const results = new Map<string, { fingerprint: string; values: unknown[]; uncertain: boolean }>();
  const grants = new Set<string>();
  const tools = createWorkspaceConversationTools({
    actions: dependencies?.actions ?? new WorkspaceActions(new AmbiguousProvider(env.AMBIGUOUS_API_KEY), new FileJournal(resolve(process.cwd(), '.agentlayer'), env.AMBIGUOUS_WORKSPACE_ID)),
    allowedTools: ['ambiguous_create_contact', 'ambiguous_create_task', 'ambiguous_create_note'],
    authorize: async (prepared, _context, signal) => {
      signal?.throwIfAborted();
      return { allowed: grants.has(`${prepared.request.requestId}:${prepared.payloadHash}`), payloadHash: prepared.payloadHash };
    },
  });
  const invalidate = (sessionId: string) => { pending.delete(sessionId); results.delete(sessionId); };
  // An uncertain dispatched action must retain its identity for status checks; expiry applies only to unsent/recoverable previews.
  const prune = () => { for (const [id, item] of pending) if (item.expires <= Date.now() && !results.get(id)?.uncertain) pending.delete(id); };
  const factory = (request: ReactiveSnapshotRequest): ConversationWorkspaceTools | undefined => {
    if (!request.conversation) return undefined;
    const scope = fingerprint(request);
    return {
      definitions: () => results.get(request.sessionId)?.uncertain ? [] : tools.definitions(),
      results: results.get(request.sessionId)?.fingerprint === scope ? structuredClone(results.get(request.sessionId)!.values) : [],
      request: async (call, sources, signal) => {
        signal.throwIfAborted(); prune();
        if (results.get(request.sessionId)?.uncertain) throw new Error('WORKSPACE_RECONCILIATION_REQUIRED');
        if (pending.size >= 32 && !pending.has(request.sessionId)) throw new Error('WORKSPACE_PREVIEW_LIMIT');
        const context: WorkspaceConversationContext = { sessionId: request.sessionId, contextId: request.contextId,
          revision: request.revision, goalRevision: request.goalRevision ?? 0, messageId: request.conversation!.messageId,
          sourceUrl: request.snapshot.url, selection: request.snapshot.selectedText,
          sources: sources.map(({ title, url }) => ({ title, url })),
        };
        // One workspace proposal ends the turn; identity is assigned by the server, never the model.
        const boundCall = { ...call, callId: `workspace-${(results.get(request.sessionId)?.values.length ?? 0) + 1}` };
        const prepared = tools.prepare(boundCall, context);
        const review = `${reviewText(prepared)}\n\nSource: ${context.sourceUrl}`
          + (context.selection ? `\nSelection: ${context.selection}` : '')
          + (context.sources.length ? `\nSources:\n${context.sources.map(source => `${source.title}: ${source.url}`).join('\n')}` : '');
        if (review.length > 11000) throw new Error('WORKSPACE_PREVIEW_TOO_LARGE');
        const prompt = `Confirm workspace action ${randomUUID()}`;
        pending.set(request.sessionId, { fingerprint: scope, expires: Date.now() + 10 * 60_000, prompt,
          hash: prepared.payloadHash, userMessage: request.conversation!.userMessage, call: structuredClone(boundCall), context: structuredClone(context) });
        return { text: review, suggestions: [{ id: 'confirm-workspace', label: 'Confirm this workspace action', prompt }] };
      },
    };
  };
  const reviewedWrap = (runner: ReactiveRunner): ReactiveRunner => {
    const wrapped: ReactiveRunner = async (request, options) => {
      prune();
      const scope = fingerprint(request);
      const proposal = pending.get(request.sessionId);
      const retained = results.get(request.sessionId);
      if ((proposal && proposal.fingerprint !== scope) || (retained && retained.fingerprint !== scope)) invalidate(request.sessionId);
      const current = pending.get(request.sessionId);
      if (request.conversation?.userMessage.startsWith('Confirm workspace action ') && request.conversation.userMessage !== current?.prompt) {
        options.emit({ schemaVersion: 'reactive-v1', type: 'completed', sessionId: request.sessionId, contextId: request.contextId,
          revision: request.revision, goalRevision: request.goalRevision ?? 0, runId: options.runId, sequence: 0,
          text: 'This workspace preview has expired or is no longer current. Ask the agent to prepare the action again.', evidenceRefs: [], suggestions: [] });
        return;
      }
      if (!current || request.conversation?.userMessage !== current.prompt) return runner(request, options);
      options.signal.throwIfAborted();
      const prepared = tools.prepare(current.call, current.context);
      if (prepared.payloadHash !== current.hash) throw new Error('WORKSPACE_PREVIEW_CHANGED');
      const grant = `${prepared.request.requestId}:${prepared.payloadHash}`;
      grants.add(grant);
      try {
        const result = await tools.execute(current.call, current.context, options.signal);
        options.signal.throwIfAborted();
        const previous = results.get(request.sessionId);
        results.set(request.sessionId, { fingerprint: scope, values: [...(previous?.fingerprint === scope ? previous.values : []), result].slice(-8),
          uncertain: result.operations.some(op => op.status === 'unknown') });
        const summary = result.operations.map(op => `${op.kind === 'note' ? 'Document' : op.kind === 'task' ? 'Task' : 'Contact'}: ${op.status === 'created' ? 'saved' : op.status === 'reused' ? 'existing record reused' : op.status === 'unknown' ? 'outcome unknown; do not create it again' : op.status === 'failed' ? 'save failed' : 'not saved'}${op.url ? `\n${op.url}` : op.id ? `\nRecord ID: ${op.id}` : ''}`).join('\n\n');
        // Continue the original user instruction with server-held results, including real IDs.
        // A further model-selected write still produces its own review; it cannot inherit this grant.
        const continuation = structuredClone(request);
        continuation.conversation!.userMessage = current.userMessage;
        if (result.operations.some(op => op.status === 'unknown')) {
          options.emit({ schemaVersion: 'reactive-v1', type: 'completed', sessionId: request.sessionId, contextId: request.contextId,
            revision: request.revision, goalRevision: request.goalRevision ?? 0, runId: options.runId, sequence: 0,
            text: summary, evidenceRefs: [], suggestions: [{ id: 'reconcile-workspace', label: 'Check this action again', prompt: current.prompt }] });
        } else {
          let completed = false, sequence = 0;
          const continuationFailed = () => options.emit({ schemaVersion: 'reactive-v1', type: 'completed', sessionId: request.sessionId, contextId: request.contextId,
            revision: request.revision, goalRevision: request.goalRevision ?? 0, runId: options.runId, sequence: sequence++,
            text: `${summary}\n\nThe conversation could not continue.`, evidenceRefs: [], suggestions: [] });
          try {
            await runner(continuation, { ...options, emit: event => {
              if (completed) return;
              sequence = Math.max(sequence, event.sequence + 1);
              if (event.type === 'error') { continuationFailed(); completed = true; return; }
              options.emit(event.type === 'completed' ? { ...event, text: `${summary}\n\n${event.text}`.slice(0, REACTIVE_LIMITS.responseChars) } : event);
              completed = event.type === 'completed';
            } });
            if (!completed && !options.signal.aborted) continuationFailed();
          } catch {
            options.signal.throwIfAborted();
            if (!completed) continuationFailed();
          }
        }
        // Retain the same identity until expiry so a confirmation retry cannot create a second record.
      } finally { grants.delete(grant); }
    };
    wrapped.invalidateSession = invalidate;
    return wrapped;
  };
  const wrap = (runner: ReactiveRunner): ReactiveRunner => {
    const executeReviewed = reviewedWrap(runner);
    const automatic: ReactiveRunner = async (request, options) => {
      // Page observations alone never initiate writes. Only a submitted task enters this loop.
      if (!request.conversation) return executeReviewed(request, options);
      let next = request;
      let sequence = 0;
      const completedResults: string[] = [];
      // A Continue/status request may already name a retained operation.
      const startsWithOperation = pending.get(request.sessionId)?.prompt === request.conversation.userMessage;
      for (let operation = startsWithOperation ? 1 : 0; operation <= 3; operation++) {
        options.signal.throwIfAborted();
        let proposalPrompt: string | undefined;
        await executeReviewed(next, { ...options, emit: event => {
          if (event.type === 'completed') {
            const proposal = pending.get(request.sessionId);
            const confirm = event.suggestions?.find(item => item.id === 'confirm-workspace');
            if (confirm && proposal?.prompt === confirm.prompt && proposal.fingerprint === fingerprint(request)) {
              proposalPrompt = confirm.prompt;
              // The final text may include completed operations before the next hidden preview.
              const previewStart = event.text.search(/Save (?:contact|task|document) in Ambiguous/);
              if (previewStart > 0) completedResults.push(event.text.slice(0, previewStart).trim());
              return;
            }
          }
          const published = structuredClone(event);
          published.sequence = sequence++;
          if (published.type === 'completed') published.text = [...completedResults, published.text].filter(Boolean).join('\n\n').slice(0, REACTIVE_LIMITS.responseChars);
          options.emit(published);
        } });
        if (!proposalPrompt) return;
        if (operation === 3) {
          options.emit({ schemaVersion: 'reactive-v1', type: 'completed', sessionId: request.sessionId,
            contextId: request.contextId, revision: request.revision, goalRevision: request.goalRevision ?? 0,
            runId: options.runId, evidenceRefs: [], sequence: sequence++, text: [...completedResults,
            'The task needs another step. Continue when ready.'].filter(Boolean).join('\n\n'),
            suggestions: [{ id: 'continue-task', label: 'Continue task', prompt: proposalPrompt }] });
          return;
        }
        options.emit({ schemaVersion: 'reactive-v1', type: 'progress', sessionId: request.sessionId,
          contextId: request.contextId, revision: request.revision, goalRevision: request.goalRevision ?? 0,
          runId: options.runId, sequence: sequence++, message: 'Updating your workspace...' });
        next = structuredClone(request);
        next.conversation!.userMessage = proposalPrompt;
      }
    };
    automatic.invalidateSession = invalidate;
    return automatic;
  };
  return { factory, wrap, invalidate };
}
