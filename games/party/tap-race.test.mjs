import test from 'node:test';
import assert from 'node:assert/strict';
import { tapRace } from './tap-race.mjs';

const players = [{ id: 'p1' }, { id: 'p2' }];
const tap = playerId => ({ playerId, input: { kind: 'tap' } });

test('a deterministic replay ends on the first runner across the line', () => {
  const log = Array.from({ length: 80 }, (_, index) => index % 2 ? [tap('p1'), tap('p2')] : [tap('p1')]);
  const replay = () => log.reduce((state, inputs) => tapRace.step(state, inputs, 50),
    tapRace.createRound(players, 'replay-seed'));
  const state = replay();
  assert.deepEqual(state, replay());
  assert.equal(tapRace.isRoundOver(state), true);
  assert.equal(tapRace.scores(state)[0].playerId, 'p1');
  assert.equal(tapRace.projectForPhone(state, 'p1').distance, tapRace.target);
  assert.ok(tapRace.projectForPhone(state, 'p2').distance < tapRace.target);
});

test('a race with no input completes in twenty seconds of fixed ticks', () => {
  let state = tapRace.createRound(players, 'timeout');
  for (let tick = 1; tick <= 399; tick++) state = tapRace.step(state, [], 50);
  assert.equal(tapRace.isRoundOver(state), false);
  assert.equal(tapRace.isRoundOver(tapRace.step(state, [], 50)), true);
});
