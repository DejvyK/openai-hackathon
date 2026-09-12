import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, openSync, closeSync, writeFileSync, fsyncSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SLACK_TEXT_LIMIT, type SlackConnection, type SlackSendResult, type ReviewedSlackMessage } from './index.js';

export interface SlackContextBinding { sessionId: string; contextId: string; revision: number; goalRevision: number; profileUrl: string; userGoal: string }
export interface SlackDestination { teamId: string; teamName: string; channelId: string; channelName: string }
export interface SlackPreview { previewId: string; text: string; binding: SlackContextBinding; destination: SlackDestination; expiresAt: number }
export interface SlackReviewProvider {
  checkConnection(): Promise<SlackConnection>;
  sendReviewed(message: ReviewedSlackMessage, beforePost?: (destination: { teamId: string; channelId: string }) => boolean): Promise<SlackSendResult>;
}
export interface SlackReviewOptions {
  directory: string;
  provider: SlackReviewProvider;
  /** Must reflect server-owned current session state; never echo the request body. */
  getCurrent: (sessionId: string) => SlackContextBinding | null;
  now?: () => number;
  ttlMs?: number;
}
export class SlackReviewError extends Error {
  constructor(readonly code: 'invalid_input' | 'stale_context' | 'preview_not_found' | 'preview_mismatch' | 'expired' | 'connection_unavailable' | 'destination_changed' | 'journal_error') { super(code); }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
function binding(value: SlackContextBinding): SlackContextBinding {
  if (!value || typeof value.sessionId !== 'string' || !value.sessionId || value.sessionId.length > 200 || typeof value.contextId !== 'string' || !value.contextId || value.contextId.length > 200 || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Number.isSafeInteger(value.goalRevision) || value.goalRevision < 0 || typeof value.userGoal !== 'string' || value.userGoal.length > 2000 || typeof value.profileUrl !== 'string') throw new SlackReviewError('invalid_input');
  let url: URL;
  try { url = new URL(value.profileUrl); } catch { throw new SlackReviewError('invalid_input'); }
  if (url.protocol !== 'https:' || !(url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com')) || !/^\/in\/[^/]+\/?$/.test(url.pathname) || url.username || url.password || url.port || value.profileUrl.length > 2048) throw new SlackReviewError('invalid_input');
  return { sessionId: value.sessionId, contextId: value.contextId, revision: value.revision, goalRevision: value.goalRevision, profileUrl: value.profileUrl, userGoal: value.userGoal };
}
function validateText(text: string) {
  if (typeof text !== 'string' || !text.trim() || text.length > SLACK_TEXT_LIMIT || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)) throw new SlackReviewError('invalid_input');
}
const unknown = (sendId: string): SlackSendResult => ({ status: 'unknown', sendId, error: { code: 'provider_error' } });

/** Immutable previews + create-exclusive attempt reservations. Local shared filesystem only. */
export class SlackReviewService {
  private readonly directory: string;
  private readonly now: () => number;
  private readonly ttlMs: number;
  constructor(private readonly options: SlackReviewOptions) {
    this.directory = resolve(options.directory);
    this.now = options.now ?? Date.now;
    this.ttlMs = Number.isFinite(options.ttlMs) ? Math.max(1, Math.min(options.ttlMs!, 30 * 60_000)) : 10 * 60_000;
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
  }
  private current(expected: SlackContextBinding): boolean {
    try { const current = this.options.getCurrent(expected.sessionId); return current !== null && hash(binding(current)) === hash(expected); } catch { return false; }
  }
  private file(id: string, suffix: string): string {
    if (!uuid.test(id)) throw new SlackReviewError('invalid_input');
    return join(this.directory, `${id}.${suffix}.json`);
  }
  private create(file: string, data: unknown): boolean {
    let fd: number;
    try { fd = openSync(file, 'wx', 0o600); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false; throw new SlackReviewError('journal_error'); }
    try { writeFileSync(fd, JSON.stringify(data)); fsyncSync(fd); } catch { throw new SlackReviewError('journal_error'); } finally { closeSync(fd); }
    return true;
  }
  private read(file: string): unknown {
    try { return JSON.parse(readFileSync(file, 'utf8')); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw new SlackReviewError('journal_error'); }
  }
  private preview(id: string): SlackPreview {
    const record = this.read(this.file(id, 'preview')) as { version?: number; preview?: SlackPreview; digest?: string } | undefined;
    if (!record) throw new SlackReviewError('preview_not_found');
    if (record.version !== 1 || !record.preview || record.preview.previewId !== id || hash(record.preview) !== record.digest) throw new SlackReviewError('journal_error');
    try { binding(record.preview.binding); validateText(record.preview.text); } catch { throw new SlackReviewError('journal_error'); }
    if (!Number.isFinite(record.preview.expiresAt) || !record.preview.destination?.teamId || !record.preview.destination.channelId) throw new SlackReviewError('journal_error');
    return record.preview;
  }
  async prepare(input: { binding: SlackContextBinding; text: string }): Promise<SlackPreview> {
    const expected = binding(input.binding);
    validateText(input.text);
    const text = input.text;
    if (!this.current(expected)) throw new SlackReviewError('stale_context');
    const connection = await this.options.provider.checkConnection();
    if (connection.status !== 'ready') throw new SlackReviewError('connection_unavailable');
    if (!this.current(expected)) throw new SlackReviewError('stale_context');
    const preview: SlackPreview = { previewId: randomUUID(), text, binding: expected, destination: { teamId: connection.teamId, teamName: connection.teamName, channelId: connection.channelId, channelName: connection.channelName }, expiresAt: this.now() + this.ttlMs };
    if (!this.create(this.file(preview.previewId, 'preview'), { version: 1, preview, digest: hash(preview) })) throw new SlackReviewError('journal_error');
    return preview;
  }
  async send(input: { previewId: string; binding: SlackContextBinding; text: string; approved: true }): Promise<SlackSendResult> {
    if (input.approved !== true) throw new SlackReviewError('invalid_input');
    const expected = binding(input.binding);
    const preview = this.preview(input.previewId);
    if (hash(expected) !== hash(preview.binding) || input.text !== preview.text) throw new SlackReviewError('preview_mismatch');
    const sendId = preview.previewId;
    // Replay terminal/pending attempts without re-dispatch, even after expiry/navigation.
    const result = this.read(this.file(sendId, 'result')) as { version?: number; digest?: string; result?: SlackSendResult } | undefined;
    if (result) {
      if (result.version !== 1 || !result.result || result.result.sendId !== sendId || !['sent', 'failed', 'unknown'].includes(result.result.status) || hash(result.result) !== result.digest) throw new SlackReviewError('journal_error');
      return result.result;
    }
    if (this.read(this.file(sendId, 'attempt')) !== undefined) return unknown(sendId);
    if (this.now() >= preview.expiresAt) throw new SlackReviewError('expired');
    if (!this.current(expected)) throw new SlackReviewError('stale_context');
    const connection = await this.options.provider.checkConnection();
    if (connection.status !== 'ready') throw new SlackReviewError('connection_unavailable');
    if (connection.teamId !== preview.destination.teamId || connection.channelId !== preview.destination.channelId) throw new SlackReviewError('destination_changed');
    if (!this.current(expected)) throw new SlackReviewError('stale_context');
    if (this.now() >= preview.expiresAt) throw new SlackReviewError('expired');
    if (!this.create(this.file(sendId, 'attempt'), { version: 1, sendId, previewDigest: hash(preview), reservedAt: this.now() })) return unknown(sendId);
    let outcome: SlackSendResult;
    try { outcome = await this.options.provider.sendReviewed({ sendId, text: preview.text }, destination => destination.teamId === preview.destination.teamId && destination.channelId === preview.destination.channelId && this.current(expected) && this.now() < preview.expiresAt); }
    catch { outcome = unknown(sendId); }
    if (outcome.sendId !== sendId) outcome = unknown(sendId);
    // Atomic publish avoids exposing a half-written terminal result to concurrent readers.
    const target = this.file(sendId, 'result');
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      this.create(temporary, { version: 1, result: outcome, digest: hash(outcome) });
      renameSync(temporary, target);
    } catch { return outcome.status === 'sent' ? outcome : unknown(sendId); }
    return outcome;
  }
}
