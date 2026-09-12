import { AbstractAgent } from '@ag-ui/client';
import { EventType, type BaseEvent, type RunAgentInput } from '@ag-ui/core';
import { Observable } from 'rxjs';
import { z } from 'zod';
import type { ReactiveView } from './reactive-state';
import { PAGE_CONTEXT_DESCRIPTION, SidebarContextSchema } from './sidebar-context';

/** Self-managed AG-UI transport: keeps pairing/HTTP in the extension background. */
export class SidebarAgentBridge {
  readonly agent = new SidebarAgent(this);
  send: (message: unknown) => void = () => { throw new Error('AgentLayer is disconnected.'); };
  view?: ReactiveView;
  refreshContext?: (context: z.infer<typeof SidebarContextSchema>) => z.infer<typeof SidebarContextSchema>;
  private listeners = new Set<(view: ReactiveView) => void>();
  publish(view: ReactiveView) { this.view = view; for (const listener of this.listeners) listener(view); }
  subscribe(listener: (view: ReactiveView) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  disconnect() { if (this.view) this.publish({ ...this.view, status: 'error', message: 'AgentLayer connection interrupted.' }); }
}

class SidebarAgent extends AbstractAgent {
  constructor(private readonly bridge: SidebarAgentBridge) { super({ agentId: 'default', description: 'AgentLayer page conversation through the authenticated extension background.' }); }
  override clone() { return new SidebarAgent(this.bridge); }
  run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable(observer => {
      const previous = this.bridge.view?.transcript.at(-1)?.id;
      let context: z.infer<typeof SidebarContextSchema>;
      try {
        const entry = input.context.find(item => item.description === PAGE_CONTEXT_DESCRIPTION);
        context = SidebarContextSchema.parse(JSON.parse(entry?.value ?? 'null'));
        if (this.bridge.refreshContext) context = SidebarContextSchema.parse(this.bridge.refreshContext(context));
      } catch { observer.error(new Error('The current page context is not ready. Wait for the page to finish reading.')); return; }
      const message = input.messages.filter(item => item.role === 'user').at(-1);
      if (!message || typeof message.content !== 'string' || !message.content.trim() || message.content.length > 2000) {
        observer.error(new Error('Write a message within 2,000 characters.')); return;
      }
      const userText = message.content.trim();
      observer.next({ type: EventType.RUN_STARTED, threadId: input.threadId, runId: input.runId });
      const unsubscribe = this.bridge.subscribe(view => {
        if (view.paused || ['error', 'empty'].includes(view.status) || (view.sourceUrl && view.sourceUrl !== context.snapshot.url)
          || ((view.goalRevision ?? 0) !== context.goalRevision && !(context.userGoal === '' && view.userGoal === userText && view.goalRevision === context.goalRevision + 1))) {
          observer.error(new Error('The page, goal or connection changed. Review the current context.')); return;
        }
        const reply = view.transcript.at(-1);
        if (view.status !== 'completed' || reply?.role !== 'assistant' || reply.id === previous) return;
        const messageId = `${input.runId}-reply`;
        observer.next({ type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' });
        if (reply.text) observer.next({ type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: reply.text });
        observer.next({ type: EventType.TEXT_MESSAGE_END, messageId });
        observer.next({ type: EventType.RUN_FINISHED, threadId: input.threadId, runId: input.runId });
        observer.complete();
      });
      const timer = setTimeout(() => observer.error(new Error('The page agent timed out.')), 70000);
      try { this.bridge.send({ type: 'conversation', userMessage: userText, context }); }
      catch (error) { observer.error(error); }
      return () => { clearTimeout(timer); unsubscribe(); };
    });
  }
}
