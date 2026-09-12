import { createHash, randomUUID } from 'node:crypto';
import { AbstractAgent } from '@ag-ui/client';
import { EventType, type BaseEvent, type RunAgentInput } from '@ag-ui/core';
import { Observable } from 'rxjs';
import { CopilotRuntime, CopilotKitIntelligence, InMemoryAgentRunner, createCopilotRuntimeHandler } from '@copilotkit/runtime/v2';
import { ReactiveSnapshotRequestSchema, ReactiveEventSchema, type ReactiveEvent } from '@agentlayer/contracts/reactive-v1';
import type { ReactiveRunner } from '../routes/reactive.js';

const EVENT_NAME = 'agentlayer.reactive.v1';
type Invocation = { request: Parameters<ReactiveRunner>[0]; options: Parameters<ReactiveRunner>[1]; controller: AbortController };

/** The model and tools stay in the existing bounded runner. No AG-UI input can select a tool or replace its page context. */
class PageAgent extends AbstractAgent {
  constructor(private readonly invoke: ReactiveRunner, private readonly pending: Map<string, Invocation>) {
    super({ agentId: 'agentlayer', description: 'Page conversation with bounded Exa research and reviewed action proposals.' });
  }
  override clone(): PageAgent { return new PageAgent(this.invoke, this.pending); }
  run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable(observer => {
      const bound = this.pending.get(input.runId);
      if (!bound || bound.controller.signal.aborted) {
        observer.next({ type: EventType.RUN_ERROR, message: 'The page context is no longer active.', code: 'CONTEXT_EXPIRED' });
        observer.complete(); return;
      }
      const messageId = `${input.runId}-assistant`;
      let textStarted = false, streamed = false, finished = false;
      const text = (delta: string) => {
        if (!delta) return;
        if (!textStarted) { observer.next({ type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' }); textStarted = true; }
        observer.next({ type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta });
      };
      observer.next({ type: EventType.RUN_STARTED, threadId: input.threadId, runId: input.runId });
      void this.invoke(bound.request, { ...bound.options, signal: bound.controller.signal, emit: raw => {
        if (bound.controller.signal.aborted || observer.closed) return;
        const event = ReactiveEventSchema.parse(raw);
        if (event.sessionId !== bound.request.sessionId || event.contextId !== bound.request.contextId || event.revision !== bound.request.revision || (event.goalRevision ?? 0) !== (bound.request.goalRevision ?? 0) || event.runId !== input.runId) throw new Error('COPILOT_CONTEXT_MISMATCH');
        if (event.type === 'message_delta') { text(event.text); streamed = true; }
        if (event.type === 'completed' && !streamed) text(event.text);
        observer.next({ type: EventType.CUSTOM, name: EVENT_NAME, value: event });
      } }).then(() => {
        if (observer.closed) return;
        finished = true;
        if (textStarted) observer.next({ type: EventType.TEXT_MESSAGE_END, messageId });
        observer.next({ type: EventType.RUN_FINISHED, threadId: input.threadId, runId: input.runId });
        observer.complete();
      }, () => {
        finished = true;
        observer.next({ type: EventType.RUN_ERROR, message: 'The page agent could not complete this request.', code: 'AGENT_FAILED' });
        observer.complete();
      });
      return () => { if (!finished) bound.controller.abort(); };
    });
  }
}

export interface CopilotBridgeOptions { apiKey?: string }
export interface CopilotInspection { mode: 'sse'; credentialStatus: 'not_configured' | 'accepted' | 'rejected' | 'unverified'; agents: string[] }

/** Uses the actual CopilotKit runtime stream while retaining the extension's authenticated reactive-v1 transport. */
export function createCopilotReactiveBridge(invoke: ReactiveRunner, options: CopilotBridgeOptions = {}) {
  const pending = new Map<string, Invocation>();
  const intelligence = options.apiKey ? new CopilotKitIntelligence({ apiKey: options.apiKey, enableEnterpriseLearning: false }) : undefined;
  // SSE mode owns execution here. Intelligence uses a different realtime transport;
  // its project credential is checked separately, without claiming cloud persistence.
  const runtime = new CopilotRuntime({ agents: { agentlayer: new PageAgent(invoke, pending) }, runner: new InMemoryAgentRunner({ maxThreads: 32, maxRunsPerThread: 2, maxBytes: 2_000_000 }) });
  const handler = createCopilotRuntimeHandler({ runtime, basePath: '/copilot', activateChannels: false });
  const runner: ReactiveRunner = async (raw, outer) => {
    const request = ReactiveSnapshotRequestSchema.parse(raw);
    if (outer.signal.aborted) return;
    if (pending.size >= 4 || pending.has(outer.runId)) throw new Error('COPILOT_RUN_LIMIT');
    const controller = new AbortController();
    const digest = createHash('sha256').update(JSON.stringify([request.sessionId, request.snapshot.url, request.goalRevision ?? 0])).digest('hex');
    // Deterministic scope preserves same-page conversation turns.
    const threadId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
    const abort = () => { controller.abort(); void runtime.runner.stop({ threadId, runId: outer.runId }).catch(() => {}); };
    outer.signal.addEventListener('abort', abort, { once: true });
    pending.set(outer.runId, { request, options: outer, controller });
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const cancelRead = () => { void reader?.cancel().catch(() => {}); };
    controller.signal.addEventListener('abort', cancelRead, { once: true });
    let terminal: ReactiveEvent | undefined;
    let readyToPublish = false;
    try {
      const response = await handler(new Request('http://agentlayer.internal/copilot/agent/agentlayer/run', {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'text/event-stream' }, signal: controller.signal,
        body: JSON.stringify({ threadId, runId: outer.runId, state: {}, tools: [], context: [], forwardedProps: {}, messages: [{ id: request.conversation?.messageId ?? randomUUID(), role: 'user', content: request.conversation?.userMessage ?? 'Offer next steps for the current page and session goal.' }] }),
      }));
      if (!response.ok || !response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new Error(`COPILOT_RUNTIME_UNAVAILABLE_${response.status}`);
      reader = response.body.getReader();
      const decoder = new TextDecoder(); let buffer = '', bytes = 0, runFinished = false;
      while (!controller.signal.aborted) {
        const chunk = await reader.read(); if (chunk.done) break;
        bytes += chunk.value.byteLength; if (bytes > 1_000_000) throw new Error('COPILOT_STREAM_LIMIT');
        buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n');
        let end: number;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
          if (!data || data === '[DONE]') continue;
          const event = JSON.parse(data);
          if (event.type === EventType.RUN_ERROR) throw new Error('COPILOT_RUN_FAILED');
          if (event.type === EventType.RUN_FINISHED) {
            if (event.runId !== outer.runId || event.threadId !== threadId) throw new Error('COPILOT_CONTEXT_MISMATCH');
            runFinished = true;
          }
          if (event.type !== EventType.CUSTOM || event.name !== EVENT_NAME) continue;
          const result = ReactiveEventSchema.parse(event.value);
          if (result.runId !== outer.runId || result.sessionId !== request.sessionId || result.contextId !== request.contextId || result.revision !== request.revision || (result.goalRevision ?? 0) !== (request.goalRevision ?? 0)) throw new Error('COPILOT_CONTEXT_MISMATCH');
          if (result.type === 'completed' || result.type === 'error' || result.type === 'cancelled') terminal = result;
          else if (!terminal && !controller.signal.aborted) outer.emit(result);
        }
      }
      if (!controller.signal.aborted && (!terminal || !runFinished)) throw new Error('COPILOT_INCOMPLETE_RESPONSE');
      readyToPublish = !controller.signal.aborted && !!terminal && runFinished;
    } finally {
      outer.signal.removeEventListener('abort', abort);
      pending.delete(outer.runId);
      controller.abort();
      controller.signal.removeEventListener('abort', cancelRead);
      await reader?.cancel().catch(() => {});
      await runtime.runner.stop({ threadId, runId: outer.runId }).catch(() => {});
    }
    // Publishing completion lets the UI immediately start another turn on this thread.
    // The underlying agent and SDK lifecycle must be fully released first.
    if (readyToPublish && terminal && !outer.signal.aborted) outer.emit(terminal);
  };
  return {
    runner,
    async inspect(): Promise<CopilotInspection> {
      if (!intelligence) return { mode: 'sse', credentialStatus: 'not_configured', agents: ['agentlayer'] };
      try {
        const result = await intelligence.getRuntimeEntitlements();
        return { mode: 'sse', credentialStatus: result.status === 'ready' ? 'accepted' : result.status === 'misconfigured' ? 'rejected' : 'unverified', agents: ['agentlayer'] };
      } catch (error) {
        const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined;
        return { mode: 'sse', credentialStatus: status === 401 || status === 403 ? 'rejected' : 'unverified', agents: ['agentlayer'] };
      }
    },
    close() { for (const bound of pending.values()) bound.controller.abort(); },
  };
}
