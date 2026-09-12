import { configuredCodex } from './codex.js';
import { createGoalAssessor } from '../research/goal-assessment.js';
import { createGoalReactiveRunner, type GoalAssessor } from '../research/goal-runner.js';
import { createCopilotReactiveBridge, type CopilotInspection } from '../research/copilot-runtime.js';
import type { ReactiveRunner } from '../routes/reactive.js';
import { configuredWorkspaceConversation } from './workspace-conversation.js';
import type { CalendarToolPort } from '../mcp/runtime-server.js';

export type ConfiguredReactive = ReactiveRunner & { inspectCopilot?: () => Promise<CopilotInspection> };

/** Credentials and live-mode selection are never accepted from a page snapshot. */
export function configuredReactive(env: Record<string, string | undefined>, mode: 'demo' | 'live', calendar?: CalendarToolPort): ConfiguredReactive | undefined {
  const workspace = configuredWorkspaceConversation(env, mode === 'live');
  let assess: GoalAssessor | undefined;
  if (mode === 'live' && env.OPENAI_API_KEY?.trim() && env.EXA_API_KEY?.trim() && env.OPENAI_MODEL?.trim()) {
    const assessor = createGoalAssessor({ openaiApiKey: env.OPENAI_API_KEY, exaApiKey: env.EXA_API_KEY,
      model: env.OPENAI_MODEL, limits: { maxDurationMs: 45_000, maxToolCalls: 2 } });
    assess = (input, options) => assessor.assess(input, options);
  }
  const conversation = configuredCodex(env, mode === 'live', workspace?.factory, assess, mode === 'live' ? calendar : undefined);
  if (!conversation && !assess) return undefined;
  // Native MCP is the default agent tool path. Keep the old bounded runner only
  // for an explicit rollback; missing Codex must not silently change orchestration.
  if (env.AGENTLAYER_MCP_ENABLED !== '0' && !conversation) return undefined;
  const goalRunner = env.AGENTLAYER_MCP_ENABLED !== '0' ? conversation! : createGoalReactiveRunner(conversation, assess);
  const core = workspace ? workspace.wrap(goalRunner) : goalRunner;
  if (env.COPILOTKIT_ENABLED === '0') return core;
  const bridge = createCopilotReactiveBridge(core, { apiKey: env.COPILOTKIT_API_KEY?.trim() || undefined });
  return Object.assign(bridge.runner, { inspectCopilot: bridge.inspect, invalidateSession: workspace?.invalidate });
}
