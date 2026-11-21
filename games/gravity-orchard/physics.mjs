/**
 * Deterministic authority-side circle/terrain physics. This module is deliberately
 * outside the production browser closure: public.mjs owns only the force math.
 *
 * A tick has three fixed substeps, each with at most four contact passes. With a
 * 14-unit fruit and the 220-unit/s cap, motion per substep is at most 1.2223 units,
 * so a fruit cannot jump through even a zero-thickness terrain segment. There
 * are no fruit/fruit contacts and no variable delta, wall clock or random input.
 */
import { RULES } from './catalog.mjs';
import { forceAt } from './public.mjs';

export { forceAt };

const T = RULES.tuning;
const ROUNDING = RULES.rounding;
// Derived from the public quantization rather than an independent hidden tune.
const CONTACT_SLOP = 2 / ROUNDING;
const EPSILON = 1e-10;
const compareId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const round = (x) => Math.round(x * ROUNDING) / ROUNDING || 0;

function rectRight(rect) { return rect.x + rect.width; }
function rectBottom(rect) { return rect.y + rect.height; }

/** Inclusive contact: useful for safe gate closure as well as debug overlays. */
export function overlapCircleRect(circle, rect) {
  const dx = circle.x - clamp(circle.x, rect.x, rectRight(rect));
  const dy = circle.y - clamp(circle.y, rect.y, rectBottom(rect));
  return dx * dx + dy * dy <= circle.radius * circle.radius;
}

/** Inclusive contact; neither argument is modified. */
export function overlapCircleCircle(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const radius = a.radius + b.radius;
  return dx * dx + dy * dy <= radius * radius;
}

function pointInRect(point, rect) {
  return point.x >= rect.x && point.x <= rectRight(rect) &&
    point.y >= rect.y && point.y <= rectBottom(rect);
}

function floorRects(level) {
  const bounds = level.bounds;
  return [...level.trays.map((tray) => ({ id: `tray:${tray.id}`, ...tray.bounds })),
    { id: 'bridge', ...level.bridge }].map((rect) => {
    const x = Math.max(bounds.x, rect.x);
    const y = Math.max(bounds.y, rect.y);
    return { id: rect.id, x, y,
      width: Math.max(0, Math.min(rectRight(bounds), rectRight(rect)) - x),
      height: Math.max(0, Math.min(rectBottom(bounds), rectBottom(rect)) - y) };
  }).filter((rect) => rect.width > 0 && rect.height > 0).sort(compareId);
}

/**
 * Build the exterior of the rectangle UNION, so overlapping tray/bridge edges
 * never introduce invisible internal walls. The coordinate grid is bounded by
 * the three authored floor rectangles, not by the size of the world in pixels.
 */
function boundarySegments(rects) {
  const xs = [...new Set(rects.flatMap((r) => [r.x, rectRight(r)]))].sort((a, b) => a - b);
  const ys = [...new Set(rects.flatMap((r) => [r.y, rectBottom(r)]))].sort((a, b) => a - b);
  const cells = ys.slice(0, -1).map((y, yi) => xs.slice(0, -1).map((x, xi) =>
    rects.some((r) => pointInRect({ x: (x + xs[xi + 1]) / 2, y: (y + ys[yi + 1]) / 2 }, r))));
  const groups = new Map();
  const add = (axis, coordinate, normal, from, to) => {
    const key = `${axis}:${coordinate}:${normal}`;
    if (!groups.has(key)) groups.set(key, { axis, coordinate, normal, ranges: [] });
    groups.get(key).ranges.push([from, to]);
  };
  for (let yi = 0; yi < cells.length; yi += 1) {
    for (let xi = 0; xi < (cells[yi]?.length ?? 0); xi += 1) {
      if (!cells[yi][xi]) continue;
      if (!cells[yi]?.[xi - 1]) add('v', xs[xi], 1, ys[yi], ys[yi + 1]);
      if (!cells[yi]?.[xi + 1]) add('v', xs[xi + 1], -1, ys[yi], ys[yi + 1]);
      if (!cells[yi - 1]?.[xi]) add('h', ys[yi], 1, xs[xi], xs[xi + 1]);
      if (!cells[yi + 1]?.[xi]) add('h', ys[yi + 1], -1, xs[xi], xs[xi + 1]);
    }
  }
  const segments = [];
  for (const { axis, coordinate, normal, ranges } of groups.values()) {
    ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const merged = [];
    for (const range of ranges) {
      const last = merged.at(-1);
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
      else merged.push([...range]);
    }
    for (const [from, to] of merged) {
      segments.push({
        id: `boundary:${axis}:${coordinate}:${normal}:${from}:${to}`, kind: 'segment',
        x1: axis === 'v' ? coordinate : from,
        y1: axis === 'v' ? from : coordinate,
        x2: axis === 'v' ? coordinate : to,
        y2: axis === 'v' ? to : coordinate,
        nx: axis === 'v' ? normal : 0,
        ny: axis === 'h' ? normal : 0,
      });
    }
  }
  return segments.sort(compareId);
}

/** Diagnostic geometry, not a runtime browser export. Returned records are new. */
export function terrainColliders(level, closedGateIds = []) {
  const closed = new Set(closedGateIds);
  return [
    ...boundarySegments(floorRects(level)),
    ...level.bumpers.map((bumper) => ({ ...bumper })),
    ...level.gates.filter((gate) => closed.has(gate.id)).map((gate) => ({
      id: gate.id, kind: 'rect', x: gate.x, y: gate.y, width: gate.width, height: gate.height,
    })),
  ].sort(compareId);
}

/** Authoritative checkpoint/fixture placement check; accepts exact tangency. */
export function isPlacementClear(fruit, { level, closedGateIds = [] }) {
  if (![fruit.x, fruit.y, fruit.radius].every(Number.isFinite) || fruit.radius <= 0) return false;
  return isClear(fruit, floorRects(level), terrainColliders(level, closedGateIds), { checks: 0 });
}

function circleContact(fruit, collider) {
  const dx = fruit.x - collider.x;
  const dy = fruit.y - collider.y;
  const sum = fruit.radius + collider.radius;
  const distanceSq = dx * dx + dy * dy;
  if (distanceSq >= sum * sum) return null;
  if (distanceSq <= EPSILON * EPSILON) {
    // A centre-on-centre test fixture has no preferred normal. Fix +x, rather
    // than introducing a random direction or depending on iteration history.
    return { nx: 1, ny: 0, depth: sum, x: collider.x + collider.radius, y: collider.y };
  }
  const distance = Math.sqrt(distanceSq);
  const nx = dx / distance;
  const ny = dy / distance;
  return { nx, ny, depth: sum - distance,
    x: collider.x + nx * collider.radius, y: collider.y + ny * collider.radius };
}

function rectContact(fruit, collider) {
  const x = clamp(fruit.x, collider.x, rectRight(collider));
  const y = clamp(fruit.y, collider.y, rectBottom(collider));
  const dx = fruit.x - x;
  const dy = fruit.y - y;
  const distanceSq = dx * dx + dy * dy;
  if (distanceSq >= fruit.radius * fruit.radius) return null;
  if (distanceSq > EPSILON * EPSILON) {
    const distance = Math.sqrt(distanceSq);
    return { nx: dx / distance, ny: dy / distance, depth: fruit.radius - distance, x, y };
  }
  // Deep overlap is possible only in private fixtures/corrupt authoring, never
  // from a legal closed gate or capped substep. Nearest face, then fixed order.
  const faces = [
    { nx: -1, ny: 0, depth: fruit.radius + fruit.x - collider.x, x: collider.x, y: fruit.y },
    { nx: 1, ny: 0, depth: fruit.radius + rectRight(collider) - fruit.x, x: rectRight(collider), y: fruit.y },
    { nx: 0, ny: -1, depth: fruit.radius + fruit.y - collider.y, x: fruit.x, y: collider.y },
    { nx: 0, ny: 1, depth: fruit.radius + rectBottom(collider) - fruit.y, x: fruit.x, y: rectBottom(collider) },
  ];
  let nearest = faces[0];
  for (const face of faces.slice(1)) if (face.depth < nearest.depth) nearest = face;
  return nearest;
}

function segmentContact(fruit, collider) {
  const dx = collider.x2 - collider.x1;
  const dy = collider.y2 - collider.y1;
  const lengthSq = dx * dx + dy * dy;
  const t = clamp(((fruit.x - collider.x1) * dx + (fruit.y - collider.y1) * dy) / lengthSq, 0, 1);
  const x = collider.x1 + t * dx;
  const y = collider.y1 + t * dy;
  const ox = fruit.x - x;
  const oy = fruit.y - y;
  const distanceSq = ox * ox + oy * oy;
  if (distanceSq >= fruit.radius * fruit.radius) return null;
  if (distanceSq <= EPSILON * EPSILON) {
    return { nx: collider.nx, ny: collider.ny, depth: fruit.radius, x, y };
  }
  const distance = Math.sqrt(distanceSq);
  // At a concave corner the radial endpoint normal is required. Replacing it
  // with an axis normal creates an invisible snag at a bridge entrance.
  if (t > 0 && t < 1 && ox * collider.nx + oy * collider.ny < 0) {
    return { nx: collider.nx, ny: collider.ny, depth: fruit.radius + distance, x, y };
  }
  return { nx: ox / distance, ny: oy / distance, depth: fruit.radius - distance, x, y };
}

function contact(fruit, collider, work) {
  work.checks += 1;
  if (collider.kind === 'circle') return circleContact(fruit, collider);
  if (collider.kind === 'rect') return rectContact(fruit, collider);
  return segmentContact(fruit, collider);
}

function isClear(fruit, rects, colliders, work) {
  if (!rects.some((rect) => pointInRect(fruit, rect))) return false;
  for (const collider of colliders) if (contact(fruit, collider, work)) return false;
  return true;
}

function capVelocity(fruit) {
  const speed = Math.hypot(fruit.vx, fruit.vy);
  if (speed > T.speedCap) {
    const scale = T.speedCap / speed;
    fruit.vx *= scale;
    fruit.vy *= scale;
  }
}

/**
 * Shared deterministic bounce helper for wrong/full basket rejection. The
 * caller supplies a unit normal pointing into the allowed side. Position is
 * handled by the caller, so this does not move or capture a fruit.
 */
export function bounceVelocity(fruit, nx, ny) {
  const next = { ...fruit };
  const normalSpeed = next.vx * nx + next.vy * ny;
  if (normalSpeed < 0) {
    next.vx -= (1 + T.restitution) * normalSpeed * nx;
    next.vy -= (1 + T.restitution) * normalSpeed * ny;
  }
  capVelocity(next);
  return next;
}

function resolveContacts(fruit, colliders, hits, work) {
  for (let iteration = 0; iteration < T.collisionIterations; iteration += 1) {
    work.iterations += 1;
    let touched = false;
    for (const collider of colliders) {
      const hit = contact(fruit, collider, work);
      if (!hit) continue;
      touched = true;
      fruit.x += hit.nx * (hit.depth + CONTACT_SLOP);
      fruit.y += hit.ny * (hit.depth + CONTACT_SLOP);
      const velocity = bounceVelocity(fruit, hit.nx, hit.ny);
      fruit.vx = velocity.vx;
      fruit.vy = velocity.vy;
      if (!hits.has(collider.id)) hits.set(collider.id, { colliderId: collider.id,
        x: round(hit.x), y: round(hit.y), nx: round(hit.nx), ny: round(hit.ny) });
    }
    if (!touched) break;
  }
}

function fallbackPoint(fruit, rects, colliders, work) {
  // At most six candidates per floor rectangle. Legal simulation always has a
  // previous clear point and uses that instead; this is only bounded recovery
  // for deliberately overlapping private physics fixtures.
  const candidates = [];
  const inset = fruit.radius + CONTACT_SLOP;
  for (const rect of rects) {
    if (rect.width < 2 * inset || rect.height < 2 * inset) continue;
    const x0 = rect.x + inset; const x1 = rectRight(rect) - inset;
    const y0 = rect.y + inset; const y1 = rectBottom(rect) - inset;
    const points = [
      [clamp(fruit.x, x0, x1), clamp(fruit.y, y0, y1)],
      [(x0 + x1) / 2, (y0 + y1) / 2], [x0, y0], [x0, y1], [x1, y0], [x1, y1],
    ];
    for (let i = 0; i < points.length; i += 1) candidates.push({
      id: `${rect.id}:${i}`, x: points[i][0], y: points[i][1],
      distanceSq: (fruit.x - points[i][0]) ** 2 + (fruit.y - points[i][1]) ** 2,
    });
  }
  candidates.sort((a, b) => a.distanceSq - b.distanceSq || compareId(a, b));
  for (const candidate of candidates) {
    const next = { ...fruit, x: round(candidate.x), y: round(candidate.y), vx: 0, vy: 0 };
    if (isClear(next, rects, colliders, work)) return next;
  }
  // An impossible fixture with no free space must remain stopped on its floor,
  // rather than retain an unbounded depenetration from contradictory walls. It
  // cannot trigger a search loop or manufacture a delivery. The fallback flag
  // makes this diagnostic failure explicit; checkpoints reject such positions.
  return candidates.length ? { ...fruit, x: round(candidates[0].x), y: round(candidates[0].y), vx: 0, vy: 0 }
    : { ...fruit, vx: 0, vy: 0 };
}

function quantize(fruit) {
  fruit.x = round(fruit.x); fruit.y = round(fruit.y);
  fruit.vx = round(fruit.vx); fruit.vy = round(fruit.vy);
  // Component-wise rounding can otherwise exceed the vector cap by <1 quantum.
  const speed = Math.hypot(fruit.vx, fruit.vy);
  if (speed > T.speedCap) {
    const scale = (T.speedCap - 1 / ROUNDING) / speed;
    fruit.vx = round(fruit.vx * scale); fruit.vy = round(fruit.vy * scale);
  }
  return fruit;
}

/** Advance one authority tick. Does not mutate fruit, geometry, or controls. */
export function advanceFruit(fruit, { level, controls, closedGateIds = [], gust = null }) {
  if (![fruit.x, fruit.y, fruit.vx, fruit.vy, fruit.radius].every(Number.isFinite) || fruit.radius <= 0) {
    throw new TypeError('Physics requires a finite positive-radius fruit.');
  }
  const rects = floorRects(level);
  const colliders = terrainColliders(level, closedGateIds);
  const work = { substeps: 0, iterations: 0, checks: 0, colliderCount: colliders.length,
    // Initial/final checks + contact passes + fallback candidate checks. A
    // fallback terminates the remaining substeps, keeping this conservative.
    maxChecks: (T.substeps * (T.collisionIterations + 1) + 6 * rects.length + 3) * colliders.length };
  const hits = new Map();
  let next = { ...fruit };
  capVelocity(next);
  let lastSafe = isClear(next, rects, colliders, work) ? { ...next } : null;
  let fallback = false;
  const dt = 1 / (RULES.tickRate * T.substeps);
  for (let substep = 0; substep < T.substeps; substep += 1) {
    work.substeps += 1;
    const force = forceAt(next, { level, controls, gust });
    const drag = 1 / (1 + force.damping * dt);
    next.vx = (next.vx + force.x * dt) * drag;
    next.vy = (next.vy + force.y * dt) * drag;
    capVelocity(next);
    next.x += next.vx * dt;
    next.y += next.vy * dt;
    resolveContacts(next, colliders, hits, work);
    if (isClear(next, rects, colliders, work)) lastSafe = { ...next };
    else {
      next = lastSafe ? { ...lastSafe, vx: 0, vy: 0 } : fallbackPoint(fruit, rects, colliders, work);
      fallback = true;
      break;
    }
  }
  next = quantize(next);
  if (!isClear(next, rects, colliders, work)) {
    next = quantize(lastSafe ? { ...lastSafe, vx: 0, vy: 0 } : next);
    fallback = true;
  }
  return { fruit: next, hits: [...hits.values()], work, fallback };
}
