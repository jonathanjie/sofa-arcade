/**
 * Independent adversarial review of the authority/recovery seam. Lifecycle
 * baselines below cross lifecycle boundaries through commands and engine steps.
 * The exhaustive lane advances every intermediate fixed tick. Forged
 * checkpoints intentionally recompute the non-authenticating corruption hash:
 * structural rejection must not depend on merely noticing an old checksum.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../engine.mjs';
import { RULES } from '../catalog.mjs';
import { hashSeed } from '../supply.mjs';
import { validatePublicView } from '../public.mjs';
import { createPilot } from '../validation/pilot.mjs';
import { finishAtDeadline } from './engine-helpers.mjs';

const HOST = Object.freeze({ role: 'host', playerId: null });
const PUBLIC = Object.freeze({ role: 'public', playerId: null });
const JON = Object.freeze({ role: 'player', playerId: 'jon' });
const LYDIA = Object.freeze({ role: 'player', playerId: 'lydia' });
const SAFE = Object.freeze({ jon: engine.SAFE_INPUT, lydia: engine.SAFE_INPUT });
const LIVE = Object.freeze({ jon: { x: 1, y: 0, brake: false }, lydia: { x: 0, y: -1, brake: false } });
const clone = value => JSON.parse(JSON.stringify(value));

function command(state, actor, kind, payload) {
  const result = engine.applyCommand(state, actor, { type: 'command', protocol: 1,
    id: `review-${state.tick}-${state.runEpoch}-${actor.playerId ?? 'host'}-${kind}`,
    matchId: state.matchId, runEpoch: state.runEpoch, kind, payload });
  assert.equal(result.accepted, true, `${kind}: ${result.code}`);
  return result.state;
}

function bothReady(state) {
  return command(command(state, JON, 'ready', { value: true }), LYDIA, 'ready', { value: true });
}

function advance(state, ticks, controls = SAFE) {
  for (let i = 0; i < ticks; i += 1) state = engine.step(state, controls);
  return state;
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function rehash(checkpoint) {
  checkpoint.checksum = hashSeed(JSON.stringify(checkpoint.state)).toString(16).padStart(8, '0');
  return checkpoint;
}

function forged(state, edit) {
  const checkpoint = clone(engine.serializeCheckpoint(state));
  edit(checkpoint.state);
  return rehash(checkpoint);
}

function reject(checkpoint, label) {
  assert.throws(() => engine.restoreCheckpoint(checkpoint), { code: 'INVALID_CHECKPOINT' }, label);
}

let lifecycleCache;
function lifecycle() {
  if (lifecycleCache) return clone(lifecycleCache);
  const snapshots = {};
  let state = engine.createRun({ seed: 'independent-review', matchId: 'independent-review' });
  snapshots.waiting = state;
  snapshots.oneReady = command(state, JON, 'ready', { value: true });
  state = bothReady(state);
  snapshots.countdown = state;
  snapshots.countdownMiddle = advance(state, 73, LIVE);
  snapshots.pausedCountdown = command(snapshots.countdownMiddle, HOST, 'pause', { reason: 'requested' });
  state = advance(state, 180);
  snapshots.playing = state;
  snapshots.moving = advance(state, 42, LIVE);
  snapshots.paused = command(snapshots.moving, LYDIA, 'pause', { reason: 'recenter' });
  state = finishAtDeadline(state);
  snapshots.interlude = state;
  state = advance(bothReady(state), 180);
  snapshots.secondStage = state;
  state = advance(state, 240);
  snapshots.gateForecast = state;
  state = advance(state, 120);
  snapshots.gateClosed = state;
  state = finishAtDeadline(state);
  snapshots.secondInterlude = state;
  state = advance(bothReady(state), 180);
  snapshots.thirdStage = state;
  state = advance(state, 1170);
  snapshots.gustForecast = state;
  state = advance(state, 180);
  snapshots.gustActive = state;
  state = advance(state, 90);
  snapshots.gustEnded = state;
  state = finishAtDeadline(state);
  snapshots.finished = state;
  assert.equal(state.phase, 'finished');
  assert.deepEqual(state.results.map(result => result.ordersCompleted), [0, 0, 0]);
  lifecycleCache = freeze(snapshots);
  return clone(lifecycleCache);
}

let deliveredCache;
function actuallyDelivered() {
  if (deliveredCache) return clone(deliveredCache);
  let state = engine.createRun({ seed: 'orchard-proof-1', matchId: 'review-delivery' });
  state = advance(bothReady(state), 180);
  const pilot = createPilot();
  for (let i = 0; i < 5400 && state.orders.activeIndex === 0; i += 1) {
    const inputs = pilot.update(engine.project(state, PUBLIC));
    for (const player of ['jon', 'lydia']) assert.ok(engine.normalizeInput(inputs[player]));
    state = engine.step(state, inputs);
  }
  assert.ok(state.orders.activeIndex > 0, 'The real-input review baseline must actually complete a recipe');
  assert.ok(state.consumed.length > 0);
  deliveredCache = freeze(state);
  return clone(deliveredCache);
}

test('checkpoints from every actual lifecycle and hazard state recover paused without elapsed time or readiness', () => {
  for (const [name, state] of Object.entries(lifecycle())) {
    const checkpoint = freeze(engine.serializeCheckpoint(state));
    const original = JSON.stringify(checkpoint);
    const restored = engine.restoreCheckpoint(checkpoint);
    assert.equal(restored.phase, 'paused', name);
    assert.equal(restored.pauseReason, 'recovery', name);
    assert.equal(restored.runEpoch, state.runEpoch + 1, name);
    assert.equal(restored.tick, state.tick, name);
    assert.equal(restored.elapsedTicks, state.elapsedTicks, name);
    assert.equal(restored.countdownTicks, 0, name);
    assert.deepEqual(restored.ready, { jon: false, lydia: false }, name);
    assert.deepEqual(restored.players, { jon: { input: engine.SAFE_INPUT }, lydia: { input: engine.SAFE_INPUT } }, name);
    assert.deepEqual(restored.fruits, state.fruits, name);
    assert.deepEqual(restored.results, state.results, name);
    assert.equal(engine.step(restored, LIVE), restored, name);
    assert.equal(validatePublicView(engine.project(restored, PUBLIC)).valid, true, name);
    assert.doesNotThrow(() => engine.serializeCheckpoint(restored), name);
    assert.equal(JSON.stringify(checkpoint), original, name);
    assert.equal(restored.events.at(-1).id, `${state.matchId}:e${state.nextEvent + 1}`, name);
  }
});

test('recovery from an interlude advances once after fresh readiness and preserves earlier fruit accounting', () => {
  const original = lifecycle().interlude;
  let state = engine.restoreCheckpoint(engine.serializeCheckpoint(original));
  const priorEpoch = state.runEpoch;
  state = bothReady(state);
  assert.equal(state.phase, 'countdown');
  assert.equal(state.stageIndex, 1);
  assert.equal(state.runEpoch, priorEpoch + 1);
  assert.equal(state.elapsedTicks, 0);
  assert.equal(state.tick, original.tick);
  assert.deepEqual(state.results, original.results);
  assert.equal(state.stageArchives.length, 1);
  assert.equal(state.stageArchives[0].ledger.remainingAtEnd.length, 8);
  state = advance(state, 179, LIVE);
  assert.equal(state.fruits.length, 0);
  state = engine.step(state, LIVE);
  assert.equal(state.phase, 'playing');
  assert.equal(state.elapsedTicks, 0);
  assert.equal(state.fruits.length, 1);
  assert.deepEqual(state.players.jon.input, engine.SAFE_INPUT);
  assert.doesNotThrow(() => engine.serializeCheckpoint(state));
});

test('finished recovery and an interrupted recovery countdown cannot restart or score the completed stage', () => {
  const original = lifecycle().finished;
  let state = engine.restoreCheckpoint(engine.serializeCheckpoint(original));
  state = engine.restoreCheckpoint(engine.serializeCheckpoint(state));
  assert.equal(state.resumePhase, 'finished');
  state = advance(bothReady(state), 40, LIVE);
  state = command(state, HOST, 'pause', { reason: 'help' });
  assert.equal(state.resumePhase, 'finished');
  state = advance(bothReady(state), 180, LIVE);
  assert.equal(state.phase, 'finished');
  assert.deepEqual(state.results, original.results);
  assert.equal(state.elapsedTicks, original.elapsedTicks);
  assert.equal(state.fruits.length, 0);
  assert.equal(state.supply.nextIndex, original.supply.nextIndex);
  assert.equal(state.events.filter(event => event.kind === 'stage-complete').length,
    original.events.filter(event => event.kind === 'stage-complete').length);
  assert.equal(engine.step(state, LIVE), state);
  assert.doesNotThrow(() => engine.serializeCheckpoint(state));
  const retried = command(state, HOST, 'retry-stage', {});
  assert.equal(retried.phase, 'waiting');
  assert.equal(retried.stageIndex, 2);
  assert.deepEqual(retried.results, original.results.slice(0, 2));
  assert.equal(retried.elapsedTicks, 0);
  assert.doesNotThrow(() => engine.serializeCheckpoint(retried));
});

test('recovery after real input-driven delivery preserves consumption and deterministically resumes', () => {
  const original = actuallyDelivered();
  const checkpoint = engine.serializeCheckpoint(original);
  const restored = engine.restoreCheckpoint(checkpoint);
  assert.deepEqual(restored.consumed, original.consumed);
  assert.deepEqual(restored.orders, original.orders);
  const replay = () => {
    let state = advance(bothReady(engine.restoreCheckpoint(checkpoint)), 180, LIVE);
    assert.deepEqual(state.fruits, original.fruits, 'countdown does not simulate motion');
    assert.equal(state.elapsedTicks, original.elapsedTicks);
    for (let i = 0; i < 180; i += 1) state = engine.step(state, i < 90 ? LIVE : SAFE);
    return state;
  };
  assert.deepEqual(replay(), replay());
});

test('stale wire epochs and claimed actors do not cross a recovery boundary', () => {
  const original = lifecycle().moving;
  const restored = engine.restoreCheckpoint(engine.serializeCheckpoint(original));
  const oldCommand = { type: 'command', protocol: 1, id: 'lost-ack', kind: 'ready', payload: { value: true },
    matchId: original.matchId, runEpoch: original.runEpoch };
  const rejected = engine.applyCommand(restored, JON, oldCommand);
  assert.equal(rejected.code, 'STALE_EPOCH');
  assert.equal(rejected.state, restored);
  const claimedActor = engine.applyCommand(restored, JON, { ...oldCommand, runEpoch: restored.runEpoch,
    actor: HOST, payload: { value: true } });
  assert.equal(claimedActor.code, 'INVALID_COMMAND');
  assert.equal(claimedActor.state, restored);
  const state = advance(bothReady(restored), 180, LIVE);
  const wireInput = { type: 'input', protocol: 1, matchId: original.matchId, runEpoch: original.runEpoch,
    controllerEpoch: 'obsolete', seq: 999, observedTick: original.tick, x: 1, y: 0, brake: false };
  assert.equal(engine.normalizeInput(wireInput), null, 'wire validation belongs to GO2; it cannot be mistaken for normalized controls');
  const after = engine.step(state, { jon: wireInput, lydia: wireInput });
  assert.deepEqual(after.players, { jon: { input: engine.SAFE_INPUT }, lydia: { input: engine.SAFE_INPUT } });
  assert.equal(engine.applyCommand(after, HOST, { kind: 'pause', payload: { reason: 'recovery' } }).code, 'INVALID_COMMAND');
});

test('recomputed hashes do not permit premature completion or a resumed game disguised as waiting', () => {
  const states = lifecycle();
  reject(forged(states.interlude, state => {
    state.elapsedTicks -= 1;
    state.results.at(-1).elapsedTicks -= 1;
  }), 'zero-order timeout one tick before its deadline');
  reject(forged(states.interlude, state => { state.mode = 'practice'; }), 'practice cannot time out');
  reject(forged(states.moving, state => { state.phase = 'waiting'; }), 'waiting cannot retain elapsed simulation');
  reject(forged(states.playing, state => { state.phase = 'waiting'; }), 'waiting cannot retain an already spawned fruit even at elapsed zero');
});

test('paused and countdown recovery targets cannot reinterpret the terminal stage or bypass fresh waiting rules', () => {
  const states = lifecycle();
  const pausedFinished = engine.restoreCheckpoint(engine.serializeCheckpoint(states.finished));
  const pausedInterlude = engine.restoreCheckpoint(engine.serializeCheckpoint(states.interlude));
  const pausedMoving = engine.restoreCheckpoint(engine.serializeCheckpoint(states.moving));
  reject(forged(pausedFinished, state => { state.resumePhase = 'interlude'; }),
    'the final stage cannot advance into a nonexistent fourth level on readiness');
  reject(forged(pausedInterlude, state => { state.resumePhase = 'finished'; }),
    'an early stage cannot terminate the whole run on readiness');
  reject(forged(pausedMoving, state => { state.resumePhase = 'waiting'; }),
    'paused waiting target still requires a fresh stage');
  reject(forged(states.interlude, state => {
    state.phase = 'countdown'; state.countdownTarget = 'finished'; state.countdownTicks = 180;
  }), 'a forged countdown target cannot terminate the whole run after stage one');
});

test('restoration rejects counter values that would immediately lose integer or event identity safety', () => {
  const waiting = lifecycle().waiting;
  reject(forged(waiting, state => { state.runEpoch = Number.MAX_SAFE_INTEGER; }), 'restoration itself increments the epoch');
  reject(forged(waiting, state => { state.tick = Number.MAX_SAFE_INTEGER; }), 'a resumed fixed tick must remain representable');
  reject(forged(waiting, state => {
    state.nextEvent = Number.MAX_SAFE_INTEGER;
    state.events = Array.from({ length: RULES.eventLimit }, (_, index) => ({
      id: `${state.matchId}:e${Number.MAX_SAFE_INTEGER - RULES.eventLimit + 1 + index}`,
      kind: 'phase-change', tick: 0, data: { phase: 'waiting', reason: null },
    }));
  }), 'restoration itself allocates a new event identity');
});

test('recomputed hashes do not permit gusts that disagree with the authored stage and active clock', () => {
  const states = lifecycle();
  reject(forged(states.playing, state => {
    state.gust = { id: 'forged-gust', phase: 'active', x: 1, y: 0, ticksRemaining: 90 };
  }), 'morning stage has no gusts');
  reject(forged(states.gustForecast, state => { state.gust.ticksRemaining -= 1; }), 'forecast countdown differs from active clock');
  reject(forged(states.gustActive, state => {
    [state.gust.x, state.gust.y] = [-state.gust.y, state.gust.x];
  }), 'seeded cardinal rotation cannot be changed');
  reject(forged(states.gustActive, state => { state.gust = null; }), 'an active scheduled gust cannot disappear');
  reject(forged(states.gustEnded, state => {
    state.gust = clone(states.gustActive.gust);
  }), 'expired gust cannot remain active');
});

test('gate checkpoint states follow elapsed schedule while deferred closure may legitimately clear during the last tick', () => {
  const states = lifecycle();
  reject(forged(states.gateClosed, state => { state.gateStates[0].state = 'open'; }), 'scheduled-closed gate cannot claim open');
  reject(forged(states.gateForecast, state => { state.gateStates[0].ticksToChange += 1; }), 'forecast ticks disagree with elapsed clock');
  reject(forged(states.gateClosed, state => {
    state.gateStates[0] = { ...state.gateStates[0], state: 'forecast', ticksToChange: 0, closureDeferred: false };
  }), 'zero forecast only represents explicitly deferred closure');
  // Actual gate states above remain serializable. Whether overlap cleared in
  // the final physics substep is intentionally not inferred from post-tick
  // positions: a forecast/deferred snapshot may remain for that one tick.
  assert.doesNotThrow(() => engine.serializeCheckpoint(states.gateForecast));
  assert.doesNotThrow(() => engine.serializeCheckpoint(states.gateClosed));
});

test('malformed public events cannot be smuggled through a correctly recomputed checkpoint hash', () => {
  const moving = lifecycle().moving;
  const mutations = [
    ['unknown event', state => { state.events.at(-1).kind = 'award-arbitrary-score'; }],
    ['future event', state => { state.events.at(-1).tick = state.tick + 1; }],
    ['duplicate event identity', state => { state.events.at(-1).id = state.events[0].id; }],
    ['foreign event identity', state => { state.events.at(-1).id = 'other-match:e1'; }],
    ['invalid event seat', state => { state.events.at(-1).playerId = 'host'; }],
    ['authority payload', state => { state.events.at(-1).data = { futureSupply: ['private'] }; }],
    ['large event payload', state => { state.events.at(-1).data = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`field${i}`, i])); }],
    ['truncated recent history', state => { state.events.pop(); }],
  ];
  for (const [label, edit] of mutations) reject(forged(moving, edit), label);
});

test('fruit and recipe identities remain conserved under adversarial checkpoint mutation', () => {
  const moving = lifecycle().moving;
  reject(forged(moving, state => { state.fruits.push(clone(state.fruits[0])); }), 'duplicate active fruit');
  reject(forged(moving, state => { state.buffers[state.fruits[0].type].push(state.fruits[0].id); }), 'fruit appears both active and buffered');
  reject(forged(moving, state => { state.fruits[0].x = 640; state.fruits[0].y = 110; }), 'finite but off-floor fruit');
  reject(forged(moving, state => { state.fruits[0].x = 300; state.fruits[0].y = 360; }), 'solid bumper overlap');
  reject(forged(moving, state => { state.supply.entries[0].type = 'invented'; }), 'unauthored supply type');
  const delivered = actuallyDelivered();
  reject(forged(delivered, state => { state.consumed[0].fruitIds[1] = state.consumed[0].fruitIds[0]; }), 'duplicate consumed ingredient');
  reject(forged(delivered, state => { state.orders.completedIds.push(state.orders.completedIds[0]); }), 'duplicated completed order');
  reject(forged(delivered, state => { state.consumed[0].recipeId = state.orders.recipes.at(-1).id; }), 'ingredients attributed to the wrong order');
  reject(forged(lifecycle().secondStage, state => { state.stageArchives[0].ledger.unspawned[0] = state.stageArchives[0].ledger.remainingAtEnd[0]; }), 'duplicate archived fruit');
});

test('JSON-only recovery rejects accessors and malformed object structure without executing getter code', () => {
  const checkpoint = engine.serializeCheckpoint(lifecycle().moving);
  let getterCalls = 0;
  const hostile = clone(checkpoint);
  Object.defineProperty(hostile.state, 'tick', { enumerable: true, get() { getterCalls += 1; return 0; } });
  reject(hostile, 'accessor must not execute');
  assert.equal(getterCalls, 0);
  const sparse = clone(checkpoint);
  delete sparse.state.events[0];
  reject(sparse, 'sparse arrays are not serializable state');
  const prototype = clone(checkpoint);
  Object.defineProperty(prototype.state, '__proto__', { enumerable: true, value: { polluted: true } });
  reject(prototype, 'prototype mutation field');
  const cyclic = clone(checkpoint);
  cyclic.state.diagnostics.loop = cyclic.state;
  reject(cyclic, 'cycles must fail in bounded validation');
  for (const invalid of [null, [], '{}', { ...checkpoint, schemaVersion: 2 }, { ...checkpoint, checksum: '00000000' }]) reject(invalid, 'invalid envelope');
});
