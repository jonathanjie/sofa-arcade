import assert from 'node:assert/strict';
import test from 'node:test';
import { tugOfYarn } from './game.mjs';
import { BEATS, HEAT_MS, MATCH_MS, beatsFor, closestBeat, difficulty, timingGrade } from '../../../ui/party/games/tug-of-yarn/rhythm.mjs';

const roster = count => Array.from({ length: count }, (_, look) => ({ id: `p${look + 1}`, name: 'Mouse', look }));
const start = (count = 2) => tugOfYarn.createRound(roster(count), 'test-seed');
const step = (state, inputs = []) => tugOfYarn.step(state, inputs, 50);
const tap = (playerId, at) => ({ playerId, input: { kind: 'tap', at } });

function advance(state, until, inputsAt = () => []) {
  while (state.elapsedMs < until && !tugOfYarn.isRoundOver(state)) state = step(state, inputsAt(state));
  return state;
}

function beatInputs(state, select = () => true) {
  const beats = beatsFor(difficulty(state.gameRound, state.heat));
  const beat = closestBeat(state.elapsedMs - state.heatStart, beats);
  if (state.elapsedMs !== state.heatStart + beats[beat]) return [];
  return Object.entries(state.teams).filter(([, team]) => select(team))
    .map(([playerId]) => tap(playerId, state.elapsedMs));
}

test('accepts only canonical, bounded integer timestamps', () => {
  assert.deepEqual(tugOfYarn.normalizeInput({ kind: 'tap', at: 12 }), { kind: 'tap', at: 12 });
  assert.deepEqual(tugOfYarn.normalizeInput({ kind: 'tap', at: -0 }), { kind: 'tap', at: 0 });
  for (const raw of [null, [], {}, { kind: 'tap' }, { kind: 'tap', at: -1 },
    { kind: 'tap', at: 12.3 }, { kind: 'tap', at: '12' }, { kind: 'tap', at: Infinity },
    { kind: 'tap', at: tugOfYarn.durationMs + 1 }, { kind: 'tap', at: 12, beat: 1 }]) {
    assert.equal(tugOfYarn.normalizeInput(raw), null);
  }
});

test('starts at an even tempo and speeds up only in the final ten seconds', () => {
  assert.ok(BEATS[0] > 0);
  const base = BEATS[1] - BEATS[0];
  assert.ok(BEATS.every((beat, index) => !index || BEATS[index - 1] >= HEAT_MS - 10_000 || beat - BEATS[index - 1] === base));
  assert.ok(BEATS.at(-1) - BEATS.at(-2) < base);
  assert.deepEqual([0, 60, 61, 165, 166].map(timingGrade), ['Perfect', 'Perfect', 'Good', 'Good', 'Miss']);
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


test('a permanent departure removes the body and its queued tap before scoring', () => {
  const beat = BEATS[0];
  let state = advance(start(4), beat);
  const playerId = Object.keys(state.teams).find(id => state.teams[id] === 0);
  state = step(state, [tap(playerId, beat)]);
  state = tugOfYarn.step(state, [tap(playerId, beat)], 50, { departures: [{ playerId, reason: 'kicked' }] });
  assert.ok(!tugOfYarn.projectForTv(state).teams.some(player => player.playerId === playerId));
  assert.equal(tugOfYarn.projectForPhone(state, playerId), null);
  assert.ok(!tugOfYarn.scores(state).some(player => player.playerId === playerId));
  state = advance(state, 2000);
  assert.deepEqual(tugOfYarn.projectForTv(state).pull, [0, 0]);
  assert.ok(!JSON.stringify(state.pending).includes(playerId));
  assert.deepEqual(state.sizes, [2, 2]);
});

test('taps use the host-clock anchor through discarded ticks and ±55 ms clock error', () => {
  const startsAt = 8765.5;
  const initial = tugOfYarn.createRound(roster(4), 'test-seed', 1, { startsAt });
  const ids = Object.keys(initial.teams);
  const anchor = tugOfYarn.projectForPhone(initial, ids[0]).a;
  assert.equal(anchor, Math.round(startsAt));
  const beat = BEATS[0];
  // The scheduler discarded a half-second of work. Each pair estimates the
  // same TV beat with opposite clock errors, and the input arrives 200 ms later.
  const inputs = ids.map((id, index) => ({
    ...tap(id, Math.round(startsAt + beat + (index < 2 ? -55 : 55) - anchor)),
    receivedMs: beat + 200,
  }));
  const withTaps = tugOfYarn.step(advance(initial, 800), inputs, 50, { elapsedMs: 1300 });
  const state = tugOfYarn.step(withTaps, [], 50, { elapsedMs: 1550 });
  assert.equal(state.elapsedMs, 1550);
  assert.deepEqual(tugOfYarn.projectForTv(state).pull, [1, 1]);
  assert.equal(state.marker, 0);
});

test('a rematch starts faster and successive heats increase difficulty', () => {
  const first = start(8);
  const rematch = tugOfYarn.createRound(roster(8), 'test-seed', 2);
  assert.equal(tugOfYarn.projectForPhone(first, first.order[0]).r, 0);
  assert.equal(tugOfYarn.projectForPhone(rematch, rematch.order[0]).r, 1);
  const nextHeat = advance(first, HEAT_MS + 2000);
  assert.equal(tugOfYarn.projectForPhone(nextHeat, first.order[0]).r, 1);
  const firstTempo = beatsFor(0);
  const rematchTempo = beatsFor(1);
  assert.equal(firstTempo[1] - firstTempo[0], 800);
  assert.equal(rematchTempo[1] - rematchTempo[0], 750);
});

test('a forged future tap and a tap delivered after the deadline both score zero', () => {
  const initial = start();
  const [mint, honey] = initial.order;
  const beat = BEATS[0];
  let state = step(advance(initial, beat - 250), [tap(mint, beat)]);
  state = tugOfYarn.step(state, [{ ...tap(honey, beat), receivedMs: beat + 416 }], 50, { elapsedMs: beat + 450 });
  assert.deepEqual(tugOfYarn.projectForTv(state).pull, [0, 0]);
});
