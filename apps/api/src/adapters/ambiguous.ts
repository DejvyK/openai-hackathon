import { WorkspaceError, type Kind, type RecordData, type WorkspaceProvider } from '../workspace/model.js';

const paths = { contact: '/api/crm/contacts', task: '/api/tasks', note: '/api/documents' };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function record(value: unknown): RecordData {
  if (!object(value) || typeof value.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value.id)) throw new WorkspaceError('INVALID_PROVIDER_RESPONSE');
  return value as RecordData;
}
export class AmbiguousProvider implements WorkspaceProvider {
  constructor(private apiKey: string, private fetcher: typeof fetch = fetch, private timeoutMs = 15000) {
    if (!apiKey.trim()) throw new WorkspaceError('MISSING_AMBIGUOUS_KEY');
  }
  private async request(path: string, body?: Record<string, unknown>, signal?: AbortSignal, method = body ? 'POST' : 'GET'): Promise<unknown> {
    if (signal?.aborted) throw new WorkspaceError('CANCELLED');
    try {
      const response = await this.fetcher(`https://app.ambiguous.ai${path}`, {
        method, redirect: 'error',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json', 'API-Version': '1' },
        body: body ? JSON.stringify(body) : undefined,
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]) : AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) throw new WorkspaceError(`AMBIGUOUS_HTTP_${response.status}`, !!body && (response.status >= 500 || response.status === 408), response.status === 429);
      return await response.json();
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      throw new WorkspaceError('AMBIGUOUS_TRANSPORT_ERROR', !!body, !body);
    }
  }
  private unwrap(kind: Kind, value: unknown): RecordData {
    return record(kind === 'note' ? value : object(value) ? value[kind] : null);
  }
  async create(kind: Kind, body: Record<string, unknown>, signal?: AbortSignal) {
    // Create accepts only a date string. Clearing a default uses documented PATCH null.
    const payload = { ...body };
    if (kind === 'task' && payload.due_date === null) delete payload.due_date;
    const value = await this.request(paths[kind], payload, signal);
    try { return this.unwrap(kind, value); } catch { throw new WorkspaceError('INVALID_PROVIDER_RESPONSE', true); }
  }
  async clearTaskDueDate(id: string, signal?: AbortSignal) {
    await this.request(`${paths.task}/${encodeURIComponent(id)}`, { due_date: null }, signal, 'PATCH');
  }
  async read(kind: Kind, id: string, signal?: AbortSignal) {
    const result = this.unwrap(kind, await this.request(`${paths[kind]}/${encodeURIComponent(id)}`, undefined, signal));
    if (result.id !== id) throw new WorkspaceError('READ_BACK_ID_MISMATCH');
    return result;
  }
  async contacts(signal?: AbortSignal) {
    const rows: RecordData[] = [];
    let cursor: string | undefined;
    const seen = new Set<string>();
    for (let page = 0; page < 20; page++) {
      const value = await this.request(`${paths.contact}?type=person&limit=500${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, undefined, signal);
      if (!object(value) || !Array.isArray(value.data) || typeof value.has_more !== 'boolean') throw new WorkspaceError('INVALID_PROVIDER_RESPONSE');
      rows.push(...value.data.map(record));
      if (!value.has_more) return rows;
      if (typeof value.next_cursor !== 'string' || !value.next_cursor || seen.has(value.next_cursor)) throw new WorkspaceError('INCOMPLETE_CONTACT_SCAN');
      cursor = value.next_cursor; seen.add(cursor);
    }
    throw new WorkspaceError('CONTACT_SCAN_LIMIT');
  }
}
