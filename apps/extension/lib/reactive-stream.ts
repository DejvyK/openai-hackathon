import { ReactiveEventSchema, type ReactiveEvent } from '@agentlayer/contracts/reactive-v1';

/** Bounded SSE parser; transport/authentication is controlled by the background. */
export async function readReactiveStream(response: Response, receive: (event: ReactiveEvent) => void) {
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('The server did not return an event stream.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer = (buffer + decoder.decode(value, { stream: !done })).replace(/\r\n/g, '\n');
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
        if (frame.length > 150000) throw new Error('An event exceeded its size limit.');
        const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (data) receive(ReactiveEventSchema.parse(JSON.parse(data)));
      }
      if (buffer.length > 150000) throw new Error('An event exceeded its size limit.');
      if (done) break;
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
