import { WorkspaceError, type ReviewedAction, type Kind } from './model.js';
function text(v: unknown, max: number, empty = false): string {
  if (typeof v !== 'string' || (!empty && !v.trim()) || v.length > max) throw new WorkspaceError('INVALID_REVIEWED_PAYLOAD');
  return v;
}
export function profileKey(v: unknown): string {
  const u = new URL(text(v, 4096));
  if (u.protocol !== 'https:' && u.protocol !== 'http:' || u.username || u.password) throw new WorkspaceError('INVALID_SOURCE_URL');
  // Only the supported LinkedIn /in/<slug> adapter establishes path-based identity.
  // Other sites may identify different people by query or hash routes.
  if ((u.hostname === 'linkedin.com' || u.hostname.endsWith('.linkedin.com')) && /^\/in\/[^/]+\/?$/.test(u.pathname)) {
    u.hash = ''; u.search = ''; u.pathname = u.pathname.replace(/\/+$/, '');
  }
  return u.href;
}
// Literal Markdown escaping prevents page text from introducing links/images/HTML.
const literal = (v: string) => v.replace(/[\\`*_{}\[\]()<>#+.!|~-]/g, '\\$&');
function taskBody(task: NonNullable<ReviewedAction['reviewedPayload']['task']>, evidence: string) {
  if (task.dueAt != null && (!/^\d{4}-\d{2}-\d{2}$/.test(task.dueAt) || !Number.isFinite(Date.parse(task.dueAt)) || new Date(task.dueAt).toISOString().slice(0, 10) !== task.dueAt)) throw new WorkspaceError('INVALID_DUE_DATE');
  if (task.contactId != null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(task.contactId)) throw new WorkspaceError('INVALID_CONTACT_ID');
  return { title: text(task.title, 255), description: literal(text(task.description, 15000, true)) + evidence, due_date: task.dueAt ?? null,
    ...(task.contactId ? { contact_id: task.contactId } : {}) };
}
export function mapReviewedAction(request: ReviewedAction): Partial<Record<Kind, Record<string, unknown>>> {
  text(request.requestId, 200); text(request.contextId, 200); text(request.proposalId, 200);
  const p = request.reviewedPayload;
  profileKey(p.sourceUrl);
  if (!Array.isArray(p.sources) || p.sources.length > 20) throw new WorkspaceError('INVALID_SOURCES');
  const evidence = `\n\nSource: ${literal(p.sourceUrl)}\n` + p.sources.map(s => { profileKey(s.url); return `${literal(text(s.title, 500, true))}: ${literal(s.url)}`; }).join('\n');
  if (request.actionKind === 'create_task') {
    if (!p.task || p.person || p.note) throw new WorkspaceError('INVALID_REVIEWED_PAYLOAD');
    return { task: taskBody(p.task, evidence) };
  }
  if (request.actionKind === 'contact_followup' || request.actionKind === 'create_contact') {
    if (!p.person || p.note || (request.actionKind === 'contact_followup' ? !p.task : !!p.task)) throw new WorkspaceError('INVALID_REVIEWED_PAYLOAD');
    const person = p.person;
    const profileUrl = profileKey(person.profileUrl);
    if (profileUrl !== profileKey(p.sourceUrl)) throw new WorkspaceError('PROFILE_SOURCE_MISMATCH');
    if (person.role !== null) text(person.role, 200, true);
    if (person.company !== null) text(person.company, 200, true);
    return {
      contact: { type: 'person', name: text(person.name, 200), title: person.role, website: profileUrl, custom_properties: { agentlayer_profile_url: profileUrl, agentlayer_company: person.company } },
      ...(p.task ? { task: taskBody(p.task, evidence) } : {}),
    };
  }
  if (request.actionKind !== 'research_note' || !p.note || p.person || p.task) throw new WorkspaceError('INVALID_REVIEWED_PAYLOAD');
  return { note: { type: 'doc', title: text(p.note.title, 255), content: JSON.stringify({ type: 'doc', content: (text(p.note.content, 15000, true) + (text(p.note.selection, 10000, true) ? '\n\nSelection:\n' + p.note.selection : '') + '\n\nSource: ' + p.sourceUrl + '\n' + p.sources.map(s => s.title + ': ' + s.url).join('\n')).split('\n').map(line => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] })) }) } };
}
