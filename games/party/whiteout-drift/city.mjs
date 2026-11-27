export function hashSeed(seed) {
  let hash = 2166136261;
  for (const ch of String(seed)) hash = Math.imul(hash ^ ch.codePointAt(0), 16777619);
  return hash >>> 0;
}

// Mulberry32 keeps its single word in the round so a cloned tick replays exactly.
export function random(state) {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let word = Math.imul(state.rng ^ state.rng >>> 15, state.rng | 1);
  word ^= word + Math.imul(word ^ word >>> 7, word | 61);
  return ((word ^ word >>> 14) >>> 0) / 4294967296;
}

export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const clamp = (v, low, high) => Math.max(low, Math.min(high, v));

export function createCity(count, seed) {
  const large = count > 8;
  const w = large ? 1120 : 960, h = large ? 630 : 540;
  const columns = large ? 4 : 3;
  const state = { w, h, rng: hashSeed(seed), blocks: [], lamps: [], cones: [], hydrants: [], streets: [], spawns: [] };
  const xs = Array.from({ length: columns + 1 }, (_, i) => 42 + i * (w - 84) / columns);
  const ys = [42, h / 2, h - 42];
  for (const y of ys) {
    for (const [i, x] of xs.entries()) {
      state.streets.push({ x, y });
      if (i < columns) {
        for (const fraction of [0.22, 0.5, 0.78]) state.spawns.push({ x: x + fraction * (xs[i + 1] - x), y });
      }
    }
  }
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < columns; col++) {
      const x = xs[col] + 44, y = ys[row] + 44;
      const width = xs[col + 1] - 44 - x, height = ys[row + 1] - 44 - y;
      state.blocks.push([x, y, width, height, Math.floor(random(state) * 65536)]);
      state.lamps.push([x - 4, y], [x + width + 4, y + height]);
      for (const [dx, dy] of [[0, -15], [width + 15, height], [-14, height]]) {
        state.cones.push({ id: state.cones.length + 1, x: x + dx, y: y + dy, hit: false });
      }
      for (const side of [0, 1]) {
        if (state.hydrants.length >= 12) break;
        state.hydrants.push({ id: state.hydrants.length + 1, x: x + width * (0.3 + random(state) * 0.4),
          y: side ? y + height + 12 : y - 12, side: side ? 1 : -1, cd: 0 });
      }
    }
  }
  for (let i = state.spawns.length - 1; i > 0; i--) {
    const j = Math.floor(random(state) * (i + 1));
    [state.spawns[i], state.spawns[j]] = [state.spawns[j], state.spawns[i]];
  }
  return state;
}

export function createArena(count, seed) {
  const large = count > 8;
  const w = large ? 1120 : 960, h = large ? 630 : 540;
  const state = {
    w, h, rng: hashSeed(seed), blocks: [], lamps: [], cones: [], hydrants: [], streets: [], spawns: [],
    goal: { top: Math.round(h * 0.30), bottom: Math.round(h * 0.70) },
  };
  for (const frac of [0.18, 0.4, 0.6, 0.82]) {
    state.lamps.push([Math.round(w * frac), 8], [Math.round(w * frac), h - 8]);
  }
  for (const [x, y] of [[28, 28], [w - 28, 28], [28, h - 28], [w - 28, h - 28]]) {
    state.cones.push({ id: state.cones.length + 1, x, y, hit: false });
  }
  for (const frac of [0.28, 0.72]) {
    state.hydrants.push(
      { id: state.hydrants.length + 1, x: Math.round(w * frac), y: 18, side: 1, cd: 0 },
      { id: state.hydrants.length + 1, x: Math.round(w * frac), y: h - 18, side: -1, cd: 0 },
    );
  }
  return state;
}

// Segment/slab test against buildings expanded by a car radius. If the target
// is hidden, use a visible intersection on a shortest grid route toward it.
function clearRoad(state, a, b) {
  return !state.blocks.some(([x, y, w, h]) => {
    let enter = 0, exit = 1;
    for (const [p, d, lo, hi] of [[a.x, b.x - a.x, x - 11, x + w + 11], [a.y, b.y - a.y, y - 11, y + h + 11]]) {
      if (!d) { if (p <= lo || p >= hi) return false; continue; }
      const t = (lo - p) / d, u = (hi - p) / d;
      enter = Math.max(enter, Math.min(t, u));
      exit = Math.min(exit, Math.max(t, u));
      if (enter >= exit) return false;
    }
    return true;
  });
}

export function pursuitWaypoint(state, car, target) {
  if (clearRoad(state, car, target)) return target;
  const exits = state.streets.filter(p => clearRoad(state, p, target));
  let best = target, cost = Infinity;
  for (const p of state.streets) {
    const approach = distance(car, p);
    if (approach < 18 || !clearRoad(state, car, p)) continue;
    for (const q of exits) {
      const length = approach + Math.abs(p.x - q.x) + Math.abs(p.y - q.y) + distance(q, target);
      if (length < cost) { cost = length; best = p; }
    }
  }
  return best;
}
