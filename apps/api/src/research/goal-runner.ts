import { GoalAssessmentSchema, type GoalAssessment, type ReactiveEvent, type ReactiveSnapshotRequest } from '@agentlayer/contracts/reactive-v1';
import type { ReactiveRunner } from '../routes/reactive.js';

export type GoalAssessor = (input: Pick<ReactiveSnapshotRequest, 'snapshot'> & { userGoal: string }, options: { signal: AbortSignal }) => Promise<GoalAssessment>;

export function isLinkedInProfile(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && (parsed.hostname === 'linkedin.com' || parsed.hostname.endsWith('.linkedin.com')) && /^\/in\/[^/]+\/?$/.test(parsed.pathname);
  } catch { return false; }
}

/** Only explicit goals on a supported profile trigger automatic external research. */
export function createGoalReactiveRunner(conversation: ReactiveRunner | undefined, assess?: GoalAssessor): ReactiveRunner {
  return async (request, options) => {
    const { signal, runId, emit } = options;
    if (signal.aborted) return;
    let sequence = 0;
    const publish = (data: Record<string, unknown>) => {
      if (!signal.aborted) emit({ ...data, schemaVersion: 'reactive-v1', sessionId: request.sessionId,
        contextId: request.contextId, revision: request.revision, goalRevision: request.goalRevision ?? 0,
        runId, sequence: sequence++ } as ReactiveEvent);
    };
    if (!request.userGoal?.trim() || request.conversation || !isLinkedInProfile(request.snapshot.url)) {
      if (conversation) return conversation(request, options);
      publish({ type: 'error', error: { code: 'CONVERSATION_UNAVAILABLE', message: 'The page assistant is not configured.', retryable: false, requestId: null, operation: 'research' } });
      return;
    }
    if (!assess) {
      publish({ type: 'error', error: { code: 'GOAL_RESEARCH_UNAVAILABLE', message: 'Profile research needs live Exa and model configuration on the AgentLayer server.', retryable: false, requestId: null, operation: 'research' } });
      return;
    }
    publish({ type: 'progress', message: 'Researching this profile with Exa against your goal…' });
    try {
      const result = await assess({ snapshot: request.snapshot, userGoal: request.userGoal }, { signal });
      if (signal.aborted) return;
      // Raw evidence passages stay server-side; the sidebar gets quoted findings and source metadata.
      const assessment = GoalAssessmentSchema.parse({ ...result,
        sources: result.sources.map(({ id, title, url, retrievedAt }) => ({ id, title, url, retrievedAt })),
      });
      if (assessment.profileUrl !== request.snapshot.url || assessment.userGoal !== request.userGoal) throw new Error('ASSESSMENT_CONTEXT_MISMATCH');
      const headline = assessment.verdict === 'worth_discussing' ? 'There is evidence worth discussing with your team.'
        : assessment.verdict === 'concerns' ? 'The research found concerns relevant to your task.'
        : 'There is not enough verified evidence for a recommendation.';
      const text = [headline, ...assessment.findings.slice(0, 2).map(finding => finding.text),
        ...assessment.unknowns.slice(0, 1).map(unknown => `Still unclear: ${unknown}`)].join(' ');
      publish({ type: 'completed', text, evidenceRefs: assessment.sources.map(source => source.id),
        sources: assessment.sources, assessment, suggestions: conversation ? [
          { id: 'explain', label: 'Explore the evidence', prompt: 'Explain the key evidence and uncertainty for this profile against my task.' },
          { id: 'brief', label: 'Prepare team brief', prompt: 'Prepare a concise sourced team brief for this profile in Slack.' },
        ] : [] });
    } catch {
      publish({ type: 'error', error: { code: 'GOAL_RESEARCH_FAILED', message: 'Profile research could not be verified. No recommendation was produced. Retry after checking the connection.', retryable: true, requestId: null, operation: 'research' } });
    }
  };
}
