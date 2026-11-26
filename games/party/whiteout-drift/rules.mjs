import { createCity } from './city.mjs';
import { collide, driver, iceContacts, move, steer, streetContacts } from './physics.mjs';
import { contact, dispatch, dropCrown, DURATION, finishPins, modes, setup, updateModes } from './modes.mjs';

function createRound(players, seed, gameRound = 1, match = {}) {
  const mode = modes.find(m => m.id === match?.mode)?.id ?? 'getaway';
  const state = { ...createCity(players.length, seed), mode, elapsedMs: 0, serial: 0, police: 0, roster: [], cars: [],
    events: [], ice: [], pings: [], checkpoint: null, crown: null, team: null, lastAt: null, stealAt: 0, over: false };
  setup(state, players, gameRound);
  return state;
}

function normalizeInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const { kind, x, y, d } = input;
  const keys = kind === 'drive' ? ['kind', 'x', 'y', 'd'] : ['kind', 'x', 'y'];
  if (Object.keys(input).length !== keys.length || !keys.every(k => Object.hasOwn(input, k)) ||
      !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1 || Math.abs(y) > 1) return null;
  const magnitude = Math.hypot(x, y);
  if (magnitude > 1.000001) return null;
  if (kind === 'drive' && (d === 0 || d === 1)) return { kind, x: x || 0, y: y || 0, d };
  if (kind === 'dispatch' && magnitude >= 0.1) return { kind, x: x || 0, y: y || 0 };
  return null;
}

function advance(state, dt, now) {
  const age = obj => ({ ...obj, ms: Math.max(0, obj.ms - dt) });
  return { ...state, elapsedMs: now,
    cars: state.cars.map(c => ({ ...c, cd: Math.max(0, c.cd - dt), grace: Math.max(0, c.grace - dt),
      boostMs: Math.max(0, c.boostMs - dt), spinMs: Math.max(0, c.spinMs - dt) })),
    events: state.events.filter(e => now - e.at <= 350),
    pings: state.pings.map(age).filter(p => p.ms),
    ice: state.ice.map(p => ({ ...age(p), struck: [...p.struck] })).filter(p => p.ms),
    cones: state.cones.map(c => ({ ...c })), hydrants: state.hydrants.map(h => ({ ...h, cd: Math.max(0, h.cd - dt) })),
    crown: state.crown && { ...state.crown }, team: state.team && { ...state.team } };
}

function step(state, inputs, dt = 50, { departures = [], elapsedMs = state.elapsedMs + dt } = {}) {
  if (state.over) return state;
  const now = Math.min(DURATION, elapsedMs);
  const s = advance(state, now - state.elapsedMs, now);
  for (const { playerId } of departures) {
    const car = s.cars.find(c => c.id === playerId && !c.ai);
    if (!car) continue;
    dropCrown(s, car);
    s.roster = s.roster.map(p => p.id === car.id ? { ...p, score: car.score } : p);
    s.cars = s.cars.filter(c => c !== car); s.pings = s.pings.filter(p => p.by !== playerId);
  }
  for (const { playerId, input } of inputs) {
    const c = s.cars.find(v => v.id === playerId && !v.ai);
    if (!c) continue;
    if (input.kind === 'drive' && c.role !== 2) steer(s, c, input);
    if (input.kind === 'dispatch') dispatch(s, c, input);
  }
  const active = s.cars.filter(c => c.role !== 2);
  for (const c of active) { move(s, c, dt); streetContacts(s, c); }
  const pins = new Map();
  for (const [i, a] of active.entries()) {
    iceContacts(s, a);
    for (let j = 0; j < i; j++) {
      const b = active[j];
      if (a.role === 2 || b.role === 2) continue;
      const speeds = collide(s, a, b);
      if (!speeds) continue;
      contact(s, a, b, speeds[0], pins); contact(s, b, a, speeds[1], pins);
    }
  }
  finishPins(s, pins, dt); updateModes(s, state.elapsedMs);
  s.events = s.events.slice(-32);
  return s;
}

const r1 = n => Math.round(n * 10) / 10, r2 = n => Math.round(n * 100) / 100;
function projectForTv(s) {
  return { mode: s.mode, elapsedMs: s.elapsedMs, w: s.w, h: s.h, blocks: s.blocks, lamps: s.lamps,
    cones: s.cones.map(c => [c.id, r1(c.x), r1(c.y), +c.hit]),
    hydrants: s.hydrants.map(h => ({ id: h.id, x: r1(h.x), y: r1(h.y), cd: Math.round(h.cd) })),
    ice: s.ice.map(p => ({ id: p.id, x: r1(p.x), y: r1(p.y), r: r1(p.r), seed: p.seed, ms: Math.round(p.ms) })),
    cars: s.cars.map(c => ({ id: c.id, ai: +c.ai, look: c.ai ? -1 : c.look, x: r1(c.x), y: r1(c.y), a: r2(c.a),
      spd: r1(Math.hypot(c.vx, c.vy)), role: c.role, hp: c.hp, drift: +c.drift, spin: +(c.spinMs > 0),
      boost: +(c.boostMs > 0), pin: Math.min(10, Math.round(c.pinMs / 100)), score: Math.round(c.score) })),
    checkpoint: s.checkpoint && { x: r1(s.checkpoint.x), y: r1(s.checkpoint.y), r: r1(s.checkpoint.r) },
    crown: s.crown && { x: r1(s.crown.x), y: r1(s.crown.y), holder: s.crown.holder },
    pings: s.pings.map(p => ({ x: r1(p.x), y: r1(p.y), ms: Math.round(p.ms) })), team: s.team, events: s.events };
}

function projectForPhone(s, id) {
  const c = s.cars.find(v => !v.ai && v.id === id);
  return c ? { m: modes.findIndex(m => m.id === s.mode), r: c.role, h: c.hp, s: Math.round(c.score),
    c: Math.ceil(c.cd / 100), i: Math.ceil(c.spinMs / 100), b: Math.min(10, Math.floor(c.boostCharge / 50)) } : null;
}

function scores(s) {
  const entries = s.roster.map(p => {
    const car = s.cars.find(c => c.id === p.id);
    return { playerId: p.id, score: Math.round(car?.score ?? p.score),
      winner: s.team?.winner === p.side || (s.over && s.mode === 'freeze-tag' && car && (driver(car) || car.id === s.lastDriver)) };
  });
  const bonus = 1 + Math.max(0, ...entries.filter(e => !e.winner).map(e => e.score));
  return entries.map(({ playerId, score, winner }) => ({ playerId, score: score + (winner ? bonus : 0) }))
    .sort((a, b) => b.score - a.score);
}

export const whiteoutDrift = Object.freeze({ id: 'whiteout-drift', minPlayers: 2, maxPlayers: 16, durationMs: DURATION,
  defaultMode: 'getaway', modes, createRound, normalizeInput, step, projectForPhone, projectForTv, scores,
  isRoundOver: s => s.over });
