import assert from 'node:assert/strict';
import { createRun, applyCommand, step, conservationReport, SAFE_INPUT } from '../engine.mjs';
import { RULES } from '../catalog.mjs';
import { getLevel } from '../geometry.mjs';

export const HOST = Object.freeze({ role: 'host', playerId: null });
export const PUBLIC = Object.freeze({ role: 'public', playerId: null });
export const JON = Object.freeze({ role: 'player', playerId: 'jon' });
export const LYDIA = Object.freeze({ role: 'player', playerId: 'lydia' });
export const SAFE = Object.freeze({ jon: SAFE_INPUT, lydia: SAFE_INPUT });
export const clone = value => JSON.parse(JSON.stringify(value));

export function command(state, actor, kind, payload) {
  const result = applyCommand(state, actor, { kind, payload });
  assert.equal(result.accepted, true, `${kind}: ${result.code}`);
  return result.state;
}
export function ready(state) {
  return command(command(state, JON, 'ready', { value: true }), LYDIA, 'ready', { value: true });
}
export function advance(state, ticks, inputs = SAFE) {
  for (let i = 0; i < ticks; i += 1) state = step(state, inputs);
  return state;
}
export function playing(options = {}) {
  return advance(ready(createRun({ seed: 'engine-tests', matchId: 'engine-tests', ...options })), RULES.countdownTicks);
}
export function assertConserved(state) {
  const report = conservationReport(state);
  const all = Object.values(report).flat();
  assert.equal(all.length, 24, JSON.stringify(report));
  assert.equal(new Set(all).size, 24, 'Every ID occurs exactly once');
  assert.deepEqual([...all].sort(), state.supply.entries.map(entry => entry.id).sort());
  return report;
}
export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value); Object.values(value).forEach(deepFreeze);
  }
  return value;
}

// Timeout tests need the last transition and its eight-fruit accounting. Once the
// trays fill, jump the fixture clock to that boundary. The exhaustive lane walks
// every physics tick, including all intermediate gate and gust changes.
export function finishAtDeadline(state) {
  if (process.env.SOFA_EXHAUSTIVE === '1') return advance(state, RULES.stageDurationTicks - state.elapsedTicks);
  const slots = RULES.maxActiveFruit - state.fruits.length;
  for (let slot = 0; slot < slots; slot += 1) {
    const next = state.supply.nextSpawnTick;
    const jump = Math.max(0, next - state.elapsedTicks - 1);
    state = step({ ...state, tick: state.tick + jump, elapsedTicks: state.elapsedTicks + jump }, SAFE);
    assert.equal(state.phase, 'playing');
  }
  assert.equal(state.fruits.length, RULES.maxActiveFruit, 'Neutral trays fill before the deadline fixture');
  const jump = RULES.stageDurationTicks - state.elapsedTicks - 1;
  return step({ ...state, tick: state.tick + jump, elapsedTicks: state.elapsedTicks + jump }, SAFE);
}

const stageCache = new Map();
export function stageFixture(index) {
  // Each fixture starts a fresh stage through the engine readiness commands.
  if (!stageCache.has(index)) {
    const state = index === 0 ? playing()
      : advance(ready(finishAtDeadline(stageFixture(index - 1))), RULES.countdownTicks);
    stageCache.set(index, deepFreeze(state));
  }
  return clone(stageCache.get(index));
}

/**
 * Explicit private UNIT fixture for contacts/buffers. It is deliberately not a
 * route, completion or playability proof. Earlier unused entries are accounted
 * as compost; no runtime fixture or public API can position a live fruit.
 */
export function contactFixture({ stageIndex = 0, active = [], buffered = {} } = {}) {
  const state = stageFixture(stageIndex);
  const available = [...state.supply.entries];
  const used = new Set();
  const take = type => {
    const entry = available.find(candidate => candidate.type === type && !used.has(candidate.id));
    assert.ok(entry, `Fixture has an unused ${type}`); used.add(entry.id); return entry;
  };
  state.fruits = active.map(spec => {
    const entry = take(spec.type);
    const point = getLevel(state.levelId).spawnPoints[entry.spawnOwner];
    return { id: entry.id, type: entry.type, x: point.x, y: point.y, vx: 0, vy: 0,
      radius: RULES.tuning.radius, lastOwner: entry.spawnOwner, rejectBasket: null, rejectUntilTick: 0, ...spec };
  });
  for (const type of Object.keys(state.buffers)) state.buffers[type] = Array.from({ length: buffered[type] ?? 0 }, () => take(type).id);
  const last = Math.max(0, ...[...used].map(id => available.findIndex(entry => entry.id === id)));
  state.supply.nextIndex = last + 1;
  state.composted = available.slice(0, last + 1).filter(entry => !used.has(entry.id)).map(entry => entry.id);
  state.elapsedTicks = Math.max(1, last * RULES.spawnIntervalTicks);
  state.tick += state.elapsedTicks;
  state.supply.nextSpawnTick = state.elapsedTicks + RULES.spawnIntervalTicks;
  state.events = [];
  assertConserved(state);
  return state;
}
