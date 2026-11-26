import test from 'node:test';
import assert from 'node:assert/strict';
import { timberRush as game } from './rules.mjs';

const players = [
  { id: 'a', look: 0 },
  { id: 'b', look: 1 },
];
const create = (mode) => game.createRound(players, 'forest', 1, { mode });
function chop(state, side, dt = 350) {
  return game.step(state, [{ playerId: 'a', input: { kind: 'chop', side } }], dt);
}

test('seed and input replay reproduce all three felled trees', () => {
  let first = create('fell-race');
  let replay = create('fell-race');
  for (let i = 0; i < 216; i++) {
    const side = -first.trees[0].branches[0] || 1;
    first = chop(first, side);
    replay = chop(replay, side);
    assert.equal(first.finished, i === 215);
  }
  assert.deepEqual(first, replay);
  assert.deepEqual(game.scores(first)[0], { playerId: 'a', score: 216 });
});

test('branch and empty bar cause two seconds of recovery', () => {
  const start = create();
  start.trees[0].branches[0] = 1;
  const hit = chop(start, 1);
  assert.equal(hit.trees[0].logs, 0);
  assert.equal(hit.trees[0].down, true);
  assert.equal(chop(hit, -1, 1999).trees[0].down, true);
  assert.equal(game.step(hit, [], 2000).trees[0].down, false);
  assert.equal(game.step(start, [], 6000).trees[0].down, true);
  assert.equal(game.normalizeInput({ kind: 'chop', side: 0 }), null);
  assert.equal(game.normalizeInput({ kind: 'chop', side: 1, extra: true }), null);
});

test('ten clean cuts send an axe, teams pool logs and departed seats stop chopping', () => {
  let state = create('sabotage');
  for (let i = 0; i < 10; i++) state = chop(state, -state.trees[0].branches[0] || 1);
  assert.deepEqual(state.flights, [{ from: 'a', to: 'b', at: 3500 }]);
  state = game.step(state, [], 50, { departures: [{ playerId: 'a' }] });
  assert.equal(game.projectForPhone(state, 'a'), null);
  assert.equal(chop(state, 1).trees[0].logs, 10);
  let team = game.createRound([...players, { id: 'c', look: 2 }], 42, 1, { mode: 'lumber-team' });
  team = chop(team, -team.trees[0].branches[0] || 1);
  assert.equal(game.scores(team).find((t) => t.playerId === 'c').score, 1);
  assert.equal(game.step(team, [], 90000).finished, true);
});
