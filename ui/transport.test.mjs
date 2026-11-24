import test from 'node:test';
import assert from 'node:assert/strict';
import { readTransportConfig, createEventDecoder, subscribeRoom } from './transport.mjs';

// Let fetch and stream continuations settle before advancing a simulated deadline.
const settle = () => new Promise(resolve => setImmediate(resolve));

function clock(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const scheduled = t.mock.method(globalThis, 'setTimeout');
  const cancelled = t.mock.method(globalThis, 'clearTimeout');
  return {
    tick: ms => t.mock.timers.tick(ms),
    delays: () => scheduled.mock.calls.map(call => call.arguments[1]),
    pending: () => scheduled.mock.calls.filter(timer =>
      !cancelled.mock.calls.some(call => call.arguments[0] === timer.result)),
  };
}

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

test('authorization failure ends the stream without reconnecting a rejected credential', async t => {
  const time = clock(t);
  let calls = 0;
  const rooms = [];
  let resolveOffline;
  const offline = new Promise(resolve => { resolveOffline = resolve; });
  const stop = subscribeRoom({ code: 'ABC234', token: 'x'.repeat(43), onRoom: room => rooms.push(room),
    onConnection: state => { if (state === 'offline') resolveOffline(); }, retryMs: 1,
    fetcher: async () => { calls++; return new Response('{}', { status: 403 }); },
  });
  t.after(stop);
  await offline;
  assert.deepEqual(time.delays(), [30_000], 'Only the idle watchdog was registered');
  time.tick(5000);
  assert.deepEqual(rooms, []);
  assert.equal(calls, 1);
});

test('a temporary connection failure reconnects and delivers the current room', async t => {
  const time = clock(t);
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
  t.after(stop);
  await settle();
  time.tick(1);
  assert.equal((await received).revision, 9);
  assert.equal(calls, 2);
});

test('object-shaped connection status reports passive disconnection and reconnect while legacy strings remain compatible', async t => {
  const time = clock(t);
  const statuses = [];
  const legacy = [];
  let attempts = 0;
  let resolveConnected;
  const received = new Promise(resolve => { resolveConnected = resolve; });
  const stop = subscribeRoom({ code: 'ABC234', token: 'x'.repeat(43), retryMs: 1,
    onStatus: value => statuses.push(value), onConnection: value => legacy.push(value),
    onRoom: value => { if (value.revision === 2) resolveConnected(); },
    fetcher: async () => {
      attempts++;
      return new Response(new ReadableStream({ start(controller) {
        controller.enqueue(new TextEncoder().encode(`event: room\ndata: {"code":"ABC234","revision":${attempts}}\n\n`));
        if (attempts === 1) controller.close();
      } }), { headers: { 'Content-Type': 'text/event-stream' } });
    },
  });
  try {
    await settle();
    time.tick(1);
    await received;
    assert.deepEqual(statuses.map(value => value.state), ['connecting', 'connected', 'offline', 'reconnecting', 'connected']);
    assert.deepEqual(legacy, ['connecting', 'connected', 'offline', 'connecting', 'connected']);
    assert.ok(statuses.every(value => typeof value === 'object'));
  } finally { stop(); }
});

test('disposing a stalled reader cancels it even if fetch ignores the abort signal', async () => {
  let resolveConnected;
  let resolveCancelled;
  const connected = new Promise(resolve => { resolveConnected = resolve; });
  const cancelled = new Promise(resolve => { resolveCancelled = resolve; });
  const statuses = [];
  const stop = subscribeRoom({ code: 'ABC234', token: 'x'.repeat(43), onRoom: resolveConnected,
    onStatus: value => statuses.push(value),
    fetcher: async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('event: room\ndata: {"code":"ABC234","revision":1}\n\n')); },
      cancel() { resolveCancelled(); },
    }), { headers: { 'Content-Type': 'text/event-stream' } }),
  });
  await connected;
  stop(); stop();
  await cancelled;
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(statuses.map(value => value.state), ['connecting', 'connected']);
});

test('idle stream watchdog cancels a silent connection and recovers without a full engine snapshot', async t => {
  const time = clock(t);
  let attempts = 0;
  let cancellations = 0;
  let resolveRoom;
  const received = new Promise(resolve => { resolveRoom = resolve; });
  const stop = subscribeRoom({ code: 'ABC234', token: 'x'.repeat(43), retryMs: 1, idleTimeoutMs: 10,
    onRoom: resolveRoom,
    fetcher: async () => {
      attempts++;
      return new Response(new ReadableStream({
        start(controller) {
          if (attempts === 2) controller.enqueue(new TextEncoder().encode('event: room\ndata: {"code":"ABC234","revision":2}\n\n'));
        },
        cancel() { cancellations++; },
      }), { headers: { 'Content-Type': 'text/event-stream' } });
    },
  });
  try {
    await settle();
    time.tick(10);
    await settle();
    time.tick(1);
    assert.equal((await received).revision, 2);
    assert.equal(attempts, 2);
    assert.equal(cancellations, 1);
  } finally { stop(); }
});

test('terminal SSE errors produce safe error status and never reconnect or expose the error payload', async t => {
  const time = clock(t);
  let attempts = 0;
  const rooms = [];
  let resolveEnded;
  const ended = new Promise(resolve => { resolveEnded = resolve; });
  const statuses = [];
  const stop = subscribeRoom({ code: 'ABC234', token: 'x'.repeat(43), retryMs: 1,
    onRoom: room => rooms.push(room),
    onStatus: value => { statuses.push(value); if (value.state === 'error') resolveEnded(); },
    fetcher: async () => {
      attempts++;
      return new Response(new ReadableStream({ start(controller) {
        controller.enqueue(new TextEncoder().encode('event: error\ndata: {"status":403,"error":"PRIVATE-COMMITMENT"}\n\n'));
      } }), { headers: { 'Content-Type': 'text/event-stream' } });
    },
  });
  try {
    await ended;
    assert.deepEqual(time.delays(), [30_000], 'Only the idle watchdog was registered');
    time.tick(5000);
    assert.deepEqual(rooms, []);
    assert.equal(attempts, 1);
    assert.ok(!JSON.stringify(statuses).includes('PRIVATE-COMMITMENT'));
    assert.equal(statuses.at(-1).state, 'error');
  } finally { stop(); }
});

test('stop from offline callback leaves no retry timer or second request', {
  todo: 'subscribeRoom schedules its retry after the offline callback stops the subscription',
}, async t => {
  const time = clock(t);
  const rooms = [];
  const states = [];
  const request = Promise.withResolvers();
  let calls = 0;
  const stop = subscribeRoom({
    code: 'ABC234', token: 'x'.repeat(43), retryMs: 200, idleTimeoutMs: 8000,
    fetcher() { calls++; return request.promise; },
    onRoom: room => rooms.push(room),
    onStatus({ state }) {
      states.push(state);
      if (state === 'offline') stop();
    },
  });
  t.after(stop);
  request.reject(new Error('connection lost'));
  await settle();
  const pending = time.pending().map(timer => timer.arguments[1]);
  time.tick(8000);
  await settle();
  assert.equal(calls, 1);
  assert.deepEqual(rooms, []);
  assert.deepEqual(states, ['connecting', 'offline']);
  assert.deepEqual(pending, [], 'stop must clear the idle watchdog and prevent a retry');
});
