import { digest } from './journal.js';
import { mapReviewedAction } from './mapping.js';
import { WorkspaceActions } from './index.js';
import { WorkspaceError, type ReviewedAction } from './model.js';

type Field = { type: 'string' | readonly ['string', 'null']; maxLength: number; description?: string };
type Definition = { name: string; description: string; parameters: { type: 'object'; additionalProperties: false; required: string[]; properties: Record<string, Field> } };
const string = (maxLength: number): Field => ({ type: 'string', maxLength });
const nullable = (maxLength: number, description: string): Field => ({ type: ['string', 'null'], maxLength, description });
function definition(name: string, description: string, properties: Record<string, Field>): Definition {
  return { name, description, parameters: { type: 'object', additionalProperties: false, required: Object.keys(properties), properties } };
}
const definitions = [
  definition('ambiguous_create_contact', 'Create or reuse a contact for the current source profile. Choose the factual name, role and company from evidence or user corrections. Unknown role/company stay null. This does not create a task. A successful result returns the actual contact ID for a later task tool call.', {
    name: string(200), role: nullable(200, 'Known role, otherwise null.'), company: nullable(200, 'Known company, otherwise null.'),
  }),
  definition('ambiguous_create_task', 'Create a task with the title and body appropriate to the user goal. It can stand alone or link to a contact ID returned by a previous tool result. Do not invent dates or contact IDs. This does not send an outreach message.', {
    title: string(255), description: string(15000), dueAt: nullable(10, 'User-requested calendar date YYYY-MM-DD, otherwise null.'), contactId: nullable(36, 'Existing workspace contact ID from trusted evidence/tool results, otherwise null.'),
  }),
  definition('ambiguous_create_note', 'Create a persistent document containing the content you compose for the user goal. The server attaches the current selection and source evidence. Use this for notes or documents, not a task disguised as a note.', {
    title: string(255), content: string(15000),
  }),
];
export type WorkspaceToolName = 'ambiguous_create_contact' | 'ambiguous_create_task' | 'ambiguous_create_note';

/** Supplied from authenticated session/proposal storage, never model arguments. */
export type WorkspaceToolContext = {
  requestId: string; proposalId: string; contextId: string;
  sourceUrl: string; sources: { title: string; url: string }[]; selection?: string;
};
export type PreparedWorkspaceTool = {
  toolName: WorkspaceToolName;
  arguments: Record<string, string | null>;
  payloadHash: string;
  request: ReviewedAction;
};
type Authorization = { allowed: boolean; payloadHash: string };

function argumentsFor(def: Definition, input: unknown): Record<string, string | null> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new WorkspaceError('INVALID_TOOL_ARGUMENTS');
  const values = input as Record<string, unknown>;
  if (Object.keys(values).length !== def.parameters.required.length || Object.keys(values).some(k => !Object.hasOwn(def.parameters.properties, k))) throw new WorkspaceError('INVALID_TOOL_ARGUMENTS');
  const result: Record<string, string | null> = {};
  for (const [name, field] of Object.entries(def.parameters.properties)) {
    const value = values[name];
    if (value === null && Array.isArray(field.type)) { result[name] = null; continue; }
    if (typeof value !== 'string' || value.length > field.maxLength) throw new WorkspaceError('INVALID_TOOL_ARGUMENTS');
    result[name] = value;
  }
  return result;
}

/** The registry describes capabilities, not a workflow. The model selects calls and values. */
export function createWorkspaceToolRegistry(options: {
  actions: WorkspaceActions;
  allowedTools: readonly WorkspaceToolName[];
  /** Server policy may accept an already explicit user command or ask for missing intent.
   * It must authorize this exact payload, never treat page/model text as permission. */
  authorize: (prepared: PreparedWorkspaceTool, signal?: AbortSignal) => Promise<Authorization>;
}) {
  const allowed = definitions.filter(d => options.allowedTools.includes(d.name as WorkspaceToolName));
  function prepare(toolName: string, input: unknown, context: WorkspaceToolContext): PreparedWorkspaceTool {
    const def = allowed.find(d => d.name === toolName);
    if (!def) throw new WorkspaceError('WORKSPACE_TOOL_UNAVAILABLE');
    const args = argumentsFor(def, input);
    const base = { sourceUrl: context.sourceUrl, sources: structuredClone(context.sources) };
    let actionKind: ReviewedAction['actionKind'];
    let reviewedPayload: ReviewedAction['reviewedPayload'];
    if (toolName === 'ambiguous_create_contact') {
      actionKind = 'create_contact';
      reviewedPayload = { ...base, person: { name: args.name!, role: args.role, company: args.company, profileUrl: context.sourceUrl } };
    } else if (toolName === 'ambiguous_create_task') {
      actionKind = 'create_task';
      reviewedPayload = { ...base, task: { title: args.title!, description: args.description!, dueAt: args.dueAt, contactId: args.contactId } };
    } else {
      actionKind = 'research_note';
      reviewedPayload = { ...base, note: { title: args.title!, content: args.content!, selection: context.selection ?? '' } };
    }
    const request: ReviewedAction = { requestId: context.requestId, proposalId: context.proposalId, contextId: context.contextId, actionKind, reviewedPayload };
    mapReviewedAction(request);
    return { toolName: toolName as WorkspaceToolName, arguments: args, request, payloadHash: digest(request) };
  }
  return {
    definitions: () => structuredClone(allowed),
    prepare,
    async execute(toolName: string, input: unknown, context: WorkspaceToolContext, signal?: AbortSignal) {
      signal?.throwIfAborted();
      const prepared = prepare(toolName, input, context);
      const authorization = await options.authorize(structuredClone(prepared), signal);
      signal?.throwIfAborted();
      if (!authorization.allowed || authorization.payloadHash !== prepared.payloadHash) throw new WorkspaceError('WORKSPACE_ACTION_NOT_AUTHORIZED');
      const result = await options.actions.commitReviewedAction(prepared.request, { signal });
      return { toolName: prepared.toolName, ...result, operations: result.operations.map(({ reused, ...op }) => ({ ...op, status: op.status === 'succeeded' ? reused ? 'reused' : 'created' : op.status === 'pending' ? 'skipped' : op.status })) };
    },
    reconcile: (requestId: string, signal?: AbortSignal) => options.actions.reconcile(requestId, { signal }),
  };
}
