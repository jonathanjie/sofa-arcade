import { hashSeed, random, distance, clamp } from '../whiteout-drift/city.mjs';

export { random, distance, clamp };
export const TAU = 2 * Math.PI;
export const recharge = (plane, amount) => { plane.boostCharge = clamp(plane.boostCharge + amount, 0, 100); };

// Try a bounded number of sites. In a crowded sky, use the best clearance found.
export function openSite(s, obstacles, clearance) {
  let best, bestGap = -Infinity;
  for (let i = 0; i < 24; i++) {
    const site = { x: 110 + random(s) * (s.w - 220), y: 110 + random(s) * (s.h - 220) };
    const gap = Math.min(...obstacles.map(o => distance(site, o) - (o.r ?? 14)));
    if (gap >= clearance) return site;
    if (gap > bestGap) { best = site; bestGap = gap; }
  }
  return best;
}

export function createWorld(players, seed) {
  const s = { w: 1600, h: 960, rng: hashSeed(seed), serial: 0, elapsedMs: 0, events: [],
    thermals: [], clouds: [], rings: [], balloons: [], crowns: [], darts: [], planes: [],
    roster: players.map(({ id }) => ({ id, score: 0 })) };
  const phase = random(s) * TAU;
  const entrants = players.length === 1
    ? [
      { id: players[0].id, look: players[0].look, ai: false },
      ...[4, 8, 12].map((offset, i) => ({ id: `bot${i + 1}`, look: (players[0].look + offset) % 16, ai: true })),
    ]
    : players.map(({ id, look }) => ({ id, look, ai: false }));
  s.planes = entrants.map(({ id, look, ai }, i) => {
    const angle = phase + i * TAU / entrants.length;
    return { id, look, ai, x: s.w / 2 + 520 * Math.cos(angle), y: s.h / 2 + 330 * Math.sin(angle),
      a: angle + Math.PI, bank: 0, spd: 250, boostCharge: 100, boosting: false, fireCd: 0,
      wobbleMs: 0, liftMs: 0, stealCd: 0, thermal: null, storm: null, score: 0, crown: false,
      streak: 0, popped: 0, control: { x: 0, y: 0, b: 0, f: 0 } };
  });
  for (let i = 0; i < 7; i++) {
    const site = openSite(s, [...s.planes, ...s.thermals, ...s.clouds], 100);
    const zone = { id: ++s.serial, ...site, r: 78 + 17 * random(s) };
    if (i < 3) s.thermals.push(zone);
    else s.clouds.push({ ...zone, gust: +(i >= 5) });
  }
  return s;
}

export function emit(s, kind, at, by, target) {
  s.events.push({ id: ++s.serial, at: s.elapsedMs, kind, x: Math.round(at.x), y: Math.round(at.y), by, target });
}
