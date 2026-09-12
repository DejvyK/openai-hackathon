// Internal workspace boundary; D must bind this to the shared CommitRequest schema.
export type Kind = 'contact' | 'task' | 'note';
export type RecordData = { id: string; [key: string]: unknown };
export type ReviewedAction = {
  requestId: string; proposalId: string; contextId: string;
  approvedRequestHash?: string;
  actionKind: 'contact_followup' | 'research_note' | 'create_contact' | 'create_task';
  reviewedPayload: {
    sourceUrl: string; sources: { title: string; url: string }[];
    person?: { name: string; role: string | null; company: string | null; profileUrl: string };
    task?: { title: string; description: string; dueAt?: string | null; contactId?: string | null };
    note?: { title: string; content: string; selection: string };
  };
};
export type Operation = { kind: Kind; status: 'pending' | 'succeeded' | 'failed' | 'unknown'; reused?: boolean; id: string | null; url: string | null; errorCode: string | null; retryable: boolean };
export type CommitResult = { requestId: string; contextId: string; status: 'succeeded' | 'partial' | 'failed' | 'unknown'; operations: Operation[]; warnings: string[] };
export class WorkspaceError extends Error {
  constructor(public code: string, public uncertain = false, public retryable = false) { super(code); }
}
export interface WorkspaceProvider {
  create(kind: Kind, body: Record<string, unknown>, signal?: AbortSignal): Promise<RecordData>;
  read(kind: Kind, id: string, signal?: AbortSignal): Promise<RecordData>;
  contacts(signal?: AbortSignal): Promise<RecordData[]>;
  clearTaskDueDate?(id: string, signal?: AbortSignal): Promise<void>;
}
