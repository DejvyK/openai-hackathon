import type { ReactiveView } from './reactive-state';

type Port = {
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: { addListener(listener: (message: any) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
};
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'invalidated';
type Options = {
  connect: () => Port;
  onState: (view: ReactiveView) => void;
  onStatus: (status: ConnectionStatus) => void;
  onRecapture: () => void;
  delays?: readonly number[];
  handshakeMs?: number;
};

/** Reconnect transport loss without replaying any write/action message. */
export function createReactiveConnection({ connect, onState, onStatus, onRecapture, delays = [250, 1000, 2500], handshakeMs = 5000 }: Options) {
  let port: Port | undefined;
  let disposed = false;
  let invalidated = false;
  let retries = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let handshakeTimer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  function discardPort() {
    const previous = port; port = undefined;
    clearTimeout(handshakeTimer);
    try { previous?.disconnect(); } catch { /* Context can disappear during shutdown. */ }
  }
  function lost(cause?: unknown) {
    if (disposed) return;
    generation++; discardPort();
    invalidated = cause instanceof Error && /Extension context invalidated/i.test(cause.message);
    onStatus(invalidated ? 'invalidated' : 'disconnected');
    clearTimeout(reconnectTimer);
    if (!invalidated && retries < delays.length) reconnectTimer = setTimeout(open, delays[retries++]);
  }
  function open() {
    if (disposed || invalidated) return;
    clearTimeout(reconnectTimer);
    generation++; discardPort();
    const attempt = generation;
    onStatus('connecting');
    try {
      const next = connect(); port = next;
      handshakeTimer = setTimeout(() => { if (port === next && generation === attempt) lost(); }, handshakeMs);
      next.onMessage.addListener(message => {
        if (disposed || next !== port || attempt !== generation) return;
        if (message?.type === 'recapture') { onRecapture(); return; }
        if (message?.type !== 'state') return;
        clearTimeout(handshakeTimer); retries = 0;
        onStatus('connected'); onState(message.view as ReactiveView);
      });
      next.onDisconnect.addListener(() => { if (next === port && attempt === generation) lost(); });
    } catch (cause) { lost(cause); }
  }
  function send(message: unknown) {
    if (disposed || !port) return;
    try { port.postMessage(message); } catch (cause) { lost(cause); }
  }
  const heartbeat = setInterval(() => send({ type: 'heartbeat' }), 20000);
  open();
  return {
    send,
    reconnect() { if (disposed) return; retries = 0; invalidated = false; open(); },
    dispose() { disposed = true; generation++; clearTimeout(reconnectTimer); clearTimeout(handshakeTimer); clearInterval(heartbeat); discardPort(); },
  };
}
