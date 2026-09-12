import { timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { connectionStatus } from './config/readiness.js';
import { createActionRoutes, type IntegrationPorts } from './routes/actions.js';
import { LIMITS } from '@agentlayer/contracts/v1';
import { apiError } from './routes/errors.js';
import { ReactiveSessions, type ReactiveRunner } from './routes/reactive.js';
import { ReactiveSnapshotRequestSchema, ReactiveControlRequestSchema } from '@agentlayer/contracts/reactive-v1';
import { SlackReviewService, type SlackReviewOptions } from './slack/review.js';
import { createSlackRoutes } from './routes/slack.js';
import type { CopilotInspection } from './research/copilot-runtime.js';
import type { GoogleCalendarService } from './calendar/index.js';
import { createCalendarRoutes } from './routes/calendar.js';

export interface AppOptions { token: string; mode: 'demo' | 'live'; env?: Record<string, string | undefined>; integrations?: IntegrationPorts; reactiveRunner?: ReactiveRunner; copilot?: () => Promise<CopilotInspection>; calendar?: GoogleCalendarService; slack?: Pick<SlackReviewOptions, 'directory' | 'provider'>; onShutdown?: (close: () => void) => void }

function matchesToken(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createApp({ token, mode, env = {}, integrations, reactiveRunner, copilot, calendar, slack, onShutdown }: AppOptions) {
  if (!token) throw new Error('Pairing token must not be empty.');
  const app = new Hono();
  const actions = createActionRoutes(mode, integrations);
  const reactive = reactiveRunner ? new ReactiveSessions(reactiveRunner) : null;
  const slackReview = mode === 'live' && slack && reactive ? new SlackReviewService({ ...slack, getCurrent: sessionId => reactive.currentContext(sessionId) }) : null;
  onShutdown?.(() => reactive?.close());
  app.onError(() => apiError('INTERNAL_ERROR', 'Unexpected server error.', 500));
  app.notFound((c) => apiError('NOT_FOUND', 'Not found.', 404));
  app.get('/', (c) => c.redirect('/demo'));
  app.get('/ready', (c) => c.json({ status: 'ready', scope: 'local-api', mode, protocol: 'v1', reactive: { status: reactive ? 'configured' : 'unavailable', inferenceVerified: false } }));
  app.get('/demo', (c) => c.html(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>AgentLayer demo profile</title>
<style>body{font:18px system-ui;max-width:760px;margin:80px auto;padding:24px;color:#172033;background:#f4f6fa}article{background:white;border:1px solid #dae0eb;padding:36px;border-radius:20px}p{line-height:1.6}.label{color:#895700;font-weight:700}</style></head>
<body><p class="label">AgentLayer test fixture — fictional person, local extraction check</p>
<main><article data-agentlayer-profile><h1 data-agentlayer-name>Alex Morgan</h1>
<p data-agentlayer-role>Founder at <span data-agentlayer-company>Example Studio</span></p>
<p>We help small teams organize customer research. Select this text or activate AgentLayer to try the local demo.</p></article></main>
<p>This is a local test page. Workspace research and saving are disabled in demo mode. If configured, Codex can still analyze this page.</p></body></html>`));
  app.use('/api/*', async (c, next) => {
    if (!matchesToken(c.req.header('Authorization') ?? '', `Bearer ${token}`)) {
      return apiError('UNAUTHORIZED', 'Invalid or missing pairing token.', 401);
    }
    await next();
  });
  app.use('/api/*', bodyLimit({ maxSize: LIMITS.bodyBytes, onError: () => apiError('PAYLOAD_TOO_LARGE', 'Request exceeds 64 KB.', 413) }));
  app.use('/api/*', async (c, next) => {
    if (!['GET', 'HEAD'].includes(c.req.method) && !c.req.header('Content-Type')?.toLowerCase().startsWith('application/json')) {
      return apiError('UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json.', 415);
    }
    await next();
  });
  app.get('/api/settings/connection', (c) => c.json(connectionStatus(mode, env)));
  app.route('/', createCalendarRoutes(mode === 'live' ? calendar : undefined));
  app.get('/api/settings/copilot', async c => copilot ? c.json(await copilot()) : c.json({ mode: 'disabled', credentialStatus: 'not_configured', agents: [] }));
  for (const action of ['snapshots', 'control'] as const) app.post(`/api/reactive/${action}`, async c => {
    if (!reactive) return apiError('REACTIVE_UNAVAILABLE', 'Page analysis runtime is not configured.', 503, 'research');
    let body: unknown;
    try { body = await c.req.json(); } catch { return apiError('INVALID_JSON', 'Invalid JSON.', 400, 'research'); }
    const parsed = (action === 'snapshots' ? ReactiveSnapshotRequestSchema : ReactiveControlRequestSchema).safeParse(body);
    if (!parsed.success) return apiError('INVALID_REACTIVE_REQUEST', 'Invalid page analysis request.', 400, 'research');
    try { return c.json(action === 'snapshots' ? reactive.snapshot(parsed.data) : reactive.control(parsed.data)); }
    catch (error) {
      const code = error instanceof Error && ['SESSION_LIMIT', 'SESSION_NOT_FOUND', 'STALE_CONTROL'].includes(error.message) ? error.message : 'REACTIVE_REQUEST_FAILED';
      return apiError(code, 'Page analysis request could not be accepted.', code === 'SESSION_LIMIT' ? 429 : 409, 'research');
    }
  });
  app.get('/api/reactive/sessions/:sessionId/events', c => {
    if (!reactive) return apiError('REACTIVE_UNAVAILABLE', 'Page analysis runtime is not configured.', 503, 'research');
    const sessionId = c.req.param('sessionId');
    try { reactive.assertCanSubscribe(sessionId); } catch (error) {
      if (error instanceof Error && error.message === 'STREAM_LIMIT') return apiError('STREAM_LIMIT', 'This session already has an active event stream. Close it before reconnecting.', 409, 'research', true);
      return apiError('SESSION_NOT_FOUND', 'Page analysis session was not found.', 404, 'research');
    }
    const encoder = new TextEncoder();
    let cleanup = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        let unsubscribe = () => {};
        let timer: ReturnType<typeof setTimeout>;
        const close = () => { if (closed) return; closed = true; clearTimeout(timer); unsubscribe(); c.req.raw.signal.removeEventListener('abort', close); try { controller.close(); } catch { /* Reader cancellation already closed the stream. */ } };
        cleanup = close;
        timer = setTimeout(close, 60_000); timer.unref();
        c.req.raw.signal.addEventListener('abort', close, { once: true });
        if (c.req.raw.signal.aborted) { close(); return; }
        try {
          unsubscribe = reactive.subscribe(sessionId, event => {
            if (closed) return;
            if ((controller.desiredSize ?? 0) <= 0) { close(); return; }
            controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
          });
          if (closed) unsubscribe();
        } catch { close(); }
      },
      cancel() { cleanup(); },
    }, { highWaterMark: 256 });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
  });
  app.route('/api/slack', createSlackRoutes(slackReview));
  app.post('/api/actions/commit', async (c) => {
    let body: unknown;
    try { body = await c.req.json(); } catch { return apiError('INVALID_JSON', 'Invalid JSON.', 400, 'commit'); }
    return actions.commit(body, c.req.raw.signal);
  });
  app.get('/api/actions/:requestId', (c) => actions.reconcile(c.req.param('requestId'), c.req.raw.signal));
  app.post('/api/research', async (c) => {
    let body: unknown;
    try { body = await c.req.json(); } catch { return apiError('INVALID_JSON', 'Invalid JSON.', 400, 'research'); }
    return actions.research(body, c.req.raw.signal);
  });
  return app;
}
