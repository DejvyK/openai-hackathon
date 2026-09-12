import { resolve } from 'node:path';
import { SlackProvider } from '../slack/index.js';

export function configuredSlack(env: Record<string, string | undefined>, mode: 'demo' | 'live') {
  if (mode !== 'live' || !env.SLACK_BOT_TOKEN?.trim() || !env.SLACK_CHANNEL_ID?.trim() || !env.SLACK_TEAM_ID?.trim()) return undefined;
  return { directory: resolve(process.cwd(), '.agentlayer', 'slack'), provider: new SlackProvider({
    token: env.SLACK_BOT_TOKEN, channelId: env.SLACK_CHANNEL_ID.trim(), expectedTeamId: env.SLACK_TEAM_ID.trim(),
  }) };
}
