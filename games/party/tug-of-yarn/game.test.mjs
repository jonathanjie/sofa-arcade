import assert from 'node:assert/strict';
import test from 'node:test';
import { tugOfYarn } from './game.mjs';
import { BEATS, HEAT_MS, MATCH_MS, closestBeat, createBeatClock, timingGrade } from '../../../ui/party/games/tug-of-yarn/rhythm.mjs';

const roster = count => Array.from({ length: count }, (_, look) => ({ id: `p${look + 1}`, name: 'Mouse', look }));
const start = (count = 2) => tugOfYarn.createRound(roster(count), 'test-seed');
const step = (state, inputs = []) => tugOfYarn.step(state, inputs, 50);
const tap = (playerId, at) => ({ playerId, input: { kind: 'tap', at } });

function advance(state, until, inputsAt = () => []) {
  while (state.elapsedMs < until && !tugOfYarn.isRoundOver(state)) state = step(state, inputsAt(state));
  return state;
}

function beatInputs(state, select = () => true) {
  const beat = closestBeat(state.elapsedMs - state.heatStart);
  if (state.elapsedMs !== state.heatStart + BEATS[beat]) return [];
  return Object.entries(state.teams).filter(([, team]) => select(team))
    .map(([playerId]) => tap(playerId, state.elapsedMs));
}

test('accepts only canonical, bounded integer timestamps', () => {
  assert.deepEqual(tugOfYarn.normalizeInput({ kind: 'tap', at: 12 }), { kind: 'tap', at: 12 });
  assert.deepEqual(tugOfYarn.normalizeInput({ kind: 'tap', at: -0 }), { kind: 'tap', at: 0 });
  for (const raw of [null, [], {}, { kind: 'tap' }, { kind: 'tap', at: -1 },
    { kind: 'tap', at: 12.3 }, { kind: 'tap', at: '12' }, { kind: 'tap', at: Infinity },
    { kind: 'tap', at: MATCH_MS + 1 }, { kind: 'tap', at: 12, beat: 1 }]) {
    assert.equal(tugOfYarn.normalizeInput(raw), null);
  }
});

test('starts at an even tempo and speeds up only in the final ten seconds', () => {
  assert.ok(BEATS[0] > 0);
  const base = BEATS[1] - BEATS[0];
  assert.ok(BEATS.every((beat, index) => !index || BEATS[index - 1] >= HEAT_MS - 10_000 || beat - BEATS[index - 1] === base));
  assert.ok(BEATS.at(-1) - BEATS.at(-2) < base);
  assert.deepEqual([0, 45, 46, 150, 151].map(timingGrade), ['Perfect', 'Perfect', 'Good', 'Good', 'Miss']);
});

test('teams stay balanced and full-strength taps tie with 2, 8, odd and 16 players', () => {
  for (const count of [2, 3, 8, 15, 16]) {
    const initial = start(count);
    assert.equal(initial.sizes.reduce((total, size) => total + size, 0), count);
    assert.ok(Math.abs(initial.sizes[0] - initial.sizes[1]) <= 1);
    const state = advance(initial, 2000, beatInputs);
    assert.equal(state.marker, 0);
    assert.deepEqual(tugOfYarn.projectForTv(state).unity, [1, 1]);
    assert.deepEqual(new Set(tugOfYarn.scores(state).map(({ score }) => score)), new Set([0]));
  }
});

test('credits aligned taps more than scattered taps and rejects duplicate or late delivery', () => {
  let state = start(8);
  const beat = BEATS[0];
  const mint = Object.keys(state.teams).filter(id => state.teams[id] === 0);
  const honey = Object.keys(state.teams).filter(id => state.teams[id] === 1);
  state = advance(state, beat + 300);
  state = step(state, [
    ...mint.map((id, index) => tap(id, beat + (index < 2 ? -120 : 120))),
    ...honey.map(id => tap(id, beat - 45)),
    tap(mint[0], beat), tap('late guest', beat),
  ]);
  state = advance(state, beat + 450);
  const scene = tugOfYarn.projectForTv(state);
  assert.deepEqual(scene.unity, [0.5, 1]);
  assert.ok(scene.pull[0] < 0.5);
  assert.equal(scene.pull[1], 1);
  assert.ok(scene.position > 0);
  const before = state.marker;
  state = step(state, mint.map(id => tap(id, beat)));
  assert.equal(state.marker, before);
  assert.deepEqual(state.pending, {});
});

test('a missing teammate keeps the locked denominator and late guests cannot pull', () => {
  const initial = start(4);
  const [leaving, remaining] = Object.keys(initial.teams).filter(id => initial.teams[id] === 0);
  const state = advance(initial, 2000, now => now.elapsedMs === BEATS[0]
    ? [tap(remaining, BEATS[0]), tap('p77', BEATS[0])] : []);
  assert.deepEqual(tugOfYarn.projectForTv(state).pull, [0.5, 0]);
  assert.equal(tugOfYarn.projectForPhone(state, 'p77'), null);
  assert.equal(tugOfYarn.projectForPhone(state, leaving).b, 0);
  assert.ok(!JSON.stringify(tugOfYarn.projectForPhone(state, remaining)).includes(leaving));
});

test('no taps, including an empty fixture, finish exactly at the match deadline with a draw', () => {
  assert.ok(tugOfYarn.durationMs > MATCH_MS && tugOfYarn.durationMs <= 120_000);
  for (const count of [0, 2, 16]) {
    const almostDone = advance(start(count), MATCH_MS - 50);
    assert.equal(tugOfYarn.isRoundOver(almostDone), false);
    const done = step(almostDone);
    assert.equal(done.elapsedMs, MATCH_MS);
    assert.equal(tugOfYarn.isRoundOver(done), true);
    assert.deepEqual(done.wins, [0, 0]);
    assert.equal(tugOfYarn.projectForTv(done).winner, null);
    assert.ok(tugOfYarn.scores(done).every(({ score }) => score === 0));
    assert.deepEqual(step(done), done);
  }
});

test('the leader at time wins a heat even if the knot never crossed the line', () => {
  const state = advance(start(), HEAT_MS, now => now.elapsedMs === BEATS[0]
    ? beatInputs(now, team => team === 0) : []);
  assert.deepEqual(state.wins, [1, 0]);
  assert.equal(state.breakUntil, HEAT_MS + 2000);
  assert.equal(tugOfYarn.isRoundOver(state), false);
});

test('two line crosses close the match and a fixed seed and tick log replay exactly', () => {
  const initial = start(16);
  const log = [];
  const recorded = advance(initial, MATCH_MS, state => {
    const inputs = beatInputs(state, team => team === 0);
    log.push(inputs);
    return inputs;
  });
  const replay = log.reduce((state, inputs) => step(state, inputs), start(16));
  assert.deepEqual(replay, recorded);
  assert.equal(tugOfYarn.isRoundOver(replay), true);
  assert.ok(replay.elapsedMs < HEAT_MS);
  assert.deepEqual(replay.wins, [2, 0]);
  assert.equal(tugOfYarn.projectForTv(replay).position, -1);
  assert.equal(tugOfYarn.projectForTv(replay).winner, 0);
  assert.deepEqual(tugOfYarn.scores(replay).map(({ score }) => score), [...Array(8).fill(2), ...Array(8).fill(0)]);
});

test('teams split two heats before a decisive third', () => {
  const state = advance(start(8), MATCH_MS, now => beatInputs(now, team => team === (now.heat === 2 ? 1 : 0)));
  assert.equal(tugOfYarn.isRoundOver(state), true);
  assert.equal(state.heat, 3);
  assert.deepEqual(state.wins, [2, 1]);
});


test('phone clocks with different origins agree through delayed snapshots', () => {
  const mint = createBeatClock();
  const honey = createBeatClock();
  mint.sync(0, 5060, 40);
  honey.sync(0, 20085, 20);
  mint.sync(200, 5240, 40);
  honey.sync(200, 20220, 20);
  mint.sync(400, 5560, 40);
  honey.sync(400, 20470, 20);
  assert.equal(mint.elapsed(5000 + BEATS[0]), BEATS[0]);
  assert.equal(honey.elapsed(20_000 + BEATS[0]), BEATS[0]);
  const initial = start();
  const ids = Object.keys(initial.teams);
  const state = advance(initial, 2000, now => {
    if (now.elapsedMs === BEATS[0] + 100) return [tap(ids[0], mint.elapsed(5000 + BEATS[0]))];
    if (now.elapsedMs === BEATS[0] + 300) return [tap(ids[1], honey.elapsed(20_000 + BEATS[0]))];
    return [];
  });
  assert.deepEqual(tugOfYarn.projectForTv(state).pull, [1, 1]);
  assert.equal(state.marker, 0);
});
