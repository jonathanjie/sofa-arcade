import { hashSeed, random, clamp } from '../whiteout-drift/city.mjs';
import { buildTerrain, sampleHeight, WORLD_SIZE, wrapDelta } from './terrain.mjs';

export { random, clamp };
export const TAU = 2 * Math.PI;
export const distance = (a, b) => Math.hypot(wrapDelta(a.x, b.x), wrapDelta(a.y, b.y), a.z - b.z);
export const bearing = (a, b) => {
  const angle = Math.atan2(wrapDelta(a.y, b.y), wrapDelta(a.x, b.x)) - a.a;
  return Math.atan2(Math.sin(angle), Math.cos(angle));
};
export function target(s, p) {
  const items = s.mode === 'ring-rally' ? s.suns : s.mode === 'balloon-pop' ? s.balloons : s.crowns;
  let nearest = null, best = Infinity;
  for (const item of items) {
    if (item.holder === p.id) continue;
    const d = distance(p, item);
    if (d < best) { nearest = item; best = d; }
  }
  return nearest;
}
export function site(s) {
  const x = random(s) * s.w, y = random(s) * s.h;
  return { x, y, z: Math.max(sampleHeight(s.terrain, x, y) + 6, 14 + random(s) * 38) };
}
export function emit(s, kind, at, by, targetId, text) {
  s.events.push({ id: ++s.serial, at: s.elapsedMs, kind, x: Math.round(at.x), y: Math.round(at.y),
    z: Math.round(at.z), by, target: targetId, text });
}
export function createWorld(players, seed, mode) {
  const terrainSeed = hashSeed(seed);
  const s = { mode, w: WORLD_SIZE, h: WORLD_SIZE, terrainSeed, terrain: buildTerrain(terrainSeed), rng: terrainSeed,
    serial: 0, lv: 1, elapsedMs: 0, events: [], storms: [], suns: [], balloons: [], crowns: [], planes: [],
    roster: players.map(({ id }) => ({ id, score: 0 })) };
  const entrants = [...players];
  if (players.length === 1 && mode !== 'ring-rally') {
    for (let i = 1; i <= 3; i++) entrants.push({ id: `bot${i}`, look: (players[0].look + 4 * i) % 16, ai: true });
  }
  const phase = random(s) * TAU;
  s.planes = entrants.map(({ id, look, ai = false }, i) => {
    const angle = phase + i * TAU / entrants.length;
    return { id, look, ai, x: 256 + 150 * Math.cos(angle), y: 256 + 150 * Math.sin(angle), z: 38, a: angle + Math.PI,
      pitch: 0, bank: 0, spd: 38, fuel: 100, boosting: false, rollMs: 0, rollCd: 0, rollPhase: 0, rollAngle: 0,
      loopMs: 0, loopCd: 0, loopPhase: 0, loopSun: false, stallMs: 0, wobbleMs: 0, skimMs: 0, stormPass: {},
      score: 0, tricks: 0, crown: false, combo: 1, lastSun: 0, suns: 0, popped: 0, control: { x: 0, y: 0, b: 0, r: 0, l: 0 } };
  });
  return s;
}
