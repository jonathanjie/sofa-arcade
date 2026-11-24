import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import * as orchard from '../../../../games/gravity-orchard/engine.mjs';
import { createRealtimeClient } from '../../../../ui/realtime/gravity-orchard/index.mjs';
import { createRealtimeCoordinator, readCoordinatorDiagnostics } from '../index.mjs';
import { migrateCheckpoint } from '../lib/checkpoint.mjs';
import { createMockSimulation } from '../fixture/simulation.mjs';
import { fakeClock, flush, harness } from './unit-support/harness.mjs';

test('one room, one ticker, and repeated starts cannot replace authority', async (t) => {
  const h = await harness(); t.after(() => h.close());
  assert.deepEqual(Object.keys(h.coordinator).sort(), ['close', 'closeRoom', 'getPublicView', 'handleUpgrade', 'pauseRoom', 'startRoom']);
  await Promise.all(Array.from({ length: 5 }, () => h.coordinator.startRoom({ roomCode: 'UNIT', matchId: 'unit-match', seed: 'unit-seed' })));
  assert.equal(h.writes.length, 1);
  assert.equal(readCoordinatorDiagnostics(h.coordinator).timers, 1);
  await assert.rejects(h.coordinator.startRoom({ roomCode: 'UNIT', matchId: 'other', seed: 'seed' }), { code: 'room_already_started' });
});

test('initial/recovery state is invisible until durable and a timed-out initial writer retains its lease', async () => {
  const clock = fakeClock();
  let release, saved, hold = true;
  const coordinator = createRealtimeCoordinator({
    simulation: createMockSimulation(), clock, authorize: async () => null,
    loadCheckpoint: async () => saved ?? null,
    saveCheckpoint: async (_code, checkpoint) => {
      if (hold) await new Promise((resolve) => { release = resolve; });
      saved = structuredClone(checkpoint);
    },
  });
  const args = { roomCode: 'INIT', matchId: 'initial-match', seed: 'seed' };
  const starting = coordinator.startRoom(args).catch((error) => error);
  await flush();
  assert.equal(coordinator.getPublicView('INIT'), null);
  await clock.advance(5000);
  assert.equal((await starting).code, 'storage_unavailable');
  await assert.rejects(coordinator.startRoom(args), { code: 'room_closing' });
  assert.equal(coordinator.getPublicView('INIT'), null);
  hold = false; release(); await flush();
  const restored = await coordinator.startRoom(args);
  assert.equal(restored.view.phase, 'paused');
  assert.equal(restored.view.runEpoch, 2);
  assert.equal(saved.runEpoch, restored.view.runEpoch);
  await coordinator.close();
  assert.equal(clock.count(), 0);
});

test('latest-value input acknowledges only the value that a simulation tick actually applied', async (t) => {
  const h = await harness(); t.after(() => h.close());
  const { jon, lydia } = await h.players();
  const before = h.coordinator.getPublicView('UNIT');
  jon.input({ x: 0.2, y: 0, brake: false });
  const latest = jon.input({ x: 0.8, y: 0, brake: false });
  lydia.input(); await flush();
  assert.equal(h.coordinator.getPublicView('UNIT').tick, before.tick);
  assert.equal(h.coordinator.getPublicView('UNIT').players.jon.input.x, 0);
  await h.clock.advance(50);
  const snapshots = jon.messages.filter((message) => message.type === 'snapshot');
  const acknowledged = snapshots.findLast((message) => message.ack?.seq === latest.seq);
  assert.ok(acknowledged, 'latest applied sequence reaches the controller');
  assert.equal(acknowledged.ack.controllerEpoch, jon.welcome.controllerEpoch);
  assert.ok(acknowledged.ack.appliedTick > before.tick);
  assert.equal(acknowledged.view.players.jon.input.x, 0.8);
  assert.ok(!lydia.messages.some((message) => message.ack?.controllerEpoch === jon.welcome.controllerEpoch));
  assert.ok(readCoordinatorDiagnostics(h.coordinator, 'UNIT').inputsCoalesced >= 1);
});

test('exact 250ms deadman and 2-second pause do not refresh from invalid control', async (t) => {
  const h = await harness(); t.after(() => h.close());
  const { jon, lydia } = await h.players();
  const started = h.clock.now();
  const sample = jon.input({ x: 1, y: 0, brake: false }); lydia.input(); await flush();
  await h.clock.advance(249);
  assert.equal(h.coordinator.getPublicView('UNIT').phase, 'playing');
  assert.equal(readCoordinatorDiagnostics(h.coordinator, 'UNIT').presence.jon.inputFresh, true);
  jon.send(sample); await flush();
  await h.clock.advance(1);
  assert.ok(Math.abs(h.clock.now() - started - 250) < 1e-7);
  assert.equal(readCoordinatorDiagnostics(h.coordinator, 'UNIT').presence.jon.inputFresh, false);
  assert.deepEqual(h.coordinator.getPublicView('UNIT').players.jon.input, { x: 0, y: 0, brake: true });
  await h.clock.advance(1749);
  assert.equal(h.coordinator.getPublicView('UNIT').phase, 'playing');
  await h.clock.advance(1);
  const paused = h.coordinator.getPublicView('UNIT');
  assert.equal(paused.phase, 'paused');
  assert.equal(paused.pauseReason, 'network');
  assert.equal(paused.ready.jon, false);
  assert.equal(paused.ready.lydia, false);
});

test('host stall pauses rather than fast-forwarding; smaller catch-up never exceeds five ticks', async (t) => {
  const h = await harness(); t.after(() => h.close());
  const { jon, lydia } = await h.players();
  jon.input(); lydia.input(); await flush();
  const before = h.coordinator.getPublicView('UNIT');
  await h.clock.jump(100);
  assert.equal(h.coordinator.getPublicView('UNIT').tick - before.tick, 5);
  assert.equal(readCoordinatorDiagnostics(h.coordinator, 'UNIT').tickOverruns, 1);
  const tickBeforeStall = h.coordinator.getPublicView('UNIT').tick;
  await h.clock.jump(1000);
  const after = h.coordinator.getPublicView('UNIT');
  assert.equal(after.phase, 'paused');
  assert.equal(after.pauseReason, 'host-stall');
  assert.equal(after.tick, tickBeforeStall);
  assert.equal(readCoordinatorDiagnostics(h.coordinator, 'UNIT').hostStalls, 1);
});

test('600 controller samples produce only bounded five-second checkpoints', async (t) => {
  const h = await harness(); t.after(() => h.close());
  const { jon, lydia } = await h.players();
  const baseline = h.writes.length;
  for (let index = 0; index < 300; index++) {
    jon.input({ x: index % 2 ? 0.25 : -0.25, y: 0, brake: false }); lydia.input();
    await flush(); await h.clock.advance(50);
  }
  assert.equal(h.coordinator.getPublicView('UNIT').phase, 'playing');
  assert.ok(h.writes.length - baseline >= 2 && h.writes.length - baseline <= 3);
  assert.ok(readCoordinatorDiagnostics(h.coordinator, 'UNIT').inputsAccepted >= 600);
});

test('durable epoch is saved before publication; a failed boundary freezes the room', async (t) => {
  let release, rejectWrite, hold = false;
  const h = await harness({ saveCheckpoint: async () => {
    if (hold) await new Promise((resolve, reject) => { release = resolve; rejectWrite = reject; });
  } });
  t.after(() => h.close());
  await h.players();
  const before = h.coordinator.getPublicView('UNIT');
  hold = true;
  const pausedPromise = h.coordinator.pauseRoom('UNIT', 'network');
  await flush();
  assert.ok(release);
  assert.deepEqual(h.coordinator.getPublicView('UNIT'), before);
  await h.clock.advance(500);
  assert.equal(h.coordinator.getPublicView('UNIT').tick, before.tick);
  release(); await pausedPromise;
  assert.ok(h.coordinator.getPublicView('UNIT').runEpoch > before.runEpoch);
  assert.equal(h.coordinator.getPublicView('UNIT').phase, 'paused');
  // Recover readiness to exercise the next failing epoch.
  hold = false;
  const jon = await h.connect('jon'), lydia = await h.connect('lydia');
  jon.input(); lydia.input(); await flush();
  await jon.command('ready', { value: true }); await lydia.command('ready', { value: true });
  hold = true;
  const failure = h.coordinator.pauseRoom('UNIT', 'host-stall');
  await flush(); rejectWrite(new Error('fixture write failure'));
  await assert.rejects(failure, { code: 'storage_unavailable' });
  assert.equal(h.coordinator.getPublicView('UNIT'), null);
  assert.equal(readCoordinatorDiagnostics(h.coordinator, 'UNIT').faulted, true);
});

test('recovery validates checkpoint, increments the engine epoch once, and durably starts paused', async (t) => {
  const store = new Map();
  const first = await harness({ store });
  await first.players();
  await first.coordinator.pauseRoom('UNIT', 'network');
  const last = structuredClone(store.get('UNIT'));
  await first.close();
  const second = await harness({ store }); t.after(() => second.close());
  const restored = second.coordinator.getPublicView('UNIT');
  assert.equal(restored.phase, 'paused');
  assert.equal(restored.pauseReason, 'recovery');
  assert.equal(restored.runEpoch, last.runEpoch + 1);
  assert.equal(second.writes[0].runEpoch, restored.runEpoch);
  assert.deepEqual(restored.ready, { jon: false, lydia: false });
  const legacy = structuredClone(last); legacy.coordinatorSchema = 0; delete legacy.commands;
  assert.equal(migrateCheckpoint(legacy).coordinatorSchema, 1);
  assert.deepEqual(migrateCheckpoint(legacy).commands, []);
  assert.throws(() => migrateCheckpoint({ ...legacy, coordinatorSchema: 999 }), { code: 'unsupported_checkpoint' });
  assert.throws(() => migrateCheckpoint({ ...legacy, commands: [] }), { code: 'invalid_checkpoint' });
});

test('rejected command identities remain rejected after conditions improve', async (t) => {
  const h = await harness(); t.after(() => h.close());
  const jon = await h.connect('jon');
  const { command, result } = await jon.command('ready', { value: true }, 'one-ready');
  assert.deepEqual(result, { type: 'command-result', protocol: 1, id: 'one-ready', accepted: false, code: 'unavailable_controllers' });
  jon.input(); await flush();
  jon.send(command); await flush();
  assert.deepEqual(jon.messages.filter((message) => message.type === 'command-result').at(-1), result);
  assert.equal(h.coordinator.getPublicView('UNIT').ready.jon, false);
  jon.send({ ...command, payload: { value: false } }); await flush();
  assert.equal(jon.messages.at(-1).code, 'command_conflict');
  assert.equal((await jon.command('ready', { value: true }, 'fresh-ready')).result.accepted, true);
});

test('a command awaiting authorization cannot be overwritten by a captured stage-end tick', async (t) => {
  let held = false, resume;
  const h = await harness({ simulation: createMockSimulation({ countdownTicks: 1, stageTicks: 2 }),
    authorize: async ({ bearer }) => {
      if (bearer === 'unit-host' && held) await new Promise((resolve) => { resume = resolve; });
      return { 'unit-host': { role: 'host', playerId: null }, 'unit-jon': { role: 'player', playerId: 'jon' },
        'unit-lydia': { role: 'player', playerId: 'lydia' } }[bearer] ?? null;
    } });
  t.after(() => h.close());
  await h.players(); const host = await h.connect('host');
  held = true;
  const { command } = await host.command('pause', { reason: 'requested' }, 'held-pause');
  const before = h.coordinator.getPublicView('UNIT');
  await h.clock.advance(100);
  assert.equal(h.coordinator.getPublicView('UNIT').tick, before.tick);
  held = false; resume(); await flush();
  assert.equal(h.coordinator.getPublicView('UNIT').phase, 'paused');
  assert.equal(h.coordinator.getPublicView('UNIT').tick, before.tick);
  assert.equal(host.messages.find((message) => message.type === 'command-result' && message.id === command.id)?.accepted, true);
});

test('a trusted pause queued behind a wire pause is a safe no-op, not a storage fault', async (t) => {
  let held = false, resume;
  const h = await harness({ authorize: async ({ bearer }) => {
    if (bearer === 'unit-host' && held) await new Promise((resolve) => { resume = resolve; });
    return { 'unit-host': { role: 'host', playerId: null }, 'unit-jon': { role: 'player', playerId: 'jon' },
      'unit-lydia': { role: 'player', playerId: 'lydia' } }[bearer] ?? null;
  } });
  t.after(() => h.close());
  await h.players(); const host = await h.connect('host');
  const previousEpoch = h.coordinator.getPublicView('UNIT').runEpoch;
  held = true;
  await host.command('pause', { reason: 'requested' }, 'wire-pause');
  const systemPause = h.coordinator.pauseRoom('UNIT', 'network');
  held = false; resume(); await flush(); await systemPause;
  assert.equal(h.coordinator.getPublicView('UNIT').phase, 'paused');
  assert.equal(h.coordinator.getPublicView('UNIT').runEpoch, previousEpoch + 1);
  assert.equal(readCoordinatorDiagnostics(h.coordinator, 'UNIT').faulted, false);
});

test('disposal removes every timer, socket and public room reference', async () => {
  const h = await harness(); await h.players();
  await h.close(); await flush();
  const diagnostics = readCoordinatorDiagnostics(h.coordinator);
  assert.equal(diagnostics.rooms, 0); assert.equal(diagnostics.sockets, 0);
  assert.equal(diagnostics.drainingSockets, 0); assert.equal(diagnostics.timers, 0);
  assert.equal(h.clock.count(), 0);
  assert.equal(h.coordinator.getPublicView('UNIT'), null);
  await h.coordinator.close();
});

test('whole-coordinator shutdown uses a reconnectable close code for persisted rooms', async t => {
  const h = await harness(); t.after(() => h.close());
  const viewer = await h.connect('host');
  const closed = once(viewer.ws, 'close');
  await h.coordinator.close();
  const [code] = await closed;
  assert.equal(code, 1012);
  assert.equal(readCoordinatorDiagnostics(h.coordinator).sockets, 0);
  assert.equal(h.clock.count(), 0);
});

test('explicit room closure remains terminal rather than repeatedly reconnecting', async t => {
  const h = await harness(); t.after(() => h.close());
  const viewer = await h.connect('host');
  const closed = once(viewer.ws, 'close');
  await h.coordinator.closeRoom('UNIT');
  const [code] = await closed;
  assert.equal(code, 4410);
  assert.equal(h.coordinator.getPublicView('UNIT'), null);
});

test('an active seat replacement receives Welcome before the network pause snapshot', async (t) => {
  const h = await harness({ simulation: orchard });
  const { jon } = await h.players();
  const closed = once(jon.ws, 'close');
  const firstMessages = [];
  class ReplacementSocket extends WebSocket {
    constructor(url) {
      super(url, { origin: h.origin });
      this.on('message', data => firstMessages.push(JSON.parse(data).type));
    }
  }
  const snapshots = [];
  const replacement = createRealtimeClient({
    url: h.origin.replace('http:', 'ws:') + '/api/realtime/gravity-orchard',
    roomCode: 'UNIT', token: 'unit-jon', WebSocketImpl: ReplacementSocket,
    now: h.clock.now, onSnapshot: packet => snapshots.push(packet),
  });
  t.after(async () => { replacement.dispose(); await h.close(); });
  replacement.connect();
  assert.equal((await closed)[0], 4409);
  await flush();
  assert.equal(firstMessages[0], 'welcome');
  assert.equal(snapshots[0].view.pauseReason, 'network');
  const result = await replacement.sendCommand({ id: 'fresh-ready', kind: 'ready', payload: { value: true } });
  assert.equal(result.accepted, true);
});

test('disconnect clears Ready even when the Ready checkpoint is still pending', async (t) => {
  const writing = Promise.withResolvers();
  const release = Promise.withResolvers();
  let hold = true;
  const h = await harness({ simulation: orchard, saveCheckpoint: async (_code, checkpoint) => {
    if (hold && checkpoint.commands.some(entry => entry.command.id === 'departing-ready')) {
      hold = false;
      writing.resolve();
      await release.promise;
    }
  } });
  t.after(async () => { release.resolve(); await h.close(); });
  const jon = await h.connect('jon'), lydia = await h.connect('lydia');
  jon.input();
  await jon.command('ready', { value: true }, 'departing-ready');
  await writing.promise;
  jon.ws.close();
  await once(jon.ws, 'close');
  await flush();
  release.resolve();
  await flush();
  const replacement = await h.connect('jon');
  replacement.input(); lydia.input(); await flush();
  assert.equal((await lydia.command('ready', { value: true })).result.accepted, true);
  assert.equal(h.coordinator.getPublicView('UNIT').phase, 'waiting');
  assert.deepEqual(h.coordinator.getPublicView('UNIT').ready, { jon: false, lydia: true });
  assert.equal((await replacement.command('ready', { value: true })).result.accepted, true);
  assert.equal(h.coordinator.getPublicView('UNIT').phase, 'countdown');
});

test('reconnect keeps the deadman deadline but requires new control input', async (t) => {
  const h = await harness({ simulation: orchard });
  t.after(() => h.close());
  const { jon, lydia } = await h.players();
  const view = () => h.coordinator.getPublicView('UNIT');
  for (let i = 0; i < 32; i++) {
    jon.input(); lydia.input(); await flush();
    await h.clock.advance(100);
  }
  assert.equal(view().phase, 'playing');
  jon.input({ x: 1, y: 0, brake: false });
  await flush();
  jon.ws.close(); await once(jon.ws, 'close'); await flush();
  const replacement = await h.connect('jon');
  assert.equal(replacement.welcome.snapshot.presence.jon.inputFresh, false);
  await h.clock.advance(50);
  assert.equal(view().phase, 'playing');
  assert.deepEqual(view().players.jon.input, { x: 0, y: 0, brake: true });
  replacement.input({ x: -1, y: 0, brake: false });
  await flush();
  await h.clock.advance(50);
  assert.equal(view().players.jon.input.x, -1);
  replacement.ws.close(); await once(replacement.ws, 'close'); await flush();
  let reconnect = await h.connect('jon');
  for (let i = 0; i < 19; i++) {
    if (i === 5 || i === 12) {
      reconnect.ws.close();
      await once(reconnect.ws, 'close');
      await flush();
      reconnect = await h.connect('jon');
      assert.equal(reconnect.welcome.snapshot.presence.jon.inputFresh, false);
    }
    lydia.input(); await flush();
    await h.clock.advance(100);
  }
  await h.clock.advance(49);
  assert.equal(view().phase, 'playing');
  await h.clock.advance(1);
  assert.equal(view().pauseReason, 'network');
});

test('countdown input is first acknowledged on a playing tick', async (t) => {
  const h = await harness({ simulation: orchard });
  t.after(() => h.close());
  const { jon, lydia } = await h.players();
  const view = () => h.coordinator.getPublicView('UNIT');
  const tilt = { x: 0.75, y: 0, brake: false };
  jon.input(tilt); await flush();
  await h.clock.advance(50);
  assert.equal(view().phase, 'countdown');
  assert.equal(jon.messages.findLast(packet => packet.type === 'snapshot').ack, null);
  while (view().countdownTicks > 12) {
    jon.input(); lydia.input(); await flush();
    await h.clock.advance(200);
  }
  const last = jon.input(tilt);
  lydia.input(); await flush();
  await h.clock.advance(view().countdownTicks * (1000 / 60));
  assert.equal(view().phase, 'playing');
  const firstPlayingTick = view().tick + 1;
  await h.clock.advance(50);
  const packet = jon.messages.findLast(message => message.type === 'snapshot');
  assert.equal(packet.ack.seq, last.seq);
  assert.equal(packet.ack.appliedTick, firstPlayingTick);
  assert.deepEqual(packet.view.players.jon.input, tilt);
});

test('valid commands rejected by the production engine keep their wire reason', async (t) => {
  const h = await harness({ simulation: orchard });
  t.after(() => h.close());
  const host = await h.connect('host'), jon = await h.connect('jon');
  const before = h.coordinator.getPublicView('UNIT');
  const pause = await host.command('pause', { reason: 'requested' });
  const retry = await jon.command('retry-stage', {});
  assert.deepEqual([pause.result.code, retry.result.code], ['invalid_phase', 'forbidden']);
  assert.equal(pause.result.accepted, false);
  assert.equal(retry.result.accepted, false);
  assert.deepEqual(h.coordinator.getPublicView('UNIT'), before);
});

test('losing the first ready controller during the second Ready save prevents countdown', async (t) => {
  const writing = Promise.withResolvers();
  const release = Promise.withResolvers();
  const h = await harness({ simulation: orchard, saveCheckpoint: async (_code, checkpoint) => {
    if (checkpoint.engine.state.phase === 'countdown') {
      writing.resolve();
      await release.promise;
    }
  } });
  t.after(async () => { release.resolve(); await h.close(); });
  const host = await h.connect('host');
  const jon = await h.connect('jon'), lydia = await h.connect('lydia');
  jon.input(); lydia.input(); await flush();
  assert.equal((await lydia.command('ready', { value: true })).result.accepted, true);
  await jon.command('ready', { value: true });
  await writing.promise;
  lydia.ws.close();
  await once(lydia.ws, 'close');
  await flush();
  release.resolve();
  await flush();
  const replacement = await h.connect('lydia');
  assert.equal(replacement.welcome.snapshot.view.phase, 'paused');
  assert.deepEqual(replacement.welcome.snapshot.view.ready, { jon: false, lydia: false });
  assert.equal(host.messages.some(packet => packet.view?.phase === 'countdown'), false);
});
