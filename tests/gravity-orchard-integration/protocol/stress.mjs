/** Real-clock acceptance of slow readers, input flooding and owned timer cleanup. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { arch, cpus, platform } from 'node:os';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { startLanServer } from '../../../server/lan.mjs';
import { LIMITS } from '../../../server/runtime/gravity-orchard-dependencies.mjs';
import { createRealtimeClient } from '../../../ui/realtime/gravity-orchard/index.mjs';
import { connectPeer, createRoom } from './helpers.mjs';

const outputPath = process.argv.find(value => value.startsWith('--out='))?.slice(6);
const timers = new Set();
const clock = {
  now: () => performance.now(),
  setTimeout(fn, milliseconds) {
    const handle = setTimeout(() => { timers.delete(handle); fn(); }, milliseconds);
    timers.add(handle); return handle;
  },
  clearTimeout(handle) { clearTimeout(handle); timers.delete(handle); },
};
const summary = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return { count: sorted.length, minimum: sorted[0] ?? null, median: sorted[Math.floor(sorted.length / 2)] ?? null,
    p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? null, maximum: sorted.at(-1) ?? null };
};
async function waitFor(predicate, message, timeout = 10000) {
  const deadline = performance.now() + timeout;
  while (!predicate()) {
    if (performance.now() >= deadline) throw new Error(message);
    await delay(20);
  }
}

const host = await startLanServer({ host: '127.0.0.1', port: 0, databasePath: ':memory:',
  enableGravityOrchard: true, realtimeClock: clock, realtimeSeed: 'orchard-proof-1' });
const clients = {}, snapshots = {}, peers = [];
const samples = Object.fromEntries(['jon', 'lydia'].map(seat => [seat, { ack: -1, rtt: [], tickAge: [] }]));
const eventLoop = monitorEventLoopDelay({ resolution: 10 });
let measuring = false, failure;
const report = {
  schemaVersion: 1,
  source: { head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0 },
  environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model,
    transport: 'Real wall-clock TCP loopback; unchanged GO1 practice and GO2 clients/coordinator; same SQLite authority.' },
  method: 'Two 20 Hz authenticated players and a TV stay active while a fourth socket stops reading actual TCP. No snapshot inflation, patched bufferedAmount, artificial network latency or accelerated host clock. ACK RTT uses the sending client monotonic clock; accepted input age uses authoritative ticks. This measures localhost contention, not physical phones, home Wi-Fi, render duration or casting.',
  limits: { snapshotHz: 20, simulationHz: 60, inputHz: 20, maxInputPerSecond: LIMITS.maxInputPerSecond,
    inputBurst: LIMITS.inputBurst, pendingInputsPerRoom: 2, pendingSnapshotsPerSocket: 1,
    outgoingSoftBytes: LIMITS.outgoingSoftBytes, outgoingHardBytes: LIMITS.outgoingHardBytes,
    maxSnapshotBytes: LIMITS.maxSnapshotBytes, slowReaderMs: LIMITS.slowReaderMs },
};
try {
  const room = await createRoom(host, { mode: 'practice' });
  class LocalSocket extends WebSocket { constructor(url) { super(url, { origin: host.origin }); } }
  function connect(seat) {
    const client = createRealtimeClient({ url: host.origin.replace('http:', 'ws:') + '/api/realtime/gravity-orchard',
      roomCode: room.code, token: room.tokens[seat], WebSocketImpl: LocalSocket,
      onSnapshot(snapshot) {
        snapshots[seat] = snapshot;
        const sample = samples[seat];
        if (!measuring || !sample || !snapshot.ack || snapshot.ack.seq <= sample.ack) return;
        sample.ack = snapshot.ack.seq;
        const stats = clients[seat].getStats();
        if (Number.isFinite(stats.ackRttMs)) sample.rtt.push(stats.ackRttMs);
        if (Number.isFinite(stats.observedTickAgeAtApply)) sample.tickAge.push(stats.observedTickAgeAtApply);
      },
    });
    clients[seat] = client; client.connect(); return client;
  }
  for (const seat of ['host', 'jon', 'lydia']) connect(seat);
  await waitFor(() => Object.values(clients).every(client => client.getStats().connected), 'The real clients must authenticate.');
  async function ready() {
    await waitFor(() => snapshots.host?.presence.jon.inputFresh && snapshots.host?.presence.lydia.inputFresh, 'Both controllers provide fresh input.');
    for (const seat of ['jon', 'lydia']) {
      assert.equal((await clients[seat].sendCommand({ id: crypto.randomUUID(), kind: 'ready', payload: { value: true } })).accepted, true);
    }
    await waitFor(() => snapshots.host?.view.phase === 'playing', 'Both-ready must finish the real countdown.');
  }
  await ready();
  // Held neutral Brake leaves the authored practice run active without steering
  // fruit into a game result while socket buffers fill naturally.
  for (const seat of ['jon', 'lydia']) clients[seat].setInput({ x: 0, y: 0, brake: true });
  const spectator = await connectPeer(host, room, 'host'); peers.push(spectator);
  let spectatorCloseCode = null;
  spectator.ws.once('close', code => { spectatorCloseCode = code; });
  const before = host.realtimeDiagnostics(room.code);
  const beforeClient = Object.fromEntries(Object.entries(clients).map(([seat, client]) => [seat, client.getStats()]));
  const started = performance.now();
  const peak = { pendingInputs: 0, pendingSnapshots: 0, bufferedBytes: 0, pendingCommands: 0, sockets: 0 };
  let removedAt = null, progressAt = started;
  spectator.ws._socket.pause();
  measuring = true; eventLoop.enable();
  while (performance.now() - started < 120000) {
    await delay(50);
    const current = host.realtimeDiagnostics(room.code).coordinator;
    for (const key of Object.keys(peak)) peak[key] = Math.max(peak[key], current[key]);
    assert.ok(current.pendingInputs <= 2, 'At most one newest input per player.');
    assert.ok(current.pendingSnapshots <= current.sockets, 'At most one newest pending snapshot per connection.');
    assert.ok(current.maxBufferedBytes <= LIMITS.outgoingHardBytes + LIMITS.maxSnapshotBytes, 'Per-socket output remains below the cap plus one bounded frame.');
    assert.equal(current.phase, 'playing', 'The slow spectator cannot pause healthy controllers.');
    assert.ok(clients.host.getStats().connected && clients.jon.getStats().connected && clients.lydia.getStats().connected);
    if (current.sockets === 3 && removedAt === null) removedAt = performance.now() - started;
    if (removedAt !== null && performance.now() - started >= 12000) break;
    if (performance.now() - progressAt >= 5000) {
      progressAt = performance.now();
      process.stdout.write(JSON.stringify({ event: 'backpressure-progress', elapsedSeconds: (progressAt - started) / 1000,
        sockets: current.sockets, snapshotsCoalesced: current.snapshotsCoalesced, maxBufferedBytes: current.maxBufferedBytes }) + '\n');
    }
  }
  const durationMs = performance.now() - started;
  measuring = false; eventLoop.disable();
  const after = host.realtimeDiagnostics(room.code);
  report.sustained = {
    durationMs, rates: { ticksPerSecond: (after.coordinator.tick - before.coordinator.tick) * 1000 / durationMs,
      hostSnapshotsPerSecond: (clients.host.getStats().snapshotsReceived - beforeClient.host.snapshotsReceived) * 1000 / durationMs },
    inputsAccepted: after.coordinator.inputsAccepted - before.coordinator.inputsAccepted,
    inputsCoalesced: after.coordinator.inputsCoalesced - before.coordinator.inputsCoalesced,
    checkpointWrites: after.checkpointWrites - before.checkpointWrites,
    sqliteChangedRows: after.databaseChanges - before.databaseChanges,
    tickOverruns: after.coordinator.tickOverruns - before.coordinator.tickOverruns,
    skippedCatchUpTicks: after.coordinator.skippedCatchUpTicks - before.coordinator.skippedCatchUpTicks,
    hostStalls: after.coordinator.hostStalls - before.coordinator.hostStalls,
    maxAcceptedTickAge: after.coordinator.maxAcceptedTickAge, queuePeaks: peak,
    eventLoopDelayMs: { mean: eventLoop.mean / 1e6, p95: eventLoop.percentile(95) / 1e6, maximum: eventLoop.max / 1e6 },
    players: Object.fromEntries(['jon', 'lydia'].map(seat => [seat, { ackRttMs: summary(samples[seat].rtt),
      observedTickAgeAtApply: summary(samples[seat].tickAge),
      inputFramesPerSecond: (clients[seat].getStats().inputsSent - beforeClient[seat].inputsSent) * 1000 / durationMs,
      reconnects: clients[seat].getStats().reconnects - beforeClient[seat].reconnects }])),
  };
  report.slowReader = { method: 'Pause the actual fourth WebSocket TCP socket after authentication; wait for normal unchanged GO1 snapshots to fill output buffers.',
    initialSnapshotBytes: Buffer.byteLength(JSON.stringify(spectator.welcome.snapshot)),
    removedAfterMs: removedAt, snapshotsCoalesced: after.coordinator.snapshotsCoalesced - before.coordinator.snapshotsCoalesced,
    maxBufferedBytes: after.coordinator.maxBufferedBytes, survivorSockets: after.coordinator.sockets };
  assert.notEqual(removedAt, null, 'An indefinitely unread socket must be removed within the diagnostic deadline.');
  assert.ok(report.slowReader.snapshotsCoalesced > 0, 'Real TCP backpressure must exercise latest-snapshot coalescing.');
  assert.ok(report.sustained.inputsAccepted > 400);
  assert.ok(report.sustained.checkpointWrites <= Math.ceil(durationMs / LIMITS.checkpointMs) + 1);
  spectator.ws._socket.resume();
  await waitFor(() => spectator.ws.readyState === WebSocket.CLOSED, 'The rejected slow reader must close after consumption resumes.');
  report.slowReader.clientCloseCode = spectatorCloseCode;

  // Replace Jon using the same legitimate credential, then send a burst through
  // the actual socket. No frame injector or direct coordinator method is used.
  clients.jon.dispose();
  const flood = await connectPeer(host, room, 'jon'); peers.push(flood);
  let floodCloseCode = null;
  flood.ws.once('close', code => { floodCloseCode = code; });
  const burstStart = performance.now(), burstBefore = host.realtimeDiagnostics(room.code).coordinator;
  const view = flood.snapshot.view;
  for (let seq = 0; seq < 200; seq++) flood.send({ type: 'input', protocol: 1, matchId: view.matchId,
    runEpoch: view.runEpoch, controllerEpoch: flood.welcome.controllerEpoch, seq, observedTick: view.tick,
    x: 1, y: 0, brake: false });
  await waitFor(() => flood.ws.readyState === WebSocket.CLOSED, 'An over-rate authenticated controller must be disconnected.');
  const burstDurationMs = performance.now() - burstStart;
  const burstAfter = host.realtimeDiagnostics(room.code).coordinator;
  report.inputFlood = { framesSent: 200, durationMs: burstDurationMs, closeCode: floodCloseCode,
    totalRoomAcceptedDuringBurst: burstAfter.inputsAccepted - burstBefore.inputsAccepted,
    rateLimited: burstAfter.rateLimited - burstBefore.rateLimited,
    pendingInputs: burstAfter.pendingInputs, healthyHostConnected: clients.host.getStats().connected,
    healthyLydiaConnected: clients.lydia.getStats().connected };
  assert.equal(floodCloseCode, 4429);
  assert.ok(report.inputFlood.rateLimited > 0);
  // The room counter includes Lydia's legitimate 20 Hz traffic during closure.
  assert.ok(report.inputFlood.totalRoomAcceptedDuringBurst <= LIMITS.inputBurst + 2
    + Math.ceil(burstDurationMs * (LIMITS.maxInputPerSecond + 20) / 1000));
  assert.ok(report.inputFlood.pendingInputs <= 2);
  assert.ok(report.inputFlood.healthyHostConnected && report.inputFlood.healthyLydiaConnected);
  await waitFor(() => snapshots.host?.view.phase === 'paused', 'Losing the flooded controller must reach the shared safe pause.');
  assert.equal(snapshots.host.view.pauseReason, 'network');
  const pausedEpoch = snapshots.host.view.runEpoch;
  connect('jon');
  await waitFor(() => clients.jon.getStats().connected, 'A new legitimate controller must recover the seat.');
  await ready();
  assert.ok(snapshots.host.view.runEpoch > pausedEpoch);
  assert.deepEqual(snapshots.host.view.players.jon.input, { x: 0, y: 0, brake: true });
  report.recovery = { phase: snapshots.host.view.phase, pauseEpoch: pausedEpoch,
    resumedEpoch: snapshots.host.view.runEpoch, steeringCleared: true };
  for (const client of Object.values(clients)) client.dispose();
  await waitFor(() => { const global = host.realtimeDiagnostics().coordinator;
    return global.sockets === 0 && global.drainingSockets === 0 && global.pendingAuth === 0 && global.pendingAuthorityCalls === 0;
  }, 'Disposed clients must leave no socket or authorization work.');
  report.cleanup = { beforeHostClose: host.realtimeDiagnostics().coordinator };
  await host.close();
  await delay(30);
  report.cleanup.coordinatorTimersAfterClose = timers.size;
  assert.equal(timers.size, 0, 'Every real coordinator timer is cancelled on owned host shutdown.');
  report.passed = true;
} catch (error) {
  failure = error; report.passed = false; report.error = { name: error.name, message: error.message };
} finally {
  measuring = false; eventLoop.disable();
  for (const client of Object.values(clients)) client.dispose();
  for (const peer of peers) { peer.ws._socket?.resume(); peer.ws.terminate(); }
  await host.close();
  report.cleanup ??= {};
  report.cleanup.finalCoordinatorTimers = timers.size;
  if (outputPath) { await mkdir(dirname(outputPath), { recursive: true }); await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n'); }
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}
if (failure) throw failure;
