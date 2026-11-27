import { createWorld } from './world.mjs';
import { advanceDarts, fly, separate } from './physics.mjs';
import { collect, drift, modes, populate } from './modes.mjs';

const durationMs = 75_000;
const fields = ['kind', 'x', 'y', 'b', 'f'];
function normalizeInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Reflect.ownKeys(input).length !== fields.length ||
      !fields.every(key => Object.hasOwn(input, key))) return null;
  const { kind, x, y, b, f } = input;
  if (kind !== 'fly' || !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1 || Math.abs(y) > 1 ||
      (b !== 0 && b !== 1) || (f !== 0 && f !== 1)) return null;
  return { kind, x: x || 0, y: y || 0, b: b || 0, f: f || 0 };
}
function createRound(players, seed, gameRound = 1, match = {}) {
  const s = createWorld(players, `${seed}:${gameRound}`);
  s.mode = modes.find(m => m.id === match?.mode)?.id ?? modes[0].id;
  populate(s);
  return s;
}
function removeSeat(s, playerId) {
  const p = s.planes.find(plane => plane.id === playerId);
  if (!p) return;
  s.roster = s.roster.map(seat => seat.id === p.id ? { ...seat, score: p.score } : seat);
  s.planes = s.planes.filter(plane => plane !== p);
  s.darts = s.darts.filter(d => d.by !== p.id);
  for (const c of s.crowns) if (c.holder === p.id) Object.assign(c, { holder: null, x: p.x, y: p.y });
}
const copyObjects = items => items.map(item => ({ ...item }));
function step(state, inputs = [], dt = 50, options = {}) {
  if (state.elapsedMs >= durationMs) return state;
  const now = Math.min(durationMs, options.elapsedMs ?? state.elapsedMs + dt);
  const clockDelta = now - state.elapsedMs;
  const flightMs = Math.min(dt, clockDelta);
  const s = { ...state, elapsedMs: now, events: state.events.filter(e => now - e.at <= 350),
    planes: copyObjects(state.planes), darts: copyObjects(state.darts), crowns: copyObjects(state.crowns),
    balloons: copyObjects(state.balloons), rings: [...state.rings] };
  for (const { playerId } of options.departures ?? []) removeSeat(s, playerId);
  for (const { playerId, input } of inputs) {
    const p = s.planes.find(plane => plane.id === playerId);
    if (p) p.control = { ...input };
  }
  for (const p of s.planes) fly(s, p, flightMs, clockDelta);
  drift(s, flightMs / 1000);
  advanceDarts(s, flightMs);
  separate(s);
  collect(s);
  s.events = s.events.slice(-24);
  return s;
}
const r1 = n => Math.round(n * 10) / 10;
const r2 = n => Math.round(n * 100) / 100;
const position = o => ({ id: o.id, x: r1(o.x), y: r1(o.y) });
const circle = o => ({ ...position(o), r: r1(o.r) });
function projectForTv(s) {
  return { mode: s.mode, elapsedMs: s.elapsedMs, w: s.w, h: s.h,
    thermals: s.thermals.map(circle), clouds: s.clouds.map(c => ({ ...circle(c), gust: +c.gust })),
    rings: s.rings.map(r => ({ ...circle(r), a: r2(r.a), gold: +r.gold })),
    balloons: s.balloons.map(b => ({ ...circle(b), pts: b.pts, col: b.col })),
    crowns: s.crowns.map(c => ({ ...position(c), holder: c.holder })),
    darts: s.darts.map(d => ({ ...position(d), a: r2(d.a), look: d.look })),
    planes: s.planes.map(p => ({ ...position(p), look: p.look, a: r2(p.a), bank: r2(p.bank), spd: r1(p.spd),
      boost: +p.boosting, wobble: +(p.wobbleMs > 0), crown: +p.crown, score: Math.round(p.score) })), events: s.events.slice(-24) };
}
function projectForPhone(s, id) {
  const p = s.planes.find(plane => plane.id === id);
  if (!p) return null;
  return { m: modes.findIndex(m => m.id === s.mode), s: Math.round(p.score), b: Math.min(10, Math.floor(p.boostCharge / 10)),
    f: Math.ceil(p.fireCd / 100), c: s.mode === 'sky-tag' ? +p.crown : s.mode === 'ring-rally' ? Math.min(9, p.streak) : Math.min(99, p.popped),
    w: Math.ceil(p.wobbleMs / 100), k: +p.boosting };
}
function scores(s) {
  return s.roster.map(seat => ({ playerId: seat.id, score: Math.round(s.planes.find(p => p.id === seat.id)?.score ?? seat.score) }))
    .sort((a, b) => b.score - a.score);
}
export const paperSkies = Object.freeze({ id: 'paper-skies', minPlayers: 2, maxPlayers: 16, durationMs, modes,
  defaultMode: modes[0].id, createRound, normalizeInput, step, projectForTv, projectForPhone, scores,
  isRoundOver: s => s.elapsedMs >= durationMs });
