import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../engine.mjs';
import { RULES } from '../catalog.mjs';
import { getLevel } from '../geometry.mjs';
import { validatePublicView } from '../public.mjs';
import { seededRandom, TYPES } from '../supply.mjs';
import { HOST, PUBLIC, JON, LYDIA, SAFE, clone, command, ready, advance, playing, assertConserved, deepFreeze, finishAtDeadline, stageFixture, contactFixture } from './engine-helpers.mjs';

test('constructor bounds, pure inputs, diagonal limiting and strict unknown-field rejection', () => {
  const args = deepFreeze({ seed: 'abc', matchId: 'abc', options: { mode: 'campaign' } });
  const state = engine.createRun(args);
  assert.equal(state.phase, 'waiting'); assert.equal(state.tick, 0);
  for (const bad of [null, {}, { seed: '', matchId: 'a' }, { seed: 'a', matchId: 'b'.repeat(129) }, { seed: 'a', matchId: 'a', options: { mode: 'other' } }, { seed: 'a', matchId: 'a', fruit: [] }]) {
    assert.throws(() => engine.createRun(bad));
  }
  const good = deepFreeze({ x: 1, y: 1, brake: false });
  assert.deepEqual(engine.normalizeInput(good), { x: 0.7071, y: 0.7071, brake: false });
  assert.deepEqual(engine.normalizeInput({ x: -0, y: -0, brake: true }), { x: 0, y: 0, brake: true });
  for (const bad of [null, [], {}, { x: 0, y: 0 }, { x: '0', y: 0, brake: false }, { x: NaN, y: 0, brake: true },
    { x: Infinity, y: 0, brake: true }, { x: 1.00001, y: 0, brake: false }, { x: 0, y: -1.1, brake: true },
    { x: 0, y: 0, brake: 1 }, { x: 0, y: 0, brake: true, seq: 1 }, { x: 0, y: 0, brake: true, actor: 'jon' }]) {
    assert.equal(engine.normalizeInput(bad), null);
  }
  let called = false;
  assert.equal(engine.normalizeInput({ get x() { called = true; return 1; }, y: 0, brake: false }), null);
  assert.equal(called, false);
});

test('commands enforce actor, exact payload, phase and supplied match/epoch boundaries', () => {
  const state = deepFreeze(engine.createRun({ seed: 'authority', matchId: 'authority' }));
  const cases = [
    [PUBLIC, { kind: 'ready', payload: { value: true } }, 'FORBIDDEN'],
    [HOST, { kind: 'ready', payload: { value: true } }, 'FORBIDDEN'],
    [{ role: 'player', playerId: 'else' }, { kind: 'ready', payload: { value: true } }, 'FORBIDDEN'],
    [JON, { kind: 'ready', payload: { value: true, playerId: 'lydia' } }, 'INVALID_COMMAND'],
    [JON, { kind: 'ready', payload: { value: true }, actor: HOST }, 'INVALID_COMMAND'],
    [JON, { kind: 'pause', payload: { reason: 'network' } }, 'INVALID_COMMAND'],
    [HOST, { kind: 'system-pause', payload: { reason: 'network' } }, 'INVALID_COMMAND'],
    [JON, { kind: 'ready', payload: { value: true }, matchId: 'another', runEpoch: 0 }, 'STALE_MATCH'],
    [JON, { kind: 'ready', payload: { value: true }, matchId: 'authority', runEpoch: 99 }, 'STALE_EPOCH'],
    [JON, { kind: 'ready', payload: { value: true }, matchId: 'authority' }, 'INVALID_COMMAND'],
    [HOST, { kind: 'pause', payload: { reason: 'requested' } }, 'INVALID_PHASE'],
  ];
  for (const [actor, payload, code] of cases) {
    const result = engine.applyCommand(state, actor, payload);
    assert.deepEqual({ accepted: result.accepted, code: result.code }, { accepted: false, code });
    assert.equal(result.state, state);
  }
  const one = command(state, JON, 'ready', { value: true });
  assert.deepEqual(one.ready, { jon: true, lydia: false });
  const countdown = command(one, LYDIA, 'ready', { value: true });
  assert.equal(countdown.runEpoch, 1); assert.deepEqual(countdown.ready, { jon: false, lydia: false });
  assert.deepEqual(countdown.players.jon.input, engine.SAFE_INPUT);
  const accepted = engine.applyCommand(state, JON, { type: 'command', protocol: 1, id: 'ready-1', matchId: state.matchId, runEpoch: state.runEpoch, kind: 'ready', payload: { value: true } });
  assert.equal(accepted.accepted, true);
});

test('countdown, pause, readiness and resume conserve active time and clear input latches', () => {
  let state = engine.createRun({ seed: 'clocks', matchId: 'clocks' });
  assert.equal(engine.step(state, SAFE), state);
  state = ready(state); state = advance(state, 179);
  assert.equal(state.phase, 'countdown'); assert.equal(state.elapsedTicks, 0); assert.equal(state.fruits.length, 0);
  state = engine.step(state, { jon: { x: 1, y: 0, brake: false }, lydia: { x: 0, y: 1, brake: false } });
  assert.equal(state.phase, 'playing'); assert.equal(state.elapsedTicks, 0); assert.equal(state.fruits.length, 1);
  assert.deepEqual(state.players.jon.input, engine.SAFE_INPUT);
  state = advance(state, 45, { jon: { x: 1, y: 0, brake: false }, lydia: { x: 0, y: 1, brake: false } });
  const before = clone(state);
  state = command(state, LYDIA, 'pause', { reason: 'help' });
  assert.equal(state.pauseReason, 'help'); assert.equal(state.runEpoch, before.runEpoch + 1);
  assert.equal(advance(state, 800), state); assert.equal(state.elapsedTicks, 45);
  assert.equal(engine.applyCommand(state, JON, { kind: 'ready', payload: { value: true }, matchId: state.matchId, runEpoch: before.runEpoch }).code, 'STALE_EPOCH');
  state = advance(ready(state), 180);
  assert.equal(state.tick, before.tick + 180); assert.equal(state.elapsedTicks, 45);
  assert.deepEqual(state.fruits, before.fruits);
  assert.deepEqual(state.players.lydia.input, engine.SAFE_INPUT);
  const noInput = engine.step(state, { jon: { x: NaN, y: 0, brake: false } });
  assert.deepEqual(noInput.players, { jon: { input: engine.SAFE_INPUT }, lydia: { input: engine.SAFE_INPUT } });
});

test('trusted system pauses reject forged reasons and pause the whole run exactly once', () => {
  const state = deepFreeze(playing());
  for (const reason of ['network', 'host-stall', 'recovery']) {
    const paused = engine.pauseForSystem(state, reason);
    assert.equal(paused.phase, 'paused'); assert.equal(paused.pauseReason, reason);
    assert.equal(paused.tick, state.tick); assert.equal(paused.runEpoch, state.runEpoch + 1);
    assert.deepEqual(paused.players.jon.input, engine.SAFE_INPUT);
    if (reason !== 'recovery') assert.equal(engine.pauseForSystem(paused, reason), paused);
  }
  for (const reason of ['requested', 'help', null, '', { role: 'host' }]) assert.throws(() => engine.pauseForSystem(state, reason), { code: 'INVALID_PAUSE_REASON' });
});

test('seeded replay is bit-for-bit deterministic, immutable and finite across boundaries', () => {
  const random = seededRandom('bounded-transcript');
  const ticks = process.env.SOFA_EXHAUSTIVE === '1' ? 1700 : 600;
  const transcript = Array.from({ length: ticks }, () => Object.fromEntries(['jon', 'lydia'].map(id => [id, engine.normalizeInput({ x: random() * 2 - 1, y: random() * 2 - 1, brake: random() < 0.2 })])));
  function replay() {
    let state = playing({ seed: 'replay', matchId: 'replay' });
    for (let i = 0; i < transcript.length; i += 1) {
      if (i === 499) state = advance(ready(command(state, HOST, 'pause', { reason: 'requested' })), 180);
      const frozen = i % 100 === 0 ? deepFreeze(state) : state;
      state = engine.step(frozen, transcript[i]);
      if (i % 60 === 0) {
        assertConserved(state);
        assert.equal(validatePublicView(engine.project(state, PUBLIC)).valid, true);
        assert.ok(state.diagnostics.work.iterations <= state.fruits.length * 3 * 5 + 24);
      }
    }
    return state;
  }
  assert.deepEqual(replay(), replay());
});

test('normal spawn schedule begins at zero, defers at eight and never catches up in a burst', () => {
  let state = playing({ seed: 'saturation', matchId: 'saturation' });
  const seen = new Set(); const times = [];
  const ticks = process.env.SOFA_EXHAUSTIVE === '1' ? 2600 : 1681;
  for (let i = 0; i < ticks; i += 1) {
    for (const event of state.events) if (event.kind === 'spawn' && !seen.has(event.id)) { seen.add(event.id); times.push(event.tick - 180); }
    state = engine.step(state, SAFE);
  }
  assert.deepEqual(times, [0, 210, 420, 630, 840, 1050, 1260, 1470]);
  assert.equal(state.fruits.length, 8); assert.equal(state.supply.nextIndex, 8);
  assert.equal(state.supply.nextSpawnTick, 1680); assertConserved(state);

  // Private contact fixture isolates a capacity slot becoming free. Route
  // feasibility is independently proved in playability.test through inputs.
  const apple = getLevel(state.levelId).baskets.find(item => item.id === state.fruits[0].type);
  state = clone(state); state.fruits[0].x = apple.x; state.fruits[0].y = apple.y;
  state = engine.step(state, SAFE); assert.equal(state.fruits.length, 7);
  const after = engine.step(state, SAFE);
  assert.equal(after.fruits.length, 8); assert.equal(after.supply.nextIndex, 9);
  assert.equal(after.supply.nextSpawnTick, after.elapsedTicks + 210);
  assert.equal(advance(after, 209).supply.nextIndex, 9);
  assertConserved(after);
});

test('correct baskets capture once; wrong and full baskets bounce without losing identity', () => {
  for (const type of TYPES) {
    const basket = getLevel('morning-delivery').baskets.find(item => item.id === type);
    const state = contactFixture({ active: [{ type, x: basket.x, y: basket.y }] });
    const fruitId = state.fruits[0].id;
    const captured = engine.step(deepFreeze(state), SAFE);
    assert.equal(captured.fruits.length, 0); assert.deepEqual(captured.buffers[type], [fruitId]);
    assert.equal(captured.events.filter(event => event.kind === 'catch').length, 1); assertConserved(captured);
    const again = engine.step(captured, SAFE);
    assert.equal(again.events.filter(event => event.kind === 'catch').length, 1);
    const full = contactFixture({ active: [{ type, x: basket.x, y: basket.y }], buffered: { [type]: 3 } });
    const bounced = engine.step(full, SAFE);
    assert.equal(bounced.fruits.length, 1); assert.equal(bounced.buffers[type].length, 3);
    assert.equal(bounced.events.at(-1).kind, 'reject'); assert.equal(bounced.events.at(-1).data.reason, 'full'); assertConserved(bounced);
    for (const wrong of TYPES.filter(other => other !== type)) {
      const rejected = engine.step(contactFixture({ active: [{ type: wrong, x: basket.x, y: basket.y }] }), SAFE);
      assert.equal(rejected.fruits.length, 1); assert.equal(rejected.fruits[0].type, wrong);
      assert.equal(rejected.events.filter(event => event.kind === 'catch').length, 0);
      assert.equal(rejected.events.at(-1).data.reason, 'wrong'); assertConserved(rejected);
    }
  }
});

test('a bounded recipe chain consumes twelve distinct IDs and emits four rewards exactly once', () => {
  const basket = getLevel('morning-delivery').baskets.find(item => item.id === 'pear');
  const state = contactFixture({ active: [{ type: 'pear', x: basket.x, y: basket.y }], buffered: { apple: 3, plum: 3, pear: 2, starfruit: 3 } });
  const complete = engine.step(state, SAFE);
  assert.equal(complete.phase, 'interlude'); assert.equal(complete.orders.activeIndex, 4);
  assert.equal(complete.consumed.flatMap(order => order.fruitIds).length, 12);
  assert.equal(new Set(complete.consumed.flatMap(order => order.fruitIds)).size, 12);
  assert.equal(complete.events.filter(event => event.kind === 'order-complete').length, 4);
  assert.equal(complete.results[0].stars, 3); assertConserved(complete);
  assert.equal(advance(complete, 500), complete);
});

test('the fourth recipe on the last legal tick scores a single successful stage', () => {
  const baskets = getLevel('morning-delivery').baskets;
  const pear = baskets.find(basket => basket.id === 'pear');
  const plum = baskets.find(basket => basket.id === 'plum');
  // The pear completes the first three recipes. Hold the last plum outside its basket.
  const setup = contactFixture({
    active: [{ type: 'pear', x: pear.x, y: pear.y }, { type: 'plum', x: 430, y: 360 }],
    buffered: { apple: 3, plum: 2, pear: 2, starfruit: 3 },
  });
  setup.nextEvent = 0; // contactFixture starts with an empty event log.
  const state = engine.step(setup, SAFE);
  assert.equal(state.orders.activeIndex, 3);
  assert.equal(state.fruits.length, 1);
  const lastFruit = state.fruits[0];
  lastFruit.x = plum.x;
  lastFruit.y = plum.y;
  state.elapsedTicks = RULES.stageDurationTicks - 1;
  state.tick = RULES.countdownTicks + state.elapsedTicks;
  state.supply.nextSpawnTick = RULES.stageDurationTicks + 1;
  assert.doesNotThrow(() => engine.serializeCheckpoint(state));

  const result = engine.step(state, SAFE);
  const scoring = result.events.filter(event => event.tick === result.tick &&
    ['order-complete', 'stage-complete'].includes(event.kind));
  assert.deepEqual(scoring.map(event => event.kind), ['order-complete', 'stage-complete']);
  assert.equal(scoring[0].entityId, state.orders.recipes[3].id);
  assert.equal(scoring[1].data.reason, 'success');
  assert.deepEqual(result.results, [{
    stageIndex: 0, ordersCompleted: 4, stars: 3, elapsedTicks: RULES.stageDurationTicks,
    composted: state.composted.length,
  }]);
  assert.equal(result.consumed.at(-1).fruitIds.filter(id => id === lastFruit.id).length, 1);
  assertConserved(result);
  assert.equal(engine.step(result, SAFE), result);
});

test('compost center edges remove an ID once and stage remainder is distinct from compost', () => {
  const hole = getLevel('switchback-grove').compost[0];
  const state = contactFixture({ stageIndex: 1, active: [{ type: 'pear', x: hole.x - 0.01, y: hole.y + hole.height / 2 }] });
  const before = engine.step(state, SAFE);
  assert.equal(before.fruits.length, 1, 'Overhanging edge stays supported until its center enters');
  const into = clone(before); into.fruits[0].x = hole.x + 0.01;
  const after = engine.step(into, SAFE);
  assert.equal(after.fruits.length, 0);
  assert.equal(after.composted.length, before.composted.length + 1); assertConserved(after);
  assert.equal(engine.step(after, SAFE).composted.length, after.composted.length);
  const timeout = finishAtDeadline(playing());
  const groups = assertConserved(timeout);
  assert.equal(groups.remainingAtEnd.length, 8); assert.equal(groups.unspawned.length, 16);
  assert.equal(groups.composted.length, 0); assert.equal(groups.active.length, 0); assert.equal(groups.buffered.length, 0);
});

test('gate closure defers at overlap, forecasts at zero, and closes only once clear', () => {
  const gate = getLevel('switchback-grove').gates[0];
  let state = contactFixture({ stageIndex: 1, active: [{ type: 'pear', x: gate.x + gate.width / 2, y: 360 }] });
  state.elapsedTicks = 359; state.tick = 6000; state.supply.nextSpawnTick = 569;
  const before = clone(state.fruits[0]);
  state = engine.step(state, SAFE);
  assert.deepEqual(state.gateStates[0], { id: gate.id, state: 'forecast', ticksToChange: 0, closureDeferred: true });
  assert.deepEqual({ x: state.fruits[0].x, y: state.fruits[0].y }, { x: before.x, y: before.y });
  state = advance(state, 30, { jon: { x: 1, y: 0, brake: false }, lydia: { x: 1, y: 0, brake: false } });
  assert.equal(state.gateStates[0].state, 'closed'); assert.equal(state.gateStates[0].closureDeferred, false);
  assert.ok(state.fruits[0].x > gate.x + gate.width + state.fruits[0].radius);
  assert.equal(state.diagnostics.fallbacks, 0); assertConserved(state);
});

test('all three gusts have exact forecasts/durations and practice suppresses them', () => {
  const expected = {
    forecasts: [1170, 2520, 3870], starts: [1350, 2700, 4050], ends: [1440, 2790, 4140],
  };
  const boundaries = Object.values(expected).flat().flatMap(tick => [tick - 1, tick, tick + 1]);
  // Exercise either side of every transition, including the stage deadline.
  // The exhaustive lane checks every intervening tick for unexpected changes.
  function sampleTicks(last) {
    if (process.env.SOFA_EXHAUSTIVE === '1') return Array.from({ length: last }, (_, index) => index + 1);
    return [1, ...boundaries, last].sort((a, b) => a - b);
  }
  function stepAt(state, tick) {
    const jump = tick - state.elapsedTicks - 1;
    return engine.step({ ...state, tick: state.tick + jump, elapsedTicks: state.elapsedTicks + jump }, SAFE);
  }
  let state = stageFixture(2);
  const forecasts = []; const starts = []; const ends = []; let previous = null;
  for (const tick of sampleTicks(RULES.stageDurationTicks)) {
    state = stepAt(state, tick);
    if (state.gust && (!previous || previous.id !== state.gust.id || previous.phase !== state.gust.phase)) {
      (state.gust.phase === 'forecast' ? forecasts : starts).push(state.elapsedTicks);
    }
    if (previous?.phase === 'active' && !state.gust) ends.push(state.elapsedTicks);
    previous = state.gust;
  }
  assert.deepEqual(forecasts, [1170, 2520, 3870]); assert.deepEqual(starts, [1350, 2700, 4050]); assert.deepEqual(ends, [1440, 2790, 4140]);
  // Private mode fixture exercises the same late-stage geometry without adding
  // an unsupported stage/hazard option to createRun.
  let practice = stageFixture(2); practice.mode = 'practice';
  for (const tick of sampleTicks(5500)) {
    practice = stepAt(practice, tick);
    assert.equal(practice.gust, null);
  }
  assert.equal(practice.phase, 'playing'); assert.equal(practice.gust, null);
  assert.equal(engine.project(practice, PUBLIC).timeRemainingTicks, null);
  assert.equal(practice.events.some(event => event.kind === 'gust-start' || event.kind === 'gust-forecast'), false);
  assertConserved(practice);
});

test('full campaign timeout progression, completed-stage retry, event ring and fresh match fencing', () => {
  let state = playing({ seed: 'whole-run', matchId: 'whole-run' });
  for (let stage = 0; stage < 3; stage += 1) {
    state = finishAtDeadline(state);
    assert.equal(state.results.length, stage + 1); assert.equal(state.results.at(-1).ordersCompleted, 0);
    assert.equal(state.phase, stage === 2 ? 'finished' : 'interlude'); assertConserved(state);
    if (stage < 2) state = advance(ready(state), 180);
  }
  assert.equal(state.tick, 16740);
  assert.ok(state.events.length <= 64); assert.equal(new Set(state.events.map(event => event.id)).size, state.events.length);
  const oldTick = state.tick; const oldNextEvent = state.nextEvent;
  const oldRecipes = state.orders.recipes.map(recipe => recipe.recipeType);
  const oldSupply = state.supply.entries.map(({ type, spawnOwner }) => ({ type, spawnOwner }));
  assert.equal(engine.applyCommand(state, JON, { kind: 'retry-stage', payload: {} }).code, 'FORBIDDEN');
  state = command(state, HOST, 'retry-stage', {});
  assert.equal(state.phase, 'waiting'); assert.equal(state.stageIndex, 2); assert.equal(state.results.length, 2);
  assert.equal(state.tick, oldTick); assert.ok(state.nextEvent > oldNextEvent);
  assert.deepEqual(state.orders.recipes.map(recipe => recipe.recipeType), oldRecipes);
  assert.deepEqual(state.supply.entries.map(({ type, spawnOwner }) => ({ type, spawnOwner })), oldSupply);
  assert.equal(state.elapsedTicks, 0); assertConserved(state);
  assert.equal(engine.applyCommand(playing(), HOST, { kind: 'rematch', payload: { seedMode: 'same' } }).code, 'INVALID_PHASE');
  const paused = engine.pauseForSystem(playing(), 'network');
  assert.equal(engine.applyCommand(paused, HOST, { kind: 'rematch', payload: { seedMode: 'same' } }).code, 'COORDINATOR_REQUIRED');
  const rematch = engine.createRun({ seed: state.seed, matchId: 'new-match' });
  assert.equal(engine.applyCommand(rematch, JON, { kind: 'ready', payload: { value: true }, matchId: state.matchId, runEpoch: state.runEpoch }).code, 'STALE_MATCH');
  assert.ok(rematch.supply.entries.every(entry => !state.supply.entries.some(old => old.id === entry.id)));
});

test('projection is detached, role-equivalent and excludes authority and full future supply', () => {
  const state = playing();
  const view = engine.project(state, PUBLIC);
  for (const viewer of [HOST, JON, LYDIA]) assert.deepEqual(engine.project(state, viewer), view);
  assert.equal(validatePublicView(view).valid, true);
  for (const key of ['seed', 'supply', 'gustRotation', 'stageArchives', 'diagnostics', 'consumed', 'nextEvent']) assert.equal(Object.hasOwn(view, key), false);
  view.fruits[0].x = -100; view.players.jon.input.x = 42; view.orders.recipes[0].needs.apple = 99;
  assert.equal(engine.project(state, PUBLIC).fruits[0].x >= 0, true);
  assert.equal(state.orders.recipes[0].needs.apple, 2);
  assert.throws(() => engine.project(state, { role: 'player', playerId: 'rogue' }), { code: 'INVALID_VIEWER' });
});
