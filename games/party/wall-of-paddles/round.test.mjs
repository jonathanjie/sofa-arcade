import test from 'node:test';
import assert from 'node:assert/strict';
import { wallOfPaddles, COURT } from './round.mjs';

const roster = count => Array.from({ length: count }, (_, look) => ({
  id: `p${look + 1}`, name: `Guest ${look + 1}`, look,
}));
const start = (count = 2, seed = 'paddles', round = 1) => wallOfPaddles.createRound(roster(count), seed, round);
const slide = (playerId, position) => ({ playerId, input: { kind: 'slide', position } });
const step = (state, inputs = [], departures = []) => wallOfPaddles.step(state, inputs, 50, { departures });

function ball(overrides = {}) {
  return { id: 100, x: COURT.width / 2, y: COURT.height / 2, vx: -400, vy: 0,
    team: null, curveUntil: 0, bend: 0, ...overrides };
}

test('accepts only canonical, finite absolute slide input', () => {
  for (const value of [null, [], {}, { kind: 'tap' }, { kind: 'slide', position: '0' },
    { kind: 'slide', position: 1.01 }, { kind: 'slide', position: NaN },
    { kind: 'slide', position: Infinity }, { kind: 'slide', position: 0, extra: 1 }]) {
    assert.equal(wallOfPaddles.normalizeInput(value), null);
  }
  for (const position of [-1, -0, 1]) {
    const input = { kind: 'slide', position };
    assert.deepEqual(wallOfPaddles.normalizeInput(input), { ...input, position: position || 0 });
    assert.notEqual(wallOfPaddles.normalizeInput(input), input);
  }
});

test('balances teams and keeps paddles in equal slots at 2, 7, 8, 15 and 16 seats', () => {
  for (const count of [2, 7, 8, 15, 16]) {
    const state = step(start(count), roster(count).map(player => slide(player.id, -1)));
    const teams = [0, 1].map(team => state.paddles.filter(paddle => paddle.team === team));
    assert.ok(Math.abs(teams[0].length - teams[1].length) <= 1);
    for (const team of teams) {
      assert.equal(team[0].top, 0);
      assert.equal(team.at(-1).bottom, COURT.height);
      for (const [index, paddle] of team.entries()) {
        assert.equal(paddle.top, COURT.height * index / team.length);
        assert.equal(paddle.y, paddle.top + paddle.length / 2);
      }
    }
    assert.ok(Math.abs(teams[0].length * teams[0][0].length - teams[1].length * teams[1][0].length) < 1e-9);
  }
});

test('a late input cannot move a paddle and a silent seat holds its last absolute position', () => {
  const moved = step(start(), [slide('p1', -1), slide('p1', 0.6), slide('late', 1)]);
  const later = Array.from({ length: 80 }).reduce(state => step(state), moved);
  assert.deepEqual(later.paddles, moved.paddles);
  assert.equal(later.paddles.length, 2);
  assert.equal(wallOfPaddles.projectForPhone(later, 'late'), null);
  assert.deepEqual(wallOfPaddles.projectForPhone(later, 'p1'), { team: 0, position: 0.6 });
});

test('a departure removes the body before collision and redivides only that wall', () => {
  const state = step(start(8), [slide('p1', -1)]);
  const departed = state.paddles[0];
  state.balls = [ball({ x: 12, y: departed.y, vx: -600 })];
  const result = step(state, [slide('p1', 1)], [{ playerId: 'p1', reason: 'kicked' }]);
  assert.equal(wallOfPaddles.projectForPhone(result, 'p1'), null);
  assert.equal(result.events.find(event => event.kind === 'leave')?.playerId, 'p1');
  assert.ok(!result.events.some(event => event.kind === 'hit'));
  assert.deepEqual(result.points, [0, 1]);
  const cyan = result.paddles.filter(paddle => paddle.team === 0);
  assert.deepEqual(cyan.map(paddle => paddle.playerId), ['p3', 'p5', 'p7']);
  assert.equal(cyan[0].top, 0);
  assert.equal(cyan[0].bottom, COURT.height / 3);
  assert.deepEqual(result.paddles.filter(paddle => paddle.team === 1), state.paddles.filter(paddle => paddle.team === 1));
  assert.ok(Math.abs(cyan[0].length * 3 - result.paddles.find(paddle => paddle.team === 1).length * 4) < 1e-9);
});

test('the same seed serves faster in later rounds, with a cap at round five', () => {
  const opening = start(16, 'paddles', 1).balls;
  const second = start(16, 'paddles', 2).balls;
  assert.equal(opening.length, second.length);
  assert.ok(second.every((ball, index) => Math.abs(ball.vx) > Math.abs(opening[index].vx)));
  assert.deepEqual(start(16, 'paddles', 5).balls, start(16, 'paddles', 20).balls);
});

test('larger rosters serve more balls and adjust the target for wall coverage', () => {
  const scenes = [2, 8, 16].map(count => wallOfPaddles.projectForTv(start(count)));
  assert.deepEqual(scenes.map(scene => scene.balls.length), [2, 4, 6]);
  assert.deepEqual(scenes.map(scene => scene.target), [12, 15, 11]);
});

test('reaching the goal target cannot end a round before 45 seconds', () => {
  const state = start(16);
  state.points = [state.target, 0];
  state.elapsedMs = 44_900;
  const before = step(state);
  assert.equal(wallOfPaddles.isRoundOver(before), false);
  assert.equal(wallOfPaddles.isRoundOver(step(before)), true);
});

test('sweeps a fast crossing into a hit, even after a rail bounce in the same tick', () => {
  const state = start(16);
  const struck = state.paddles[0];
  // At the face the reflected ball lands slightly below the paddle centre.
  state.balls = [ball({ x: 130, y: 26, vx: -5000, vy: -2400 })];
  const result = step(state);
  assert.ok(result.balls[0].vx > 0);
  assert.ok(result.balls[0].vy > 0);
  assert.deepEqual(result.points, [0, 0]);
  assert.equal(result.events[0].playerId, struck.playerId);
  assert.equal(result.balls[0].team, struck.team);
});

test('a ball that grazes a paddle across a slot boundary still rebounds', () => {
  const state = step(start(4), [slide('p1', 1)]);
  state.balls = [ball({ x: 22, y: COURT.height / 2 + 4, vx: -600 })];
  const result = step(state);
  assert.equal(result.events[0]?.playerId, 'p1');
  assert.ok(result.balls[0].vx > 0);
});

test('centred paddles leave a passable seam even with the wide boost at 16 seats', () => {
  const state = start(16);
  state.wideUntil[0] = 6500;
  state.balls = [ball({ x: 12, y: COURT.height / 8, vx: -600 })];
  const result = step(state);
  assert.deepEqual(result.points, [0, 1]);
  assert.ok(!result.events.some(event => event.kind === 'hit'));
});

test('hits speed up and the far edge sends the ball away at a larger angle', () => {
  function hit(offset) {
    const state = start();
    state.balls = [ball({ x: 20, y: state.paddles[0].y + offset })];
    return step(state).balls[0];
  }
  const centre = hit(0);
  const edge = hit(70);
  assert.equal(centre.vy, 0);
  assert.ok(centre.vx > 400);
  assert.ok(edge.vy > 180);
  assert.ok(Math.abs(Math.hypot(edge.vx, edge.vy) - centre.vx) < 1e-9);
});

test('awards the winning point to the first goal in the tick, regardless of ball array order', () => {
  const state = start(4);
  const { target } = wallOfPaddles.projectForTv(state);
  state.elapsedMs = 45_000;
  state.points = [target - 1, target - 1];
  state.balls = [
    ball({ x: 8, y: 60, vx: -500 }),
    ball({ id: 101, x: COURT.width + 3, y: 60, vx: 550 }),
  ];
  const result = step(state);
  assert.deepEqual(result.points, [target, target - 1]);
  assert.equal(wallOfPaddles.isRoundOver(result), true);
  assert.equal(step(result), result);
  assert.deepEqual(wallOfPaddles.scores(result), [
    { playerId: 'p1', score: target }, { playerId: 'p3', score: target },
    { playerId: 'p2', score: target - 1 }, { playerId: 'p4', score: target - 1 },
  ]);
});

test('ranks an exact timeout tie equally and never steps past 90 seconds', () => {
  const state = start();
  state.elapsedMs = 89_950;
  state.points = [4, 4];
  state.balls = [ball()];
  assert.equal(wallOfPaddles.isRoundOver(state), false);
  const result = step(state);
  assert.equal(result.elapsedMs, 90_000);
  assert.equal(wallOfPaddles.isRoundOver(result), true);
  assert.deepEqual(wallOfPaddles.scores(result).map(entry => entry.score), [4, 4]);
});

test('counts every simultaneous crossing at the time limit before ranking the round', () => {
  const state = start();
  state.elapsedMs = 89_950;
  state.points = [3, 3];
  state.balls = [
    ball({ x: 15, y: 180, vx: -500 }),
    ball({ id: 101, x: COURT.width - 15, y: 180, vx: 500 }),
  ];
  const result = step(state);
  assert.deepEqual(result.points, [4, 4]);
  assert.equal(wallOfPaddles.isRoundOver(result), true);
});

test('untouched balls skip boosts and swept team tags claim all four effects', () => {
  for (const kind of ['wide', 'split', 'curve', 'slow']) {
    const state = start();
    const x = COURT.width / 2;
    const y = COURT.height / 2;
    state.pickup = { kind, x, y };
    state.balls = [ball({ x: x - 95, y, vx: 4000 })];
    assert.equal(step(state).pickup.kind, kind);
    state.balls[0].team = 0;
    const result = step(state);
    assert.equal(result.pickup, null);
    assert.equal(result.events.find(event => event.kind === 'boost').boost, kind);
    if (kind === 'wide') {
      assert.ok(result.paddles[0].length > state.paddles[0].length);
      assert.equal(result.paddles[1].length, state.paddles[1].length);
    }
    if (kind === 'split') assert.equal(result.balls.length, 2);
    if (kind === 'curve') assert.notEqual(result.balls[0].bend, 0);
    if (kind === 'slow') assert.ok(result.slowUntil > result.elapsedMs);
  }
});

test('replays a full locked 16-player round with the same seed and tick log', () => {
  const seats = roster(16);
  const log = Array.from({ length: 1800 }, (_, tick) =>
    seats.map(({ id }, index) => slide(id, ((tick * 17 + index * 7) % 201 - 100) / 100)));
  const replay = seed => log.reduce((state, inputs, tick) => step(state, inputs,
    tick === 100 ? [{ playerId: 'p8', reason: 'expired' }] : []), start(16, seed, 3));
  const result = replay('repeat');
  assert.deepEqual(result, replay('repeat'));
  assert.notDeepEqual(result, replay('other'));
  assert.ok(wallOfPaddles.isRoundOver(result));
  assert.ok(result.points.some(Boolean));
  assert.equal(wallOfPaddles.scores(result).length, 15);
  const scene = wallOfPaddles.projectForTv(result);
  assert.equal(Object.hasOwn(scene, 'rng'), false);
  assert.equal(Object.hasOwn(scene.paddles[0], 'position'), false);
});
