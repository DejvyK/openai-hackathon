import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';

const mode = process.env.AGENTLAYER_MODE ?? 'demo';
if (mode !== 'demo' && mode !== 'live') throw new Error('AGENTLAYER_MODE must be demo or live.');
const token = process.env.AGENTLAYER_TOKEN || randomBytes(32).toString('hex');
if (!process.env.AGENTLAYER_TOKEN) {
  writeFileSync(resolve(process.cwd(), '.pairing-token'), token, { mode: 0o600 });
}
serve({ fetch: createApp({ token, mode }).fetch, hostname: '127.0.0.1', port: 4318 }, () => {
  console.log(`AgentLayer API: http://127.0.0.1:4318 (${mode}). Pairing token: AGENTLAYER_TOKEN or apps/api/.pairing-token.`);
});
