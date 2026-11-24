import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import WebSocket from 'ws';
import { readCoordinatorDiagnostics, LIMITS } from '../index.mjs';
import { harness, start, send, input, command, until, drain, clone,
  ROOM, OTHER_ROOM, NEUTRAL, probeSimulation, strictPolicy } from './protocol-support.mjs';

function liveProbe(tick = 0) {
  const result = probeSimulation();
  const create = result.simulation.createRun;
  result.simulation.createRun = args => ({ ...create(args), phase: 'playing', tick });
  return result;
}

async function rejectUpgrade(h, { headers, url = h.url, wsOptions = {} } = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers: headers || { Origin: h.origin }, ...wsOptions });
    ws.on('unexpected-response', (_, response) => {
      response.resume();
      response.once('end', () => { ws.terminate(); resolve(response.statusCode); });
    });
    ws.on('open', () => { ws.terminate(); reject(new Error('Unexpected accepted upgrade.')); });
    ws.on('error', () => {});
  });
}

test('upgrade policy fails closed for missing, throwing, false, async and nonboolean callbacks', async t => {
  for (const [label, policy] of [
    ['missing', null], ['throws', () => { throw new Error('secret-error-canary'); }],
    ['false', () => false], ['string', () => 'true'], ['async', async () => true], ['undefined', () => undefined],
  ]) await t.test(label, async () => {
    const h = await harness({ validateUpgrade: policy });
    try { assert.equal(await rejectUpgrade(h), 403); }
    finally { await h.close(); }
  });
});

test('HTTP origin policy checks original Host/route and refuses forwarded-header scheme spoofing', async t => {
  const requests = [];
  const h = await harness({ validateUpgrade: request => {
    requests.push({ encrypted: Boolean(request.socket.encrypted), headers: { ...request.headers }, url: request.url });
    return strictPolicy(request);
  } });
  t.after(() => h.close());
  await start(h);
  const accepted = await h.connect();
  assert.equal(accepted.welcome()?.viewer.playerId, 'jon');
  for (const headers of [
    {}, { Origin: 'null' }, { Origin: 'https://attacker.invalid' },
    { Origin: h.origin.replace('http:', 'https:'), 'X-Forwarded-Proto': 'https' },
    { Origin: h.origin, Host: 'attacker.invalid', 'X-Forwarded-Host': new URL(h.origin).host },
  ]) assert.equal(await rejectUpgrade(h, { headers }), 403);
  assert.equal(await rejectUpgrade(h, { url: `${h.url}?token=never-accepted` }), 403);
  const spoofed = requests.find(request => request.headers['x-forwarded-proto']);
  assert.equal(spoofed.encrypted, false);
  assert.equal(spoofed.headers['x-forwarded-proto'], 'https');
});

test('real HTTPS upgrade uses TLS identity with trusted test CA and does not rewrite Origin', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'go2-tls-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const keyPath = join(directory, 'key.pem');
  const certPath = join(directory, 'certificate.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '1',
    '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1',
    '-keyout', keyPath, '-out', certPath], { stdio: 'ignore' });
  const tls = { key: await readFile(keyPath), cert: await readFile(certPath) };
  const seen = [];
  const h = await harness({ tls, validateUpgrade: request => {
    seen.push({ encrypted: request.socket.encrypted, origin: request.headers.origin });
    return strictPolicy(request);
  } });
  t.after(() => h.close());
  await start(h);
  const accepted = await h.connect();
  assert.equal(accepted.welcome()?.viewer.playerId, 'jon');
  const wrongOrigin = h.origin.replace('https:', 'http:');
  assert.equal(await rejectUpgrade(h, { headers: { Origin: wrongOrigin, 'X-Forwarded-Proto': 'https' }, wsOptions: { ca: tls.cert } }), 403);
  assert.ok(seen.every(request => request.encrypted === true));
  assert.ok(seen.some(request => request.origin === wrongOrigin));
});

test('first-message deadline is five seconds and unrelated traffic cannot establish ownership', async t => {
  const h = await harness();
  t.after(() => h.close());
  await start(h);
  const quiet = await h.connect({ auth: false });
  await h.clock.advance(4999);
  assert.equal(quiet.ws.readyState, WebSocket.OPEN);
  await h.clock.advance(1);
  await until(() => quiet.ws.readyState !== WebSocket.OPEN, 'authentication timeout');
  assert.equal(quiet.welcome(), undefined);
  const earlyInput = await h.connect({ auth: false });
  await send(earlyInput, { type: 'input', protocol: 1, playerId: 'jon', x: 1, y: 0, brake: false });
  await until(() => earlyInput.ws.readyState !== WebSocket.OPEN, 'pre-auth rejection');
  assert.equal(earlyInput.welcome(), undefined);
});

test('unknown/cross-room tokens and invalid trusted role-seat pairings never receive snapshots', async t => {
  const h = await harness();
  t.after(() => h.close());
  await start(h);
  await start(h, OTHER_ROOM);
  const wrongRoomToken = h.token(OTHER_ROOM, 'player', 'jon');
  const wrong = await h.connect({ bearer: wrongRoomToken });
  assert.equal(wrong.welcome(), undefined);
  assert.equal(wrong.received.some(message => message.type === 'snapshot'), false);
  for (const [role, playerId] of [['public', null], ['host', 'jon'], ['player', null], ['player', 'outsider']]) {
    const bearer = h.token(ROOM, role, playerId);
    const client = await h.connect({ bearer });
    assert.equal(client.welcome(), undefined, `Rejected ${role} pairing`);
  }
});

test('pending authorization is bounded, expires and cannot resurrect a closed socket', async t => {
  let resolveAuthorization;
  const h = await harness({ authorize: () => new Promise(resolve => { resolveAuthorization = resolve; }) });
  t.after(() => h.close());
  await start(h);
  const client = await h.connect();
  await h.clock.advance(5000);
  await until(() => client.ws.readyState !== WebSocket.OPEN, 'slow auth deadline');
  resolveAuthorization({ role: 'player', playerId: 'jon' });
  await drain(20);
  assert.equal(client.welcome(), undefined);
  assert.equal(h.coordinator.getPublicView(ROOM, { role: 'public', playerId: null }).phase, 'waiting');
});

test('host cannot steer, and wire actors never reach the pure normalizer', async t => {
  const live = liveProbe();
  const h = await harness({ simulation: live.simulation });
  t.after(() => h.close());
  await start(h);
  const host = await h.connect({ role: 'host', playerId: null });
  const jon = await h.connect();
  const lydia = await h.connect({ playerId: 'lydia' });
  const before = live.stats.normalize;
  await send(host, input(host, { controllerEpoch: 'fabricated-epoch', x: 1, brake: false }));
  await send(jon, input(jon, { playerId: 'lydia', x: 1, brake: false }));
  await send(lydia, input(lydia, { actor: { role: 'host' }, x: 1, brake: false }));
  assert.equal(live.stats.normalize, before);
  await h.clock.advance(20);
  const view = h.coordinator.getPublicView(ROOM, { role: 'public', playerId: null });
  assert.deepEqual(view.players.jon.input, NEUTRAL);
  assert.deepEqual(view.players.lydia.input, NEUTRAL);
});

test('malformed, binary, deeply nested and oversized frames are bounded without engine invocation', async t => {
  const live = liveProbe();
  const h = await harness({ simulation: live.simulation });
  t.after(() => h.close());
  await start(h);
  const cases = [
    '{', '[]', JSON.stringify({ type: 'unknown', protocol: 1 }),
    JSON.stringify({ type: 'auth', protocol: 1, roomCode: ROOM, token: 'x'.repeat(5000) }),
    JSON.stringify({ type: 'command', protocol: 1, payload: { nested: { nested: { nested: { nested: { nested: true } } } } } }),
    new Uint8Array([0, 255, 128]),
  ];
  for (const frame of cases) {
    const client = await h.connect();
    const before = live.stats.normalize;
    client.ws.send(frame);
    await drain(10);
    assert.equal(live.stats.normalize, before);
    client.ws.terminate();
    await drain();
  }
  const rawOversized = await h.connect();
  await send(rawOversized, 'x'.repeat(4097));
  await until(() => rawOversized.ws.readyState !== WebSocket.OPEN, 'oversize rejection');
});

test('stale TCP backlog, future tick, stale epochs and unsafe counters cannot refresh control', async t => {
  const live = liveProbe(100);
  const h = await harness({ simulation: live.simulation });
  t.after(() => h.close());
  await start(h);
  const jon = await h.connect();
  const overrides = [
    { observedTick: 69 }, { observedTick: 101 }, { matchId: 'obsolete-match' }, { runEpoch: 999 },
    { controllerEpoch: 'obsolete-controller' }, { seq: -1 }, { seq: 0.5 }, { seq: Number.MAX_SAFE_INTEGER + 1 },
    { observedTick: -1 }, { protocol: 2 }, { x: 1.001 }, { x: null }, { y: '0' }, { brake: 1 },
  ];
  for (const override of overrides) {
    // Some invalid schemas close the socket: reopen, preserving the independently
    // observed engine state instead of assuming an implementation-specific code.
    const client = jon.ws.readyState === WebSocket.OPEN ? jon : await h.connect();
    const before = live.stats.normalize;
    await send(client, input(client, override));
    assert.equal(live.stats.normalize, before, `Rejected fields ${Object.keys(override).join(',')}`);
    if (client !== jon) client.ws.terminate();
  }
  const overflow = await h.connect();
  const raw = JSON.stringify(input(overflow)).replace('"x":0', '"x":1e309');
  const before = live.stats.normalize;
  await send(overflow, raw);
  assert.equal(live.stats.normalize, before);
  await h.clock.advance(260);
  assert.deepEqual(h.coordinator.getPublicView(ROOM, { role: 'public', playerId: null }).players.jon.input, NEUTRAL);
});

test('acknowledgment is recipient-private and follows applied latest value, not receipt', async t => {
  const live = liveProbe();
  const h = await harness({ simulation: live.simulation });
  t.after(() => h.close());
  await start(h);
  const jon = await h.connect();
  const lydia = await h.connect({ playerId: 'lydia' });
  const host = await h.connect({ role: 'host', playerId: null });
  await send(jon, input(jon, { seq: 1, x: 0.2, brake: false }));
  await send(jon, input(jon, { seq: 2, x: 0.8, brake: false }));
  assert.equal(jon.latest().ack, null);
  assert.equal(live.stats.step, 0);
  await h.clock.advance(51);
  assert.equal(jon.latest().ack?.seq, 2);
  assert.ok(jon.latest().ack.appliedTick > 0);
  assert.ok(jon.latest().ack.appliedTick <= jon.latest().view.tick);
  assert.deepEqual(jon.latest().view.players.jon.input, { x: 0.8, y: 0, brake: false });
  assert.equal(lydia.latest().ack, null);
  assert.equal(host.latest().ack, null);
  const privateEpoch = jon.welcome().controllerEpoch;
  assert.equal(JSON.stringify(lydia.received).includes(privateEpoch), false);
  assert.equal(JSON.stringify(host.received).includes(privateEpoch), false);
  await send(jon, input(jon, { seq: 2, x: -1, brake: false }));
  await send(jon, input(jon, { seq: 1, x: -1, brake: false }));
  await h.clock.advance(51);
  assert.equal(jon.latest().ack.seq, 2);
  assert.equal(jon.latest().view.players.jon.input.x, 0.8);
});

test('duplicate-seat takeover fences old input immediately and clears its latch', async t => {
  const live = liveProbe();
  const h = await harness({ simulation: live.simulation });
  t.after(() => h.close());
  await start(h);
  const old = await h.connect();
  await send(old, input(old, { seq: 1, x: 1, brake: false }));
  await h.clock.advance(51);
  assert.equal(old.latest().view.players.jon.input.x, 1);
  const replacement = await h.connect({ bearer: old.bearer });
  assert.notEqual(old.welcome().controllerEpoch, replacement.welcome().controllerEpoch);
  await h.clock.advance(51);
  assert.deepEqual(replacement.latest().view.players.jon.input, NEUTRAL);
  await send(replacement, input(replacement, { controllerEpoch: old.welcome().controllerEpoch, seq: 999, x: 1, brake: false }));
  await h.clock.advance(51);
  assert.deepEqual(h.coordinator.getPublicView(ROOM, { role: 'public', playerId: null }).players.jon.input, NEUTRAL);
  await until(() => old.ws.readyState !== WebSocket.OPEN, 'old seat fenced');
});

test('revocation/expiry reauthenticates existing connections and blocks subsequent controls', async t => {
  const h = await harness({ simulation: liveProbe().simulation });
  t.after(() => h.close());
  await start(h);
  const jon = await h.connect();
  h.grants.delete(`${ROOM}:${jon.bearer}`);
  await h.clock.advance(1100);
  await until(() => jon.ws.readyState !== WebSocket.OPEN, 'revoked connection closed');
  assert.equal(jon.received.some(message => message.type === 'auth'), false);
  const retry = await h.connect({ bearer: jon.bearer });
  assert.equal(retry.welcome(), undefined);
});

test('room isolation includes identity, snapshots, reliable IDs and closed-room cleanup', async t => {
  const h = await harness();
  t.after(() => h.close());
  await start(h);
  await start(h, OTHER_ROOM);
  const a = await h.connect();
  const b = await h.connect({ room: OTHER_ROOM });
  await send(a, input(a));
  await send(b, input(b));
  await send(a, command(a, 'same-command-id', 'ready', { value: true }));
  await send(b, command(b, 'same-command-id', 'ready', { value: true }));
  await drain(10);
  assert.equal(h.coordinator.getPublicView(ROOM, { role: 'public', playerId: null }).ready.jon, true);
  assert.equal(h.coordinator.getPublicView(OTHER_ROOM, { role: 'public', playerId: null }).ready.jon, true);
  assert.ok(a.received.filter(m => m.type === 'snapshot').every(m => m.roomCode === ROOM));
  assert.ok(b.received.filter(m => m.type === 'snapshot').every(m => m.roomCode === OTHER_ROOM));
  await h.coordinator.closeRoom(ROOM);
  assert.equal(h.coordinator.getPublicView(ROOM, { role: 'public', playerId: null }), null);
  assert.ok(h.coordinator.getPublicView(OTHER_ROOM, { role: 'public', playerId: null }));
  assert.equal(b.ws.readyState, WebSocket.OPEN);
});

test('lost acknowledgment retries survive reconnect, rematch and checkpoint restoration exactly once', async t => {
  const h = await harness({ simulation: liveProbe().simulation });
  t.after(() => h.close());
  await start(h);
  await h.coordinator.pauseRoom(ROOM, 'network');
  const host = await h.connect({ role: 'host', playerId: null });
  const oldMatch = host.latest().view.matchId;
  const request = command(host, 'uncertain-rematch', 'rematch', { seedMode: 'same' });
  await send(host, request);
  await until(() => host.received.some(m => m.type === 'command-result' && m.id === request.id), 'rematch result');
  const result = host.received.find(m => m.type === 'command-result' && m.id === request.id);
  assert.equal(result.accepted, true);
  const newMatch = h.coordinator.getPublicView(ROOM, { role: 'public', playerId: null }).matchId;
  assert.notEqual(newMatch, oldMatch);
  host.ws.terminate();
  const retry = await h.connect({ role: 'host', playerId: null, bearer: host.bearer });
  await send(retry, request);
  const replay = retry.received.find(m => m.type === 'command-result' && m.id === request.id);
  assert.deepEqual(replay, result);
  assert.equal(h.coordinator.getPublicView(ROOM, { role: 'public', playerId: null }).matchId, newMatch);
  await send(retry, { ...request, payload: { seedMode: 'new' } });
  const altered = retry.received.filter(m => m.type === 'command-result' && m.id === request.id).at(-1);
  assert.equal(altered.accepted, false);
  const checkpoint = clone(h.saved.get(ROOM));
  const recovered = await harness({ loadCheckpoint: async () => checkpoint });
  t.after(() => recovered.close());
  const restored = await start(recovered);
  assert.equal(restored.view.phase, 'paused');
  assert.equal(restored.view.matchId, newMatch);
  const recoveringHost = await recovered.connect({ role: 'host', playerId: null });
  await send(recoveringHost, request);
  assert.deepEqual(recoveringHost.received.find(m => m.type === 'command-result' && m.id === request.id), result);
  assert.equal(recovered.coordinator.getPublicView(ROOM, { role: 'public', playerId: null }).matchId, newMatch);
});

test('an unresolved lifecycle save cannot publish its epoch, acknowledge it, or advance gameplay', async t => {
  let hold = false;
  let release;
  let entered = false;
  const h = await harness({ simulation: liveProbe().simulation, saveCheckpoint: async () => {
    if (hold) { entered = true; await new Promise(resolve => { release = resolve; }); }
  } });
  t.after(() => h.close());
  await start(h);
  const host = await h.connect({ role: 'host', playerId: null });
  const original = host.latest().view;
  hold = true;
  const request = command(host, 'durable-pause', 'pause', { reason: 'requested' });
  await send(host, request);
  await until(() => entered, 'boundary store entered');
  await h.clock.advance(200);
  assert.equal(host.received.some(m => m.type === 'command-result' && m.id === request.id), false);
  assert.equal(host.received.some(m => m.type === 'snapshot' && m.view.runEpoch > original.runEpoch), false);
  assert.equal(h.coordinator.getPublicView(ROOM, { role: 'public', playerId: null }).tick, original.tick);
  hold = false;
  release();
  await drain(20);
  await until(() => host.received.some(m => m.type === 'command-result' && m.id === request.id), 'durable result');
  assert.equal(h.coordinator.getPublicView(ROOM, { role: 'public', playerId: null }).phase, 'paused');
});

test('actual SQLite checkpoint hook writes at coarse intervals, never per input', async t => {
  const database = new DatabaseSync(':memory:');
  database.exec('CREATE TABLE checkpoints (room TEXT PRIMARY KEY, value TEXT NOT NULL)');
  const upsert = database.prepare('INSERT INTO checkpoints VALUES (?, ?) ON CONFLICT(room) DO UPDATE SET value=excluded.value');
  let writes = 0;
  const h = await harness({ simulation: liveProbe().simulation, saveCheckpoint: async (room, checkpoint) => {
    upsert.run(room, JSON.stringify(checkpoint)); writes++;
  } });
  t.after(async () => { await h.close(); database.close(); });
  await start(h);
  const jon = await h.connect();
  const lydia = await h.connect({ playerId: 'lydia' });
  const baseline = writes;
  for (let seq = 0; seq < 120; seq++) {
    await send(jon, input(jon, { seq, x: seq % 2 ? 0.6 : -0.6, brake: false }));
    await send(lydia, input(lydia, { seq, y: 0.2, brake: false }));
    await h.clock.advance(50);
  }
  assert.ok(writes - baseline <= 2, `Expected coarse persistence; observed ${writes - baseline} writes for 240 samples.`);
  assert.equal(h.coordinator.getPublicView(ROOM, { role: 'public', playerId: null }).phase, 'playing');
  const saved = JSON.parse(database.prepare('SELECT value FROM checkpoints WHERE room = ?').get(ROOM).value);
  assert.equal(saved.matchId, `match-${ROOM}`);
  assert.equal(saved.runEpoch, 0);
  assert.equal(saved.engine.state.matchId, saved.matchId);
  assert.equal(saved.engine.state.runEpoch, saved.runEpoch);
  // The periodic write at five seconds captures 300 physics ticks (60 Hz).
  assert.equal(saved.engine.state.tick, 300);
  assert.ok(jon.latest().ack.seq >= 115);
});

test('diagnostics/public snapshots redact credentials and private engine state; disposal removes scheduled work', async () => {
  const h = await harness();
  await start(h);
  const jon = await h.connect();
  const host = await h.connect({ role: 'host', playerId: null });
  const serial = JSON.stringify({ messages: [...jon.received, ...host.received], diagnostics: readCoordinatorDiagnostics(h.coordinator) });
  assert.equal(serial.includes(jon.bearer), false);
  assert.equal(serial.includes(host.bearer), false);
  assert.equal(serial.includes('PRIVATE_PROBE_STATE_MUST_NOT_ESCAPE'), false);
  assert.equal(JSON.stringify(readCoordinatorDiagnostics(h.coordinator)).includes(jon.welcome().controllerEpoch), false);
  await h.close();
  assert.equal(h.clock.tasks.size, 0);
  await h.clock.advance(60_000);
  assert.equal(h.clock.tasks.size, 0);
  await h.coordinator.close();
});

test('actual paused TCP reader has one coalesced snapshot and bounded outbound memory', async t => {
  const large = probeSimulation();
  const project = large.simulation.project;
  large.simulation.project = (state, viewer) => ({ ...project(state, viewer), events: Array.from({ length: 64 }, (_, n) => ({
    id: `bounded-event-${n}`, kind: 'phase-change', tick: state.tick, data: { note: 'x'.repeat(600) },
  })) });
  const h = await harness({ simulation: large.simulation });
  t.after(() => h.close());
  await start(h);
  const reader = await h.connect({ role: 'host', playerId: null });
  reader.ws._socket.pause(); // Stop real TCP consumption; no patched bufferedAmount getter.
  let coalesced = 0;
  let maxBuffered = 0;
  for (let second = 0; second < 45; second++) {
    await h.clock.advance(1000);
    const diagnostic = readCoordinatorDiagnostics(h.coordinator, ROOM);
    assert.ok(diagnostic.pendingSnapshots <= 1);
    assert.ok(diagnostic.pendingInputs <= 2);
    maxBuffered = Math.max(maxBuffered, diagnostic.bufferedBytes, diagnostic.maxBufferedBytes);
    coalesced = Math.max(coalesced, diagnostic.snapshotsCoalesced);
    if (diagnostic.sockets === 0) break;
  }
  assert.ok(coalesced > 0, 'The real unread TCP stream must exercise snapshot coalescing.');
  assert.ok(maxBuffered <= LIMITS.outgoingHardBytes + LIMITS.maxSnapshotBytes, 'Output remains below cap plus one bounded frame.');
  assert.equal(readCoordinatorDiagnostics(h.coordinator, ROOM).sockets, 0, 'Persistently slow reader is disconnected.');
  reader.ws._socket.resume();
});

test('input flooding and per-room socket caps bound queued work without cross-room damage', async t => {
  const h = await harness({ simulation: liveProbe().simulation });
  t.after(() => h.close());
  await start(h);
  await start(h, OTHER_ROOM);
  const other = await h.connect({ room: OTHER_ROOM, role: 'host', playerId: null });
  const flood = await h.connect();
  const packet = input(flood);
  for (let seq = 0; seq < 100; seq++) flood.ws.send(JSON.stringify({ ...packet, seq }));
  await drain(20);
  await until(() => flood.ws.readyState !== WebSocket.OPEN, 'input flood bounded');
  const report = readCoordinatorDiagnostics(h.coordinator, ROOM);
  assert.ok(report.inputsAccepted <= LIMITS.inputBurst);
  assert.ok(report.pendingInputs <= 2);
  for (let i = 0; i < LIMITS.maxRoomSockets + 2; i++) await h.connect({ role: 'host', playerId: null });
  assert.ok(readCoordinatorDiagnostics(h.coordinator, ROOM).sockets <= LIMITS.maxRoomSockets);
  assert.equal(other.ws.readyState, WebSocket.OPEN);
  assert.equal(readCoordinatorDiagnostics(h.coordinator, OTHER_ROOM).sockets, 1);
});

test('an async command writer cannot be overwritten by a concurrent scheduled stage-end tick', async t => {
  const small = probeSimulation({ stageTicks: 1 });
  const create = small.simulation.createRun;
  small.simulation.createRun = args => ({ ...create(args), phase: 'playing' });
  let calls = 0;
  let release;
  const h = await harness({ simulation: small.simulation, authorize: async () => {
    if (++calls === 2) await new Promise(resolve => { release = resolve; });
    return { role: 'host', playerId: null };
  } });
  t.after(() => h.close());
  await start(h);
  const host = await h.connect({ role: 'host', playerId: null });
  await send(host, command(host, 'pause-over-tick', 'pause', { reason: 'requested' }));
  await until(() => !!release, 'command authorization pending');
  await h.clock.advance(100);
  release();
  await drain(20);
  const result = host.received.find(m => m.type === 'command-result' && m.id === 'pause-over-tick');
  assert.equal(result?.accepted, true);
  const view = h.coordinator.getPublicView(ROOM, { role: 'public', playerId: null });
  assert.equal(view.phase, 'paused');
  assert.equal(view.tick, 0);
  assert.equal(view.results.length, 0);
  assert.equal(view.runEpoch, 1);
});

test('a rejected command keeps its identity after fresh input and rejects changed-content reuse', async t => {
  const h = await harness();
  t.after(() => h.close());
  await start(h);
  const jon = await h.connect();
  const request = command(jon, 'rejected-ready-id', 'ready', { value: true });
  await send(jon, request);
  const initial = jon.received.find(m => m.type === 'command-result' && m.id === request.id);
  assert.equal(initial?.accepted, false);
  await send(jon, input(jon));
  await send(jon, request);
  const repeat = jon.received.filter(m => m.type === 'command-result' && m.id === request.id).at(-1);
  assert.deepEqual(repeat, initial);
  assert.equal(h.coordinator.getPublicView(ROOM, { role: 'public', playerId: null }).ready.jon, false);
  await send(jon, { ...request, payload: { value: false } });
  const conflict = jon.received.filter(m => m.type === 'command-result' && m.id === request.id).at(-1);
  assert.equal(conflict.accepted, false);
  assert.equal(conflict.code, 'command_conflict');
});

test('auth completing after closeRoom cannot attach a connection or retain a hidden room', async t => {
  let release;
  const h = await harness({ authorize: async () => {
    await new Promise(resolve => { release = resolve; });
    return { role: 'player', playerId: 'jon' };
  } });
  t.after(() => h.close());
  await start(h);
  const client = await h.connect();
  await until(() => !!release, 'authority pending');
  await h.coordinator.closeRoom(ROOM);
  release();
  await drain(20);
  assert.equal(client.welcome(), undefined);
  assert.equal(readCoordinatorDiagnostics(h.coordinator).rooms, 0);
  assert.equal(readCoordinatorDiagnostics(h.coordinator).sockets, 0);
});

test('coarse lifecycle hooks serialize and coalesce behind one unresolved notification', async t => {
  let release;
  const calls = [];
  const completedEpochs = [];
  const h = await harness({ simulation: liveProbe().simulation, onLifecycle: async event => {
    calls.push(event);
    if (calls.length === 1) await new Promise(resolve => { release = resolve; });
    completedEpochs.push(event.view.runEpoch);
  } });
  t.after(() => h.close());
  await start(h);
  const host = await h.connect({ role: 'host', playerId: null });
  await h.coordinator.pauseRoom(ROOM, 'network');
  await drain(10);
  assert.equal(calls.length, 1, 'Do not accumulate or reorder asynchronous lifecycle hooks.');
  assert.equal(completedEpochs.length, 0);
  release();
  await drain(20);
  assert.equal(calls.length, 2, 'Only the newest pending public state follows the active callback.');
  assert.deepEqual(completedEpochs, [0, 1]);
  assert.equal(calls[1].view.phase, 'paused');
  assert.ok(host.welcome());
});

test('close/reopen cannot let a delayed prior writer overwrite a newer recovery checkpoint', async t => {
  let hold = false;
  let release;
  let checkpoint;
  const writes = [];
  const h = await harness({ simulation: liveProbe().simulation,
    loadCheckpoint: async () => clone(checkpoint ?? null),
    saveCheckpoint: async (_room, value) => {
      if (hold) { hold = false; await new Promise(resolve => { release = resolve; }); }
      checkpoint = clone(value); writes.push(value.runEpoch);
    },
  });
  t.after(() => h.close());
  await start(h);
  hold = true;
  const pausing = h.coordinator.pauseRoom(ROOM, 'network').catch(error => error);
  await until(() => !!release, 'old writer pending');
  const closing = h.coordinator.closeRoom(ROOM);
  let reopened;
  const reopening = start(h).then(value => { reopened = { value }; }, error => { reopened = { error }; });
  await drain(15);
  assert.equal(Boolean(reopened?.value), false, 'Do not publish a new room with an independent in-flight writer.');
  release();
  await pausing;
  await closing;
  await reopening;
  const snapshot = reopened.error ? await start(h) : reopened.value;
  assert.equal(snapshot.view.phase, 'paused');
  assert.ok(writes.every((epoch, index) => index === 0 || epoch >= writes[index - 1]), 'Durable epochs never regress.');
  assert.equal(checkpoint.runEpoch, snapshot.view.runEpoch);
});
