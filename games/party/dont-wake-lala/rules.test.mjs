import assert from 'node:assert/strict';
import test from 'node:test';
import { getPartyGame } from '../registry.mjs';

const game = getPartyGame('dont-wake-lala');

const players = Array.from({ length: 16 }, (_, index) => ({ id: `p${index + 1}`, name: `Mouse ${index + 1}`, look: index }));
const movement = (playerId, held = true) => ({ playerId, input: { kind: 'hold', held } });
const shake = playerId => ({ playerId, input: { kind: 'motion' } });
const tick = (state, ...inputs) => game.step(state, inputs, 50);
const lane = (state, id = 'p1') => game.projectForTv(state).runners.find(player => player.playerId === id);
const cue = state => game.projectForTv(state).cue;
const begin = (size = 2, seed = 'hallway', round) => game.createRound(players.slice(0, size), seed, round);

function until(state, condition, drive = () => []) {
  for (let count = 0; count < 1200 && !condition(state); count++) state = tick(state, ...drive(state, count));
  assert.ok(condition(state), 'expected state must be reachable');
  return state;
}

test('normalize only exact hold and motion messages', () => {
  assert.deepEqual(game.normalizeInput({ kind: 'hold', held: false }), { kind: 'hold', held: false });
  assert.deepEqual(game.normalizeInput({ kind: 'motion' }), { kind: 'motion' });
  for (const input of [null, [], {}, { kind: 'hold', held: 1 }, { kind: 'hold', held: true, at: 1 }, { kind: 'motion', acceleration: 1 }, { kind: 'tap' }]) {
    assert.equal(game.normalizeInput(input), null);
  }
});

test('hold moves, release stops, and lost input expires without discarding progress', () => {
  let state = tick(begin(), movement('p1'));
  assert.equal(lane(state).distance, 0.25);
  state = tick(state, movement('p1', false));
  assert.equal(lane(state).distance, 0.25);
  state = tick(state, movement('p1'));
  for (let index = 0; index < 10; index++) state = tick(state);
  assert.equal(lane(state).distance, 2);
  assert.equal(lane(state, 'p2').distance, 0);
});

test('both warning stages precede a real gaze and release on the third tick is safe', () => {
  let state = until(begin(), value => cue(value) === 'ear');
  let warningTicks = 0;
  const seen = new Set();
  while (cue(state) !== 'look') {
    seen.add(cue(state));
    warningTicks++;
    state = tick(state, movement('p1'), movement('p2'));
  }
  assert.deepEqual([...seen], ['ear', 'blink']);
  assert.ok(warningTicks >= 12);
  assert.ok(lane(state).distance > 0);
  state = tick(tick(state));
  assert.equal(lane(state).caught, false);
  state = tick(state, movement('p1', false));
  assert.equal(lane(state).caught, false);
  assert.ok(lane(state).distance > 0);
  assert.equal(lane(state, 'p2').distance, 0);
  assert.equal(lane(state, 'p2').caught, true);
});

test('a catch resets distance once and mice can rejoin the race at the next nap', () => {
  let state = until(begin(), value => cue(value) === 'look');
  state = tick(tick(tick(state)));
  state = tick(state, movement('p1'), movement('p1', false));
  assert.equal(lane(state).caught, true);
  const catchId = lane(state).catchId;
  state = tick(state, movement('p1'));
  assert.equal(lane(state).catchId, catchId);
  state = until(state, value => cue(value) === 'sleep', () => [movement('p1')]);
  assert.equal(lane(state).caught, false);
  assert.ok(lane(state).distance > 0);
  assert.equal(game.isRoundOver(state), false);
});

test('only motion while the eye is open can catch a stationary mouse', () => {
  let state = tick(begin(), shake('p1'));
  state = until(state, value => cue(value) === 'look');
  state = tick(state, shake('p1'));
  assert.equal(lane(state).caught, false);
  state = tick(tick(state));
  assert.equal(lane(state).caught, true);
  assert.equal(lane(state, 'p2').caught, false);
});

test('round two shortens warnings and introduces ear-only fake-outs', () => {
  function measures(round) {
    let state = begin(2, 'hallway', round);
    let warningTicks = 0;
    const realWarnings = [];
    let fakes = 0;
    while (!game.isRoundOver(state)) {
      const before = cue(state);
      if (before === 'ear' || before === 'blink') warningTicks++;
      state = tick(state);
      if (before === 'ear' && cue(state) === 'sleep') { fakes++; warningTicks = 0; }
      if (before === 'blink' && cue(state) === 'look') { realWarnings.push(warningTicks); warningTicks = 0; }
    }
    return { fakes, realWarnings };
  }
  const first = measures(1);
  const next = measures(2);
  assert.equal(first.fakes, 0);
  assert.ok(next.fakes > 0);
  assert.ok(Math.max(...next.realWarnings) < Math.min(...first.realWarnings));
  assert.ok(Math.min(...measures(20).realWarnings) >= 12);
});

test('first to the cheese wins and simultaneous reaches tie without overshoot', () => {
  for (const size of [2, 8, 16]) {
    const state = until(begin(size), game.isRoundOver, current => [
      movement('p1', cue(current) !== 'blink' && cue(current) !== 'look'),
      movement('p2', cue(current) !== 'blink' && cue(current) !== 'look'),
      movement('p3', false),
    ]);
    assert.equal(game.projectForTv(state).finish, true);
    assert.deepEqual(game.scores(state).slice(0, 2), [{ playerId: 'p1', score: 150 }, { playerId: 'p2', score: 150 }]);
    assert.equal(game.scores(state).length, size);
    assert.equal(tick(state, movement('p1')), state);
  }
});

test('a stale hold cannot cross the finish line after the phone leaves', () => {
  let state = until(begin(), current => lane(current).distance === 149.75, current => [
    movement('p1', cue(current) !== 'blink' && cue(current) !== 'look'),
  ]);
  state = tick(state);
  assert.equal(lane(state).distance, 149.75);
  assert.equal(game.isRoundOver(state), false);
});

test('a round with everyone caught continues and times out in a distance tie at exactly 60 s', () => {
  let state = until(begin(), current => cue(current) === 'look');
  state = tick(tick(tick(state, movement('p1'), movement('p2'))));
  assert.ok(game.projectForTv(state).runners.every(player => player.caught));
  assert.equal(game.isRoundOver(state), false);
  while (state.elapsedMs < 59_950) state = tick(state);
  assert.equal(game.isRoundOver(state), false);
  state = tick(state);
  assert.equal(state.elapsedMs, 60_000);
  assert.equal(game.isRoundOver(state), true);
  assert.ok(game.scores(state).every(result => result.score === 0));
});

test('leaving expires a hold, while a late guest has no lane or private projection', () => {
  let state = tick(begin(), movement('p1'));
  for (let index = 0; index < 60; index++) state = tick(state, movement('p99'));
  assert.equal(lane(state).distance, 1.75);
  assert.equal(lane(state, 'p99'), undefined);
  assert.equal(game.projectForPhone(state, 'p99'), null);
  assert.deepEqual(Object.keys(game.projectForPhone(state, 'p1')).sort(), ['caught', 'cue', 'distance']);
});

test('a fixed seed and input log replay to the same cues, catches, scores and ending', () => {
  const log = Array.from({ length: 1200 }, (_, index) => [movement('p1', index % 70 < 48), movement('p2', index % 90 < 67)]);
  function replay(seed) {
    let state = begin(16, seed, 2);
    const scenes = log.map(inputs => {
      state = tick(state, ...inputs);
      return game.projectForTv(state);
    });
    return { scenes, scores: game.scores(state), ended: game.isRoundOver(state) };
  }
  const first = replay('repeatable');
  assert.equal(first.ended, true);
  assert.deepEqual(first, replay('repeatable'));
  assert.notDeepEqual(first.scenes.map(scene => scene.cue), replay('different').scenes.map(scene => scene.cue));
  assert.deepEqual(Object.keys(first.scenes[0]).sort(), ['cue', 'finish', 'runners', 'target']);
});
