import { createWorkspaceToolRegistry, type PreparedWorkspaceTool, type WorkspaceToolName } from './agent-tools.js';
import { digest } from './journal.js';
import type { WorkspaceActions } from './index.js';
import { WorkspaceError } from './model.js';

/** Identity and evidence supplied by the application, not by model tool arguments. */
export type WorkspaceConversationContext = {
  sessionId: string;
  contextId: string;
  revision: number;
  goalRevision: number;
  messageId: string;
  sourceUrl: string;
  sources: { title: string; url: string }[];
  selection?: string;
};

export type WorkspaceConversationCall = {
  /** Server-assigned stable call ordinal/ID, retained when the same turn is retried. */
  callId: string;
  toolName: string;
  arguments: unknown;
};

function identity(callId: string, context: WorkspaceConversationContext) {
  if ([callId, context.sessionId, context.contextId, context.messageId].some(value =>
    typeof value !== 'string' || !value.trim() || value.length > 256) ||
    !Number.isSafeInteger(context.revision) || context.revision < 0 ||
    !Number.isSafeInteger(context.goalRevision) || context.goalRevision < 0) {
    throw new WorkspaceError('INVALID_TOOL_CONTEXT');
  }
  const turn = digest({ sessionId: context.sessionId, contextId: context.contextId,
    revision: context.revision, goalRevision: context.goalRevision, messageId: context.messageId });
  return { requestId: `tool-${digest({ turn, callId })}`, proposalId: `turn-${turn}` };
}

/** A transport-independent bridge for the runner's application-mediated tool loop. */
export function createWorkspaceConversationTools(options: {
  actions: WorkspaceActions;
  allowedTools: readonly WorkspaceToolName[];
  authorize: (prepared: PreparedWorkspaceTool, context: WorkspaceConversationContext,
    signal?: AbortSignal) => Promise<{ allowed: boolean; payloadHash: string }>;
}) {
  function registry(context: WorkspaceConversationContext) {
    return createWorkspaceToolRegistry({ ...options,
      authorize: (prepared, signal) => options.authorize(prepared, structuredClone(context), signal),
    });
  }
  return {
    definitions: () => createWorkspaceToolRegistry({ ...options,
      authorize: async () => ({ allowed: false, payloadHash: '' }),
    }).definitions(),
    prepare(call: WorkspaceConversationCall, context: WorkspaceConversationContext) {
      const bound = structuredClone(context);
      return registry(bound).prepare(call.toolName, call.arguments, { ...bound, ...identity(call.callId, bound) });
    },
    async execute(call: WorkspaceConversationCall, context: WorkspaceConversationContext, signal?: AbortSignal) {
      signal?.throwIfAborted();
      const bound = structuredClone(context);
      return registry(bound).execute(call.toolName, call.arguments, { ...bound, ...identity(call.callId, bound) }, signal);
    },
    reconcile(callId: string, context: WorkspaceConversationContext, signal?: AbortSignal) {
      signal?.throwIfAborted();
      return options.actions.reconcile(identity(callId, context).requestId, { signal });
    },
  };
}

export type WorkspaceConversationTools = ReturnType<typeof createWorkspaceConversationTools>;
