import test from 'node:test';
import assert from 'node:assert/strict';
import { balloonBop as game } from './rules.mjs';
const players = [{ id: 'a', look: 0 }, { id: 'b', look: 1 }];
const hop = { playerId: 'a', input: { kind: 'hop', x: 250 } };

test('only bounded integer hop targets are accepted', () => {
  for (const x of [0, 500, 1000]) assert.deepEqual(game.normalizeInput({kind:'hop',x}), {kind:'hop',x});
  for (const v of [null, {kind:'tap',x:1}, {kind:'hop',x:1, extra:0}, ...[-1, 1001, Infinity, .1, '1'].map(x => ({kind:'hop',x}))]) {
    assert.equal(game.normalizeInput(v), null);
  }
});
test('replaying a seed, hops and a departure reproduces the scene', () => {
  function replay(seed) {
    let s = game.createRound(players, seed);
    for (let i = 0; i < 220; i++) s = game.step(s, i % 22 === 0 ? [hop] : [], 50,
      { departures: i === 140 ? [{playerId:'b'}] : [] });
    assert.equal(game.projectForPhone(s, 'b'), null);
    return game.projectForTv(s);
  }
  assert.deepEqual(replay('a'), replay('a'));
  assert.notDeepEqual(replay('a'), replay('b'));
});
test('bops count once per balloon and the team earns the airborne multiplier', () => {
  const s = game.createRound(players, 'bop');
  s.balloons = [1,2].map(() => ({x:250,y:90,vx:0,vy:-1}));
  const next = game.step(s, [hop]);
  assert.equal(next.team, 4);
  assert.equal(next.players[0].bops, 2);
  assert.equal(game.step(next, []).team, 4);
  assert.equal(s.team, 0);
});
test('a floor loss awards the opposite volley team or consumes the last co-op life', () => {
  for (const mode of ['keep-it-up','balloon-volley']) {
    const s = game.createRound(players, 'floor', 1, {mode});
    s.drops = 2;
    Object.assign(s.balloons[0], {x:200,y:17,vy:0});
    const next = game.step(s, []);
    assert.equal(game.isRoundOver(next), !s.volley);
    if (s.volley) assert.deepEqual(game.scores(next)[0], {playerId:'b',score:1});
  }
});
test('a jumper blocks a dart before it reaches the balloon', () => {
  const s = game.createRound(players, 'block');
  s.dart = {x:238,y:100};
  Object.assign(s.balloons[0], {x:250,y:100,vy:1});
  const next = game.step(s, [hop]);
  assert.equal(next.dart, null);
  assert.equal(next.drops, 0);
  assert.equal(next.event.label, 'Blocked!');
});
test('gusts end, another balloon joins, and time expires at 90 seconds', () => {
  let s = game.createRound(players, 'wind', 1, {mode:'balloon-volley'});
  for (let i = 0; i < 160; i++) s = game.step(s, []);
  assert.equal(Math.abs(s.wind), 1);
  for (let i = 160; i < 220; i++) s = game.step(s, []);
  assert.equal(s.wind, 0);
  for (let i = 220; i < 360; i++) s = game.step(s, []);
  assert.equal(s.balloons.length, 2);
  assert.equal(game.isRoundOver(s), false);
  assert.equal(game.isRoundOver(game.step(s, [], 50, {elapsedMs:90000})), true);
});
test('the net rejects a low crossing and each team hops on its own half', () => {
  let s = game.createRound(players, 'net', 1, {mode:'balloon-volley'});
  Object.assign(s.balloons[0], {x:499, y:80, vx:3, vy:0});
  s = game.step(s, players.map(p => ({playerId:p.id, input:{kind:'hop',x:1000}})));
  assert.ok(s.balloons[0].vx < 0);
  assert.ok(s.balloons[0].x < 500);
  for (let i = 1; i < 18; i++) s = game.step(s, []);
  assert.equal(s.players[0].x, 482);
  assert.equal(s.players[1].x, 982);
});
