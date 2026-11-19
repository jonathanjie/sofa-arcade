import test from 'node:test';
import assert from 'node:assert/strict';
import { readTransportConfig, createEventDecoder, subscribeRoom } from './transport.mjs';

test('only the local host metadata enables LAN transport and a usable join origin', () => {
  const doc = values => ({ querySelector: selector => values[selector] === undefined ? null : { getAttribute: () => values[selector] } });
  const cloud = readTransportConfig({ document: doc({}), origin: 'https://sofa.example' });
  assert.deepEqual(cloud, { mode: 'cloud', joinOrigin: 'https://sofa.example', realtime: false });
  const local = readTransportConfig({ document: doc({
    'meta[name="sofa-transport"]': 'lan', 'meta[name="sofa-join-origin"]': 'http://192.168.1.20:4177/',
  }), origin: 'http://localhost:4177' });
  assert.deepEqual(local, { mode: 'lan', joinOrigin: 'http://192.168.1.20:4177', realtime: true });
  assert.equal(readTransportConfig({ document: doc({ 'meta[name="sofa-transport"]': 'lan', 'meta[name="sofa-join-origin"]': 'javascript:alert(1)' }), origin: 'http://localhost:4177' }).joinOrigin, 'http://localhost:4177');
});

test('SSE decoder handles split lines, CRLF, comments, and multiple complete room updates', () => {
  const received = [];
  const decode = createEventDecoder((type, value) => received.push({ type, value }));
  for (const chunk of [': heartbeat\r', '\n\r\nevent: ro', 'om\r\ndata: {"revision":1,', '"name":"Lala’s"}\r', '\n\r\nevent: room\ndata: {"revision":2}\n\n']) decode(chunk);
  assert.deepEqual(received, [{ type: 'room', value: { revision: 1, name: 'Lala’s' } }, { type: 'room', value: { revision: 2 } }]);
});

test('subscription sends credentials only in headers, delivers a snapshot, and aborts cleanly', async () => {
  const token = 'x'.repeat(43);
  const states = [];
  let capture;
  let resolveRoom;
  const roomReceived = new Promise(resolve => { resolveRoom = resolve; });
  const encoder = new TextEncoder();
  const stop = subscribeRoom({
    code: 'ABC234', token, onConnection: state => states.push(state), onRoom: value => resolveRoom(value),
    fetcher: async (url, options) => {
      capture = { url, options };
      return new Response(new ReadableStream({ start(controller) {
        controller.enqueue(encoder.encode('event: room\ndata: {"code":"ABC234","revision":7}\n\n'));
        options.signal.addEventListener('abort', () => controller.close(), { once: true });
      } }), { headers: { 'Content-Type': 'text/event-stream' } });
    },
  });
  assert.deepEqual(await roomReceived, { code: 'ABC234', revision: 7 });
  assert.equal(capture.url, '/api/rooms/ABC234/events');
  assert.ok(!capture.url.includes(token));
  assert.equal(capture.options.headers.Authorization, `Bearer ${token}`);
  assert.deepEqual(states, ['connecting', 'connected']);
  stop(); stop();
  assert.equal(capture.options.signal.aborted, true);
});

test('authorization failure ends the stream without reconnecting a rejected credential', async () => {
  let calls = 0;
  let resolveOffline;
  const offline = new Promise(resolve => { resolveOffline = resolve; });
  const stop = subscribeRoom({ code: 'ABC234', token: 'x'.repeat(43), onRoom() { assert.fail('A rejected session must not receive a room.'); },
    onConnection: state => { if (state === 'offline') resolveOffline(); }, retryMs: 1,
    fetcher: async () => { calls++; return new Response('{}', { status: 403 }); },
  });
  await offline;
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(calls, 1);
  stop();
});

test('a temporary connection failure reconnects and delivers the current room', async () => {
  let calls = 0;
  let resolveRoom;
  const received = new Promise(resolve => { resolveRoom = resolve; });
  const stop = subscribeRoom({ code: 'ABC234', token: 'x'.repeat(43), onRoom: resolveRoom, retryMs: 1,
    fetcher: async (_url, options) => {
      if (++calls === 1) throw new Error('Temporary network interruption');
      return new Response(new ReadableStream({ start(controller) {
        controller.enqueue(new TextEncoder().encode('event: room\ndata: {"code":"ABC234","revision":9}\n\n'));
        options.signal.addEventListener('abort', () => controller.close(), { once: true });
      } }), { headers: { 'Content-Type': 'text/event-stream' } });
    },
  });
  try { assert.equal((await received).revision, 9); assert.equal(calls, 2); }
  finally { stop(); }
});
