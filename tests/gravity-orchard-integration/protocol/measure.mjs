/** Real-wall-clock integrated TCP/GO1/SQLite sample; no synthetic one-way latency. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { cpus, platform, arch } from 'node:os';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { startLanServer } from '../../../server/lan.mjs';
import { createRealtimeClient } from '../../../ui/realtime/gravity-orchard/index.mjs';
import { createRoom, until } from './helpers.mjs';

const outputPath = process.argv.find(value => value.startsWith('--out='))?.slice(6);
const sampleMs = 6000;
const host = await startLanServer({ host: '127.0.0.1', port: 0, databasePath: ':memory:', enableGravityOrchard: true });
const clients = {};
const snapshots = {};
const samples = { jon: { rtt: [], tickAge: [], appliedAge: [], lastAck: -1 }, lydia: { rtt: [], tickAge: [], appliedAge: [], lastAck: -1 } };
let measuring = false;
const eventLoop = monitorEventLoopDelay({ resolution: 10 });
try {
  const room = await createRoom(host);
  class LocalSocket extends WebSocket { constructor(url) { super(url, { origin: host.origin }); } }
  for (const seat of ['host', 'jon', 'lydia']) {
    clients[seat] = createRealtimeClient({ url: host.origin.replace('http:', 'ws:') + '/api/realtime/gravity-orchard',
      roomCode: room.code, token: room.tokens[seat], WebSocketImpl: LocalSocket,
      onSnapshot(snapshot) {
        snapshots[seat] = snapshot;
        if (!measuring || !samples[seat] || !snapshot.ack || snapshot.ack.seq <= samples[seat].lastAck) return;
        samples[seat].lastAck = snapshot.ack.seq;
        const stats = clients[seat].getStats();
        if (Number.isFinite(stats.ackRttMs)) samples[seat].rtt.push(stats.ackRttMs);
        if (Number.isFinite(stats.observedTickAgeAtApply)) samples[seat].tickAge.push(stats.observedTickAgeAtApply);
        if (Number.isFinite(stats.appliedInputAgeTicks)) samples[seat].appliedAge.push(stats.appliedInputAgeTicks);
      },
    });
    clients[seat].connect();
  }
  await until(() => Object.values(clients).every(client => client.getStats().connected));
  await delay(100);
  for (const seat of ['jon', 'lydia']) assert.equal((await clients[seat].sendCommand({ id: crypto.randomUUID(), kind: 'ready', payload: { value: true } })).accepted, true);
  await until(() => snapshots.host?.view.phase === 'playing');
  for (const seat of ['jon', 'lydia']) clients[seat].setInput({ x: 0.2, y: -0.1, brake: false });
  const before = host.realtimeDiagnostics(room.code);
  const beforeClient = Object.fromEntries(Object.entries(clients).map(([seat, client]) => [seat, client.getStats()]));
  eventLoop.enable(); measuring = true;
  const start = performance.now();
  await delay(sampleMs);
  const durationMs = performance.now() - start;
  measuring = false; eventLoop.disable();
  const after = host.realtimeDiagnostics(room.code);
  assert.equal(after.coordinator.phase, 'playing');
  const summary = values => {
    const sorted = [...values].sort((a, b) => a - b);
    return { count: sorted.length, minimum: sorted[0] ?? null, median: sorted[Math.floor(sorted.length * 0.5)] ?? null,
      p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? null, maximum: sorted.at(-1) ?? null };
  };
  const report = {
    schemaVersion: 1,
    source: { head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0 },
    environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model, transport: 'same-machine TCP loopback; real wall clock; GO1 simulation and shared SQLite' },
    durationMs,
    measurement: 'ACK RTT uses each client monotonic send/receive clock; tick age compares authoritative tick numbers. No one-way/Wi-Fi/casting or physical sensor claim.',
    rates: { ticksPerSecond: (after.coordinator.tick - before.coordinator.tick) * 1000 / durationMs,
      hostSnapshotsPerSecond: (clients.host.getStats().snapshotsReceived - beforeClient.host.snapshotsReceived) * 1000 / durationMs },
    inputsAccepted: after.coordinator.inputsAccepted - before.coordinator.inputsAccepted,
    checkpointWrites: after.checkpointWrites - before.checkpointWrites,
    sqliteChangedRows: after.databaseChanges - before.databaseChanges,
    tickOverruns: after.coordinator.tickOverruns - before.coordinator.tickOverruns,
    hostStalls: after.coordinator.hostStalls - before.coordinator.hostStalls,
    pendingInputs: after.coordinator.pendingInputs, pendingSnapshots: after.coordinator.pendingSnapshots,
    snapshotsCoalesced: after.coordinator.snapshotsCoalesced - before.coordinator.snapshotsCoalesced,
    inputsCoalesced: after.coordinator.inputsCoalesced - before.coordinator.inputsCoalesced,
    maxAcceptedTickAge: after.coordinator.maxAcceptedTickAge,
    maxBufferedBytes: after.coordinator.maxBufferedBytes,
    eventLoopDelayMs: { mean: eventLoop.mean / 1e6, p95: eventLoop.percentile(95) / 1e6, maximum: eventLoop.max / 1e6 },
    players: Object.fromEntries(['jon', 'lydia'].map(seat => [seat, {
      ackRttMs: summary(samples[seat].rtt), observedTickAgeAtApply: summary(samples[seat].tickAge), appliedInputAgeTicks: summary(samples[seat].appliedAge),
      framesPerSecond: (clients[seat].getStats().inputsSent - beforeClient[seat].inputsSent) * 1000 / durationMs,
      reconnects: clients[seat].getStats().reconnects - beforeClient[seat].reconnects,
    }])),
  };
  assert.ok(report.inputsAccepted >= 200);
  assert.ok(report.checkpointWrites <= 2);
  assert.ok(report.pendingInputs <= 2 && report.pendingSnapshots <= 3);
  if (outputPath) { await mkdir(dirname(outputPath), { recursive: true }); await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n'); }
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} finally {
  eventLoop.disable(); for (const client of Object.values(clients)) client.dispose(); await host.close();
}
