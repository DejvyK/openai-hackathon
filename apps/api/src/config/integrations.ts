import { resolve } from 'node:path';
import { ResearchBriefSchema } from '@agentlayer/contracts/v1';
import { createResearcher } from '../adapters/research.js';
import { AmbiguousProvider } from '../adapters/ambiguous.js';
import { FileJournal, WorkspaceActions } from '../workspace/index.js';
import { createWorkspaceCommitter } from '../workspace/v1.js';
import type { IntegrationPorts } from '../routes/actions.js';

/** Only server environment supplies provider credentials, workspace and storage. */
export function configuredIntegrations(env: Record<string, string | undefined>, journalRoot = resolve(process.cwd(), '.agentlayer')): IntegrationPorts {
  const ports: IntegrationPorts = {};
  if (env.OPENAI_API_KEY?.trim() && env.EXA_API_KEY?.trim() && env.OPENAI_MODEL?.trim()) {
    const researcher = createResearcher({ openaiApiKey: env.OPENAI_API_KEY, exaApiKey: env.EXA_API_KEY, model: env.OPENAI_MODEL, limits: { maxDurationMs: 60_000, maxToolCalls: 4 } });
    ports.research = async (context, options) => ResearchBriefSchema.parse(await researcher.research(context, options));
  }
  if (env.AMBIGUOUS_API_KEY?.trim() && env.AMBIGUOUS_WORKSPACE_ID?.trim()) {
    const workspace = new WorkspaceActions(new AmbiguousProvider(env.AMBIGUOUS_API_KEY), new FileJournal(journalRoot, env.AMBIGUOUS_WORKSPACE_ID));
    const committer = createWorkspaceCommitter(workspace);
    ports.commit = (request, options) => committer.commitReviewedAction(request, { workspace: options, signal: options.signal });
    ports.reconcile = (requestId, options) => committer.reconcile(requestId, options);
  }
  return ports;
}
