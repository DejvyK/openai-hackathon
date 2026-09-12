import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { configuredIntegrations } from './config/integrations.js';
import { configuredReactive } from './config/reactive.js';
import { configuredSlack } from './config/slack.js';
import { createGoogleCalendarService } from './calendar/index.js';

const mode = process.env.AGENTLAYER_MODE ?? 'demo';
if (mode !== 'demo' && mode !== 'live') throw new Error('AGENTLAYER_MODE must be demo or live.');
const pairingPath = resolve(process.cwd(), '.pairing-token');
let savedToken: string | undefined;
try {
  const candidate = readFileSync(pairingPath, 'utf8').trim();
  if (/^[a-f0-9]{64}$/.test(candidate)) savedToken = candidate;
} catch { /* First launch creates a local pairing token. */ }
const token = process.env.AGENTLAYER_TOKEN || savedToken || randomBytes(32).toString('hex');
if (!process.env.AGENTLAYER_TOKEN) {
  writeFileSync(pairingPath, token, { mode: 0o600 });
}
let closeSessions = () => {};
const calendar = mode === 'live' ? createGoogleCalendarService(process.env) : undefined;
const reactiveRunner = configuredReactive(process.env, mode, calendar);
const app = createApp({ token, mode, env: process.env, integrations: mode === 'live' ? configuredIntegrations(process.env) : {}, reactiveRunner, copilot: reactiveRunner?.inspectCopilot, calendar, slack: configuredSlack(process.env, mode), onShutdown: close => { closeSessions = close; } });
const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 4318 }, () => {
  console.log(`AgentLayer API: http://127.0.0.1:4318 (${mode}). Pairing token: AGENTLAYER_TOKEN or apps/api/.pairing-token.`);
});
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  closeSessions();
  server.close();
  if ('closeAllConnections' in server) server.closeAllConnections();
  const deadline = setTimeout(() => process.exit(0), 5_000);
  deadline.unref();
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
server.once('close', closeSessions);
