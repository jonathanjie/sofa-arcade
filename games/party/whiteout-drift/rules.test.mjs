import assert from 'node:assert/strict';
import test from 'node:test';
import { PARTY_LIMITS } from '../../../server/realtime/party/protocol.mjs';
import { PARTY_TICK_MS } from '../../../server/realtime/party/round.mjs';
import { whiteoutDrift as game } from './rules.mjs';

const players = n => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, look: i, name: '🚗'.repeat(12) }));
const start = (mode, n = 2, round = 1) => game.createRound(players(n), 'snow', round, { mode });
const tick = (s, inputs = [], options) => game.step(s, inputs, PARTY_TICK_MS, options);
const input = (id, x, y, d = 0) => ({ playerId: id, input: { kind: 'drive', x, y, d } });
const car = (s, id) => s.cars.find(c => c.id === id);
const event = (s, kind) => s.events.find(e => e.kind === kind);
const repeat = (s, n) => { for (let i = 0; i < n; i++) s = tick(s); return s; };

// Put two cars on an unobstructed horizontal road with an impact on the next tick.
function ram(s, attacker, victim) {
  Object.assign(attacker, { x: 193, y: 42, a: 0, vx: 160, vy: 0, spinMs: 0 });
  Object.assign(victim, { x: 220, y: 42, vx: 0, vy: 0, grace: 0 });
  return tick(s, [input(attacker.id, 1, 0)]);
}

test('accepts only finite, bounded, exact drive and dispatch messages', () => {
  for (const message of [input('p1', 0.6, 0.8, 1).input, { kind: 'dispatch', x: -1, y: 0 }]) {
    assert.deepEqual(game.normalizeInput(message), message);
  }
  assert.equal(Object.is(game.normalizeInput(input('p1', -0, 0).input).x, -0), false);
  for (const value of [null, [], {}, { kind: 'drive', x: 0, y: 1 }, input('', 1, 1).input,
    input('', 0, NaN).input, input('', 0, Infinity).input, input('', 1.0000001, 0).input,
    input('', '0', 1).input, input('', 1, 0, true).input, { ...input('', 1, 0).input, z: 1 },
    { kind: 'dispatch', x: 0.09, y: 0 }, { kind: 'dispatch', x: 1, y: 0, d: 1 }]) {
    assert.equal(game.normalizeInput(value), null);
  }
  assert.equal(start('unknown').mode, 'getaway');
});

for (const { id } of game.modes) test(`${id}: fixed-seed replay, no input-state mutation`, () => {
  const run = () => {
    let s = start(id, 16);
    const first = s, original = structuredClone(s);
    for (let i = 0; i < 240; i++) s = tick(s, [input('p2', Math.cos(i / 70), Math.sin(i / 70), +(i % 60 < 35))]);
    assert.deepEqual(first, original);
    assert.ok(s.events.every(e => s.elapsedMs - e.at <= 350)); assert.ok(s.events.length <= 32);
    return s;
  };
  assert.deepEqual(run(), run());
});

test('street trap: smasher immunity, rival spin, one award per patch', () => {
  let s = start('getaway');
  const h = s.hydrants[0];
  for (const c of s.cars.slice(0, 2)) Object.assign(c, { x: h.x, y: h.y });
  s = tick(s);
  assert.equal(s.hydrants[0].cd, 14000); assert.equal(s.ice[0].ms, 9500);
  assert.equal(car(s, 'p1').spinMs, 0); assert.equal(car(s, 'p1').score, 90);
  assert.equal(car(s, 'p2').spinMs, 1350);
  assert.equal(event(s, 'ice-spin').target, 'p2'); assert.ok(event(s, 'hydrant'));
  s = repeat(s, 14); assert.equal(car(s, 'p1').spinMs, 0);
  Object.assign(car(s, 'p1'), { x: s.ice[0].x, y: s.ice[0].y });
  s = tick(s); assert.equal(car(s, 'p1').spinMs, 1350);
  assert.equal(s.ice.length, 1);
});

test('busted driver dispatches a ping; AI takes the bait and cannot be ping-spammed', () => {
  let s = start('getaway');
  car(s, 'p1').hp = 1; s = ram(s, car(s, 'ai1'), car(s, 'p1'));
  assert.equal(car(s, 'p1').role, 2); assert.ok(event(s, 'bust'));
  Object.assign(car(s, 'ai2'), { x: 350, y: 42 }); Object.assign(car(s, 'p2'), { x: 330, y: 42 });
  const msg = { playerId: 'p1', input: { kind: 'dispatch', x: 1, y: 0 } };
  const baseline = tick(s); s = tick(s, [msg, msg]);
  assert.ok(car(baseline, 'ai2').stickX < 0); assert.ok(car(s, 'ai2').stickX > 0);
  assert.equal(s.pings.length, 1); assert.equal(game.projectForPhone(s, 'p1').c, 40);
});

test('heist: checkpoints move, teams rotate and winner outranks higher personal score', () => {
  let s = start('cops-and-robbers');
  assert.equal(car(start('cops-and-robbers', 2, 2), 'p2').role, 1);
  const cp = s.checkpoint; Object.assign(car(s, 'p2'), { x: cp.x, y: cp.y });
  s = tick(s); assert.notDeepEqual(s.checkpoint, cp); assert.equal(s.team.robbers, 1);
  assert.equal(car(s, 'p2').score, 120);
  assert.equal(tick(s, [], { elapsedMs: 75000 }).team.winner, 'robbers');
  car(s, 'p2').hp = 1; car(s, 'p2').score = 999;
  s = ram(s, car(s, 'p1'), car(s, 'p2'));
  assert.equal(s.team.cops, 1); assert.equal(s.team.winner, 'cops');
  assert.equal(car(s, 'p1').score, 170); assert.equal(game.scores(s)[0].playerId, 'p1');
});

test('freeze tag converts the last driver and ends the round', () => {
  let s = start('freeze-tag'); assert.equal(car(s, 'p2').hp, 2);
  s = ram(s, car(s, 'p1'), car(s, 'p2')); assert.equal(car(s, 'p2').hp, 1);
  s = ram(s, car(s, 'p1'), car(s, 'p2'));
  assert.ok(game.isRoundOver(s)); assert.equal(car(s, 'p2').spinMs, 400);
  assert.equal(car(s, 'p2').role, 1); assert.equal(car(s, 'p1').score, 120);
});

test('crown pickup, protected possession, steal, drop and timed respawn', () => {
  let s = start('drift-king'); Object.assign(car(s, 'p1'), { x: s.crown.x, y: s.crown.y });
  s = tick(s); assert.equal(s.crown.holder, 'p1');
  s = ram(s, car(s, 'p2'), car(s, 'p1')); assert.equal(s.crown.holder, 'p1');
  s.elapsedMs = s.stealAt; s = ram(s, car(s, 'p2'), car(s, 'p1')); assert.equal(s.crown.holder, 'p2');
  Object.assign(car(s, 'p1'), { x: 800, y: 42 }); car(s, 'p2').hp = 1;
  s = ram(s, car(s, 'ai1'), car(s, 'p2')); assert.equal(s.crown.holder, null);
  const before = car(s, 'p2').score; s = repeat(s, 49); assert.equal(car(s, 'p2').role, 2);
  s = tick(s); assert.equal(car(s, 'p2').role, 0); assert.equal(car(s, 'p2').hp, 3); assert.equal(car(s, 'p2').score, before);
});

test('departed holder drops crown and keeps earned score in the roster', () => {
  let s = start('drift-king'); Object.assign(car(s, 'p1'), { x: s.crown.x, y: s.crown.y });
  s = tick(s); const { x, y } = car(s, 'p1');
  s = tick(s, [], { departures: [{ playerId: 'p1', reason: 'left' }] });
  assert.deepEqual(s.crown, { x, y, holder: null }); assert.equal(game.projectForPhone(s, 'p1'), null);
  assert.ok(!game.projectForTv(s).cars.some(c => c.id === 'p1'));
  assert.deepEqual(game.scores(s)[0], { playerId: 'p1', score: 50 });
});

test('drift charge readies on release, style needs speed; cop ram is edge-triggered', () => {
  let s = start('cops-and-robbers');
  Object.assign(car(s, 'p2'), { x: 200, y: 42, a: 0 });
  s = repeat(tick(s, [input('p2', 1, 0, 1)]), 9); assert.equal(game.projectForPhone(s, 'p2').b, 10);
  s = tick(s, [input('p2', 1, 0), input('p1', 0, 0, 1)]);
  assert.equal(car(s, 'p2').boostMs, 450); assert.equal(car(s, 'p2').score, 15);
  assert.equal(car(s, 'p1').cd, 2800); assert.equal(car(s, 'p1').boostMs, 400);
  assert.ok(event(s, 'boost'));
});

for (const n of [2, 8, 16]) test(`${n} seats: clear spawn positions and full phone packet byte cap`, () => {
  for (const { id } of game.modes) {
    const s = start(id, n);
    for (const [i, c] of s.cars.entries()) {
      assert.ok(s.cars.slice(0, i).every(b => Math.hypot(c.x - b.x, c.y - b.y) >= 22));
      if (c.ai) continue;
      c.score = 99999; c.cd = 4000; c.spinMs = 1350; c.boostCharge = 1000;
      const state = game.projectForPhone(s, c.id);
      assert.deepEqual(Object.keys(state), ['m', 'r', 'h', 's', 'c', 'i', 'b']);
      for (const name of ['W'.repeat(12), '🚗'.repeat(12)]) {
        const packet = { type: 'snapshot', view: { phase: 'playing', round: 1, ms: 75000, notice: null, gameId: game.id,
          self: { id: c.id, name, look: c.look, ready: true }, waiting: false, state, place: null } };
        assert.ok(Buffer.byteLength(JSON.stringify(packet)) <= PARTY_LIMITS.phoneSnapshotBytes);
      }
    }
  }
});

test('patrol escalation and last-survivor grace use the host clock', () => {
  let s = start('getaway', 16);
  assert.equal(s.police, 4);
  s = tick(s, [], { elapsedMs: 25000 }); assert.equal(s.police, 5);
  s = tick(s, [], { elapsedMs: 50000 }); assert.equal(s.police, 6);
  const departures = players(16).slice(1).map(({ id }) => ({ playerId: id }));
  s = tick(s, [], { departures });
  // Keep the final runway clear while the timer elapses.
  for (const c of s.cars.filter(c => c.ai)) c.spinMs = 4000;
  s = repeat(s, 59); assert.equal(game.isRoundOver(s), false);
  const prior = car(s, 'p1').score;
  s = tick(s); assert.ok(game.isRoundOver(s)); assert.ok(car(s, 'p1').score >= prior + 200);
});

test('slow sustained police pressure against the city boundary causes a bust', () => {
  let s = start('cops-and-robbers');
  Object.assign(car(s, 'p1'), { x: 33, y: 42, a: Math.PI });
  Object.assign(car(s, 'p2'), { x: 11, y: 42 });
  s = tick(s, [input('p1', -1, 0)]);
  assert.equal(car(s, 'p2').pinMs, 50);
  s = repeat(s, 19); assert.equal(car(s, 'p2').role, 2); assert.equal(s.team.winner, 'cops');
});


test('car-soccer splits Gold vs Blue, kicks the ball, scores goals, resets kickoff, and keeps phone snapshots bounded', () => {
  const roster = Array.from({ length: 16 }, (_, i) => ({ id: `p${i}`, look: i, name: '⚽'.repeat(12) }));
  let s = game.createRound(roster, 'soccer-seed', 1, { mode: 'car-soccer' });
  assert.equal(s.mode, 'car-soccer');
  assert.equal(s.blocks.length, 0);
  assert.equal(s.cars.filter(c => c.side === 'gold').length, 8);
  assert.equal(s.cars.filter(c => c.side === 'blue').length, 8);
  assert.ok(s.ball && s.ball.x === s.w / 2 && s.ball.y === s.h / 2);

  // Position a Gold striker right behind the ball and drive east into the Blue net.
  s.cars[0].x = s.ball.x - 30;
  s.cars[0].y = s.ball.y;
  s.cars[0].a = 0;
  s.cars[0].boostMs = 400;
  for (let i = 1; i < s.cars.length; i++) { s.cars[i].x = 40; s.cars[i].y = 40 + i * 25; }
  for (let step = 0; step < 80 && s.team.gold === 0; step++) {
    s = game.step(s, [{ playerId: 'p0', input: { kind: 'drive', x: 1, y: 0, d: 0 } }], 50);
  }
  assert.equal(s.team.gold, 1);
  assert.ok(s.kickoffMs > 0);
  assert.equal(s.ball.x, s.w / 2);

  for (const p of roster) {
    const view = game.projectForPhone(s, p.id);
    assert.equal(view.m, 4);
    assert.ok(view.r === 0 || view.r === 4);
    const envelope = { type: 'snapshot', view: { phase: 'playing', round: 1, ms: 50000, notice: null,
      gameId: game.id, self: { ...p, ready: true }, waiting: false, state: view, place: null } };
    assert.ok(Buffer.byteLength(JSON.stringify(envelope)) <= 320);
  }

  s = game.step(s, [], 50, { elapsedMs: game.durationMs });
  assert.equal(game.isRoundOver(s), true);
  assert.equal(s.team.winner, 'gold');
});
