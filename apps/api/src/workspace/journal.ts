import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync, unlinkSync, rmdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { WorkspaceError, type CommitResult } from './model.js';
export type Entry = { version: 1; hash: string; result: CommitResult; expected: Record<string, Record<string, unknown>> };
function validateEntry(entry: Entry, requestId: string) {
  const invalid = () => { throw new WorkspaceError('CORRUPT_JOURNAL'); };
  if (entry.version !== 1 || !/^[a-f0-9]{64}$/.test(entry.hash) || entry.result?.requestId !== requestId ||
      !entry.expected || typeof entry.expected !== 'object' || Array.isArray(entry.expected) ||
      typeof entry.result.contextId !== 'string' || !entry.result.contextId ||
      !Array.isArray(entry.result.operations)) invalid();
  const ops = entry.result.operations;
  if (!(ops.length === 1 && ['contact', 'task', 'note'].includes(ops[0].kind)) && !(ops.length === 2 && ops[0].kind === 'contact' && ops[1].kind === 'task')) invalid();
  for (const op of ops) {
    if (!['pending', 'succeeded', 'failed', 'unknown'].includes(op.status) ||
        typeof op.retryable !== 'boolean' || (op.id !== null && (typeof op.id !== 'string' || !op.id)) ||
        (op.status === 'succeeded' && !op.id) || (op.status === 'unknown' && op.retryable) ||
        (op.status === 'pending' && op.id !== null)) invalid();
    if ((op.status === 'unknown' || op.status === 'succeeded') && !op.reused &&
        (!entry.expected[op.kind] || typeof entry.expected[op.kind] !== 'object' || Array.isArray(entry.expected[op.kind]))) invalid();
  }
  if (ops[1]?.id && ops[0].status !== 'succeeded') invalid();
}
export function digest(value: unknown): string {
  function canonical(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)]));
    return v;
  }
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
// One local writer per workspace. A crash leaves a fail-closed lock for operator recovery.
export class FileJournal {
  readonly directory: string;
  constructor(directory: string, workspace: string) {
    if (!workspace.trim()) throw new WorkspaceError('MISSING_WORKSPACE_SCOPE');
    this.directory = join(resolve(directory), digest(workspace));
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
  }
  async exclusive<T>(work: () => Promise<T>): Promise<T> {
    const lock = join(this.directory, 'writer.lock');
    try { mkdirSync(lock); } catch { throw new WorkspaceError('JOURNAL_LOCKED'); }
    try { return await work(); } finally { rmdirSync(lock); }
  }
  read(requestId: string): Entry | undefined {
    try {
      const entry = JSON.parse(readFileSync(join(this.directory, digest(requestId) + '.json'), 'utf8')) as Entry;
      validateEntry(entry, requestId);
      return entry;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw new WorkspaceError('CORRUPT_JOURNAL');
    }
  }
  save(entry: Entry) {
    const target = join(this.directory, digest(entry.result.requestId) + '.json');
    const temp = target + '.' + randomUUID() + '.tmp';
    const fd = openSync(temp, 'wx', 0o600);
    try { writeFileSync(fd, JSON.stringify(entry)); fsyncSync(fd); } finally { closeSync(fd); }
    try { renameSync(temp, target); } catch (error) { unlinkSync(temp); throw error; }
  }
}
