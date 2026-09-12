import { FileJournal, digest, type Entry } from './journal.js';
import { mapReviewedAction, profileKey } from './mapping.js';
import { WorkspaceError, type Kind, type RecordData, type ReviewedAction, type WorkspaceProvider } from './model.js';
export * from './model.js';
export { FileJournal } from './journal.js';

function status(entry: Entry) {
  const ops = entry.result.operations;
  entry.result.status = ops.every(o => o.status === 'succeeded') ? 'succeeded' : ops.some(o => o.status === 'unknown') ? 'unknown' : ops.some(o => o.status === 'succeeded') ? 'partial' : 'failed';
}
function upgradeDateExpectation(entry: Entry) {
  // Old journals omitted no-date expectations and may have accepted a provider SLA.
  // Recheck them without changing any existing external record.
  const task = entry.expected.task;
  if (task && !Object.hasOwn(task, 'due_date')) {
    task.due_date = null;
    const op = entry.result.operations.find(o => o.kind === 'task')!;
    if (op.status === 'succeeded') { op.status = 'unknown'; op.errorCode = 'DATE_REVALIDATION_REQUIRED'; }
  }
}
function verify(kind: Kind, record: RecordData, expected: Record<string, unknown>) {
  const fields = kind === 'task' ? ['title', 'description', 'contact_id', 'due_date'] : kind === 'contact' ? ['type', 'name', 'title', 'website'] : ['type', 'title'];
  for (const field of fields) if (expected[field] !== undefined && record[field] !== expected[field]) throw new WorkspaceError('READ_BACK_MISMATCH');
  if (kind === 'contact') {
    const saved = record.custom_properties as Record<string, unknown> | null;
    const intended = expected.custom_properties as Record<string, unknown>;
    for (const [key, value] of Object.entries(intended)) {
      if (saved?.[key] !== value) throw new WorkspaceError('CONTACT_FIELDS_NOT_VERIFIED');
    }
  }
  if (kind === 'note') {
    const plain = (value: unknown): string => {
      if (typeof value === 'string') return plain(JSON.parse(value));
      if (!value || typeof value !== 'object') return '';
      const node = value as { text?: string; content?: unknown[]; type?: string };
      return (node.text ?? (node.content ?? []).map(plain).join('')) + (node.type === 'paragraph' ? '\n' : '');
    };
    if (plain(record.content) !== plain(expected.content)) throw new WorkspaceError('NOTE_CONTENT_NOT_VERIFIED');
  }
}
export class WorkspaceActions {
  constructor(private provider: WorkspaceProvider, private journal: FileJournal) {}
  async commitReviewedAction(request: ReviewedAction, options: { signal?: AbortSignal } = {}) {
    const mapped = mapReviewedAction(request); // all mapping/limits before any write
    return this.journal.exclusive(async () => {
      const hash = digest(request);
      let entry = this.journal.read(request.requestId);
      if (entry && entry.hash !== hash) throw new WorkspaceError('REQUEST_ID_CONFLICT');
      if (entry) { upgradeDateExpectation(entry); this.journal.save(entry); }
      if (!entry) {
        const kinds = (['contact', 'task', 'note'] as const).filter(kind => mapped[kind] !== undefined);
        entry = { version: 1, hash, expected: {}, result: { requestId: request.requestId, contextId: request.contextId, status: 'failed', operations: kinds.map(kind => ({ kind, status: 'pending', id: null, url: null, errorCode: null, retryable: false })), warnings: ['Record URLs require live verification; no guessed contact URL is returned.'] } };
        this.journal.save(entry);
      }
      for (const op of entry.result.operations) {
        if (op.status === 'succeeded') continue;
        if (op.status === 'unknown' || op.id) { await this.readBack(entry, op.kind, options.signal); if (!entry.result.operations.some(o => o.kind === op.kind && o.status === 'succeeded')) break; continue; }
        if (op.status === 'failed' && !op.retryable) break;
        try {
          options.signal?.throwIfAborted();
          let body: Record<string, unknown>;
          if (op.kind === 'contact') {
            body = mapped.contact!;
            const key = body.website;
            const matches = (await this.provider.contacts(options.signal)).filter(c => {
              if (c.type !== 'person') return false;
              const custom = c.custom_properties as Record<string, unknown> | null;
              try { return profileKey(custom?.agentlayer_profile_url ?? c.website) === key; } catch { return false; }
            });
            if (matches.length > 1) throw new WorkspaceError('CONTACT_MATCH_AMBIGUOUS');
            if (matches.length === 1) {
              const found = await this.provider.read('contact', matches[0].id, options.signal);
              const custom = found.custom_properties as Record<string, unknown> | null;
              if (found.type !== 'person' || profileKey(custom?.agentlayer_profile_url ?? found.website) !== key) throw new WorkspaceError('CONTACT_MATCH_CHANGED');
              op.id = found.id; op.status = 'succeeded'; op.reused = true; op.errorCode = null;
              this.journal.save(entry); continue;
            }
          } else if (op.kind === 'task') {
            const contact = entry.result.operations.find(o => o.kind === 'contact');
            if (contact) {
              if (contact.status !== 'succeeded' || !contact.id) break;
              body = { ...mapped.task!, contact_id: contact.id };
            } else {
              body = { ...mapped.task! };
              if (body.contact_id) {
                const linked = await this.provider.read('contact', String(body.contact_id), options.signal);
                if (linked.id !== body.contact_id) throw new WorkspaceError('CONTACT_LINK_MISMATCH');
              }
            }
          } else body = mapped.note!;
          options.signal?.throwIfAborted();
          entry.expected[op.kind] = body;
          op.status = 'unknown'; op.errorCode = 'WRITE_IN_FLIGHT'; op.retryable = false;
          this.journal.save(entry); // persisted before dispatch, including abrupt crashes
          const created = await this.provider.create(op.kind, body, options.signal);
          op.id = created.id;
          this.journal.save(entry); // preserve confirmed ID even if GET subsequently fails
          if (op.kind === 'task' && body.due_date === null && created.due_date !== null) {
            if (!this.provider.clearTaskDueDate) throw new WorkspaceError('OPTIONAL_DATE_UNSUPPORTED', true);
            op.errorCode = 'CLEAR_DUE_DATE_IN_FLIGHT'; this.journal.save(entry);
            await this.provider.clearTaskDueDate(op.id, options.signal);
          }
          await this.readBack(entry, op.kind, options.signal);
          if (!entry.result.operations.some(o => o.kind === op.kind && o.status === 'succeeded')) break;
        } catch (error) {
          const e = error instanceof WorkspaceError ? error : new WorkspaceError('WORKSPACE_ERROR', op.status === 'unknown');
          op.status = e.uncertain || op.id ? 'unknown' : 'failed'; op.errorCode = e.code; op.retryable = op.status === 'failed' && e.retryable;
          this.journal.save(entry); break;
        }
      }
      status(entry); this.journal.save(entry); return entry.result;
    });
  }
  private async readBack(entry: Entry, kind: Kind, signal?: AbortSignal) {
    const op = entry.result.operations.find(o => o.kind === kind)!;
    if (!op.id) { op.status = 'unknown'; op.errorCode = 'WRITE_OUTCOME_UNRESOLVED'; return; }
    try {
      const record = await this.provider.read(kind, op.id, signal);
      verify(kind, record, entry.expected[kind]);
      op.status = 'succeeded'; op.errorCode = null; op.retryable = false;
    } catch { op.status = 'unknown'; op.errorCode = 'READ_BACK_UNVERIFIED'; op.retryable = false; }
    this.journal.save(entry);
  }
  async reconcile(requestId: string, options: { signal?: AbortSignal } = {}) {
    return this.journal.exclusive(async () => {
      const entry = this.journal.read(requestId);
      if (!entry) throw new WorkspaceError('REQUEST_NOT_FOUND');
      upgradeDateExpectation(entry); this.journal.save(entry);
      for (const op of entry.result.operations) if (op.status === 'unknown') await this.readBack(entry, op.kind, options.signal);
      status(entry); this.journal.save(entry); return entry.result;
    });
  }
}
