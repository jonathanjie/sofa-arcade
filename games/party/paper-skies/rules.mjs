import { bearing, clamp, createWorld, target } from './world.mjs';
import { finishTricks, fly, inputPlane } from './physics.mjs';
import { collect, drift, modes, populate } from './modes.mjs';

const durationMs = 75_000;
const fields = ['kind', 'x', 'y', 'b', 'r', 'l'];
function normalizeInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Reflect.ownKeys(input).length !== fields.length ||
      !fields.every(key => Object.hasOwn(input, key))) return null;
  const { kind, x, y, b, r, l } = input;
  if (kind !== 'fly' || !Number.isFinite(x) || !Number.isFinite(y) ||
      (b !== 0 && b !== 1) || (r !== 0 && r !== 1) || (l !== 0 && l !== 1)) return null;
  return { kind, x: clamp(x, -1, 1) || 0, y: clamp(y, -1, 1) || 0, b: b || 0, r: r || 0, l: l || 0 };
}
function createRound(players, seed, gameRound = 1, match = {}) {
  const mode = modes.find(m => m.id === match?.mode)?.id ?? modes[0].id;
  const s = createWorld(players, `${seed}:${gameRound}`, mode);
  populate(s);
  return s;
}
function removeSeat(s, playerId) {
  const p = s.planes.find(plane => plane.id === playerId);
  if (!p) return;
  s.roster = s.roster.map(seat => seat.id === p.id ? { ...seat, score: p.score } : seat);
  s.planes = s.planes.filter(plane => plane !== p);
  for (const c of s.crowns) if (c.holder === p.id) Object.assign(c, { holder: null, x: p.x, y: p.y, z: p.z, protectedUntil: 0 });
}
const copyObjects = items => items.map(item => ({ ...item }));
function step(state, inputs = [], dt = 50, options = {}) {
  if (state.elapsedMs >= durationMs) return state;
  const now = Math.min(durationMs, options.elapsedMs ?? state.elapsedMs + dt);
  const clockDelta = now - state.elapsedMs;
  const flightMs = Math.min(dt, clockDelta);
  const s = { ...state, elapsedMs: now, events: state.events.filter(e => now - e.at <= 350),
    lv: Math.min(3, 1 + Math.floor(now / 25000)),
    planes: state.planes.map(p => ({ ...p, stormPass: { ...p.stormPass } })),
    storms: copyObjects(state.storms), crowns: copyObjects(state.crowns),
    balloons: copyObjects(state.balloons), suns: [...state.suns] };
  for (const { playerId } of options.departures ?? []) removeSeat(s, playerId);
  for (const { playerId, input } of inputs) {
    const p = s.planes.find(plane => plane.id === playerId);
    if (p && !p.ai) inputPlane(p, input);
  }
  drift(s, flightMs / 1000);
  for (const p of s.planes) fly(s, p, flightMs);
  collect(s, flightMs);
  for (const p of s.planes) finishTricks(s, p, flightMs);
  s.events = s.events.slice(-24);
  return s;
}
const r1 = n => Math.round(n * 10) / 10;
const r2 = n => Math.round(n * 100) / 100;
const position = o => ({ id: o.id, x: r1(o.x), y: r1(o.y), z: r1(o.z) });
function projectForTv(s) {
  return { mode: s.mode, seed: s.terrainSeed, elapsedMs: s.elapsedMs, lv: s.lv, w: s.w, h: s.h, solo: +(s.roster.length === 1),
    storms: s.storms.map(position), suns: s.suns.map(o => ({ ...position(o), gold: +o.gold })),
    balloons: s.balloons.map(o => ({ ...position(o), r: o.r, pts: o.pts, col: o.col })),
    crowns: s.crowns.map(o => ({ ...position(o), holder: o.holder })),
    planes: s.planes.map(p => ({ ...position(p), look: p.look, ai: +p.ai, a: r2(p.a), pitch: r2(p.pitch), bank: r2(p.bank),
      roll: r2(p.rollPhase), loop: r2(p.loopPhase), spd: r1(p.spd), fuel: Math.round(p.fuel), combo: p.combo, suns: p.suns,
      boost: +p.boosting, wobble: +(p.wobbleMs > 0), crown: +p.crown, score: Math.round(p.score) })), events: s.events.slice(-24) };
}
function projectForPhone(s, id) {
  const p = s.planes.find(plane => !plane.ai && plane.id === id);
  if (!p) return null;
  const nearest = target(s, p);
  const view = { m: modes.findIndex(m => m.id === s.mode), s: Math.round(p.score), f: Math.round(p.fuel),
    z: Math.round((p.z - 8) / 60 * 100), c: s.mode === 'ring-rally' ? p.combo : s.mode === 'balloon-pop' ? p.popped : +p.crown,
    k: +p.boosting, rl: +(p.rollMs > 0 || p.rollCd > 0), lp: +(p.loopMs > 0 || p.loopCd > 0), r: Math.round(p.bank * 10) };
  if (nearest) view.t = Math.round(bearing(p, nearest) * 180 / Math.PI);
  return view;
}
function scores(s) {
  return s.roster.map(seat => ({ playerId: seat.id, score: Math.round(s.planes.find(p => p.id === seat.id)?.score ?? seat.score) }))
    .sort((a, b) => b.score - a.score);
}
export const paperSkies = Object.freeze({ id: 'paper-skies', minPlayers: 1, maxPlayers: 16, durationMs, modes,
  defaultMode: modes[0].id, createRound, normalizeInput, step, projectForTv, projectForPhone, scores,
  isRoundOver: s => s.elapsedMs >= durationMs });
