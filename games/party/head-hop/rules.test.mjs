import test from 'node:test';
import assert from 'node:assert/strict';
import { headHop as game } from './rules.mjs';

const roster = [{ id: 'a', look: 0 }, { id: 'b', look: 1 }];
for (const { id: mode } of game.modes) {
  test(mode + ' replays hops and departures from a seed', () => {
    function replay() {
      let s = game.createRound(roster, 43, 1, { mode });
      for (let i = 0; i < 1800; i++) {
        const inputs = i % 18 === 0 ? [{ playerId: 'a', input: { kind: 'hop', power: 8 } }] : [];
        s = game.step(s, inputs, 50, { departures: i === 50 ? [{ playerId: 'b' }] : [] });
      }
      assert.ok(game.isRoundOver(s));
      assert.equal(game.projectForPhone(s, 'b'), null);
      return game.scores(s);
    }
    assert.deepEqual(replay(), replay());
  });
}
test('descending feet bounce and squash a rider, a perch earns time', () => {
  let s = game.createRound(roster, 1, 1, { mode: 'king-of-the-heads' });
  const [a,b] = s.players;
  Object.assign(a, { x: 400, y: 244, vy: 100, balloon: 0 });
  Object.assign(b, { x: 400, y: 300, balloon: 0 });
  s = game.step(s, [], 50);
  assert.equal(s.players[0].perch, 'b');
  assert.ok(s.players[1].squashed);
  for (let i = 0; i < 20; i++) s = game.step(s, [], 50);
  assert.ok(s.players[0].rideMs > 0);
  assert.equal(game.normalizeInput({ kind: 'hop', power: 11 }), null);
});

test('different room seeds change the goon entrances', () => {
  assert.notDeepEqual(game.createRound(roster, 'red').goons, game.createRound(roster, 'blue').goons);
});

test('a spike costs a life and a balloon carries the survivor back', () => {
  const s = game.createRound(roster, 'bramble');
  Object.assign(s.players[0], { balloon: 0, y: 509, vy: 120, chain: 8 });
  const next = game.step(s, [], 50);
  assert.equal(next.players[0].lives, 2);
  assert.equal(next.players[0].chain, 0);
  assert.ok(next.players[0].balloon > 0);
});

test('chain points grow on consecutive landings and a held hop rises faster', () => {
  let s = game.createRound(roster, 23, 1, { mode: 'stomp-chain' });
  for (let landing = 0; landing < 2; landing++) {
    const goon = s.goons[3];
    Object.assign(s.players[0], { x: goon.x, y: goon.y - 1, vy: 100, balloon: 0 });
    s = game.step(s, [], 50);
  }
  assert.deepEqual(game.projectForPhone(s, 'a'), { score: 3, chain: 2, lives: 3 });
  const hop = power => game.step(s, [{ playerId: 'a', input: { kind: 'hop', power } }], 50);
  assert.ok(hop(10).players[0].y < hop(0).players[0].y);
});

test('a second on a head earns one crown point', () => {
  let s = game.createRound(roster, 12, 1, { mode: 'king-of-the-heads' });
  Object.assign(s.players[0], { balloon: 0, perch: 'b', rideMs: 950 });
  Object.assign(s.players[1], { balloon: 0, y: 300 });
  s = game.step(s, [], 50);
  assert.equal(game.scores(s)[0].score, 1);
});

test('the third fall exhausts a seat in every mode', () => {
  for (const { id: mode } of game.modes) {
    const s = game.createRound(roster, 'last-life', 1, { mode });
    Object.assign(s.players[0], { lives: 1, balloon: 0, y: 509, vy: 120 });
    const next = game.step(s, [], 50);
    assert.equal(next.players[0].lives, 0);
    assert.equal(next.over, mode === 'last-one-up');
  }
});
