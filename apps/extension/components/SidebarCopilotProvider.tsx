import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AbstractAgent } from '@ag-ui/client';
import { CopilotKitAgentIdContext, CopilotKitContext, CopilotKitCoreReact } from '@copilotkit/react-core/v2/context';

/** Headless SDK provider: no global chat CSS, markdown fonts, inspector or extra network client. */
export function SidebarCopilotProvider({ agent, children }: { agent: AbstractAgent; children: ReactNode }) {
  // This is the SDK's local-agent registry used by its selfManagedAgents provider.
  // The agent delegates all model traffic to our authenticated extension background.
  const [copilotkit] = useState(() => new CopilotKitCoreReact({ agents__unsafe_dev_only: { default: agent } }));
  const [executingToolCallIds, setExecuting] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const subscription = copilotkit.subscribe({
      onToolExecutionStart: ({ toolCallId }) => setExecuting(previous => new Set([...previous, toolCallId])),
      onToolExecutionEnd: ({ toolCallId }) => setExecuting(previous => { const next = new Set(previous); next.delete(toolCallId); return next; }),
    });
    return () => { subscription.unsubscribe(); agent.abortRun(); };
  }, [copilotkit, agent]);
  const value = useMemo(() => ({ copilotkit, executingToolCallIds }), [copilotkit, executingToolCallIds]);
  return <CopilotKitAgentIdContext.Provider value="default"><CopilotKitContext.Provider value={value}>{children}</CopilotKitContext.Provider></CopilotKitAgentIdContext.Provider>;
}
