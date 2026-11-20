/** Full real-rate campaign: public-view pilot -> actual GO2 clients -> authenticated LAN -> GO1. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { cpus, platform, arch } from 'node:os';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { startLanServer } from '../../../server/lan.mjs';
import { createRealtimeClient } from '../../../ui/realtime/gravity-orchard/index.mjs';
import { createPilot } from '../../../games/gravity-orchard/validation/pilot.mjs';
import { getLevel } from '../../../games/gravity-orchard/geometry.mjs';
import { createRoom } from './helpers.mjs';

const evidence = process.env.SOFA_GO7_EVIDENCE_DIR || '.go7-evidence';
const seed = process.env.SOFA_GO7_CAMPAIGN_SEED || 'orchard-proof-1';
const host = await startLanServer({ host: '127.0.0.1', port: 0, databasePath: ':memory:', enableGravityOrchard: true,
  realtimeSeed: seed });
const clients = {}, snapshots = {}, pilot = createPilot();
const rtt = { jon: [], lydia: [] }, tickAge = { jon: [], lydia: [] }, ackSeen = { jon: -1, lydia: -1 };
const fruitLocations = new Map(), seenEvents = new Set();
const transfers = { jonToLydia: new Set(), lydiaToJon: new Set() };
const eventCounts = {}, stageReports = [];
const eventLoop = monitorEventLoopDelay({ resolution: 10 });
let readyPending = false, readyIdentity = null, complete = false, error = null, startedAt = performance.now();
let pilotMaxMs = 0, pilotUpdates = 0;
let report;
const summary = values => { const a = [...values].sort((x, y) => x - y); return { count: a.length, minimum: a[0] ?? null, median: a[Math.floor(a.length * 0.5)] ?? null, p95: a[Math.min(a.length - 1, Math.floor(a.length * 0.95))] ?? null, maximum: a.at(-1) ?? null }; };
try {
  const room = await createRoom(host);
  class LocalSocket extends WebSocket { constructor(url) { super(url, { origin: host.origin }); } }
  async function ready(snapshot) {
    const view = snapshot.view;
    const identity = `${view.matchId}:${view.runEpoch}:${view.phase}`;
    if (readyPending || readyIdentity === identity || !['waiting', 'interlude'].includes(view.phase)
      || !snapshot.presence.jon.inputFresh || !snapshot.presence.lydia.inputFresh) return;
    readyPending = true;
    try {
      for (const seat of ['jon', 'lydia']) {
        const result = await clients[seat].sendCommand({ id: crypto.randomUUID(), kind: 'ready', payload: { value: true } });
        if (!result.accepted) throw new Error(`Production readiness rejected: ${result.code}`);
      }
      readyIdentity = identity;
    } catch (value) { error = value; }
    finally { readyPending = false; }
  }
  function observe(view) {
    for (const event of view.events) if (!seenEvents.has(event.id)) { seenEvents.add(event.id); eventCounts[event.kind] = (eventCounts[event.kind] || 0) + 1; }
    const level = getLevel(view.levelId);
    for (const fruit of view.fruits) {
      const side = fruit.x < level.bridge.x ? 'jon' : fruit.x > level.bridge.x + level.bridge.width ? 'lydia' : null;
      const previous = fruitLocations.get(fruit.id);
      if (side && previous && side !== previous) transfers[previous === 'jon' ? 'jonToLydia' : 'lydiaToJon'].add(fruit.id);
      if (side) fruitLocations.set(fruit.id, side);
    }
    if (view.results.length > stageReports.length) {
      stageReports.push(...view.results.slice(stageReports.length));
      process.stdout.write(JSON.stringify({ event: 'stage-complete', stageIndex: view.results.at(-1).stageIndex, orders: view.results.at(-1).ordersCompleted,
        composted: view.results.at(-1).composted, activeSeconds: view.results.at(-1).elapsedTicks / 60, wallSeconds: (performance.now() - startedAt) / 1000 }) + '\n');
    }
    if (view.phase === 'paused') error = new Error(`Campaign unexpectedly paused: ${view.pauseReason}`);
  }
  for (const seat of ['host', 'jon', 'lydia']) {
    clients[seat] = createRealtimeClient({ url: host.origin.replace('http:', 'ws:') + '/api/realtime/gravity-orchard', roomCode: room.code,
      token: room.tokens[seat], WebSocketImpl: LocalSocket,
      onSnapshot(snapshot) {
        snapshots[seat] = snapshot;
        if (seat !== 'host') {
          if (snapshot.ack && snapshot.ack.seq > ackSeen[seat]) {
            ackSeen[seat] = snapshot.ack.seq;
            const stats = clients[seat].getStats();
            if (Number.isFinite(stats.ackRttMs)) rtt[seat].push(stats.ackRttMs);
            if (Number.isFinite(stats.observedTickAgeAtApply)) tickAge[seat].push(stats.observedTickAgeAtApply);
          }
          return;
        }
        observe(snapshot.view);
        if (snapshot.view.phase === 'playing') {
          const before = performance.now();
          const controls = pilot.update(snapshot.view);
          pilotMaxMs = Math.max(pilotMaxMs, performance.now() - before); pilotUpdates++;
          for (const player of ['jon', 'lydia']) clients[player]?.setInput(controls[player]);
        }
        if (snapshot.view.phase === 'finished') complete = true;
        else void ready(snapshot);
      },
    });
    clients[seat].connect();
  }
  eventLoop.enable();
  const deadline = performance.now() + 330_000;
  while (!complete && !error && performance.now() < deadline) await delay(50);
  if (!complete && !error) error = new Error('The real-rate campaign exceeded its wall-clock deadline.');
  const view = snapshots.host?.view;
  report = {
    schemaVersion: 1, seed,
    source: { head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0 },
    environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model,
      transport: 'same-machine TCP loopback; actual 60 Hz host and 20 Hz GO2 clients; public-view pilot; shared SQLite', pilot: 'GO1 validation/pilot.mjs unchanged' },
    measurement: 'Each ACK RTT uses that client own monotonic clock. Observed tick age uses host tick numbers. No one-way/phone sensor/Wi-Fi/TV/native claim.',
    wallSeconds: (performance.now() - startedAt) / 1000,
    completed: complete, error: error?.message || null,
    results: stageReports, ordersCompleted: stageReports.reduce((sum, stage) => sum + stage.ordersCompleted, 0), stars: stageReports.reduce((sum, stage) => sum + stage.stars, 0),
    transfers: { jonToLydia: transfers.jonToLydia.size, lydiaToJon: transfers.lydiaToJon.size }, eventCounts,
    pilot: { updates: pilotUpdates, maximumUpdateMs: pilotMaxMs },
    transport: host.realtimeDiagnostics(room.code),
    players: Object.fromEntries(['jon', 'lydia'].map(seat => [seat, { ackRttMs: summary(rtt[seat]), observedTickAgeAtApply: summary(tickAge[seat]), stats: clients[seat].getStats() }])),
    eventLoopDelayMs: { mean: eventLoop.mean / 1e6, p95: eventLoop.percentile(95) / 1e6, maximum: eventLoop.max / 1e6 },
    final: view ? { phase: view.phase, stageIndex: view.stageIndex, tick: view.tick, timeRemainingTicks: view.timeRemainingTicks, baskets: view.baskets, activeFruit: view.fruits.length } : null,
  };
  await mkdir(evidence, { recursive: true }); await writeFile(path.join(evidence, 'realtime-campaign.json'), JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ event: 'campaign-complete', completed: report.completed, orders: report.ordersCompleted, stars: report.stars, transfers: report.transfers, wallSeconds: report.wallSeconds, error: report.error }) + '\n');
  if (error) throw error;
  assert.equal(stageReports.length, 3);
  assert.equal(report.ordersCompleted, 12, 'All recipes must finish through real normalized socket inputs.');
  assert.equal(report.stars, 9);
  assert.ok(report.transfers.jonToLydia > 0 && report.transfers.lydiaToJon > 0);
  assert.equal(report.transport.coordinator.checkpointErrors, 0);
} finally {
  eventLoop.disable(); for (const client of Object.values(clients)) client.dispose(); await host.close();
}
