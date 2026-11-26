import assert from 'node:assert/strict';
import test from 'node:test';
import { wobbleTower as game } from './rules.mjs';

const players = Array.from({ length: 5 }, (_, i) => ({ id: 'p' + i, look: i, name: 'Crew ' + i }));
function play(s, delay, id = s.queue[0]) {
  const at = s.start + delay;
  return game.step(s, [{ playerId: id, receivedMs: at, input: { kind: 'tap' } }], 50, { elapsedMs: at });
}

for (const { id: mode } of game.modes) {
  test(mode + ' replays, handles departures, ends on time and ranks the remaining crew', () => {
    function replay() {
      let s = game.createRound(players, 'add123', 1, { mode });
      for (let i = 1; i <= 1800; i++) {
        const departures = i === 120 ? [{ playerId: 'p1' }] : [];
        const inputs = i % 17 === 0 ? [{ playerId: s.queue[0], input: { kind: 'tap' } }] : [];
        s = game.step(s, inputs, 50, { departures });
      }
      assert.ok(game.isRoundOver(s));
      assert.equal(game.projectForPhone(s, 'p1'), null);
      assert.equal(game.scores(s).length, 4);
      assert.ok(s.peak > 0);
      return s;
    }
    assert.deepEqual(replay(), replay());
  });
}

test('a centred plank grows, an off-centre plank slices, and misses use mode scoring', () => {
  for (const { id: mode } of game.modes) {
    let s = game.createRound(players, '0', 1, { mode });
    assert.equal(play(s, 400, 'p1').turn, 0);
    s = play(s, Math.round(Math.PI * 380));
    assert.equal(s.event.label, 'Perfect!');
    assert.equal(s.towers[0].layers.at(-1).w, 158);
    s = play(s, 450);
    assert.equal(s.event.label, 'Slice!');
    assert.ok(s.event.cut > 0);
    s = play(s, Math.round((2.5 * Math.PI - 4.8) * 380));
    assert.equal(s.event.label, 'Whoops!');
    if (mode === 'coop') {
      assert.equal(s.towers[0].height, 0);
      assert.equal(s.peak, 2);
    }
    if (mode === 'duel') assert.equal(s.points[0], -1);
  }
});

test('an unattended turn expires at three seconds and an invalid tap cannot claim a turn', () => {
  const s = game.createRound(players, 'f');
  assert.equal(game.step(s, [], 2999).turn, 0);
  assert.equal(game.step(s, [], 3000).queue[0], 'p1');
  assert.equal(game.normalizeInput({ kind: 'tap', x: 0 }), null);
  assert.deepEqual(game.normalizeInput({ kind: 'tap' }), { kind: 'tap' });
});

test('the duel countdown follows alternating crews even when their sizes differ', () => {
  let s = game.createRound(players, 'ace', 1, { mode: 'duel' });
  for (let i = 0; i < 12; i++) {
    for (const player of players) {
      const { q } = game.projectForPhone(s, player.id);
      let future = s;
      for (let j = 0; j < q; j++) future = game.step(future, [], 3000);
      assert.equal(future.queue[0], player.id);
    }
    s = game.step(s, [], 3000);
  }
});
