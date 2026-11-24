import assert from 'node:assert/strict';
import test from 'node:test';
import { dustBunnySumo as game } from './rules.mjs';

const STEP_MS = 50;
const SEED = 'living-room';
const players = count => Array.from({ length: count }, (_, look) => ({
  id: `p${look + 1}`, look, name: `Bunny ${look + 1}`,
}));
const round = (count = 2) => game.createRound(players(count), SEED);
const tick = (state, ...inputs) => game.step(state, inputs, STEP_MS);
const command = (playerId, kind, axes) => ({ playerId, input: { kind, ...axes } });

function advance(state, ticks) {
  for (let index = 0; index < ticks; index++) state = tick(state);
  return state;
}

test('normalizes exact, finite inputs with a bounded vector', () => {
  assert.deepEqual(game.normalizeInput({ kind: 'dash' }), { kind: 'dash' });
  assert.deepEqual(game.normalizeInput({ kind: 'roll', x: -0, y: 0.99 }), { kind: 'roll', x: 0, y: 0.99 });
  assert.deepEqual(game.normalizeInput({ kind: 'gust', x: 1, y: 0 }), { kind: 'gust', x: 1, y: 0 });
  for (const invalid of [
    null, [], { kind: 'tap' }, { kind: 'dash', playerId: 'p1' },
    { kind: 'roll', y: 0 }, { kind: 'roll', x: '0', y: 0 }, { kind: 'roll', x: 1, y: 1 },
    { kind: 'roll', x: NaN, y: 0 }, { kind: 'gust', x: 0, y: -Infinity },
    { kind: 'gust', x: 0, y: 0 }, { kind: 'roll', x: -.2, y: 0, extra: 0 },
  ]) assert.equal(game.normalizeInput(invalid), null);
});

test('scales rug area for 2, 8 and 16 players with no overlapping starts', () => {
  const sizes = [2, 8, 16].map(count => {
    const { radius, bodies } = game.projectForTv(round(count));
    assert.equal(bodies.length, count);
    for (const [index, first] of bodies.entries()) {
      assert.ok(Math.hypot(first.x, first.y) < radius);
      for (const second of bodies.slice(index + 1)) assert.ok(Math.hypot(first.x - second.x, first.y - second.y) > 23);
    }
    return radius;
  });
  assert.ok(sizes[0] < sizes[1] && sizes[1] < sizes[2]);
  assert.equal(game.maxPlayers, 16);
});

test('a driver who stops sending input coasts to a stop and a late joiner cannot steer', () => {
  const start = round();
  const input = command('p1', 'roll', { x: 1, y: 0 });
  const moving = tick(start, input);
  assert.ok(moving.bodies[0].vx > 0);
  const stopped = advance(moving, 70);
  assert.ok(Math.abs(stopped.bodies[0].vx) < .01);
  assert.equal(game.projectForPhone(stopped, 'late'), null);
  assert.deepEqual(tick(start, command('late', 'dash')), tick(start));
  assert.equal(start.bodies[0].vx, 0);
});

test('dash locks for two seconds and uses the last steering direction', () => {
  let state = round();
  Object.assign(state.bodies[0], { x: 12, y: 0 });
  Object.assign(state.bodies[1], { x: -60, y: 0 });
  state = tick(state, command('p1', 'roll', { x: 0, y: 1 }), command('p1', 'roll', { x: 0, y: 0 }), command('p1', 'dash'));
  assert.equal(state.bodies[0].vx, 0);
  assert.ok(state.bodies[0].vy > 50);
  assert.equal(game.projectForPhone(state, 'p1').cd, 4);
  assert.deepEqual(tick(state, command('p1', 'dash')), tick(state));
  state = advance(state, 39);
  assert.equal(game.projectForPhone(state, 'p1').cd, 1);
  state = tick(state, command('p1', 'dash'));
  assert.equal(game.projectForPhone(state, 'p1').cd, 4);
});

test('an elastic circle impact transfers speed and keeps bodies apart', () => {
  const start = round();
  Object.assign(start.bodies[0], { x: -13, y: 0, vx: 84 });
  Object.assign(start.bodies[1], { x: 13, y: 0, vx: -18 });
  const state = tick(start);
  assert.ok(state.bodies[0].vx < 10 && state.bodies[1].vx > 60);
  assert.ok(state.bodies[1].x - state.bodies[0].x >= 23 - 1e-9);
  assert.equal(game.projectForTv(state).events[0].kind, 'hit');
});

test('Lala shows the next rug radius two seconds before it changes', () => {
  const start = round();
  const radius = start.radius;
  const early = advance(start, 279);
  assert.equal(game.projectForTv(early).warning, null);
  const warning = game.projectForTv(tick(early)).warning;
  assert.equal(warning.ms, 2000);
  assert.ok(warning.radius < radius);
  const shrink = advance(early, 41);
  assert.equal(shrink.radius, warning.radius);
  assert.equal(game.projectForTv(shrink).events[0].kind, 'shrink');
});

test('a knocked-out player can send a weak gust on a four-second cooldown', () => {
  const start = round(3);
  Object.assign(start.bodies[0], { x: 0, y: start.radius + 1 });
  Object.assign(start.bodies[1], { x: -36, y: 0 });
  Object.assign(start.bodies[2], { x: start.radius - 1, y: 0 });
  const out = tick(start);
  assert.deepEqual(game.projectForPhone(out, 'p1'), { out: true, cd: 0 });
  const gust = command('p1', 'gust', { x: 1, y: 0 });
  const sent = tick(out, gust);
  assert.equal(game.projectForPhone(sent, 'p1').cd, 8);
  assert.deepEqual(tick(sent, gust), tick(sent));
  const crossed = advance(sent, 14);
  assert.ok(crossed.bodies[1].x > -36 && crossed.bodies[1].x < -25);
  assert.equal(crossed.bodies[2].x, start.bodies[2].x);
  assert.equal(crossed.bodies[2].outAt, null);
  assert.equal(game.projectForPhone(advance(sent, 80), 'p1').cd, 0);
});

test('fourteen staggered gusts cannot push a stationary bunny off the rug', () => {
  let state = round(16);
  const startX = state.radius - 65;
  Object.assign(state.bodies[0], { x: startX, y: 0 });
  Object.assign(state.bodies[1], { x: -60, y: 0 });
  const draughts = state.bodies.slice(2);
  for (const body of draughts) body.outAt = 0;
  for (const { id } of draughts) state = tick(state, command(id, 'gust', { x: 1, y: 0 }));
  state = advance(state, 86);
  assert.ok(state.bodies[0].x > startX);
  assert.equal(state.bodies[0].outAt, null);
  assert.ok(state.bodies[0].x <= state.radius);
});

test('the last bunny wins and all later inputs leave the result unchanged', () => {
  const start = round(3);
  Object.assign(start.bodies[0], { x: 0, y: 0 });
  Object.assign(start.bodies[1], { x: start.radius + 2, y: 0 });
  Object.assign(start.bodies[2], { x: 0, y: -start.radius - 4 });
  const result = tick(start);
  assert.equal(game.isRoundOver(result), true);
  assert.deepEqual(game.scores(result), [
    { playerId: 'p1', score: 3 }, { playerId: 'p2', score: 2 }, { playerId: 'p3', score: 1 },
  ]);
  assert.equal(tick(result, command('p1', 'dash')), result);
});

test('everyone out on the same tick is ranked by distance, with equal distances tying', () => {
  const start = round(3);
  Object.assign(start.bodies[0], { x: start.radius + 1, y: 0 });
  Object.assign(start.bodies[1], { x: -start.radius - 1, y: 0 });
  Object.assign(start.bodies[2], { x: 0, y: start.radius + 3 });
  const result = tick(start);
  assert.equal(game.isRoundOver(result), true);
  assert.deepEqual(game.scores(result).map(({ score }) => score), [3, 3, 1]);
});

test('the 90-second cap breaks survivor ties by distance from centre', () => {
  const start = round(2);
  start.elapsedMs = 89_950;
  start.radius = 13;
  start.shrinkIndex = 10;
  Object.assign(start.bodies[0], { x: 12, y: 0 });
  Object.assign(start.bodies[1], { x: -13, y: 0 });
  const result = tick(start);
  assert.equal(game.isRoundOver(result), true);
  assert.equal(result.elapsedMs, game.durationMs);
  assert.deepEqual(game.scores(result), [{ playerId: 'p1', score: 2 }, { playerId: 'p2', score: 1 }]);
});

test('fixed seed and tick log replay exactly to the same final scores', () => {
  const roster = players(16);
  const initial = game.createRound(roster, SEED);
  const log = Array.from({ length: 420 }, (_, index) => index >= 115 && index < 175
    ? initial.bodies.slice(1).map(({ id, x, y }) => command(id, 'roll', { x: x / Math.hypot(x, y), y: y / Math.hypot(x, y) }))
    : []);
  const replay = seed => log.reduce((state, inputs) => tick(state, ...inputs), game.createRound(roster, seed));
  const result = replay(SEED);
  assert.ok(game.isRoundOver(result));
  assert.equal(game.scores(result)[0].playerId, 'p1');
  assert.deepEqual(replay(SEED), result);
  assert.notDeepEqual(game.createRound(roster, 'different'), initial);
});
