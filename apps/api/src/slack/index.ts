/** Server-only Slack boundary. Never construct this config from page/model content. */
export interface SlackConfig { token: string; channelId: string; expectedTeamId?: string; timeoutMs?: number }
export type SlackFailureCode = 'invalid_input' | 'not_configured' | 'denied' | 'rate_limited' | 'provider_error' | 'network_error' | 'invalid_response';
export interface SlackFailure { code: SlackFailureCode; retryAfterSeconds?: number }
export type SlackConnection = { status: 'ready'; teamId: string; teamName: string; channelId: string; channelName: string } | { status: 'failed'; error: SlackFailure };
export type SlackSendResult =
  | { status: 'sent'; sendId: string; channelId: string; messageTs: string; permalink: string | null; linkUnavailable: boolean }
  | { status: 'failed' | 'unknown'; sendId: string; error: SlackFailure };
export interface ReviewedSlackMessage { text: string; sendId: string }
export const SLACK_TEXT_LIMIT = 3000;
type Json = Record<string, unknown>;
type ApiResult = { ok: true; data: Json } | { ok: false; uncertain: boolean; error: SlackFailure };
const id = /^[CG][A-Z0-9]{2,63}$/;
const teamIdPattern = /^T[A-Z0-9]{2,63}$/;
const tsPattern = /^\d{1,20}\.\d{1,10}$/;
const denied = new Set(['invalid_auth', 'not_authed', 'token_revoked', 'token_expired', 'account_inactive', 'missing_scope', 'channel_not_found', 'not_in_channel', 'no_permission', 'access_denied', 'is_archived', 'restricted_action', 'restricted_action_read_only_channel']);
const rejected = new Set([...denied, 'invalid_arguments', 'invalid_blocks', 'no_text', 'msg_too_long', 'invalid_metadata_format']);
const object = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const label = (v: unknown): string => typeof v === 'string' ? v.slice(0, 200) : '';

export class SlackProvider {
  private readonly config: SlackConfig;
  private readonly timeoutMs: number;
  constructor(config: SlackConfig, private readonly fetcher: typeof fetch = fetch) {
    this.config = { ...config };
    this.timeoutMs = Number.isFinite(config.timeoutMs) ? Math.min(30_000, Math.max(10, config.timeoutMs!)) : 10_000;
  }
  private configured(): boolean {
    return typeof this.config.token === 'string' && this.config.token.length > 0 && !/\s/.test(this.config.token) && id.test(this.config.channelId) && (!this.config.expectedTeamId || teamIdPattern.test(this.config.expectedTeamId));
  }
  private async call(method: 'auth.test' | 'conversations.info' | 'chat.postMessage' | 'chat.getPermalink', body: Json, writing = false): Promise<ApiResult> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, this.timeoutMs); });
    try {
      return await Promise.race([timeout, (async (): Promise<ApiResult> => {
        const response = await this.fetcher(`https://slack.com/api/${method}`, { method: 'POST', redirect: 'error', signal: controller.signal, headers: { Authorization: `Bearer ${this.config.token}`, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) });
        if (response.status === 429) {
          const raw = response.headers.get('retry-after');
          const seconds = raw && /^\d+$/.test(raw) ? Math.min(Number(raw), 86400) : undefined;
          return { ok: false, uncertain: false, error: { code: 'rate_limited', ...(seconds !== undefined ? { retryAfterSeconds: seconds } : {}) } };
        }
        if (!response.ok) return { ok: false, uncertain: writing && response.status !== 401 && response.status !== 403, error: { code: response.status === 401 || response.status === 403 ? 'denied' : 'provider_error' } };
        const data: unknown = await response.json();
        if (!object(data) || typeof data.ok !== 'boolean') return { ok: false, uncertain: writing, error: { code: 'invalid_response' } };
        if (data.ok !== true) {
          const code = typeof data.error === 'string' ? data.error : '';
          const limited = code === 'rate_limited' || code === 'ratelimited';
          return { ok: false, uncertain: writing && !limited && !rejected.has(code), error: { code: limited ? 'rate_limited' : denied.has(code) ? 'denied' : 'provider_error' } };
        }
        return { ok: true, data };
      })()]);
    } catch { return { ok: false, uncertain: writing, error: { code: 'network_error' } }; }
    finally { clearTimeout(timer); }
  }
  /** Read checks do not prove chat:write permission or future availability. */
  async checkConnection(): Promise<SlackConnection> {
    if (!this.configured()) return { status: 'failed', error: { code: 'not_configured' } };
    const auth = await this.call('auth.test', {});
    if (!auth.ok) return { status: 'failed', error: auth.error };
    if (typeof auth.data.team_id !== 'string' || !teamIdPattern.test(auth.data.team_id)) return { status: 'failed', error: { code: 'invalid_response' } };
    if (this.config.expectedTeamId && auth.data.team_id !== this.config.expectedTeamId) return { status: 'failed', error: { code: 'denied' } };
    const result = await this.call('conversations.info', { channel: this.config.channelId });
    if (!result.ok) return { status: 'failed', error: result.error };
    const channel = result.data.channel;
    if (!object(channel) || channel.id !== this.config.channelId) return { status: 'failed', error: { code: 'invalid_response' } };
    // MVP deliberately requires membership; never joins or broadens public-channel permissions.
    if (channel.is_archived === true || channel.is_member !== true) return { status: 'failed', error: { code: 'denied' } };
    return { status: 'ready', teamId: auth.data.team_id, teamName: label(auth.data.team), channelId: this.config.channelId, channelName: label(channel.name) };
  }
  async getPermalink(messageTs: string): Promise<string | null> {
    if (!this.configured() || !tsPattern.test(messageTs)) return null;
    const result = await this.call('chat.getPermalink', { channel: this.config.channelId, message_ts: messageTs });
    if (!result.ok || typeof result.data.permalink !== 'string') return null;
    try {
      const url = new URL(result.data.permalink);
      return url.protocol === 'https:' && !url.username && !url.password && !url.port && url.hostname.endsWith('.slack.com') && url.pathname.startsWith('/archives/') ? url.href : null;
    } catch { return null; }
  }
  /** Caller must persist sendId + approved text/revisions BEFORE invoking; never retry unknown. */
  async sendReviewed(message: ReviewedSlackMessage, beforePost?: (destination: { teamId: string; channelId: string }) => boolean): Promise<SlackSendResult> {
    const sendId = typeof message.sendId === 'string' ? message.sendId : '';
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(sendId) || typeof message.text !== 'string' || !message.text.trim() || message.text.length > SLACK_TEXT_LIMIT || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(message.text)) return { status: 'failed', sendId, error: { code: 'invalid_input' } };
    const connection = await this.checkConnection();
    if (connection.status === 'failed') return { status: 'failed', sendId, error: connection.error };
    // Escape Slack control characters in notification fallback; visible block preserves reviewed text.
    const fallback = message.text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    // Final synchronous authorization/context check, after all awaited read checks.
    try { if (beforePost && !beforePost(connection)) return { status: 'failed', sendId, error: { code: 'invalid_input' } }; }
    catch { return { status: 'failed', sendId, error: { code: 'invalid_input' } }; }
    const result = await this.call('chat.postMessage', {
      channel: this.config.channelId, text: fallback, mrkdwn: false, parse: 'none', link_names: false,
      unfurl_links: false, unfurl_media: false,
      blocks: [{ type: 'section', text: { type: 'plain_text', text: message.text, emoji: false } }],
    }, true);
    if (!result.ok) return { status: result.uncertain ? 'unknown' : 'failed', sendId, error: result.error };
    if (result.data.channel !== this.config.channelId || typeof result.data.ts !== 'string' || !tsPattern.test(result.data.ts)) return { status: 'unknown', sendId, error: { code: 'invalid_response' } };
    const permalink = await this.getPermalink(result.data.ts);
    return { status: 'sent', sendId, channelId: this.config.channelId, messageTs: result.data.ts, permalink, linkUnavailable: permalink === null };
  }
}
