import test from 'node:test';
import assert from 'node:assert/strict';
import { paperSkies as game } from './rules.mjs';

const seats = n => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, look: i, name: '🪁'.repeat(12) }));
const start = (mode, n = 2) => game.createRound(seats(n), 'breeze', 1, { mode });
const fly = (x = 0, y = 0, b = 0, f = 0) => ({ kind: 'fly', x, y, b, f });
const command = input => [{ playerId: 'p1', input }];
const tick = (s, inputs = [], options) => game.step(s, inputs, 50, options);
function clearSky(mode) {
  const s = start(mode);
  s.thermals = []; s.clouds = [];
  Object.assign(s.planes[0], { x: 400, y: 450, a: 0 });
  Object.assign(s.planes[1], { x: 1200, y: 450, a: 0 });
  return s;
}

test('accepts independently clamped axes, rejects malformed input, canonicalizes all signed zeros', () => {
  assert.deepEqual(game.normalizeInput(fly(1, 1, 1, 1)), fly(1, 1, 1, 1));
  assert.deepEqual(game.normalizeInput(fly(-0, -0, -0, -0)), fly());
  for (const bad of [null, [], {}, Object.create(fly()), { ...fly(), z: 1 }, { ...fly(), kind: 'drive' },
    fly(-1.01), fly(0, 1.01), fly(Infinity), fly(0, NaN), fly('0'), fly(0, 0, true), fly(0, 0, 0, 2)]) {
    assert.equal(game.normalizeInput(bad), null);
  }
  for (const key of Object.keys(fly())) { const partial = fly(); delete partial[key]; assert.equal(game.normalizeInput(partial), null); }
});

for (const [m, { id }] of game.modes.entries()) {
  test(`${id}: deterministic full round, bounded planes, unchanged previous state and final scores`, () => {
    let a = start(id, 16), b = start(id, 16);
    assert.notDeepEqual(a.thermals, game.createRound(seats(16), 'other').thermals);
    assert.equal(a.thermals.length, 3);
    assert.deepEqual(a.clouds.map(c => c.gust), [0, 0, 1, 1]);
    for (let i = 0; i < 1500; i++) {
      const inputs = command(fly(Math.sin(i / 20), Math.cos(i / 30), +(i % 60 < 45), 1));
      const before = i % 100 === 0 ? structuredClone(a) : null;
      const next = tick(a, inputs);
      if (before) assert.deepEqual(a, before);
      a = next; b = tick(b, inputs);
      assert.ok(a.planes.every(p => p.x >= 36 && p.x <= 1564 && p.y >= 36 && p.y <= 924 && p.boostCharge >= 0 && p.boostCharge <= 100));
      assert.ok(a.darts.length <= 2);
      assert.equal(game.isRoundOver(a), i === 1499);
    }
    assert.deepEqual(a, b); assert.deepEqual(game.scores(a), game.scores(b));
    assert.equal(a.elapsedMs, game.durationMs); assert.equal(tick(a), a);
  });
  test(`${id}: exact phone snapshot with 2, 8 and 16 max-length names`, () => {
    for (const n of [2, 8, 16]) {
      const s = start(id, n);
      for (const seat of seats(n)) {
        const p = s.planes.find(p => p.id === seat.id);
        Object.assign(p, { score: 1499.8, popped: 112, streak: 5, crown: true, wobbleMs: 550, fireCd: 450, boosting: true });
        const state = game.projectForPhone(s, seat.id);
        assert.deepEqual(state, { m, s: 1500, b: 10, f: 5, c: [5, 99, 1][m], w: 6, k: 1 });
        const packet = { type: 'snapshot', view: { phase: 'playing', round: 99, ms: 74950, notice: null,
          gameId: game.id, self: { ...seat, ready: true }, waiting: false, state, place: null } };
        assert.ok(Buffer.byteLength(JSON.stringify(packet)) < 300);
      }
      assert.equal(game.projectForPhone(s, 'spectator'), null);
    }
  });
}

test('flight: pitch, bank, charge threshold, recharge and escape from an outward-facing wall', () => {
  let s = clearSky('sky-tag');
  s = tick(s, command(fly(1, -1, 1)));
  assert.equal(s.planes[0].spd, 445); assert.ok(s.planes[0].bank > 0 && s.planes[0].bank < 1);
  Object.assign(s.planes[0], { boostCharge: 2, boosting: true });
  s = tick(s); assert.equal(s.planes[0].boostCharge, 0);
  s = tick(s, command(fly(0, 1, 1))); assert.equal(s.planes[0].spd, 195); assert.ok(!s.planes[0].boosting);
  assert.ok(s.planes[0].boostCharge > 0);
  Object.assign(s.planes[0], { x: 36, y: 480, a: Math.PI, bank: 0 });
  s = tick(s, command(fly()));
  for (let i = 0; i < 30; i++) s = tick(s);
  assert.ok(s.planes[0].x > 70);
});

test('thermals recharge once per entry; storm gusts disrupt streak and flight', () => {
  let s = clearSky('ring-rally'); s.rings = [];
  Object.assign(s.planes[0], { boostCharge: 20, streak: 4 });
  s.thermals = [{ id: 11, x: 400, y: 450, r: 90 }];
  s = tick(s); assert.equal(s.planes[0].boostCharge, 48.75); assert.ok(s.planes[0].spd > 250);
  s = tick(s); assert.equal(s.planes[0].boostCharge, 49.5);
  s.clouds = [{ id: 12, x: 440, y: 450, r: 80, gust: 1 }];
  s = tick(s); assert.equal(s.planes[0].wobbleMs, 500); assert.equal(s.planes[0].streak, 0);
  assert.ok(s.planes[0].spd < 300);
});

test('ring values, streak bonus, cap, refill and safe replacement', () => {
  let s = clearSky('ring-rally');
  for (const r of s.rings) Object.assign(r, { x: 900, y: 650 });
  s.planes[0].boostCharge = 10;
  for (let i = 0; i < 6; i++) {
    const r = s.rings[i ? 0 : 1], p = s.planes[0];
    Object.assign(r, { x: p.x + 12, y: p.y });
    const before = p.score;
    s = tick(s);
    assert.equal(s.planes[0].score - before, (i ? 3 : 1) + +(i >= 2));
    assert.equal(s.planes[0].streak, Math.min(5, i + 1));
    assert.equal(s.rings.length, 4); assert.equal(s.rings.filter(r => r.gold).length, 1);
    assert.ok(!s.rings.some(o => o.id === r.id)); assert.equal(s.events.at(-1).kind, 'ring');
    const replacement = s.rings[i ? 0 : 1];
    assert.ok(s.planes.every(q => Math.hypot(q.x - replacement.x, q.y - replacement.y) > 95));
    if (!i) assert.equal(s.planes[0].boostCharge, 45.75);
  }
});

test('balloons drift, retain their value mix and pop from a plane or a dart', () => {
  let s = clearSky('balloon-pop');
  const mix = s.balloons.map(b => b.pts);
  for (const b of s.balloons) Object.assign(b, { x: 950, y: 650 });
  Object.assign(s.balloons[9], { x: 412, y: 450 });
  Object.assign(s.balloons[6], { x: 464, y: 450 });
  s = tick(s, command(fly(0, 0, 0, 1)));
  assert.equal(s.planes[0].score, 5); assert.equal(s.planes[0].popped, 2);
  assert.deepEqual(s.events.map(e => e.kind), ['pop', 'pop']); assert.equal(s.darts.length, 0);
  assert.deepEqual(s.balloons.map(b => b.pts), mix); assert.notEqual(s.balloons[0].x, 950);
});

test('crown count, grab, timed income, protected close pass, then steal', () => {
  assert.equal(start('sky-tag', 9).crowns.length, 1); assert.equal(start('sky-tag', 10).crowns.length, 2);
  let s = clearSky('sky-tag'); Object.assign(s.crowns[0], { x: 412, y: 450 });
  s = tick(s); assert.equal(s.crowns[0].holder, 'p1'); assert.equal(s.planes[0].score, 2);
  Object.assign(s.planes[1], { x: s.planes[0].x, y: s.planes[0].y + 30 });
  for (let i = 0; i < 23; i++) s = tick(s);
  assert.equal(s.crowns[0].holder, 'p1'); assert.ok(Math.abs(s.planes[0].score - 4.3) < 1e-8);
  s = tick(s); assert.equal(s.crowns[0].holder, 'p2'); assert.equal(s.planes[1].score, 3);
  assert.equal(s.planes[1].stealCd, 1200); assert.ok(s.planes[0].wobbleMs > 0);
});

test('a dart steals a distant crown; departure freezes score and clears owned darts before inputs', () => {
  let s = clearSky('sky-tag');
  Object.assign(s.planes[1], { x: 455, crown: true }); s.crowns[0].holder = 'p2';
  s = tick(s, command(fly(0, 0, 0, 1)));
  assert.equal(s.planes[1].wobbleMs, 550); assert.equal(s.crowns[0].holder, 'p1');
  assert.deepEqual(s.events.map(e => e.kind), ['hit', 'crown']);
  s.planes[1].x = 1400;
  for (let i = 0; i < 10; i++) s = tick(s);
  assert.ok(s.darts.some(d => d.by === 'p1'));
  const { x, y, score } = s.planes[0];
  s = tick(s, command(fly()), { departures: [{ playerId: 'p1', reason: 'expired' }] });
  assert.deepEqual(s.crowns[0], { id: s.crowns[0].id, x, y, holder: null });
  assert.equal(s.planes.length, 1); assert.equal(s.darts.length, 0); assert.equal(game.projectForPhone(s, 'p1'), null);
  assert.equal(s.roster[0].score, score); assert.deepEqual(game.scores(tick(s))[0], { playerId: 'p1', score: Math.round(score) });
});

test('darts travel at flight-independent speed, obey cooldown, and expire', () => {
  let s = tick(clearSky('sky-tag'), command(fly(0, 0, 0, 1)));
  const first = s.darts[0]; assert.equal(s.planes[0].fireCd, 450);
  s = tick(s); assert.equal(s.darts[0].x - first.x, 28);
  for (let i = 0; i < 7; i++) s = tick(s);
  assert.equal(s.darts.length, 1);
  s = tick(s); assert.equal(s.darts.length, 2);
  s = tick(s, command(fly()));
  for (let i = 0; i < 4; i++) s = tick(s);
  assert.ok(!s.darts.some(d => d.id === first.id));
});

test('host-clock gap advances deadline without simulating discarded flight ticks', () => {
  const s = clearSky('sky-tag');
  const end = tick(s, [], { elapsedMs: 75050 });
  assert.equal(end.elapsedMs, 75000); assert.equal(end.planes[0].x, 412.5); assert.ok(game.isRoundOver(end));
});


test('TV projects only public fields at the specified precision', () => {
  const keys = (object, expected) => assert.deepEqual(Object.keys(object).sort(), expected.split(' ').sort());
  for (const { id } of game.modes) {
    const s = start(id);
    Object.assign(s.planes[0], { x: 400.123, a: 0.126 });
    s.darts.push({ id: 40, x: 50, y: 60, a: 1, look: 0, by: 'p1', ms: 200 });
    const tv = game.projectForTv(s);
    keys(tv, 'mode elapsedMs w h thermals clouds rings balloons crowns darts planes events');
    for (const [items, expected] of [[tv.thermals, 'id x y r'], [tv.clouds, 'id x y r gust'],
      [tv.rings, 'id x y r a gold'], [tv.balloons, 'id x y r pts col'], [tv.crowns, 'id x y holder'],
      [tv.darts, 'id x y a look'], [tv.planes, 'id look x y a bank spd boost wobble crown score']]) {
      for (const item of items) keys(item, expected);
    }
    assert.equal(tv.planes[0].x, 400.1); assert.equal(tv.planes[0].a, 0.13);
  }
});
