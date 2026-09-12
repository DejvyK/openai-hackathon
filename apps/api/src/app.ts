import { randomUUID, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import {
  ResearchRequestSchema,
  CreateTaskRequestSchema,
  type ResearchBrief,
  type TaskResult,
} from '@agentlayer/contracts';

export interface AppOptions { token: string; mode: 'demo' | 'live' }

function matchesToken(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createApp({ token, mode }: AppOptions) {
  if (!token) throw new Error('Pairing token must not be empty.');
  const app = new Hono();
  const tasks = new Map<string, { fingerprint: string; result: TaskResult }>();
  app.onError(() => Response.json({ error: 'Unexpected server error.' }, { status: 500 }));
  app.notFound((c) => c.json({ error: 'Not found.' }, 404));
  app.get('/ready', (c) => c.json({ status: 'ready', scope: 'scaffold', mode, integrations: 'not-implemented' }));
  app.get('/demo', (c) => c.html(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>AgentLayer demo profile</title>
<style>body{font:18px system-ui;max-width:760px;margin:80px auto;padding:24px;color:#172033;background:#f4f6fa}article{background:white;border:1px solid #dae0eb;padding:36px;border-radius:20px}p{line-height:1.6}.label{color:#895700;font-weight:700}</style></head>
<body><p class="label">AgentLayer test fixture — fictional person, simulated workflow</p>
<main><article data-agentlayer-profile><h1 data-agentlayer-name>Alex Morgan</h1>
<p data-agentlayer-role>Founder at <span data-agentlayer-company>Example Studio</span></p>
<p>We help small teams organize customer research. Select this text or activate AgentLayer to try the local demo.</p></article></main>
<p>This is a local test page. Research and saved tasks are demo data, not Exa or Ambiguous AI results.</p></body></html>`));
  app.use('/api/*', async (c, next) => {
    if (!matchesToken(c.req.header('Authorization') ?? '', `Bearer ${token}`)) {
      return c.json({ error: 'Invalid or missing pairing token.' }, 401);
    }
    await next();
  });
  app.use('/api/*', bodyLimit({ maxSize: 32 * 1024, onError: (c) => c.json({ error: 'Request exceeds 32 KB.' }, 413) }));
  app.use('/api/*', async (c, next) => {
    if (!c.req.header('Content-Type')?.toLowerCase().startsWith('application/json')) {
      return c.json({ error: 'Content-Type must be application/json.' }, 415);
    }
    await next();
  });
  app.post('/api/research', async (c) => {
    let body: unknown;
    try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON.' }, 400); }
    const parsed = ResearchRequestSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'Invalid page context.' }, 400);
    if (mode === 'live') return c.json({ error: 'Live OpenAI and Exa integration is not implemented.' }, 501);
    const { context } = parsed.data;
    const brief: ResearchBrief = {
      mode: 'demo',
      contextId: context.contextId,
      summary: `DEMO: Prepared from the supplied page context for ${context.name || context.title}. No external research was performed.`,
      sources: [{ title: 'Supplied page (not independently verified)', url: context.url }],
      task: {
        title: `DEMO: Follow up with ${context.name || context.title}`,
        description: `Draft suggestion: review ${context.name || context.title}${context.company ? ` at ${context.company}` : ''} and decide whether a follow-up is relevant.\nSource: ${context.url}\nNo externally verified facts.`,
      },
    };
    return c.json(brief);
  });
  app.post('/api/tasks', async (c) => {
    let body: unknown;
    try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON.' }, 400); }
    const parsed = CreateTaskRequestSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'Invalid task proposal.' }, 400);
    if (mode === 'live') return c.json({ error: 'Live Ambiguous AI integration is not implemented.' }, 501);
    const task = parsed.data;
    const fingerprint = JSON.stringify([task.contextId, task.title, task.description]);
    const previous = tasks.get(task.requestId);
    if (previous) {
      if (previous.fingerprint !== fingerprint) return c.json({ error: 'Request ID already belongs to a different task.' }, 409);
      return c.json(previous.result);
    }
    if (tasks.size >= 1000) return c.json({ error: 'Demo session task limit reached. Restart the backend to reset.' }, 429);
    const result: TaskResult = { mode: 'demo', id: `demo-${randomUUID()}`, title: task.title, url: null, status: 'created' };
    tasks.set(task.requestId, { fingerprint, result });
    return c.json(result, 201);
  });
  return app;
}
