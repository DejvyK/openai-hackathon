import { createHash, randomUUID } from 'node:crypto';
import { ReactiveSnapshotRequestSchema, ReactiveControlRequestSchema, ReactiveEventSchema, REACTIVE_LIMITS, type ReactiveEvent, type ReactiveSnapshotRequest } from '@agentlayer/contracts/reactive-v1';

export type ReactiveRunner = ((request: ReactiveSnapshotRequest, options: { runId: string; signal: AbortSignal; emit: (event: ReactiveEvent) => void }) => Promise<void>) & { invalidateSession?: (sessionId: string) => void };
type Session = { touchedAt: number; request: ReactiveSnapshotRequest; hash: string; paused: boolean; invalidated?: boolean; runId: string; controller: AbortController; terminal: boolean; sequence: number; chars: number; events: ReactiveEvent[]; subscribers: Set<(event: ReactiveEvent) => void>; timer?: ReturnType<typeof setTimeout> };
export class ReactiveSessions {
  private sessions = new Map<string, Session>();
  constructor(private runner: ReactiveRunner, private maxRunMs = REACTIVE_LIMITS.maxRunMs) {}
  private evictIdle(forCapacity = false) {
    const idle = [...this.sessions.values()].filter(s => s.terminal && !s.subscribers.size).sort((a, b) => a.touchedAt - b.touchedAt);
    for (const s of idle) {
      if (Date.now() - s.touchedAt < 30 * 60_000 && !(forCapacity && this.sessions.size >= 32)) continue;
      this.runner.invalidateSession?.(s.request.sessionId);
      clearTimeout(s.timer);
      this.sessions.delete(s.request.sessionId);
    }
  }
  private publish(s: Session, data: Record<string, unknown>) {
    const event = ReactiveEventSchema.parse({ ...data, schemaVersion: 'reactive-v1', sessionId: s.request.sessionId, contextId: s.request.contextId, revision: s.request.revision, goalRevision: s.request.goalRevision ?? 0, runId: s.runId, sequence: s.sequence++ });
    s.events.push(event);
    s.touchedAt = Date.now();
    for (const subscriber of s.subscribers) subscriber(event);
  }
  private cancel(s: Session, reason: 'superseded' | 'paused' | 'closed' | 'user' | 'timeout') {
    if (s.terminal) return;
    s.terminal = true; clearTimeout(s.timer); s.controller.abort();
    this.publish(s, { type: 'cancelled', reason });
  }
  snapshot(input: unknown) {
    const request = ReactiveSnapshotRequestSchema.parse(input);
    this.evictIdle(!this.sessions.has(request.sessionId));
    const old = this.sessions.get(request.sessionId);
    const ack = (s: Session, status: 'accepted' | 'unchanged' | 'paused' | 'stale') => ({ schemaVersion: 'reactive-v1', sessionId: request.sessionId, contextId: s.request.contextId, revision: s.request.revision, goalRevision: s.request.goalRevision ?? 0, runId: s.runId, status });
    // Exclude capture time, but preserve exact evidence/text and URL in the digest.
    const { capturedAt: _, ...content } = request.snapshot;
    const hash = createHash('sha256').update(JSON.stringify({ content, userGoal: request.userGoal ?? '', goalRevision: request.goalRevision ?? 0, conversation: request.conversation ?? null })).digest('hex');
    if (old && ((request.goalRevision ?? 0) < (old.request.goalRevision ?? 0) || ((request.goalRevision ?? 0) === (old.request.goalRevision ?? 0) && (request.userGoal ?? '') !== (old.request.userGoal ?? '')))) return ack(old, 'stale');
    if (old && request.revision <= old.request.revision) return ack(old, request.revision === old.request.revision && hash === old.hash && request.contextId === old.request.contextId ? 'unchanged' : 'stale');
    if (old?.paused) return ack(old, 'paused');
    if (old && old.hash === hash && request.contextId === old.request.contextId) return ack(old, 'unchanged');
    if (!old && this.sessions.size >= 32) throw new Error('SESSION_LIMIT');
    if (old) this.cancel(old, 'superseded');
    const s: Session = { touchedAt: Date.now(), request, hash, paused: false, runId: randomUUID(), controller: new AbortController(), terminal: false, sequence: 0, chars: 0, events: [], subscribers: old?.subscribers ?? new Set() };
    this.sessions.set(request.sessionId, s);
    this.publish(s, { type: 'started' });
    s.timer = setTimeout(() => this.cancel(s, 'timeout'), this.maxRunMs);
    s.timer.unref();
    const emit = (raw: ReactiveEvent) => {
      if (s.terminal || this.sessions.get(request.sessionId) !== s) return;
      const event = ReactiveEventSchema.parse(raw);
      if (event.sessionId !== request.sessionId || event.contextId !== request.contextId || event.revision !== request.revision || (event.goalRevision ?? 0) !== (request.goalRevision ?? 0) || event.runId !== s.runId) throw new Error('EVENT_CONTEXT_MISMATCH');
      if (event.type === 'started' || event.type === 'cancelled') throw new Error('SERVER_OWNED_EVENT');
      if (s.events.length >= 254) throw new Error('EVENT_LIMIT');
      if (event.type === 'message_delta') {
        s.chars += event.text.length;
        if (s.chars > REACTIVE_LIMITS.responseChars) throw new Error('RESPONSE_LIMIT');
      }
      if (event.type === 'completed') {
        const sourceIds = (event.sources ?? []).map(source => source.id);
        if (new Set(sourceIds).size !== sourceIds.length) throw new Error('DUPLICATE_SOURCES');
        if (event.evidenceRefs.some(id => !request.snapshot.extractedEvidence.some(e => e.id === id) && !sourceIds.includes(id))) throw new Error('UNKNOWN_EVIDENCE');
        const availableSourceIds = new Set([...sourceIds, ...request.snapshot.extractedEvidence.map(item => item.id), ...(event.assessment?.sources.map(item => item.id) ?? [])]);
        for (const intent of event.frontendIntents ?? []) {
          if (intent.name === 'sourced_summary' && intent.props.sourceIds.some(id => !availableSourceIds.has(id))) throw new Error('UNKNOWN_FRONTEND_EVIDENCE');
          if (intent.name === 'prepare_slack_draft' && (!request.conversation || !intent.arguments.text.includes(request.snapshot.url) || event.slackDraft !== intent.arguments.text)) throw new Error('INVALID_FRONTEND_DRAFT');
        }
      }
      if (event.type === 'completed' && event.assessment && (event.assessment.profileUrl !== request.snapshot.url || event.assessment.userGoal !== request.userGoal)) throw new Error('ASSESSMENT_CONTEXT_MISMATCH');
      if (event.type === 'completed' || event.type === 'error') { s.terminal = true; clearTimeout(s.timer); }
      this.publish(s, event);
    };
    void Promise.resolve().then(() => s.terminal ? undefined : this.runner(structuredClone(request), { runId: s.runId, signal: s.controller.signal, emit })).then(() => {
      if (!s.terminal) throw new Error('MISSING_COMPLETION');
    }).catch(() => {
      if (s.terminal) return;
      s.terminal = true; clearTimeout(s.timer); s.controller.abort();
      this.publish(s, { type: 'error', error: { code: 'REACTIVE_RUN_FAILED', message: 'Page analysis could not be completed.', retryable: true, requestId: null, operation: 'research' } });
    });
    return ack(s, 'accepted');
  }
  control(input: unknown) {
    const command = ReactiveControlRequestSchema.parse(input);
    const s = this.sessions.get(command.sessionId);
    if (!s) throw new Error('SESSION_NOT_FOUND');
    s.touchedAt = Date.now();
    if (command.action === 'cancel') {
      if (command.runId !== s.runId || command.contextId !== s.request.contextId || command.revision !== s.request.revision || (command.goalRevision ?? 0) !== (s.request.goalRevision ?? 0)) throw new Error('STALE_CONTROL');
      this.runner.invalidateSession?.(command.sessionId);
      s.invalidated = true;
      this.cancel(s, 'user');
    } else if (command.action === 'pause') { this.runner.invalidateSession?.(command.sessionId); s.paused = true; this.cancel(s, 'paused'); }
    else if (command.action === 'resume') { s.paused = false; s.hash = ''; } // next snapshot explicitly starts current context
    else { this.runner.invalidateSession?.(command.sessionId); this.cancel(s, 'closed'); this.sessions.delete(command.sessionId); }
    return { schemaVersion: 'reactive-v1', sessionId: command.sessionId, action: command.action, status: 'accepted' };
  }
  currentContext(sessionId: string) {
    const s = this.sessions.get(sessionId);
    const completed = s?.events.at(-1);
    if (!s || s.paused || s.invalidated || completed?.type !== 'completed' || (!completed.assessment && !completed.slackDraft)) return null;
    return { sessionId, contextId: s.request.contextId, revision: s.request.revision, goalRevision: s.request.goalRevision ?? 0,
      profileUrl: s.request.snapshot.url, userGoal: s.request.userGoal ?? '' };
  }
  events(sessionId: string) {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error('SESSION_NOT_FOUND');
    return structuredClone(s.events);
  }
  assertCanSubscribe(sessionId: string) {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error('SESSION_NOT_FOUND');
    if (s.subscribers.size >= 1) throw new Error('STREAM_LIMIT');
  }
  subscribe(sessionId: string, listener: (event: ReactiveEvent) => void) {
    this.assertCanSubscribe(sessionId);
    const s = this.sessions.get(sessionId)!;
    s.touchedAt = Date.now();
    s.subscribers.add(listener);
    for (const event of s.events) listener(event);
    return () => { s.subscribers.delete(listener); const current = this.sessions.get(sessionId); if (current) current.touchedAt = Date.now(); };
  }
  close() { for (const s of this.sessions.values()) { this.runner.invalidateSession?.(s.request.sessionId); this.cancel(s, 'closed'); } this.sessions.clear(); }
}
