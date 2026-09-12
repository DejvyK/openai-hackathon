import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm, readdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { CalendarEventInputSchema, type CalendarEventInput } from '@agentlayer/contracts/calendar-v1';

export const GOOGLE_CALENDAR_REDIRECT_URI = 'http://127.0.0.1:4318/oauth/google-calendar/callback';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events.owned';
const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
type Tokens = { accessToken: string; refreshToken: string; expiresAt: number; connectionId: string; clientHash: string };
type Operation = { hash: string; eventId: string; dispatched: boolean };
export class GoogleCalendarError extends Error {
  constructor(public readonly code: string, public readonly uncertain = false, public readonly retryable = false, public readonly eventId?: string) { super(code); }
}
export type CalendarEventResult = { status: 'created' | 'reused'; id: string; url: string };

function timestamp(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) throw new GoogleCalendarError('calendar_invalid_datetime');
  const [, year, month, day, hour, minute, second, offset] = match;
  const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  if (Number(year) < 1000 || Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > days || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 || (offset !== 'Z' && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4)) > 59))) throw new GoogleCalendarError('calendar_invalid_datetime');
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new GoogleCalendarError('calendar_invalid_datetime');
  return parsed;
}
export function validateCalendarEvent(input: unknown): CalendarEventInput {
  const parsed = CalendarEventInputSchema.safeParse(input);
  if (!parsed.success) throw new GoogleCalendarError('calendar_invalid_event');
  const event = parsed.data;
  const start = timestamp(event.start), end = timestamp(event.end);
  if (end <= start) throw new GoogleCalendarError('calendar_invalid_interval');
  try {
    const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: event.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    for (const value of [event.start, event.end]) {
      const parts = Object.fromEntries(formatter.formatToParts(new Date(value)).map(part => [part.type, part.value]));
      if (`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}` !== value.slice(0, 19)) throw new Error('offset');
    }
  } catch { throw new GoogleCalendarError('calendar_invalid_timezone_or_offset'); }
  return event;
}

/** Single local-user connection. All filesystem paths and Google URLs are server-owned. */
export function createGoogleCalendarService(env: Record<string, string | undefined>, directory = resolve('.agentlayer/google-calendar')) {
  const clientId = env.GOOGLE_CALENDAR_CLIENT_ID?.trim(), clientSecret = env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
  const configured = Boolean(clientId && clientSecret);
  const tokenPath = join(directory, 'tokens.json');
  const requireConfigured = () => { if (!configured) throw new GoogleCalendarError('calendar_not_configured'); };
  async function read<T>(path: string): Promise<T | null> {
    try { return JSON.parse(await readFile(path, 'utf8')) as T; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw new GoogleCalendarError('calendar_storage_unavailable'); }
  }
  async function save(path: string, value: unknown) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temp = `${path}.${randomUUID()}.tmp`;
    try { await writeFile(temp, JSON.stringify(value), { mode: 0o600, flag: 'wx' }); await rename(temp, path); }
    finally { await rm(temp, { force: true }).catch(() => {}); }
  }
  // Serialize mutation/refresh with a cross-process lock; abandoned locks fail closed.
  async function exclusive<T>(work: () => Promise<T>): Promise<T> {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const lock = join(directory, 'writer.lock');
    try { await mkdir(lock); } catch { throw new GoogleCalendarError('calendar_busy', false, true); }
    try { return await work(); } finally { await rm(lock, { recursive: true, force: true }); }
  }
  async function request(url: string, init: RequestInit, uncertain = false): Promise<Response> {
    try { return await fetch(url, { ...init, redirect: 'error', signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) }); }
    catch { throw new GoogleCalendarError('calendar_network_error', uncertain, true); }
  }
  async function exchange(fields: Record<string, string>) {
    const response = await request('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId!, client_secret: clientSecret!, ...fields }) });
    if (!response.ok) throw new GoogleCalendarError(response.status === 400 ? 'calendar_reconnect_required' : 'calendar_token_exchange_failed', false, response.status >= 500);
    let body: Record<string, unknown>;
    try { body = await response.json() as Record<string, unknown>; } catch { throw new GoogleCalendarError('calendar_invalid_token_response'); }
    if (typeof body.access_token !== 'string' || typeof body.expires_in !== 'number' || body.expires_in <= 0) throw new GoogleCalendarError('calendar_invalid_token_response');
    return body as { access_token: string; expires_in: number; refresh_token?: string; scope?: string };
  }
  async function tokens(): Promise<Tokens> {
    requireConfigured();
    const saved = await read<Tokens>(tokenPath);
    if (!saved?.refreshToken || !saved.connectionId || saved.clientHash !== hash(clientId!)) throw new GoogleCalendarError('calendar_not_connected');
    if (saved.expiresAt > Date.now() + 60_000) return saved;
    try {
      const refreshed = await exchange({ grant_type: 'refresh_token', refresh_token: saved.refreshToken });
      const next = { ...saved, accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token ?? saved.refreshToken, expiresAt: Date.now() + refreshed.expires_in * 1000 };
      await save(tokenPath, next); return next;
    } catch (error) {
      if (error instanceof GoogleCalendarError && error.code === 'calendar_reconnect_required') await rm(tokenPath, { force: true });
      throw error;
    }
  }
  return {
    status() {
      let saved: Tokens | null = null;
      try { if (configured) saved = JSON.parse(readFileSync(tokenPath, 'utf8')) as Tokens; }
      catch { /* Missing or unreadable credentials never imply connected. */ }
      return { configured, connected: Boolean(saved?.refreshToken && saved.connectionId && saved.clientHash === hash(clientId ?? '')) };
    },
    async beginConnect() {
      requireConfigured();
      const state = randomBytes(32).toString('base64url'), verifier = randomBytes(48).toString('base64url');
      await exclusive(() => save(join(directory, `oauth-${hash(state)}.json`), { verifier, expiresAt: Date.now() + 10 * 60_000, clientHash: hash(clientId!) }));
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({ client_id: clientId!, redirect_uri: GOOGLE_CALENDAR_REDIRECT_URI, response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent', state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
      return { authorizationUrl: url.toString() };
    },
    async completeConnect(code: string, state: string) {
      requireConfigured();
      if (!code || code.length > 4096 || !/^[A-Za-z0-9_-]{43}$/.test(state)) throw new GoogleCalendarError('calendar_invalid_oauth_state');
      return exclusive(async () => {
        const path = join(directory, `oauth-${hash(state)}.json`);
        const pending = await read<{ verifier: string; expiresAt: number; clientHash: string }>(path);
        if (!pending) throw new GoogleCalendarError('calendar_invalid_oauth_state');
        await rm(path); // Consume before token exchange, including failed exchanges.
        if (pending.expiresAt < Date.now() || pending.clientHash !== hash(clientId!)) throw new GoogleCalendarError('calendar_invalid_oauth_state');
        const result = await exchange({ code, code_verifier: pending.verifier, grant_type: 'authorization_code', redirect_uri: GOOGLE_CALENDAR_REDIRECT_URI });
        if (!result.refresh_token || (result.scope && !result.scope.split(' ').includes(SCOPE))) throw new GoogleCalendarError('calendar_required_access_missing');
        await save(tokenPath, { accessToken: result.access_token, refreshToken: result.refresh_token, expiresAt: Date.now() + result.expires_in * 1000, connectionId: randomUUID(), clientHash: hash(clientId!) } satisfies Tokens);
        return { configured, connected: true };
      });
    },
    async disconnect() {
      return exclusive(async () => {
        const saved = await read<Tokens>(tokenPath);
        // Local unlink always succeeds independently of Google's revocation availability.
        await rm(tokenPath, { force: true });
        for (const filename of await readdir(directory)) {
          if (/^oauth-[a-f0-9]{64}\.json$/.test(filename)) await rm(join(directory, filename), { force: true });
        }
        if (saved?.refreshToken) await request('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: saved.refreshToken }) }).catch(() => {});
        return { configured, connected: false };
      });
    },
    async createEvent(input: CalendarEventInput, options: { requestId: string; sourceUrl: string; signal?: AbortSignal }): Promise<CalendarEventResult> {
      const event = validateCalendarEvent(input);
      if (!options.requestId || options.requestId.length > 200) throw new GoogleCalendarError('calendar_invalid_request_id');
      let source: URL;
      try { source = new URL(options.sourceUrl); if (!['http:', 'https:'].includes(source.protocol) || source.username || source.password) throw new Error(); }
      catch { throw new GoogleCalendarError('calendar_invalid_source'); }
      return exclusive(async () => {
        options.signal?.throwIfAborted();
        const auth = await tokens();
        const eventId = `al${hash(`${auth.connectionId}:${options.requestId}`)}`;
        const description = `${event.description}\n\nSource: ${source.href}`.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
        const body = { id: eventId, summary: event.title, description, ...(event.location ? { location: event.location } : {}), start: { dateTime: event.start, timeZone: event.timeZone }, end: { dateTime: event.end, timeZone: event.timeZone }, extendedProperties: { private: { agentlayerRequest: hash(options.requestId) } } };
        const payloadHash = hash(JSON.stringify(body)), path = join(directory, `event-${hash(options.requestId)}.json`);
        const existing = await read<Operation>(path);
        if (existing && (existing.hash !== payloadHash || existing.eventId !== eventId)) throw new GoogleCalendarError('calendar_request_conflict');
        const operation = existing ?? { hash: payloadHash, eventId, dispatched: false };
        const headers = { Authorization: `Bearer ${auth.accessToken}`, 'Content-Type': 'application/json' };
        const get = async () => {
          try { return await request(`${API}/${eventId}`, { headers, signal: options.signal }, operation.dispatched); }
          catch { throw new GoogleCalendarError('calendar_readback_unavailable', operation.dispatched, true, eventId); }
        };
        let response = await get();
        let created = false;
        if (response.status === 404 && !operation.dispatched) {
          options.signal?.throwIfAborted();
          operation.dispatched = true;
          await save(path, operation);
          let inserted: Response;
          try { inserted = await request(`${API}?sendUpdates=none`, { method: 'POST', headers, body: JSON.stringify(body), signal: options.signal }, true); }
          catch { throw new GoogleCalendarError('calendar_network_error', true, true, eventId); }
          if (!inserted.ok && inserted.status !== 409) {
            const uncertain = inserted.status >= 500 || inserted.status === 408;
            if (!uncertain) { operation.dispatched = false; await save(path, operation); }
            throw new GoogleCalendarError('calendar_create_failed', uncertain, inserted.status === 429 || uncertain, eventId);
          }
          created = inserted.ok;
          response = await get();
        }
        if (!response.ok) throw new GoogleCalendarError(response.status === 401 ? 'calendar_reconnect_required' : 'calendar_readback_unavailable', operation.dispatched || created, true, eventId);
        let actual: Record<string, any>;
        try { actual = await response.json() as Record<string, any>; }
        catch { throw new GoogleCalendarError('calendar_readback_unavailable', operation.dispatched, true, eventId); }
        if (actual.id !== eventId || actual.status === 'cancelled' || actual.summary !== body.summary || actual.description !== body.description || (actual.location ?? '') !== (body.location ?? '') || Date.parse(actual.start?.dateTime) !== Date.parse(event.start) || Date.parse(actual.end?.dateTime) !== Date.parse(event.end) || actual.start?.timeZone !== event.timeZone || actual.end?.timeZone !== event.timeZone || actual.extendedProperties?.private?.agentlayerRequest !== hash(options.requestId) || (actual.attendees?.length ?? 0) > 0) throw new GoogleCalendarError('calendar_readback_mismatch', true, false, eventId);
        let url: URL;
        try { url = new URL(actual.htmlLink); if (url.protocol !== 'https:' || !['www.google.com', 'calendar.google.com'].includes(url.hostname)) throw new Error(); }
        catch { throw new GoogleCalendarError('calendar_invalid_event_link', true, false, eventId); }
        await save(path, { ...operation, dispatched: true });
        return { status: created ? 'created' : 'reused', id: eventId, url: url.href };
      });
    },
  };
}
export type GoogleCalendarService = ReturnType<typeof createGoogleCalendarService>;
