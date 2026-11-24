import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { WebSocket } from 'ws';
import { startLanServer } from '../../../server/lan.mjs';
import { createEventDecoder } from '../../../ui/transport.mjs';
import { createRealtimeClient } from '../../../ui/realtime/gravity-orchard/index.mjs';
import { api, createRoom, harness, manualClock, connectPeer, NEUTRAL, flush, until } from './helpers.mjs';

test('planned game requires explicit local candidate capability and valid practice options', async t => {
  const host = await startLanServer({ host: '127.0.0.1', port: 0, databasePath: ':memory:', enableGravityOrchard: false });
  t.after(() => host.close());
  assert.equal((await api(host, '/api/rooms', { body: { gameId: 'gravity-orchard' } })).status, 409);
  assert.doesNotMatch(await (await fetch(host.origin)).text(), /name="sofa-gravity-orchard"/);
  const h = await harness(t, { gameOptions: { mode: 'practice' } });
  assert.match(await (await fetch(h.host.origin)).text(), /name="sofa-gravity-orchard" content="candidate"/);
  assert.equal(h.room.started.state.mode, 'practice');
  for (const options of [null, [], { mode: 'unsafe' }, { mode: 'practice', seed: 'untrusted' }]) {
    assert.equal((await api(h.host, '/api/rooms', { body: { gameId: 'gravity-orchard', options } })).status, 400);
  }
  const refused = await api(h.host, `/api/rooms/${h.room.code}/action`, {
    token: h.room.tokens.jon, body: { revision: h.room.started.revision, actionId: crypto.randomUUID(), action: { type: 'ready' } },
  });
  assert.equal(refused.value.code, 'realtime_required');
  assert.equal((await api(h.host, `/api/rooms/${h.room.code}/rematch`, { body: {}, token: h.room.tokens.host })).value.code, 'realtime_required');
});

test('two real authenticated sockets drive GO1 with bounded SQLite writes and recipient-only applied ACKs', async t => {
  const startedAt = Date.now();
  const h = await harness(t);
  assert.deepEqual(h.jon.welcome.viewer, { role: 'player', playerId: 'jon' });
  assert.deepEqual(h.lydia.welcome.viewer, { role: 'player', playerId: 'lydia' });
  assert.deepEqual(h.tv.welcome.viewer, { role: 'host', playerId: null });
  await h.ready(); await h.pump(3100);
  assert.equal(h.tv.snapshot.view.phase, 'playing');
  const before = h.host.realtimeDiagnostics(h.room.code);
  // The pump advances simulation time. Keep wall-clock presence heartbeats
  // out of the SQLite measurement even if this test takes longer on CI.
  const wallClock = t.mock.method(Date, 'now', () => startedAt);
  try {
    await h.pump(6000, { x: 0.5, y: -0.25, brake: false });
  } finally {
    wallClock.mock.restore();
  }
  const after = h.host.realtimeDiagnostics(h.room.code);
  assert.ok(after.coordinator.inputsAccepted - before.coordinator.inputsAccepted >= 230);
  assert.ok(after.checkpointWrites - before.checkpointWrites <= 2);
  assert.equal(after.databaseChanges - before.databaseChanges, (after.checkpointWrites - before.checkpointWrites) * 2);
  assert.ok(h.tv.snapshot.view.tick >= 540);
  assert.equal(h.tv.snapshot.ack, null);
  assert.equal(h.jon.snapshot.ack.controllerEpoch, h.jon.welcome.controllerEpoch);
  assert.equal(h.lydia.snapshot.ack.controllerEpoch, h.lydia.welcome.controllerEpoch);
  assert.notEqual(h.jon.snapshot.ack.controllerEpoch, h.lydia.snapshot.ack.controllerEpoch);
  assert.ok(h.jon.snapshot.ack.appliedTick <= h.jon.snapshot.view.tick);
  const get = await api(h.host, `/api/rooms/${h.room.code}`, { token: h.room.tokens.host });
  assert.equal(get.value.state.tick, h.tv.snapshot.view.tick);
  assert.equal(get.value.state.matchId, h.tv.snapshot.view.matchId);
  const serialized = JSON.stringify([...h.jon.messages, ...h.lydia.messages, ...h.tv.messages, get.value]);
  for (const secret of [...Object.values(h.room.tokens), 'hostHash', 'tokenHash', 'clientHash', 'coordinatorSchema', 'checksum', 'recentActions']) assert.ok(!serialized.includes(secret), secret);
});

test('HTTP/SSE lifecycle, recenter, both-ready resume, stale epochs and stale TCP input share one authority', async t => {
  const h = await harness(t);
  const abort = new AbortController();
  const response = await fetch(`${h.host.origin}/api/rooms/${h.room.code}/events`, { headers: { Authorization: `Bearer ${h.room.tokens.host}` }, signal: abort.signal });
  assert.equal(response.status, 200);
  const reader = response.body.getReader(); const events = [];
  const decode = createEventDecoder((kind, value) => { if (kind === 'room') events.push(value); });
  const pumping = (async () => { const decoder = new TextDecoder(); try { for (;;) { const { done, value } = await reader.read(); if (done) break; decode(decoder.decode(value, { stream: true })); } } catch {} })();
  t.after(async () => { abort.abort(); await reader.cancel().catch(() => {}); await pumping; });
  await h.ready(); await h.pump(3100);
  const oldInput = h.jon.input({ x: 1, y: 0, brake: false }); await flush();
  const oldEpoch = h.jon.snapshot.view.runEpoch;
  assert.equal((await h.jon.command('pause', { reason: 'recenter' })).result.accepted, true);
  await until(() => events.some(room => room.state?.phase === 'paused'));
  const get = await api(h.host, `/api/rooms/${h.room.code}`);
  assert.equal(get.value.state.pauseReason, 'recenter');
  assert.ok(get.value.state.runEpoch > oldEpoch);
  h.jon.send({ ...oldInput, seq: oldInput.seq + 100 }); await flush();
  assert.equal(h.tv.snapshot.view.players.jon.input.brake, true);
  h.jon.input(); h.lydia.input(); await flush();
  const onlyJon = await h.jon.command('ready', { value: true });
  assert.equal(onlyJon.result.accepted, true);
  assert.equal(h.tv.snapshot.view.phase, 'paused');
  h.jon.input(); h.lydia.input(); await flush();
  assert.equal((await h.lydia.command('ready', { value: true })).result.accepted, true);
  await h.pump(3200);
  const before = h.host.realtimeDiagnostics(h.room.code).coordinator;
  for (let i = 0; i < 50; i++) {
    h.jon.input({ x: 1, y: 0, brake: false }, { observedTick: 0 });
    h.lydia.input(); await flush(); await h.clock.advance(50);
  }
  assert.equal(h.tv.snapshot.view.phase, 'paused');
  assert.equal(h.tv.snapshot.view.pauseReason, 'network');
  const after = h.host.realtimeDiagnostics(h.room.code).coordinator;
  assert.ok((after.rejectedInputReasons.stale_tick || 0) > (before.rejectedInputReasons.stale_tick || 0));
});

test('unknown/cross-room tokens, host steering and hostile upgrades cannot gain a player seat', async t => {
  const h = await harness(t);
  const other = await createRoom(h.host);
  const wrong = await connectPeer(h.host, other, 'jon', { token: h.room.tokens.jon });
  t.after(() => wrong.ws.terminate());
  assert.equal(wrong.welcome, null);
  const invalid = await connectPeer(h.host, h.room, 'jon', { token: 'x'.repeat(43) });
  t.after(() => invalid.ws.terminate());
  assert.equal(invalid.welcome, null);
  const before = h.host.realtimeDiagnostics(h.room.code).coordinator.inputsAccepted;
  h.tv.send({ ...h.jon.input(), controllerEpoch: h.tv.welcome.controllerEpoch }); await flush();
  assert.equal(h.host.realtimeDiagnostics(h.room.code).coordinator.inputsAccepted, before + 1);
  for (const origin of ['https://foreign.example', `${h.host.origin}/`, 'null']) {
    const bad = new WebSocket(h.host.origin.replace('http:', 'ws:') + '/api/realtime/gravity-orchard', { origin });
    const rejected = new Promise(resolve => bad.once('unexpected-response', (_req, res) => { res.resume(); resolve(res.statusCode); bad.terminate(); }));
    bad.on('error', () => {});
    assert.equal(await rejected, 403);
  }
});

test('lost command acknowledgment, controller replacement and rematch never replay an old action', async t => {
  const h = await harness(t);
  await h.ready(); await h.pump(3100);
  const old = h.jon.snapshot.view;
  const command = { type: 'command', protocol: 1, id: crypto.randomUUID(), matchId: old.matchId, runEpoch: old.runEpoch, kind: 'pause', payload: { reason: 'help' } };
  // Ignore the first reply, then remove that connection before consuming it.
  h.jon.send(command); await until(() => h.host.realtimeDiagnostics(h.room.code).coordinator.phase === 'paused');
  const pausedEpoch = h.host.realtimeDiagnostics(h.room.code).coordinator.runEpoch;
  h.jon.ws.terminate(); await flush();
  const replacement = await h.connect('jon'); h.players.jon = replacement;
  replacement.send(command);
  const replay = await until(() => replacement.messages.find(message => message.type === 'command-result' && message.id === command.id));
  assert.equal(replay.accepted, true);
  assert.equal(h.host.realtimeDiagnostics(h.room.code).coordinator.runEpoch, pausedEpoch);
  replacement.send({ ...command, payload: { reason: 'requested' } });
  await until(() => replacement.messages.some(message => message.type === 'command-result' && message.code === 'command_conflict'));
  const rematch = await h.tv.command('rematch', { seedMode: 'same' });
  assert.equal(rematch.result.accepted, true);
  assert.notEqual(h.tv.snapshot.view.matchId, old.matchId);
  replacement.send(command);
  await flush();
  assert.equal(h.tv.snapshot.view.phase, 'waiting');
  assert.equal(h.tv.snapshot.view.tick, 0);
});

test('host stalls pause instead of catching up and restart restores a durable paused epoch', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'go7-recovery-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const databasePath = path.join(directory, 'rooms.sqlite');
  const h = await harness(t, { databasePath });
  await h.ready(); await h.pump(3500);
  const before = h.tv.snapshot.view;
  await h.clock.jump(1250);
  assert.equal(h.tv.snapshot.view.phase, 'paused');
  assert.equal(h.tv.snapshot.view.pauseReason, 'host-stall');
  assert.equal(h.tv.snapshot.view.tick, before.tick);
  const prior = h.tv.snapshot.view;
  for (const peer of h.peers) peer.ws.terminate(); await flush();
  await h.host.close();
  const recovered = await startLanServer({ host: '127.0.0.1', port: 0, databasePath, enableGravityOrchard: true, realtimeClock: manualClock() });
  t.after(() => recovered.close());
  const directSocket = await connectPeer(recovered, h.room, 'host');
  t.after(() => directSocket.ws.terminate());
  assert.equal(directSocket.welcome.snapshot.view.phase, 'paused');
  assert.equal(directSocket.welcome.snapshot.view.pauseReason, 'recovery');
  assert.ok(directSocket.welcome.snapshot.view.runEpoch > prior.runEpoch);
  assert.equal(directSocket.welcome.snapshot.view.tick, prior.tick);
  assert.deepEqual(directSocket.welcome.snapshot.view.ready, { jon: false, lydia: false });
  assert.deepEqual(directSocket.welcome.snapshot.view.players.jon.input, NEUTRAL);
  const raw = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const coarse = JSON.parse(raw.prepare('SELECT data FROM sofa_rooms WHERE code = ?').get(h.room.code).data);
    const checkpoint = JSON.parse(raw.prepare('SELECT checkpoint FROM sofa_gravity_checkpoints WHERE code = ?').get(h.room.code).checkpoint);
    assert.equal(coarse.state.runEpoch, checkpoint.runEpoch);
    assert.equal(coarse.state.matchId, checkpoint.matchId);
    assert.equal(coarse.state.phase, 'paused');
    assert.equal(checkpoint.engine.state.phase, 'paused');
  } finally { raw.close(); }
});

test('graceful whole-host restart reconnects the same clients and credentials to paused recovery', { timeout: 300_000 }, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'go7-live-restart-'));
  const databasePath = path.join(directory, 'rooms.sqlite');
  const clock = manualClock();
  let host = await startLanServer({ host: '127.0.0.1', port: 0, databasePath, enableGravityOrchard: true, realtimeClock: clock });
  const origin = host.origin, port = host.port;
  const room = await createRoom(host, { mode: 'practice' });
  const clients = {}, snapshots = {}, states = {}, connections = { host: 0, jon: 0, lydia: 0 };
  t.after(async () => {
    for (const client of Object.values(clients)) client.dispose();
    await host.close(); await rm(directory, { recursive: true, force: true });
  });
  // Drive the clients' input and reconnect timers alongside the host scheduler.
  // A slow OS scheduling turn must not look like a host stall or stale input.
  t.mock.timers.enable({ apis: ['setTimeout'] });
  async function advanceUntil(check, message = 'Expected the room transition.') {
    for (let step = 0; step < 160; step++) {
      if (check()) return;
      t.mock.timers.tick(50);
      await clock.advance(50);
    }
    assert.fail(message);
  }
  class LocalSocket extends WebSocket { constructor(url) { super(url, { origin }); } }
  for (const seat of ['host', 'jon', 'lydia']) {
    clients[seat] = createRealtimeClient({ url: origin.replace('http:', 'ws:') + '/api/realtime/gravity-orchard',
      roomCode: room.code, token: room.tokens[seat], WebSocketImpl: LocalSocket, now: clock.now,
      onSnapshot: snapshot => { snapshots[seat] = snapshot; },
      onStatus: status => { states[seat] = status.state; if (status.state === 'connected') connections[seat]++; },
    });
    clients[seat].connect();
  }
  const ready = seat => clients[seat].sendCommand({ id: crypto.randomUUID(), kind: 'ready', payload: { value: true } });
  await advanceUntil(() => snapshots.host?.presence.jon.inputFresh && snapshots.host?.presence.lydia.inputFresh);
  assert.equal((await ready('jon')).accepted, true);
  assert.equal((await ready('lydia')).accepted, true);
  await advanceUntil(() => snapshots.host?.view.phase === 'playing');
  clients.jon.setInput({ x: 0.5, y: -0.25, brake: false });
  await advanceUntil(() => snapshots.host?.view.players.jon.input.x === 0.5);
  const before = snapshots.host.view;
  await host.close();
  // Keep all original clients mounted. A host restart must not require a page
  // reload, a new credential, or a replacement realtime client object.
  host = await startLanServer({ host: '127.0.0.1', port, databasePath, enableGravityOrchard: true, realtimeClock: clock });
  await advanceUntil(() => Object.keys(clients).every(seat => connections[seat] >= 2 && states[seat] === 'connected'
    && snapshots[seat]?.view.pauseReason === 'recovery' && snapshots[seat]?.view.runEpoch > before.runEpoch),
  'Same TV and phone client instances must reconnect after a graceful host restart.');
  const recovered = snapshots.host.view;
  assert.equal(recovered.matchId, before.matchId);
  assert.equal(recovered.phase, 'paused');
  assert.deepEqual(recovered.ready, { jon: false, lydia: false });
  assert.deepEqual(recovered.players.jon.input, NEUTRAL);
  assert.deepEqual(recovered.players.lydia.input, NEUTRAL);
  assert.equal(host.realtimeDiagnostics(room.code).coordinator.sockets, 3);
  const read = await api(host, `/api/rooms/${room.code}`, { token: room.tokens.host });
  assert.equal(read.status, 200); assert.equal(read.value.state.runEpoch, recovered.runEpoch);
  await advanceUntil(() => snapshots.host.presence.jon.inputFresh && snapshots.host.presence.lydia.inputFresh);
  assert.equal((await ready('jon')).accepted, true);
  assert.equal(snapshots.host.view.phase, 'paused', 'One returning controller cannot resume alone.');
  assert.equal((await ready('lydia')).accepted, true);
  await advanceUntil(() => snapshots.host.view.phase === 'playing');
  assert.ok(snapshots.host.view.runEpoch > recovered.runEpoch);
  assert.deepEqual(snapshots.host.view.players.jon.input, NEUTRAL, 'Old held steering stays cleared after recovery.');
  for (const client of Object.values(clients)) {
    assert.ok(client.getStats().reconnects >= 1);
    assert.equal(client.getStats().invalidMessages, 0);
  }
});

test('expiry in the original room database revokes already authenticated sockets and HTTP views', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'go7-expiry-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const databasePath = path.join(directory, 'rooms.sqlite');
  const h = await harness(t, { databasePath });
  assert.ok(h.peers.every(peer => peer.ws.readyState === WebSocket.OPEN));
  const database = new DatabaseSync(databasePath);
  try {
    database.prepare('UPDATE sofa_rooms SET expires_at = ? WHERE code = ?').run(Date.now() - 1, h.room.code);
  } finally { database.close(); }
  await h.clock.advance(1050);
  assert.ok(h.peers.every(peer => peer.ws.readyState === WebSocket.CLOSED), 'The shared expiry authority revokes TV and both phones.');
  const read = await api(h.host, `/api/rooms/${h.room.code}`, { token: h.room.tokens.host });
  assert.equal(read.status, 410);
  assert.equal(read.value.code, 'room_expired');
  const reconnect = await connectPeer(h.host, h.room, 'jon');
  t.after(() => reconnect.ws.terminate());
  assert.equal(reconnect.welcome, null, 'Expired credentials cannot obtain a replacement realtime capability.');
});

test('two concurrent orchard rooms isolate steering, snapshots and durable lifecycle changes', async t => {
  const h = await harness(t);
  const otherRoom = await createRoom(h.host);
  const other = {};
  for (const seat of ['jon', 'lydia', 'host']) {
    other[seat] = await connectPeer(h.host, otherRoom, seat);
    h.peers.push(other[seat]);
  }
  other.jon.input(); other.lydia.input(); await flush();
  assert.equal((await other.jon.command('ready', { value: true })).result.accepted, true);
  assert.equal((await other.lydia.command('ready', { value: true })).result.accepted, true);
  await h.ready();
  const firstInput = { x: 0.6, y: 0.1, brake: false };
  const otherInput = { x: -0.4, y: 0.3, brake: false };
  async function pumpBoth(milliseconds) {
    for (let elapsed = 0; elapsed < milliseconds; elapsed += 50) {
      h.jon.input(firstInput); h.lydia.input(firstInput);
      other.jon.input(otherInput); other.lydia.input(otherInput);
      await flush(); await h.clock.advance(50);
    }
  }
  await pumpBoth(3250);
  assert.equal(h.tv.snapshot.view.phase, 'playing');
  assert.equal(other.host.snapshot.view.phase, 'playing');
  assert.notEqual(h.tv.snapshot.view.matchId, other.host.snapshot.view.matchId);
  assert.deepEqual(h.tv.snapshot.view.players.jon.input, firstInput);
  assert.deepEqual(other.host.snapshot.view.players.jon.input, otherInput);
  const otherBefore = other.host.snapshot.view;
  const rejectionBefore = h.host.realtimeDiagnostics(h.room.code).coordinator.inputsRejected;
  h.jon.input(firstInput, { matchId: otherBefore.matchId, runEpoch: otherBefore.runEpoch, observedTick: otherBefore.tick });
  await flush();
  assert.equal(h.host.realtimeDiagnostics(h.room.code).coordinator.inputsRejected, rejectionBefore + 1);
  assert.equal((await h.tv.command('pause', { reason: 'help' })).result.accepted, true);
  const pausedTick = h.tv.snapshot.view.tick;
  await pumpBoth(300);
  assert.equal(h.tv.snapshot.view.phase, 'paused');
  assert.equal(h.tv.snapshot.view.tick, pausedTick);
  assert.equal(other.host.snapshot.view.phase, 'playing');
  assert.equal(other.host.snapshot.view.runEpoch, otherBefore.runEpoch);
  assert.ok(other.host.snapshot.view.tick > otherBefore.tick);
  assert.deepEqual(other.host.snapshot.view.players.jon.input, otherInput);
  for (const [room, peer] of [[h.room, h.tv], [otherRoom, other.host]]) {
    const read = await api(h.host, `/api/rooms/${room.code}`, { token: room.tokens.host });
    assert.equal(read.status, 200);
    assert.equal(read.value.state.matchId, peer.snapshot.view.matchId);
    assert.equal(read.value.state.phase, peer.snapshot.view.phase);
    for (const message of peer.messages) {
      const snapshot = message.type === 'welcome' ? message.snapshot : message.type === 'snapshot' ? message : message.snapshot;
      if (snapshot) assert.equal(snapshot.roomCode, room.code);
    }
  }
});

test('failed room-row update rolls back the new Orchard checkpoint and closes the faulted room', { timeout: 300_000 }, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'go7-rollback-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const databasePath = path.join(directory, 'rooms.sqlite');
  const h = await harness(t, { databasePath });
  await h.ready();
  await h.pump(3100);
  const view = h.tv.snapshot.view;
  assert.equal(view.phase, 'playing');
  const db = new DatabaseSync(databasePath);
  t.after(() => db.close());
  const rows = () => ({
    room: db.prepare('SELECT * FROM sofa_rooms WHERE code = ?').get(h.room.code),
    checkpoint: db.prepare('SELECT * FROM sofa_gravity_checkpoints WHERE code = ?').get(h.room.code),
  });
  const before = rows();
  // The update follows the checkpoint upsert in the same host transaction.
  db.exec(`CREATE TRIGGER fail_pause BEFORE UPDATE OF data ON sofa_rooms
    WHEN json_extract(NEW.data, '$.state.pauseReason') = 'help'
    BEGIN SELECT RAISE(ABORT, 'injected pause failure'); END`);
  const closed = Promise.all(h.peers.map(peer => once(peer.ws, 'close')));
  const id = crypto.randomUUID();
  h.tv.send({ type: 'command', protocol: 1, matchId: view.matchId, runEpoch: view.runEpoch,
    id, kind: 'pause', payload: { reason: 'help' } });
  for (const [code] of await closed) assert.equal(code, 1011);
  for (const peer of h.peers) {
    assert.equal(peer.messages.some(m => m.type === 'snapshot' && m.view.pauseReason === 'help'), false);
    assert.equal(peer.messages.some(m => m.type === 'command-result' && m.id === id && m.accepted), false);
  }
  assert.deepEqual(rows(), before);
  db.exec('DROP TRIGGER fail_pause');
  await h.host.close();
  const restarted = await startLanServer({ host: '127.0.0.1', port: 0, databasePath,
    enableGravityOrchard: true, realtimeClock: manualClock() });
  t.after(() => restarted.close());
  const read = await api(restarted, `/api/rooms/${h.room.code}`, { token: h.room.tokens.host });
  assert.equal(read.status, 200);
  assert.equal(read.value.state.matchId, view.matchId);
  assert.equal(read.value.state.phase, 'paused');
  assert.equal(read.value.state.pauseReason, 'recovery');
  assert.equal(JSON.parse(rows().checkpoint.checkpoint).commands.some(entry => entry.command.id === id), false);
});

test('expired orchards free coordinator capacity and restart restores only the newest live checkpoint within its budget', async t => {
  t.mock.timers.enable({ apis: ['Date'] });
  const directory = await mkdtemp(path.join(tmpdir(), 'go7-room-limit-'));
  const databasePath = path.join(directory, 'rooms.sqlite');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const options = { port: 0, host: '127.0.0.1', databasePath,
    enableGravityOrchard: true, realtimeClock: manualClock() };
  let host = await startLanServer({ ...options, orchardRoomLimit: 1 });
  t.after(() => host.close());
  const expired = await createRoom(host);
  t.mock.timers.tick(24 * 60 * 60 * 1000 - 1);
  const replacement = await api(host, '/api/rooms', { body: { gameId: 'gravity-orchard' } });
  for (const playerId of ['jon', 'lydia']) {
    assert.equal((await api(host, `/api/rooms/${replacement.value.code}/join`, {
      body: { playerId, clientId: crypto.randomUUID() },
    })).status, 200);
  }
  const startReplacement = () => api(host, `/api/rooms/${replacement.value.code}/start`, {
    body: {}, token: replacement.value.hostToken,
  });
  assert.equal((await startReplacement()).status, 503);
  t.mock.timers.tick(2);
  assert.equal((await startReplacement()).status, 200);
  assert.equal(host.realtimeDiagnostics(expired.code).coordinator, null);
  await host.close();

  host = await startLanServer(options);
  t.mock.timers.tick(1);
  const newest = await createRoom(host);
  await host.close();
  host = await startLanServer({ ...options, orchardRoomLimit: 1 });
  assert.equal(host.realtimeDiagnostics(newest.code).coordinator.matchId, newest.started.state.matchId);
  assert.equal(host.realtimeDiagnostics(replacement.value.code).coordinator, null);
  assert.equal(host.realtimeDiagnostics(expired.code).coordinator, null);
  assert.equal(host.realtimeDiagnostics(newest.code).checkpointWrites, 1);
});

test('a second host that cannot bind leaves the running orchard checkpoint intact', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'go7-occupied-port-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const options = { host: '127.0.0.1', port: 0, databasePath: path.join(directory, 'rooms.sqlite'),
    realtimeClock: manualClock() };
  const host = await startLanServer(options);
  t.after(() => host.close());
  const room = await createRoom(host);
  const read = () => api(host, '/api/rooms/' + room.code, { token: room.tokens.host });
  const before = await read();
  assert.equal(before.status, 200);
  await assert.rejects(startLanServer({ ...options, port: host.port }), { code: 'EADDRINUSE' });
  assert.equal((await read()).value.revision, before.value.revision);
});
