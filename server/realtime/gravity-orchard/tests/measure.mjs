// Real monotonic timers + actual loopback sockets. This is not a phone/Wi-Fi benchmark.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import WebSocket from 'ws';
import { createFixtureServer } from '../fixture/server.mjs';
import { createRealtimeClient } from '../../../../ui/realtime/gravity-orchard/index.mjs';

const destination = resolve(process.argv[2] || fileURLToPath(new URL('../evidence/loopback-measurements.json', import.meta.url)));
const fixture = await createFixtureServer();
const clients = [];
const latest = {};
async function waitFor(check, label) {
  const deadline = performance.now() + 10_000;
  while (!check()) {
    if (performance.now() > deadline) throw new Error(`Measurement could not reach ${label}.`);
    await delay(10);
  }
}
const percentile = (values, ratio) => values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * ratio))] : null;
const round = value => Math.round(value * 100) / 100;

try {
  class FixtureSocket extends WebSocket {
    constructor(url) { super(url, { headers: { Origin: fixture.origin } }); }
  }
  for (const viewer of ['host', 'jon', 'lydia']) {
    const response = await fetch(`${fixture.origin}/fixture/session`, {
      method: 'POST', headers: { Origin: fixture.origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ viewer }),
    });
    assert.equal(response.status, 200);
    const session = await response.json();
    const client = createRealtimeClient({
      url: fixture.origin.replace('http:', 'ws:') + '/api/realtime/gravity-orchard',
      roomCode: session.roomCode, token: session.token, WebSocketImpl: FixtureSocket,
      now: () => performance.now(), onSnapshot: snapshot => { latest[viewer] = snapshot; },
    });
    clients.push(client);
    client.connect();
  }
  await waitFor(() => clients.every(client => client.getStats().connected), 'three authenticated connections');
  const [host, jon, lydia] = clients;
  assert.equal((await jon.sendCommand({ id: 'measure-ready-jon', kind: 'ready', payload: { value: true } })).accepted, true);
  assert.equal((await lydia.sendCommand({ id: 'measure-ready-lydia', kind: 'ready', payload: { value: true } })).accepted, true);
  await waitFor(() => Object.values(latest).every(snapshot => snapshot.view.phase === 'playing'), 'playing after the full countdown');
  jon.setInput({ x: 0.3, y: 0.1, brake: false });
  lydia.setInput({ x: -0.3, y: -0.1, brake: false });
  const began = performance.now();
  const initial = clients.map(client => client.getStats());
  const diagnosticsBefore = fixture.diagnostics();
  const samples = [[], []];
  const seen = [-1, -1];
  while (performance.now() - began < 6000) {
    for (const [i, client] of [jon, lydia].entries()) {
      const stats = client.getStats();
      if (stats.lastAckSeq !== seen[i] && Number.isFinite(stats.ackRttMs)) {
        samples[i].push(stats.ackRttMs); seen[i] = stats.lastAckSeq;
      }
    }
    await delay(20);
  }
  const elapsed = performance.now() - began;
  const final = clients.map(client => client.getStats());
  const diagnosticsAfter = fixture.diagnostics();
  const rate = (after, before) => round((after - before) / (elapsed / 1000));
  const report = {
    schemaVersion: 1,
    environment: 'Linux Node process, three actual WebSocket clients on loopback, real monotonic timers, deterministic mock simulation',
    node: process.version, platform: process.platform, architecture: process.arch, durationMs: round(elapsed),
    configured: { simulationHz: 60, inputHz: 20, snapshotHz: 20 },
    observed: {
      simulationTicksPerSecond: rate(diagnosticsAfter.transport.ticks, diagnosticsBefore.transport.ticks),
      hostSnapshotsPerSecond: rate(final[0].snapshotsReceived, initial[0].snapshotsReceived),
      jonInputsPerSecond: rate(final[1].inputsSent, initial[1].inputsSent),
      lydiaInputsPerSecond: rate(final[2].inputsSent, initial[2].inputsSent),
      checkpointWrites: diagnosticsAfter.writes - diagnosticsBefore.writes,
      acceptedInputs: diagnosticsAfter.transport.inputsAccepted - diagnosticsBefore.transport.inputsAccepted,
      tickOverruns: diagnosticsAfter.transport.tickOverruns - diagnosticsBefore.transport.tickOverruns,
      maxBufferedBytes: diagnosticsAfter.transport.maxBufferedBytes,
      acknowledgments: Object.fromEntries(['jon', 'lydia'].map((seat, i) => [seat, {
        samples: samples[i].length, medianRttMs: round(percentile(samples[i], 0.5)),
        p95RttMs: round(percentile(samples[i], 0.95)), maxRttMs: round(Math.max(...samples[i])),
      }])),
    },
    meaning: 'RTT is measured from each client sending an input to receiving an acknowledgment of that input being applied. It includes simulation scheduling and snapshot delivery. No clocks from different hosts are subtracted.',
    limitations: ['No rendered browser in this measurement.', 'No actual phone, Wi-Fi, TV casting, sensors or native Tauri measurement.', 'Observed values are one sample, not latency or throughput guarantees.'],
  };
  assert.ok(samples.every(values => values.length > 20), 'Need enough actual applied-input acknowledgments.');
  assert.ok(report.observed.hostSnapshotsPerSecond >= 17 && report.observed.hostSnapshotsPerSecond <= 23,
    'Phase-locked snapshots should remain near the configured rate in this idle loopback fixture.');
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  for (const client of clients) client.dispose();
  await fixture.close();
}
