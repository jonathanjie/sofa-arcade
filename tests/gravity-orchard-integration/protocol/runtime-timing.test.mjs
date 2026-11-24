import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { startLanServer } from '../../../server/lan.mjs';
import { api, connectPeer, createRoom, flush, harness, manualClock, until } from './helpers.mjs';

const operations = new Set(['sqlite.prepare', 'sqlite.get', 'sqlite.all', 'sqlite.run', 'sqlite.exec',
  'sqlite.begin', 'sqlite.commit', 'sqlite.rollback', 'checkpoint.project', 'checkpoint.stringify', 'realtime.timer']);

function assertSafeRecords(records, startedAt) {
  assert.ok(records.length > 0);
  for (const record of records) {
    assert.ok(operations.has(record.operation), record.operation);
    const numeric = record.operation === 'realtime.timer' ? ['atMs', 'durationMs', 'delayMs', 'lateByMs'] : ['atMs', 'durationMs'];
    assert.deepEqual(Object.keys(record).sort(), ['operation', ...numeric].sort());
    for (const key of numeric) assert.ok(Number.isFinite(record[key]) && record[key] >= 0, `${record.operation}.${key}`);
    assert.ok(record.atMs >= startedAt && record.atMs <= performance.now(), 'Record timestamps use the real monotonic clock.');
  }
}

test('optional timing observes real SQLite, heartbeat and coordinator work without exposing authority', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'go7-runtime-timing-'));
  const filename = path.join(directory, 'rooms.sqlite');
  const records = [], startedAt = performance.now();
  let host;
  t.after(async () => { await host?.close(); await rm(directory, { recursive: true, force: true }); });
  const h = await harness(t, { databasePath: filename, realtimeSeed: 'private-runtime-timing-seed',
    onRuntimeTiming: record => records.push(record) });
  host = h.host;
  await h.ready(); await h.pump(3100);
  assert.equal(h.tv.snapshot.view.phase, 'playing');
  await h.pump(100, { x: 0.25, y: -0.1, brake: false });
  assert.equal(h.tv.snapshot.ack, null);
  assert.equal(h.jon.snapshot.ack.controllerEpoch, h.jon.welcome.controllerEpoch);
  assert.equal(h.lydia.snapshot.ack.controllerEpoch, h.lydia.welcome.controllerEpoch);
  assert.equal(h.jon.snapshot.view.players.jon.input.x, 0.25);

  // Age only this test fixture's heartbeat timestamp. The running host still
  // uses its one original connection and existing authenticated heartbeat path.
  const fixture = new DatabaseSync(filename);
  try {
    fixture.prepare('UPDATE sofa_rooms SET jon_seen = 0 WHERE code = ?').run(h.room.code);
    const revision = fixture.prepare('SELECT revision FROM sofa_rooms WHERE code = ?').get(h.room.code).revision;
    const beforeHeartbeat = records.length;
    const read = await api(host, `/api/rooms/${h.room.code}`, { token: h.room.tokens.jon });
    assert.equal(read.status, 200); assert.equal(read.value.revision, revision);
    assert.equal(read.value.state.tick, h.tv.snapshot.view.tick);
    assert.ok(records.slice(beforeHeartbeat).some(record => record.operation === 'sqlite.run'), 'The throttled player heartbeat write is observed.');
    assert.ok(fixture.prepare('SELECT jon_seen FROM sofa_rooms WHERE code = ?').get(h.room.code).jon_seen > 0);
  } finally { fixture.close(); }

  const epoch = h.tv.snapshot.view.runEpoch;
  await h.clock.jump(350);
  await until(() => h.tv.snapshot.view.phase === 'paused');
  assert.equal(h.tv.snapshot.view.pauseReason, 'host-stall');
  assert.ok(h.tv.snapshot.view.runEpoch > epoch);
  assert.deepEqual(h.tv.snapshot.view.players.jon.input, { x: 0, y: 0, brake: true });
  assert.ok(records.some(record => record.operation === 'realtime.timer' && record.lateByMs > 250), 'Injected-clock lateness remains visible without changing its values.');
  const read = await api(host, `/api/rooms/${h.room.code}`, { token: h.room.tokens.host });
  assert.equal(read.value.state.runEpoch, h.tv.snapshot.view.runEpoch);
  assert.equal(read.value.state.tick, h.tv.snapshot.view.tick);
  for (const operation of [...operations].filter(value => value !== 'sqlite.rollback')) {
    assert.ok(records.some(record => record.operation === operation), operation);
  }
  assertSafeRecords(records, startedAt);
  const serialized = JSON.stringify(records);
  for (const secret of [filename, h.room.code, ...Object.values(h.room.tokens), ...Object.values(h.room.clientIds),
    'private-runtime-timing-seed', 'sofa_rooms', 'sofa_gravity_checkpoints', 'controllerEpoch', 'hostHash', 'checkpoint.engine']) {
    assert.ok(!serialized.includes(secret), `Runtime timing must exclude ${secret === filename ? 'the database path' : 'authority values'}.`);
  }
  assert.equal(Object.hasOwn(read.value, 'runtimeTiming'), false);
  await host.close();
  assert.equal(h.clock.timerCount(), 0, 'Original injected timer handles remain cancellable.');
  const afterClose = records.length;
  await h.clock.advance(10000);
  assert.equal(records.length, afterClose, 'Closed coordinator callbacks cannot reappear through the observer.');
});

test('throwing timing observers preserve auth, countdown, pause and persistence', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'go7-runtime-timing-throw-'));
  const filename = path.join(directory, 'rooms.sqlite');
  const records = [], peers = [], startedAt = performance.now();
  let host;
  t.after(async () => { for (const peer of peers) peer.ws.terminate(); await host?.close(); await rm(directory, { recursive: true, force: true }); });
  const clock = manualClock();
  host = await startLanServer({ realtimeClock: clock, host: '127.0.0.1', port: 0, databasePath: filename, enableGravityOrchard: true,
    onRuntimeTiming(record) { records.push(record); throw new Error('observer must not escape'); } });
  const room = await createRoom(host);
  const jon = await connectPeer(host, room, 'jon'); peers.push(jon);
  const lydia = await connectPeer(host, room, 'lydia'); peers.push(lydia);
  const tv = await connectPeer(host, room, 'host'); peers.push(tv);
  const rejected = await connectPeer(host, room, 'jon', { token: 'x'.repeat(43) }); peers.push(rejected);
  assert.equal(rejected.welcome, null, 'An observer cannot authorize an invalid credential.');
  jon.input(); lydia.input(); await flush();
  assert.equal((await jon.command('ready', { value: true })).result.accepted, true);
  assert.equal((await lydia.command('ready', { value: true })).result.accepted, true);
  await clock.advance(100);
  await until(() => tv.snapshot.view.phase === 'countdown' && tv.snapshot.view.tick >= 3);
  assert.equal((await tv.command('pause', { reason: 'help' })).result.accepted, true);
  await until(() => tv.snapshot.view.phase === 'paused');
  assert.equal(tv.snapshot.view.pauseReason, 'help');
  const read = await api(host, `/api/rooms/${room.code}`, { token: room.tokens.host });
  assert.equal(read.status, 200); assert.equal(read.value.state.runEpoch, tv.snapshot.view.runEpoch);
  assert.deepEqual(read.value.state.ready, { jon: false, lydia: false });
  assert.equal(host.realtimeDiagnostics(room.code).coordinator.checkpointErrors, 0);
  assert.ok(records.some(record => record.operation === 'realtime.timer'), 'The coordinator timer is observed.');
  assert.ok(records.some(record => record.operation === 'sqlite.commit'));
  assertSafeRecords(records, startedAt);
  await host.close();
  const saved = new DatabaseSync(filename);
  try {
    const checkpoint = JSON.parse(saved.prepare('SELECT checkpoint FROM sofa_gravity_checkpoints WHERE code = ?').get(room.code).checkpoint);
    assert.equal(checkpoint.runEpoch, read.value.state.runEpoch);
    assert.equal(checkpoint.engine.state.phase, 'paused');
    assert.equal(checkpoint.engine.state.pauseReason, 'help');
  } finally { saved.close(); }
  const afterClose = records.length;
  await clock.advance(80);
  assert.equal(records.length, afterClose, 'Owned close cancels the observed callbacks.');
});

test('throwing observers preserve the default real timer, authenticated commands and owned close', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'go7-observed-clock-'));
  const databasePath = path.join(directory, 'rooms.sqlite');
  const records = [];
  const host = await startLanServer({ host: '127.0.0.1', port: 0, databasePath, enableGravityOrchard: true,
    onRuntimeTiming(record) { records.push(record); throw new Error('observer must not escape'); } });
  t.after(async () => { await host.close(); await rm(directory, { recursive: true, force: true }); });
  const room = await createRoom(host);
  const jon = await connectPeer(host, room, 'jon');
  t.after(() => jon.ws.terminate());
  const rejected = await connectPeer(host, room, 'jon', { token: 'x'.repeat(43) });
  assert.equal(rejected.welcome, null);
  const id = crypto.randomUUID();
  assert.equal((await jon.command('ready', { value: false }, id)).result.accepted, true);
  await until(() => records.some(record => record.operation === 'realtime.timer'), 'The default real timer is observed.');
  await host.close();
  const afterClose = records.length;
  const db = new DatabaseSync(databasePath);
  try {
    const saved = db.prepare('SELECT checkpoint FROM sofa_gravity_checkpoints WHERE code = ?').get(room.code);
    const entry = JSON.parse(saved.checkpoint).commands.find(command => command.command.id === id);
    assert.equal(entry.actor, 'player:jon');
    assert.equal(entry.result.accepted, true);
  } finally { db.close(); }
  await delay(80);
  assert.equal(records.length, afterClose, 'Owned close cancels the observed default-clock callbacks.');
});
