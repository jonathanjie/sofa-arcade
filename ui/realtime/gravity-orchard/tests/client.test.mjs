import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealtimeClient, CLIENT_LIMITS } from '../index.mjs';

const URL = 'ws://127.0.0.1:4177/api/realtime/gravity-orchard';
const TOKEN = 'ephemeral_test_credential';

function view(overrides = {}) {
  return { gameId: 'gravity-orchard', schemaVersion: 1, matchId: 'match:1', runEpoch: 1, tick: 10,
    phase: 'playing', mode: 'campaign', stageIndex: 0, levelId: 'morning-delivery',
    timeRemainingTicks: 5400, countdownTicks: 0, ready: { jon: false, lydia: false }, pauseReason: null,
    fruits: [], baskets: Object.fromEntries(['apple', 'plum', 'pear', 'starfruit'].map(type => [type, { count: 0, capacity: 3 }])),
    orders: { recipes: [], activeIndex: 0, completedIds: [] }, gateStates: [], gust: null,
    players: { jon: { input: { x: 0, y: 0, brake: true } }, lydia: { input: { x: 0, y: 0, brake: true } } },
    results: [], events: [], ...overrides };
}
function snapshot(serverSeq = 1, overrides = {}, ack = null) {
  return { type: 'snapshot', protocol: 1, roomCode: 'ROOMA', serverSeq, view: view(overrides),
    presence: { jon: { connected: true, inputFresh: true }, lydia: { connected: true, inputFresh: true } }, ack };
}
function welcome(overrides = {}, role = 'player', epoch = 'controller:1') {
  return { type: 'welcome', protocol: 1,
    viewer: { role, playerId: role === 'player' ? 'jon' : null },
    controllerEpoch: role === 'player' ? epoch : null, snapshot: snapshot(1, overrides) };
}

class ManualClock {
  now = 0;
  tasks = new Map();
  serial = 0;
  setTimeout = (fn, delay = 0) => {
    const id = ++this.serial;
    this.tasks.set(id, { fn, at: this.now + Math.max(0, delay) });
    return id;
  };
  clearTimeout = id => this.tasks.delete(id);
  advance(ms) {
    const target = this.now + ms;
    let loops = 0;
    while (true) {
      const due = [...this.tasks].filter(([, entry]) => entry.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due) break;
      if (++loops > 10000) throw new Error('Timer runaway');
      this.now = due[1].at;
      this.tasks.delete(due[0]);
      due[1].fn();
    }
    this.now = target;
  }
}

function harness(t, overrides = {}) {
  const clock = new ManualClock();
  t.mock.method(globalThis, 'setTimeout', clock.setTimeout);
  t.mock.method(globalThis, 'clearTimeout', clock.clearTimeout);
  class Socket {
    static instances = [];
    readyState = 0;
    bufferedAmount = 0;
    listeners = new Map();
    sent = [];
    closed = [];
    constructor(...args) { this.arguments = args; Socket.instances.push(this); }
    addEventListener(type, handler) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(handler);
    }
    removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
    emit(type, event = {}) { for (const fn of [...(this.listeners.get(type) || [])]) fn(event); }
    open() { this.readyState = 1; this.emit('open'); }
    receive(message) { this.emit('message', { data: typeof message === 'string' ? message : JSON.stringify(message) }); }
    send(message) { assert.equal(this.readyState, 1); this.sent.push(JSON.parse(message)); }
    close(code, reason) { this.readyState = 3; this.closed.push({ code, reason }); this.emit('close', { code }); }
    drop(code = 1006) { this.readyState = 3; this.emit('close', { code }); }
    frames(type) { return this.sent.filter(message => message.type === type); }
  }
  const snapshots = [], statuses = [];
  const client = createRealtimeClient({ url: URL, roomCode: 'ROOMA', token: TOKEN,
    onSnapshot: message => snapshots.push(message), onStatus: status => statuses.push(status),
    now: () => clock.now, WebSocketImpl: Socket, ...overrides });
  t.after(() => client.dispose());
  return { client, Socket, clock, snapshots, statuses,
    connect(message = welcome()) {
      client.connect();
      const socket = Socket.instances.at(-1);
      socket.open();
      socket.receive(message);
      return socket;
    } };
}

test('auth is the only first frame; credentials never enter URL, subprotocol, status or stats', t => {
  const h = harness(t);
  h.client.connect();
  h.client.connect();
  assert.equal(h.Socket.instances.length, 1, 'duplicate mounts cannot create another socket');
  const socket = h.Socket.instances[0];
  assert.deepEqual(socket.arguments, [URL]);
  assert.equal(socket.sent.length, 0);
  socket.open();
  assert.deepEqual(socket.sent, [{ type: 'auth', protocol: 1, roomCode: 'ROOMA', token: TOKEN }]);
  h.clock.advance(500);
  assert.equal(socket.sent.length, 1, 'no control before welcome');
  socket.receive(welcome());
  assert.equal(h.client.getStats().connected, true);
  assert.equal(JSON.stringify([h.statuses, h.client.getStats()]).includes(TOKEN), false);
  assert.equal(JSON.stringify(h.client.getStats()).includes('controller:1'), false);
});

test('factory rejects credential-bearing URLs and malformed configuration without echoing values', () => {
  for (const url of [URL + '?token=' + TOKEN, URL + '#' + TOKEN,
    'ws://' + TOKEN + '@127.0.0.1/api/realtime/gravity-orchard', URL.replace('/api/', '/wrong/')]) {
    assert.throws(() => createRealtimeClient({ url, roomCode: 'ROOMA', token: TOKEN, WebSocketImpl: class {} }), error => {
      assert.equal(error.code, 'invalid_configuration');
      assert.equal(error.message.includes(TOKEN), false);
      return true;
    });
  }
});

test('20Hz input is latest-only, normalized and keeps a stationary heartbeat', t => {
  const h = harness(t);
  const socket = h.connect();
  assert.equal(socket.frames('input').length, 1);
  for (let n = 0; n < 1000; n++) h.client.setInput({ x: n / 1000, y: 0, brake: false });
  h.client.setInput({ x: 1, y: 1, brake: false });
  h.clock.advance(49);
  assert.equal(socket.frames('input').length, 1);
  h.clock.advance(1);
  const sent = socket.frames('input').at(-1);
  assert.deepEqual(sent, { type: 'input', protocol: 1, matchId: 'match:1', runEpoch: 1,
    controllerEpoch: 'controller:1', seq: 1, observedTick: 10, x: 0.7071, y: 0.7071, brake: false });
  h.clock.advance(1000);
  assert.equal(socket.frames('input').length, 22);
  assert.equal(socket.frames('input').at(-1).x, 0.7071);
  assert.equal(h.client.getStats().inputsCoalesced, 1000);
});

test('invalid intent never replaces the current valid latch; no actor/time fields accepted', t => {
  const h = harness(t);
  const socket = h.connect();
  h.client.setInput({ x: 0.5, y: -0.5, brake: false });
  for (const invalid of [null, { x: NaN, y: 0, brake: true }, { x: Infinity, y: 0, brake: true },
    { x: 1.01, y: 0, brake: true }, { x: 0, y: 0, brake: 1 },
    { x: 0, y: 0, brake: true, actor: 'lydia' }, { x: 0, y: 0, brake: true, timestamp: 100 }]) {
    assert.equal(h.client.setInput(invalid), false);
  }
  h.clock.advance(50);
  assert.equal(socket.frames('input').at(-1).x, 0.5);
  assert.equal(h.client.getStats().inputsDropped, 7);
});

test('pause, resume, stage and rematch clear cached motion while sequence continues', t => {
  const h = harness(t);
  const socket = h.connect();
  let seq = 1;
  for (const change of [{ phase: 'paused', runEpoch: 2 }, { phase: 'countdown', runEpoch: 3 },
    { phase: 'playing', runEpoch: 4, stageIndex: 1 }, { phase: 'playing', matchId: 'match:2', runEpoch: 1 }]) {
    h.client.setInput({ x: 1, y: 0, brake: false });
    socket.receive(snapshot(++seq, change));
    h.clock.advance(50);
    assert.deepEqual(Object.fromEntries(['x', 'y', 'brake'].map(key => [key, socket.frames('input').at(-1)[key]])),
      { x: 0, y: 0, brake: true });
  }
  assert.deepEqual(socket.frames('input').map(frame => frame.seq), [0, 1, 2, 3, 4]);
});

test('host observes without sending steering', t => {
  const h = harness(t);
  const socket = h.connect(welcome({}, 'host'));
  h.client.setInput({ x: 1, y: 0, brake: false });
  h.clock.advance(1000);
  assert.equal(socket.frames('input').length, 0);
  assert.equal(socket.frames('ping').length, 2);
});

test('snapshots reject stale sequence, epoch, tick and retired match without stale callbacks', t => {
  const h = harness(t);
  const socket = h.connect();
  socket.receive(snapshot(2, { tick: 15 }));
  socket.receive(snapshot(1, { tick: 14 }));
  socket.receive(snapshot(3, { tick: 9 }));
  socket.receive(snapshot(4, { runEpoch: 0, tick: 100 }));
  socket.receive(snapshot(5, { matchId: 'match:2', runEpoch: 0, tick: 0 }));
  socket.receive(snapshot(6, { matchId: 'match:1', runEpoch: 50, tick: 900 }));
  assert.equal(h.snapshots.length, 3);
  assert.equal(h.client.getStats().snapshotsDropped, 4);
  assert.equal(h.client.getStats().matchId, 'match:2');
  assert.equal(h.client.getStats().tick, 0);
});

test('input acknowledgment RTT uses the client monotonic send clock, not server clocks', t => {
  const h = harness(t);
  const socket = h.connect();
  h.clock.advance(37);
  socket.receive(snapshot(2, { tick: 12 }, { controllerEpoch: 'controller:1', seq: 0, appliedTick: 11 }));
  assert.equal(h.client.getStats().ackRttMs, 37);
  assert.equal(h.client.getStats().appliedInputAgeTicks, 1);
  assert.equal(h.client.getStats().observedTickAgeAtApply, 1);
  assert.equal(h.client.getStats().lastAppliedTick, 11);
  h.clock.advance(10);
  socket.receive(snapshot(3, { tick: 14 }, { controllerEpoch: 'controller:1', seq: 0, appliedTick: 11 }));
  assert.equal(h.client.getStats().ackRttMs, 37, 'repeated ack cannot inflate RTT');
  assert.equal(h.client.getStats().appliedInputAgeTicks, 3);
  assert.equal(h.client.getStats().observedTickAgeAtApply, 1);
  const ping = socket.frames('ping')[0];
  socket.receive({ type: 'pong', protocol: 1, id: ping.id });
  assert.equal(h.client.getStats().pingRttMs, 47);
});

test('a foreign controller ack or future applied tick is a protocol fault', t => {
  const h = harness(t);
  const socket = h.connect();
  socket.receive(snapshot(2, {}, { controllerEpoch: 'other-controller', seq: 0, appliedTick: 10 }));
  assert.equal(h.client.getStats().state, 'error');
  assert.equal(h.client.getStats().invalidMessages, 1);
  assert.equal(h.snapshots.length, 1);
});

test('reliable commands preserve IDs/content/match/epoch through lost ack and reconnect', async t => {
  const h = harness(t);
  const socket = h.connect();
  const command = { id: 'pause:unique', kind: 'pause', payload: { reason: 'help' } };
  const resultPromise = h.client.sendCommand(command);
  assert.equal(h.client.sendCommand(structuredClone(command)), resultPromise);
  command.payload.reason = 'requested'; // Caller mutation cannot change retained retries.
  const original = structuredClone(socket.frames('command')[0]);
  assert.equal(original.runEpoch, 1);
  socket.receive(snapshot(2, { phase: 'paused', runEpoch: 2, tick: 20 }));
  h.clock.advance(750);
  assert.deepEqual(socket.frames('command')[1], original);
  const capturedCallback = [...socket.listeners.get('message')][0];
  socket.drop();
  h.clock.advance(250);
  const replacement = h.Socket.instances.at(-1);
  replacement.open();
  replacement.receive(welcome({ phase: 'paused', runEpoch: 3, tick: 15 }, 'player', 'controller:2'));
  h.clock.advance(750);
  assert.deepEqual(replacement.frames('command')[0], original);
  capturedCallback({ data: JSON.stringify(snapshot(999, { matchId: 'wrong-room-late', tick: 999 })) });
  assert.equal(h.client.getStats().matchId, 'match:1');
  replacement.receive({ type: 'command-result', protocol: 1, id: original.id, accepted: true,
    snapshot: snapshot(1, { phase: 'paused', runEpoch: 2, tick: 20 }) });
  const result = await resultPromise;
  assert.equal(result.accepted, true);
  assert.equal(h.client.getStats().runEpoch, 3, 'old command ack cannot roll back recovered stream');
  assert.equal(h.client.getStats().pendingCommands, 0);
  assert.equal(h.client.getStats().commandRetries, 2);
});

test('command ID reuse with different normalized content fails and invalid system commands never send', async t => {
  const h = harness(t);
  const socket = h.connect();
  const pending = h.client.sendCommand({ id: 'id:1', kind: 'pause', payload: { reason: 'requested' } });
  await assert.rejects(h.client.sendCommand({ id: 'id:1', kind: 'pause', payload: { reason: 'help' } }), { code: 'command_conflict' });
  for (const command of [{ id: 'bad:1', kind: 'pause', payload: { reason: 'host-stall' } },
    { id: 'bad:2', kind: 'resume', payload: {} },
    { id: 'bad:3', kind: 'ready', payload: { value: true }, playerId: 'lydia' }]) {
    await assert.rejects(h.client.sendCommand(command), { code: 'invalid_command' });
  }
  assert.equal(socket.frames('command').length, 1);
  socket.receive({ type: 'command-result', protocol: 1, id: 'id:1', accepted: false, code: 'invalid_phase' });
  assert.deepEqual(await pending, { type: 'command-result', protocol: 1, id: 'id:1', accepted: false, code: 'invalid_phase' });
});

test('reconnect resets controller sequence/latch and ignores detached-room callbacks', t => {
  const h = harness(t);
  const socket = h.connect();
  h.client.setInput({ x: 1, y: 0, brake: false });
  h.clock.advance(50);
  const late = [...socket.listeners.get('message')][0];
  socket.drop();
  h.clock.advance(249);
  assert.equal(h.Socket.instances.length, 1);
  h.clock.advance(1);
  const replacement = h.Socket.instances[1];
  replacement.open();
  replacement.receive(welcome({ runEpoch: 2, phase: 'playing' }, 'player', 'controller:2'));
  assert.equal(replacement.frames('input')[0].seq, 0);
  assert.equal(replacement.frames('input')[0].x, 0);
  assert.equal(replacement.frames('input')[0].brake, true);
  late({ data: JSON.stringify(snapshot(999, { runEpoch: 999 })) });
  assert.equal(h.client.getStats().runEpoch, 2);
  assert.equal([...socket.listeners.values()].reduce((n, set) => n + set.size, 0), 0);
});

test('a replaced controller does not auto-reconnect into a takeover war', t => {
  const h = harness(t);
  const socket = h.connect();
  socket.drop(4409);
  h.clock.advance(30000);
  assert.equal(h.Socket.instances.length, 1);
  assert.equal(h.client.getStats().state, 'offline');
  assert.equal(h.clock.tasks.size, 0);
});

test('auth revocation and protocol closure are terminal without exposing close reason', t => {
  const h = harness(t);
  const socket = h.connect();
  socket.drop(4401);
  h.client.connect();
  h.clock.advance(30000);
  assert.equal(h.Socket.instances.length, 1);
  assert.equal(h.client.getStats().state, 'error');
  assert.equal(h.clock.tasks.size, 0);
});

test('welcome timeout bounds unauthenticated lifetime and schedules only one retry', t => {
  const h = harness(t);
  h.client.connect();
  const socket = h.Socket.instances[0];
  socket.open();
  h.clock.advance(4999);
  assert.equal(socket.closed.length, 0);
  h.clock.advance(1);
  assert.equal(socket.closed.length, 1);
  assert.equal(h.clock.tasks.size, 1);
  h.client.connect();
  h.clock.advance(250);
  assert.equal(h.Socket.instances.length, 2);
});

test('slow outbound socket drops samples without queues and closes at a bounded threshold', t => {
  const h = harness(t);
  const socket = h.connect();
  socket.bufferedAmount = CLIENT_LIMITS.softBufferedBytes;
  for (let n = 0; n < 10000; n++) h.client.setInput({ x: n % 2, y: 0, brake: false });
  h.clock.advance(2000);
  assert.equal(socket.frames('input').length, 1);
  assert.ok(h.client.getStats().inFlightInputs <= CLIENT_LIMITS.maxInputReceipts);
  assert.equal(h.client.getStats().pendingCommands, 0);
  h.clock.advance(50);
  assert.equal(socket.closed[0].code, 4429);
  assert.equal(h.clock.tasks.size, 1);
});

test('input receipt memory stays bounded even when acknowledgments never arrive', t => {
  const h = harness(t);
  const socket = h.connect();
  for (let n = 0; n < 10; n++) {
    h.clock.advance(1000);
    socket.receive(snapshot(n + 2, { tick: 60 * (n + 1) }));
  }
  assert.equal(socket.frames('input').length, 201);
  assert.equal(h.client.getStats().inFlightInputs, CLIENT_LIMITS.maxInputReceipts);
});

test('pending commands are bounded and disposal rejects promises and clears every timer/listener', async t => {
  const h = harness(t);
  const socket = h.connect();
  const promises = [];
  for (let n = 0; n < CLIENT_LIMITS.maxPendingCommands; n++) {
    promises.push(h.client.sendCommand({ id: 'ready:' + n, kind: 'ready', payload: { value: true } }));
  }
  await assert.rejects(h.client.sendCommand({ id: 'ready:excess', kind: 'ready', payload: { value: true } }), { code: 'command_queue_full' });
  const settled = Promise.allSettled(promises);
  const late = [...socket.listeners.get('message')][0];
  const callbacks = h.snapshots.length + h.statuses.length;
  h.client.dispose();
  h.client.dispose();
  late({ data: JSON.stringify(snapshot(100)) });
  h.client.connect();
  h.clock.advance(30000);
  assert.ok((await settled).every(result => result.status === 'rejected' && result.reason.code === 'disposed'));
  assert.equal(h.client.getStats().pendingCommands, 0);
  assert.equal(h.clock.tasks.size, 0);
  assert.equal(h.snapshots.length + h.statuses.length, callbacks);
  assert.equal([...socket.listeners.values()].reduce((n, set) => n + set.size, 0), 0);
  assert.equal(h.Socket.instances.length, 1);
});

test('dispose during reconnect cancels old-room work permanently', t => {
  const h = harness(t);
  const socket = h.connect();
  socket.drop();
  h.client.dispose();
  h.clock.advance(30000);
  assert.equal(h.clock.tasks.size, 0);
  assert.equal(h.Socket.instances.length, 1);
});

test('malformed/oversized/deep server frames fail safely instead of reaching presentation', t => {
  const h = harness(t);
  const socket = h.connect();
  socket.receive('{"type":"snapshot","protocol":1,"view":' + '['.repeat(30) + '0' + ']'.repeat(30) + '}');
  assert.equal(h.client.getStats().invalidMessages, 1);
  assert.equal(h.snapshots.length, 1);
  assert.equal(h.clock.tasks.size, 0);
});

test('presentation callback exceptions do not strand socket/timers', t => {
  const h = harness(t, { onSnapshot: () => { throw new Error('presentation failed'); } });
  const socket = h.connect();
  h.clock.advance(50);
  assert.equal(socket.frames('input').length, 2);
  assert.equal(h.client.getStats().callbackErrors, 1);
  assert.equal(h.client.getStats().connected, true);
});

test('dispose from a reconnect status callback does not schedule a late timer', t => {
  let client;
  const h = harness(t, { onStatus: status => { if (status.state === 'reconnecting') client.dispose(); } });
  client = h.client;
  const socket = h.connect();
  socket.drop();
  assert.equal(h.clock.tasks.size, 0);
  h.clock.advance(30000);
  assert.equal(h.Socket.instances.length, 1);
});

test('stale cached command-result snapshot from an old controller is discarded, not replayed', async t => {
  const h = harness(t);
  const socket = h.connect();
  const pending = h.client.sendCommand({ id: 'pause:cached', kind: 'pause', payload: { reason: 'help' } });
  socket.receive(snapshot(2, { runEpoch: 2, phase: 'paused', tick: 20 }));
  socket.drop();
  h.clock.advance(250);
  const replacement = h.Socket.instances[1];
  replacement.open();
  replacement.receive(welcome({ runEpoch: 3, phase: 'paused', tick: 20 }, 'player', 'controller:2'));
  replacement.receive({ type: 'command-result', protocol: 1, id: 'pause:cached', accepted: true,
    snapshot: snapshot(50, { runEpoch: 2, phase: 'paused', tick: 20 },
      { controllerEpoch: 'controller:1', seq: 0, appliedTick: 11 }) });
  assert.equal((await pending).accepted, true);
  assert.equal(h.client.getStats().connected, true);
  assert.equal(h.client.getStats().runEpoch, 3);
  assert.equal(h.client.getStats().invalidMessages, 0);
});

test('stale welcome cannot create an authenticated stream against obsolete authority', t => {
  const h = harness(t);
  const socket = h.connect(welcome({ runEpoch: 5 }));
  socket.drop();
  h.clock.advance(250);
  const replacement = h.Socket.instances[1];
  replacement.open();
  replacement.receive(welcome({ runEpoch: 4 }, 'player', 'controller:2'));
  assert.equal(h.client.getStats().connected, false);
  assert.equal(h.client.getStats().state, 'error');
  assert.equal(replacement.frames('input').length, 0);
});

test('pending commands use a bounded fair rate below the server command budget', async t => {
  const h = harness(t);
  const socket = h.connect();
  const pending = [];
  for (let n = 0; n < CLIENT_LIMITS.maxPendingCommands; n++) {
    pending.push(h.client.sendCommand({ id: 'ready:rate:' + n, kind: 'ready', payload: { value: true } }));
  }
  assert.equal(socket.frames('command').length, CLIENT_LIMITS.commandBurst);
  h.clock.advance(1000);
  assert.ok(socket.frames('command').length <= CLIENT_LIMITS.commandBurst + CLIENT_LIMITS.commandFramesPerSecond);
  h.clock.advance(3000);
  assert.equal(new Set(socket.frames('command').map(command => command.id)).size, CLIENT_LIMITS.maxPendingCommands,
    'uncertain old commands cannot starve first attempts');
  const results = Promise.allSettled(pending);
  h.client.dispose();
  await results;
});

test('wrong-room snapshots cannot reach a consumer', t => {
  const h = harness(t);
  const socket = h.connect();
  socket.receive({ ...snapshot(2), roomCode: 'ROOMB' });
  assert.equal(h.snapshots.length, 1);
  assert.equal(h.client.getStats().state, 'error');
  // A detached handler cannot process even an oversized frame after shutdown.
  socket.receive(' '.repeat(CLIENT_LIMITS.maxInboundBytes + 1));
  assert.equal(h.client.getStats().invalidMessages, 1);
});

test('oversized inbound frames are rejected before parsing and presentation', t => {
  const h = harness(t);
  const socket = h.connect();
  socket.receive(' '.repeat(CLIENT_LIMITS.maxInboundBytes + 1));
  assert.equal(h.client.getStats().invalidMessages, 1);
  assert.equal(h.client.getStats().state, 'error');
  assert.equal(h.snapshots.length, 1);
  assert.equal(h.clock.tasks.size, 0);
});

for (const code of [1002, 1009]) {
  test(`WebSocket implementation protocol close ${code} is terminal`, t => {
    const h = harness(t);
    const socket = h.connect();
    socket.drop(code);
    h.clock.advance(30000);
    assert.equal(h.Socket.instances.length, 1);
    assert.equal(h.client.getStats().state, 'error');
    assert.equal(h.clock.tasks.size, 0);
  });
}

test('unrecognized result error text is sanitized and cannot become a credential dump', async t => {
  const h = harness(t);
  const socket = h.connect();
  const pending = h.client.sendCommand({ id: 'ready:safe-error', kind: 'ready', payload: { value: true } });
  socket.receive({ type: 'command-result', protocol: 1, id: 'ready:safe-error', accepted: false, code: TOKEN });
  assert.equal((await pending).code, 'server_rejected');
  assert.equal(JSON.stringify([h.statuses, h.client.getStats()]).includes(TOKEN), false);
});

test('reconnect backoff caps and resets after a verified welcome', t => {
  const h = harness(t);
  h.client.connect();
  function retryAfter(delay) {
    const old = h.Socket.instances.at(-1);
    const count = h.Socket.instances.length;
    const snapshotCount = h.snapshots.length;
    const inputCount = old.frames('input').length;
    old.drop(1006);
    old.receive(snapshot(99));
    h.clock.advance(delay - 1);
    assert.equal(h.Socket.instances.length, count);
    h.clock.advance(1);
    assert.equal(h.Socket.instances.length, count + 1);
    assert.equal(h.snapshots.length, snapshotCount);
    assert.equal(old.frames('input').length, inputCount);
    h.Socket.instances.at(-1).open();
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    retryAfter(Math.min(CLIENT_LIMITS.reconnectMaxMs, CLIENT_LIMITS.reconnectMinMs * 2 ** Math.min(attempt, 5)));
  }
  const current = h.Socket.instances.at(-1);
  current.receive(welcome());
  assert.equal(h.client.getStats().connected, true);
  const detached = h.Socket.instances.slice(0, -1);
  for (const socket of detached) socket.receive(snapshot(99, { tick: 99 }));
  assert.equal(h.snapshots.at(-1).view.tick, 10, 'Only the current socket can publish a view');
  h.client.setInput({ x: 1, y: 0, brake: false });
  h.clock.advance(50);
  assert.equal(current.frames('input').at(-1).x, 1);
  for (const socket of detached) assert.equal(socket.frames('input').length, 0);
  retryAfter(CLIENT_LIMITS.reconnectMinMs);
});
