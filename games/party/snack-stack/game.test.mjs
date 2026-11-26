import assert from 'node:assert/strict';
import { test } from 'node:test';
import { snackStack } from './game.mjs';
import { CHALLENGES, PLAY_MS, PREVIEW_MS, SLOT_MS } from './schedule.mjs';

const roster = Array.from({ length: 16 }, (_, index) => ({ id: 'p' + index, look: index }));
const input = (kind, at, value = 0, playerId = 'p0') => ({ playerId, input: { kind, at, value, slot: 0 } });
const byId = id => CHALLENGES.findIndex(challenge => challenge.id === id);
const fixture = id => ({ ...snackStack.createRound(roster.slice(0, 2), 'test'),
  slots: [{ card: byId(id), variant: 0 }], elapsed: PREVIEW_MS });
const tick = (state, inputs = []) => snackStack.step(state, inputs, 50);

test('all twelve cards appear exactly once and the same seed and tick log replay identically', () => {
  function run() {
    let state = snackStack.createRound(roster, 'on the rug');
    assert.equal(new Set(state.slots.map(slot => slot.card)).size, 12);
    for (let elapsed = 0; elapsed < 12 * SLOT_MS; elapsed += 50) {
      assert.equal(snackStack.isRoundOver(state), false);
      const slot = Math.floor(elapsed / SLOT_MS);
      const at = elapsed % SLOT_MS - PREVIEW_MS;
      const inputs = at >= 0 && at < PLAY_MS && at % 250 === 0
        ? roster.slice(0, 8).map(({ id }) => ({ ...input('tap', at, 0, id), input: { kind: 'tap', at, value: 0, slot } }))
        : [];
      state = tick(state, inputs);
    }
    assert.equal(snackStack.isRoundOver(state), true);
    assert.equal(snackStack.scores(state).length, 16);
    assert.equal(snackStack.scores(state).find(entry => entry.playerId === 'p8').score, 0);
    return state;
  }
  assert.deepEqual(run(), run());
  assert.notDeepEqual(snackStack.createRound(roster, 'on the rug').slots, snackStack.createRound(roster, 'under the sofa').slots);
});

test('seven taps score for accuracy and excess taps cost points', () => {
  let state = fixture('exact-seven');
  for (let index = 0; index < 8; index++) {
    const records = [input('tap', index * 50, 0, 'p1')];
    if (index < 7) records.push(input('tap', index * 50));
    state = tick(state, records);
  }
  assert.deepEqual(snackStack.projectForTv(state).players.map(player => player.done), [true, false]);
  assert.equal(snackStack.projectForPhone(state, 'p0').d, 0, 'seven taps still leave room for an overtap');
  while (!snackStack.isRoundOver(state)) state = tick(state);
  assert.deepEqual(snackStack.scores(state), [
    { playerId: 'p0', score: 99 }, { playerId: 'p1', score: 56 },
  ]);
});

test('quiet and absent entrants tie at zero, and a late player cannot affect a locked roster', () => {
  let state = fixture('quick-taps');
  state = tick(state, [input('tap', 0, 0, 'late')]);
  assert.equal(snackStack.projectForPhone(state, 'late'), null);
  while (!snackStack.isRoundOver(state)) state = tick(state);
  assert.deepEqual(snackStack.scores(state), [{ playerId: 'p0', score: 0 }, { playerId: 'p1', score: 0 }]);
});

test('hold uses the phone duration, rejects stale and future events, and accepts a near-deadline release', () => {
  let state = fixture('hold-three');
  state = { ...state, elapsed: PREVIEW_MS + 1900 };
  state = tick(state, [input('down', 1400, 0, 'p1'), input('down', 1850), input('up', 4800)]);
  assert.equal(snackStack.projectForPhone(state, 'p0').d, 0);
  state = { ...state, elapsed: PREVIEW_MS + PLAY_MS + 100 };
  state = tick(state, [input('up', 4950, 0, 'p1'), input('up', 4850)]);
  assert.equal(snackStack.projectForPhone(state, 'p0').d, 1);
  while (!snackStack.isRoundOver(state)) state = tick(state);
  assert.deepEqual(snackStack.scores(state), [
    { playerId: 'p0', score: 95 }, { playerId: 'p1', score: 0 },
  ]);
});

test('normalization validates all keys and returns a canonical copy', () => {
  const sample = { kind: 'point', slot: 11, at: 4999, value: [100, 0] };
  assert.deepEqual(snackStack.normalizeInput(sample), sample);
  assert.notEqual(snackStack.normalizeInput(sample).value, sample.value);
  for (const bad of [
    null, [], { ...sample, extra: 1 }, { ...sample, slot: 12 }, { ...sample, at: -1 },
    { ...sample, at: NaN }, { ...sample, value: [101, 0] }, { ...sample, value: [1] },
    { ...sample, kind: 'spin' }, { ...sample, kind: 'tap', value: 1 },
  ]) assert.equal(snackStack.normalizeInput(bad), null);
});

test('a zigzag needs one stroke that starts at the first corner', () => {
  let state = fixture('trace-crack');
  state = tick(state, [input('point', 0, [12, 23])]);
  assert.equal(snackStack.projectForPhone(state, 'p0').n, 0);
  state = tick(state, [input('trace-start', 50, [12, 23])]);
  assert.equal(snackStack.projectForPhone(state, 'p0').n, 1);
  state = tick(state, [input('trace-end', 100)]);
  state = tick(state, [input('point', 150, [34, 71])]);
  assert.equal(snackStack.projectForPhone(state, 'p0').n, 0);
  for (const [index, point] of [[12, 23], [34, 71], [57, 29], [80, 76]].entries()) {
    state = tick(state, [input(index ? 'point' : 'trace-start', 200 + index * 50, point)]);
  }
  assert.equal(snackStack.projectForPhone(state, 'p0').d, 1);
});

test('every fourth slot doubles a settled gain and only settles it once', () => {
  const card = byId('quick-taps');
  let state = snackStack.createRound(roster.slice(0, 2), 'test');
  state = { ...state, slots: Array.from({ length: 4 }, () => ({ card, variant: 0 })) };
  for (let elapsed = 0; elapsed < 4 * SLOT_MS; elapsed += 50) {
    const slot = Math.floor(elapsed / SLOT_MS);
    const at = elapsed % SLOT_MS - PREVIEW_MS;
    state = tick(state, at === 0 ? [{ playerId: 'p0', input: { kind: 'tap', at, value: 0, slot } }] : []);
  }
  assert.deepEqual(snackStack.scores(state), [{ playerId: 'p0', score: 15 }, { playerId: 'p1', score: 0 }]);
  assert.equal(tick(state), state);
});

test('a phone only sees its own answer status and the TV keeps the count cue', () => {
  const state = tick(fixture('count-mice'), [input('choose', 0, 3)]);
  assert.deepEqual(snackStack.projectForPhone(state, 'p0'), {
    i: 0, c: byId('count-mice'), t: PREVIEW_MS + 50, n: 0, d: 1,
  });
  assert.deepEqual(snackStack.projectForPhone(state, 'p1'), {
    i: 0, c: byId('count-mice'), t: PREVIEW_MS + 50, n: 0, d: 0,
  });
  assert.equal(snackStack.projectForTv(state).variant, 0);
});

test('permanent departures leave the game before input and settlement', () => {
  const state = { ...fixture('quick-taps'), elapsed: PREVIEW_MS + PLAY_MS + 200 };
  const next = snackStack.step(state, [input('tap', 4999)], 50, {
    departures: [{ playerId: 'p0', reason: 'kicked' }],
  });
  assert.equal(snackStack.projectForPhone(next, 'p0'), null);
  assert.deepEqual(snackStack.projectForTv(next).players.map(player => player.id), ['p1']);
  assert.deepEqual(snackStack.scores(next), [{ playerId: 'p1', score: 0 }]);
  assert.equal(snackStack.projectForPhone(state, 'p0').n, 0, 'preserve the previous state for replay');
});

test('a later round narrows the cheese target, with difficulty capped after round three', () => {
  function stop(round) {
    const initial = snackStack.createRound(roster, 'cheese', round);
    // At 1812 ms the pointer is just inside the first-round target and outside round three.
    let state = { ...initial, slots: [{ card: byId('cheese-wheel'), variant: 0 }], elapsed: PREVIEW_MS + 1800 };
    state = tick(state, [input('tap', 1812)]);
    while (!snackStack.isRoundOver(state)) state = tick(state);
    return snackStack.scores(state)[0].score;
  }
  assert.ok(stop(1) > stop(3));
  assert.equal(stop(3), stop(12));
});

test('the phone gets a play anchor in host time and it follows discarded ticks', () => {
  const state = snackStack.createRound(roster, 'clock', 1, { startsAt: 82_000 });
  assert.equal(snackStack.projectForPhone(state, 'p0').a, 83_500);
  const next = tick(state);
  assert.equal(snackStack.projectForPhone(next, 'p0', { tickAt: 82_400 }).a, 83_850);
});
