import test from 'node:test';
import assert from 'node:assert/strict';
import { paperSkies as game } from './rules.mjs';
import { buildTerrain, sampleHeight, wrapCoord, wrapDelta } from './terrain.mjs';

const seats = n => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, look: i, name: '🪁'.repeat(12) }));
const start = (mode = 'ring-rally', n = 2) => game.createRound(seats(n), 'breeze', 1, { mode });
const fly = (x = 0, y = 0, b = 0, r = 0, l = 0) => ({ kind: 'fly', x, y, b, r, l });
const command = input => ({ playerId: 'p1', input });
const tick = (s, input, options) => game.step(s, input ? [command(input)] : [], 50, options);
function advance(s, ticks) { for (let i = 0; i < ticks; i++) s = tick(s); return s; }
const keys = (obj, expected) => assert.deepEqual(Object.keys(obj).sort(), expected.split(' ').sort());
const kinds = s => s.events.map(e => e.kind);
function sky(mode) {
  const s = start(mode);
  s.terrain.heights.fill(0);
  for (const o of [...s.storms, ...s.suns, ...s.balloons, ...s.crowns]) Object.assign(o, { x: 300, y: 300, z: 45 });
  Object.assign(s.planes[0], { x: 100, y: 100, a: 0, z: 38 });
  Object.assign(s.planes[1], { x: 400, y: 400, a: 0, z: 38 });
  return s;
}
function near(item, p, dz = 0) { Object.assign(item, { x: p.x + 2, y: p.y, z: p.z + dz }); }

test('terrain rebuilds from TV seed; samples wrap on smooth periodic seams', () => {
  const s = start(), t = buildTerrain(game.projectForTv(s).seed);
  assert.deepEqual(t, s.terrain); assert.notDeepEqual(t.heights, buildTerrain('another').heights);
  assert.equal(t.size, 512); assert.equal(t.clouds.length, 512 ** 2);
  assert.equal(new Set(t.heights).size, 29); assert.ok(new Set(t.clouds).size > 100);
  for (let i = 0; i < 512; i++) {
    assert.equal(sampleHeight(t, -0.1, i + 512), sampleHeight(t, 511, i));
    assert.ok(Math.abs(sampleHeight(t, i, 0) - sampleHeight(t, i, 511)) <= 2);
    assert.ok(Math.abs(sampleHeight(t, 0, i) - sampleHeight(t, 511, i)) <= 2);
  }
  assert.equal(wrapDelta(511, 2), 3); assert.equal(wrapDelta(2, 511), -3); assert.equal(wrapCoord(-1025), 511);
});

test('flight input requires six own fields; clamps finite axes independently', () => {
  assert.deepEqual(game.normalizeInput(fly(2, -3, 1, 1, 1)), fly(1, -1, 1, 1, 1));
  assert.deepEqual(game.normalizeInput(fly(-0, -0, -0, -0, -0)), fly());
  for (const bad of [null, [], Object.create(fly()), { ...fly(), f: 0 }, fly(NaN), fly(0, Infinity),
    fly('1'), fly(0, 0, 2), fly(0, 0, 0, true), fly(0, 0, 0, 0, -1), { ...fly(), kind: 'dart' }]) {
    assert.equal(game.normalizeInput(bad), null);
  }
  for (const k of Object.keys(fly())) { const partial = fly(); delete partial[k]; assert.equal(game.normalizeInput(partial), null); }
});

test('pitch, bank, forward wrap, boost fuel drain and 1.5 second stall recovery', () => {
  let s = sky(); s.planes[0].x = 511;
  s = tick(s, fly(1, -1, 1)); let p = s.planes[0];
  assert.ok(p.x < 3 && p.z > 38 && p.bank > 0 && p.a > 0); assert.equal(p.spd, 56); assert.equal(p.fuel, 99.655);
  s = tick(s, fly(0, 1)); p = s.planes[0]; assert.equal(p.z, 38); assert.equal(p.spd, 42);
  p.fuel = 0.01; p.combo = 4; s = tick(s); assert.equal(s.planes[0].stallMs, 1500); assert.ok(kinds(s).includes('stall'));
  s = advance(s, 30); assert.equal(s.planes[0].fuel, 55); assert.equal(s.planes[0].combo, 1); assert.ok(s.planes[0].z < 38);
});

test('roll sidesteps for eleven ticks; one short press does not repeat', () => {
  let s = game.step(sky(), [command(fly(0, 0, 0, 1)), command(fly())]);
  assert.ok(s.planes[0].rollAngle > 0); s = advance(s, 10);
  assert.equal(s.planes[0].rollCd, 700); assert.equal(s.planes[0].rollMs, 0); assert.ok(Math.abs(s.planes[0].y - 118) < 1e-8);
  s = tick(s, fly(0, 0, 0, 1)); s = advance(s, 20); assert.equal(s.planes[0].rollMs, 0); assert.equal(s.planes[0].rollCd, 0);
});

for (const pickup of [false, true]) test(`loop reverses horizontal travel, returns to entry, bonus sun=${pickup}`, () => {
  let s = tick(sky(), fly(0, 0, 0, 0, 1)); s = advance(s, 5); const x = s.planes[0].x;
  s = advance(s, 4); assert.ok(s.planes[0].x < x && s.planes[0].z > 56);
  s = advance(s, 8); if (pickup) near(s.suns[0], { ...s.planes[0], z: 38 });
  s = tick(s); const p = s.planes[0]; assert.equal(p.z, 38); assert.equal(p.loopMs, 0); assert.equal(p.loopCd, 1200);
  assert.equal(p.score, pickup ? 70 : 30); assert.equal(s.events.at(-1).kind, 'loop');
});

test('storms distinguish altitude, hit, completed close pass, and one dodge per maneuver encounter', () => {
  let s = sky(); near(s.storms[0], s.planes[0], 30); s = tick(s); assert.equal(s.planes[0].wobbleMs, 0);
  near(s.storms[0], s.planes[0]); s = tick(s); assert.equal(s.planes[0].wobbleMs, 650); assert.ok(kinds(s).includes('storm'));
  assert.ok(s.planes[0].fuel < 80); assert.equal(tick(s).planes[0].score, 0);
  s = sky(); near(s.storms[0], s.planes[0], 18); s = advance(s, 14); assert.equal(s.planes[0].score, 15); assert.ok(kinds(s).includes('close'));
  for (const input of [fly(0, 0, 0, 1), fly(0, 0, 0, 0, 1)]) {
    s = sky(); near(s.storms[0], s.planes[0]); s = advance(tick(s, input), 3);
    assert.equal(s.planes[0].score, 25); assert.equal(s.planes[0].tricks, 1); assert.ok(kinds(s).includes('dodge'));
  }
});

test('low flight earns skim points only over water; terrain bounces the plane', () => {
  let s = sky(); s.planes[0].z = 12; s = advance(s, 9); assert.equal(s.planes[0].score, 0);
  s = tick(s); assert.equal(s.planes[0].score, 2); assert.ok(kinds(s).includes('skim'));
  s.terrain.heights.fill(25); s.planes[0].combo = 4; s = tick(s);
  const p = s.planes[0]; assert.equal(p.z, 35); assert.equal(p.combo, 1); assert.equal(p.wobbleMs, 600);
  assert.ok(p.fuel < 82); assert.ok(kinds(s).includes('crash'));
});

test('sun pickups use 3D torus distance, bounded combo, score, fuel and timeout', () => {
  let s = sky(); let p = s.planes[0]; p.fuel = 10; p.x = 510;
  Object.assign(s.suns[0], { x: 0, y: p.y, z: 60 }); s = tick(s); assert.equal(s.planes[0].suns, 0);
  for (let i = 0; i < 5; i++) {
    p = s.planes[0]; const sun = s.suns[0]; near(sun, p); sun.gold = +(i === 4);
    const points = (sun.gold ? 20 : 10) * Math.min(5, i + 2);
    s = tick(s); assert.equal(s.planes[0].score - p.score, points); assert.equal(s.events.at(-1).text, `+${points}`);
    assert.ok(Math.abs(s.planes[0].fuel - p.fuel - 15.88) < 1e-8);
  }
  assert.ok(s.suns.length >= 10 && s.suns.length <= 15); s = tick(s, undefined, { elapsedMs: 6000 }); assert.equal(s.planes[0].combo, 1);
});

test('balloons drift, require matching altitude, award value and refill 12 fuel', () => {
  let s = sky('balloon-pop'); s.planes[0].fuel = 40; near(s.balloons[2], s.planes[0], 25);
  const x = s.balloons[2].x; s = tick(s); assert.notEqual(s.balloons[2].x, x); assert.equal(s.planes[0].popped, 0);
  near(s.balloons[2], s.planes[0]); s = tick(s); assert.equal(s.planes[0].score, 30); assert.equal(s.planes[0].popped, 1);
  assert.equal(s.balloons.length, 12); assert.ok(Math.abs(s.planes[0].fuel - 51.76) < 1e-8);
});

test('crowns track holders in 3D, pay ten per second, transfer and drop on departure', () => {
  let s = sky('sky-tag'); near(s.crowns[0], s.planes[0], 22); s = tick(s); assert.equal(s.crowns[0].holder, null);
  near(s.crowns[0], s.planes[0]); s = advance(s, 20); assert.equal(s.planes[0].score, 10);
  near(s.planes[1], s.planes[0]); s = advance(s, 5); assert.equal(s.crowns[0].holder, 'p2');
  s.planes[0].z = 65; s = tick(s, undefined, { departures: [{ playerId: 'p2' }] });
  assert.equal(s.crowns[0].holder, null); assert.equal(s.crowns[0].z, 38); assert.equal(game.projectForPhone(s, 'p2'), null);
  assert.equal(game.scores(s).find(row => row.playerId === 'p2').score, 1);
});

for (const [m, { id }] of game.modes.entries()) {
  test(`${id}: full replay with level changes and fixed tick after clock gap`, () => {
    let a = start(id, 16), b = start(id, 16);
    for (let i = 1; i <= 1500; i++) {
      const input = fly(Math.sin(i / 20), Math.cos(i / 30), +(i % 60 < 45), +(i % 80 === 0), +(i % 90 === 0));
      const old = i % 500 === 0 ? structuredClone(a) : null, prev = a;
      a = tick(a, input); b = tick(b, input); if (old) assert.deepEqual(prev, old);
      assert.equal(a.lv, Math.min(3, 1 + Math.floor(i / 500))); assert.equal(a.storms.length, 3 + 3 * a.lv);
      assert.ok(a.planes.every(p => p.x >= 0 && p.x < 512 && p.y >= 0 && p.y < 512 && p.z >= 8 && p.z <= 68 && p.fuel >= 0 && p.fuel <= 100));
    }
    assert.deepEqual(a, b); assert.ok(game.isRoundOver(a)); assert.equal(tick(a), a);
    const gap = tick(sky(id), undefined, { elapsedMs: 60000 }); assert.ok(Math.abs(gap.planes[0].x - 102.4) < 1e-8);
  });
  test(`${id}: solo rivals, public scene and full phone envelopes for 1/2/8/16 seats`, () => {
    for (const n of [1, 2, 8, 16]) {
      const s = start(id, n), tv = game.projectForTv(s);
      assert.equal(s.planes.filter(p => p.ai).length, n === 1 && m !== 0 ? 3 : 0);
      assert.equal(game.scores(s).length, n); assert.equal(game.projectForPhone(s, 'bot1'), null);
      if (n === 1 && m !== 0) assert.notEqual(advance(s, 20).planes[1].x, s.planes[1].x);
      assert.equal(tv.solo, +(n === 1)); assert.equal(tv.crowns.length, m === 2 ? 1 + +(n >= 10) : 0);
      keys(tv, 'mode seed elapsedMs lv w h solo storms suns balloons crowns planes events');
      for (const [items, fields] of [[tv.planes, 'id look ai x y z a pitch bank roll loop spd fuel combo suns boost wobble crown score'],
        [tv.storms, 'id x y z'], [tv.suns, 'id x y z gold'], [tv.crowns, 'id x y z holder'], [tv.balloons, 'id x y z r pts col']]) {
        for (const item of items) keys(item, fields);
      }
      for (const seat of seats(n)) {
        const p = s.planes.find(plane => plane.id === seat.id);
        Object.assign(p, { score: 1500, fuel: 100, z: 68, popped: 12, combo: 5, bank: -1, rollCd: 700, loopMs: 50, boosting: true });
        const state = game.projectForPhone(s, seat.id); const { t, ...rest } = state;
        assert.deepEqual(rest, { m, s: 1500, f: 100, z: 100, c: [5, 12, 0][m], k: 1, rl: 1, lp: 1, r: -10 });
        assert.ok(Number.isInteger(t) && Math.abs(t) <= 180);
        const packet = { type: 'snapshot', view: { phase: 'playing', round: 99, ms: 74950, notice: null,
          gameId: game.id, self: { ...seat, ready: true }, waiting: false, state, place: null } };
        assert.ok(Buffer.byteLength(JSON.stringify(packet)) <= 320);
      }
    }
  });
}
