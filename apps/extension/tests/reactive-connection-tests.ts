import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createReactiveConnection, type ConnectionStatus } from '../lib/reactive-connection';
import { initialReactiveView } from '../lib/reactive-state';

class FakePort {
  messages: unknown[] = [];
  disconnected = false;
  messageListeners: ((message: any) => void)[] = [];
  disconnectListeners: (() => void)[] = [];
  onMessage = { addListener: (listener: (message: any) => void) => { this.messageListeners.push(listener); } };
  onDisconnect = { addListener: (listener: () => void) => { this.disconnectListeners.push(listener); } };
  postMessage(message: unknown) { if (this.disconnected) throw new Error('Disconnected port'); this.messages.push(message); }
  disconnect() { if (this.disconnected) return; this.disconnected = true; this.disconnectListeners.forEach(listener => listener()); }
  emit(message: unknown) { this.messageListeners.forEach(listener => listener(message)); }
}

test('reconnects transport, ignores obsolete messages, and never replays an action', async () => {
  const ports: FakePort[] = [];
  const statuses: ConnectionStatus[] = [];
  const views: string[] = [];
  const client = createReactiveConnection({ connect: () => { const port = new FakePort(); ports.push(port); return port; },
    onStatus: status => statuses.push(status), onState: view => views.push(view.text), onRecapture() {}, delays: [1], handshakeMs: 1000 });
  try {
    ports[0]!.emit({ type: 'state', view: { ...initialReactiveView, text: 'old' } });
    client.send({ type: 'pause' });
    ports[0]!.disconnect();
    client.send({ type: 'resume' }); // Lost controls are not queued and replayed.
    await delay(10);
    assert.equal(ports.length, 2);
    ports[0]!.emit({ type: 'state', view: { ...initialReactiveView, text: 'stale' } });
    ports[1]!.emit({ type: 'state', view: { ...initialReactiveView, text: 'current' } });
    assert.deepEqual(views, ['old', 'current']);
    assert.deepEqual(ports[1]!.messages, []);
    assert.equal(statuses.at(-1), 'connected');
  } finally { client.dispose(); }
  await delay(10); assert.equal(ports.length, 2);
});

test('invalidated extension context does not retry indefinitely', async () => {
  let attempts = 0;
  const statuses: ConnectionStatus[] = [];
  const client = createReactiveConnection({ connect: () => { attempts++; throw new Error('Extension context invalidated.'); },
    onStatus: status => statuses.push(status), onState() {}, onRecapture() {}, delays: [1, 1] });
  try { await delay(10); assert.equal(attempts, 1); assert.equal(statuses.at(-1), 'invalidated'); }
  finally { client.dispose(); }
});

test('silent ports time out with bounded retries and an explicit reconnect remains available', async () => {
  const ports: FakePort[] = [];
  const statuses: ConnectionStatus[] = [];
  const client = createReactiveConnection({ connect: () => { const port = new FakePort(); ports.push(port); return port; },
    onStatus: status => statuses.push(status), onState() {}, onRecapture() {}, delays: [1], handshakeMs: 5 });
  try {
    const deadline = Date.now() + 1000;
    while ((ports.length !== 2 || statuses.at(-1) !== 'disconnected') && Date.now() < deadline) await delay(10);
    assert.equal(ports.length, 2); assert.equal(statuses.at(-1), 'disconnected');
    client.reconnect(); assert.equal(ports.length, 3);
    ports[2]!.emit({ type: 'state', view: initialReactiveView });
    assert.equal(statuses.at(-1), 'connected');
  } finally { client.dispose(); }
});
