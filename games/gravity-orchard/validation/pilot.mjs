/**
 * Diagnostic controller, deliberately outside the production runtime closure.
 * It sees only PublicView and immutable level geometry; it cannot edit engine
 * state, inspect queued fruit, choose a spawn, teleport, or claim a catch.
 * All movement is submitted through the same normalized x/y/Brake input seam.
 */
import { getLevel } from '../geometry.mjs';
import { RULES } from '../catalog.mjs';

const SAFE = Object.freeze({ x: 0, y: 0, brake: true });
const GRID = 16;
const MARGIN = 5;
const round = value => Math.round(value * 10000) / 10000;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const contains = (p, r) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
const discRect = (p, radius, rect) => {
  const x = clamp(p.x, rect.x, rect.x + rect.width);
  const y = clamp(p.y, rect.y, rect.y + rect.height);
  return Math.hypot(p.x - x, p.y - y) < radius;
};
function unitInput(x, y, brake = false) {
  const magnitude = Math.max(1, Math.hypot(x, y));
  let nx = round(x / magnitude), ny = round(y / magnitude);
  // Rounding can put a diagonal a few ten-thousandths outside the circle.
  // Stay just inside so revalidation at the engine seam is idempotent.
  if (Math.hypot(nx, ny) > 1) { nx = round(nx / 1.0001); ny = round(ny / 1.0001); }
  return { x: nx, y: ny, brake };
}

function pointSafe(level, point, fruitType, radius, closed) {
  const regions = [...level.trays.map(tray => tray.bounds), level.bridge];
  // Sampling the circle boundary is conservative at the authored broad seams;
  // each edge/corner is independently verified against real engine collisions.
  for (let sample = 0; sample < 16; sample++) {
    const a = sample * Math.PI / 8;
    const edge = { x: point.x + Math.cos(a) * radius, y: point.y + Math.sin(a) * radius };
    if (!regions.some(region => contains(edge, region))) return false;
  }
  for (const bumper of level.bumpers) {
    if (bumper.kind === 'circle') {
      if (distance(point, bumper) < radius + bumper.radius) return false;
    } else if (discRect(point, radius, bumper)) return false;
  }
  if (level.compost.some(rect => discRect(point, radius + 4, rect))) return false;
  if (level.gates.some(gate => closed.has(gate.id) && discRect(point, radius, gate))) return false;
  if (level.baskets.some(basket => basket.fruitType !== fruitType && distance(point, basket) < radius + basket.radius + 3)) return false;
  return true;
}

function segmentSafe(level, a, b, type, radius, closed) {
  const parts = Math.max(1, Math.ceil(distance(a, b) / 6));
  for (let i = 1; i <= parts; i++) {
    if (!pointSafe(level, { x: a.x + (b.x - a.x) * i / parts, y: a.y + (b.y - a.y) * i / parts }, type, radius, closed)) return false;
  }
  return true;
}

class Heap {
  constructor() { this.values = []; }
  push(item) {
    const values = this.values;
    values.push(item);
    let n = values.length - 1;
    while (n) {
      const parent = (n - 1) >> 1;
      if (values[parent].f < item.f || (values[parent].f === item.f && values[parent].id < item.id)) break;
      values[n] = values[parent]; n = parent;
    }
    values[n] = item;
  }
  pop() {
    const first = this.values[0];
    const last = this.values.pop();
    if (this.values.length) {
      let n = 0;
      while (true) {
        const l = n * 2 + 1, r = l + 1;
        if (l >= this.values.length) break;
        const child = r < this.values.length && (this.values[r].f < this.values[l].f || (this.values[r].f === this.values[l].f && this.values[r].id < this.values[l].id)) ? r : l;
        if (this.values[child].f > last.f || (this.values[child].f === last.f && this.values[child].id >= last.id)) break;
        this.values[n] = this.values[child]; n = child;
      }
      this.values[n] = last;
    }
    return first;
  }
}

function createGrid(level, type, radius, closed) {
  const columns = Math.floor(level.bounds.width / GRID) + 1;
  const rows = Math.floor(level.bounds.height / GRID) + 1;
  const points = Array.from({ length: columns * rows }, (_, id) => ({ x: level.bounds.x + id % columns * GRID, y: level.bounds.y + Math.floor(id / columns) * GRID }));
  const safe = points.map(point => pointSafe(level, point, type, radius, closed));
  const closest = point => {
    let chosen = -1, best = Infinity;
    for (let id = 0; id < points.length; id++) {
      if (!safe[id]) continue;
      const d = distance(point, points[id]);
      if (d < best) { best = d; chosen = id; }
    }
    return chosen;
  };
  return { columns, rows, points, safe, closest };
}

export function findRoute(level, from, to, type, radius, closedGateIds = [], cache = new Map()) {
  const closed = new Set(closedGateIds);
  const clearance = radius + MARGIN;
  if (segmentSafe(level, from, to, type, clearance, closed)) return [to];
  const key = `${level.id}:${type}:${clearance}:${[...closed].join(',')}`;
  if (!cache.has(key)) cache.set(key, createGrid(level, type, clearance, closed));
  const grid = cache.get(key);
  const start = grid.closest(from), goal = grid.closest(to);
  if (start < 0 || goal < 0) return [];
  const costs = new Float64Array(grid.points.length).fill(Infinity);
  const previous = new Int32Array(grid.points.length).fill(-1);
  const open = new Heap();
  costs[start] = 0;
  open.push({ id: start, f: distance(grid.points[start], to) });
  let visits = 0;
  while (open.values.length && visits++ < grid.points.length * 3) {
    const { id } = open.pop();
    if (id === goal) {
      const path = [to];
      for (let current = goal; current >= 0 && current !== start; current = previous[current]) path.unshift(grid.points[current]);
      path.unshift(grid.points[start]);
      return path;
    }
    const x = id % grid.columns, y = Math.floor(id / grid.columns);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || x + dx < 0 || x + dx >= grid.columns || y + dy < 0 || y + dy >= grid.rows) continue;
      const next = (y + dy) * grid.columns + x + dx;
      if (!grid.safe[next]) continue;
      if (dx && dy && (!grid.safe[y * grid.columns + x + dx] || !grid.safe[(y + dy) * grid.columns + x])) continue;
      const cost = costs[id] + GRID * (dx && dy ? Math.SQRT2 : 1);
      if (cost < costs[next]) {
        costs[next] = cost; previous[next] = id;
        open.push({ id: next, f: cost + distance(grid.points[next], to) });
      }
    }
  }
  return [];
}

function remainingNeed(view, type) {
  return view.orders.recipes.slice(view.orders.activeIndex).reduce((sum, recipe) => sum + recipe.needs[type], 0) - view.baskets[type].count;
}

export function createPilot() {
  let selected = null;
  let route = [];
  let context = '';
  let routeTick = -Infinity;
  let lastProgress = null;
  let stuckTicks = 0;
  const gridCache = new Map();
  let diagnostic = { target: null, route: [], mode: 'idle' };
  return {
    reset() { selected = null; route = []; context = ''; routeTick = -Infinity; lastProgress = null; stuckTicks = 0; },
    inspect() { return structuredClone(diagnostic); },
    update(view) {
      const controls = { jon: { ...SAFE }, lydia: { ...SAFE } };
      if (view.phase !== 'playing') return controls;
      const level = getLevel(view.levelId);
      const newContext = `${view.matchId}:${view.runEpoch}:${view.stageIndex}`;
      if (context !== newContext) { selected = null; route = []; context = newContext; routeTick = -Infinity; lastProgress = null; stuckTicks = 0; }
      const basketFor = fruit => level.baskets.find(basket => basket.fruitType === fruit.type);
      let fruit = view.fruits.find(item => item.id === selected);
      if (!fruit || remainingNeed(view, fruit.type) <= 0 || view.baskets[fruit.type].count >= 3) {
        const candidates = view.fruits.filter(item => remainingNeed(view, item.type) > 0 && view.baskets[item.type].count < 3);
        // Finish a nearby useful delivery before crossing again. The target is
        // latched until captured: presentation or RNG never decides the result.
        candidates.sort((a, b) => {
          const needA = Math.max(0, (view.orders.recipes[view.orders.activeIndex]?.needs[a.type] || 0) - view.baskets[a.type].count);
          const needB = Math.max(0, (view.orders.recipes[view.orders.activeIndex]?.needs[b.type] || 0) - view.baskets[b.type].count);
          return (distance(a, basketFor(a)) - needA * 80) - (distance(b, basketFor(b)) - needB * 80) || a.id.localeCompare(b.id);
        });
        fruit = candidates[0];
        selected = fruit?.id ?? null;
        route = []; routeTick = -Infinity; lastProgress = null; stuckTicks = 0;
      }
      if (!fruit) { diagnostic = { target: null, route: [], mode: 'waiting-for-supply' }; return controls; }
      const basket = basketFor(fruit);
      const closed = view.gateStates.filter(gate => gate.state === 'closed').map(gate => gate.id);
      const closedSet = new Set(closed);
      if (lastProgress && distance(fruit, lastProgress) < 0.1) stuckTicks++; else stuckTicks = 0;
      lastProgress = { x: fruit.x, y: fruit.y };
      if (!route.length || view.tick - routeTick > 45 || stuckTicks > 10 || !segmentSafe(level, fruit, route[0], fruit.type, fruit.radius, closedSet)) {
        route = findRoute(level, fruit, basket, fruit.type, fruit.radius, closed, gridCache);
        routeTick = view.tick;
      }
      if (!route.length) { diagnostic = { target: selected, route: [], mode: 'waiting-for-gate' }; return controls; }
      while (route.length > 1 && distance(fruit, route[0]) < 22) route.shift();
      // Look across collinear grid points so the controller never follows a
      // stop/start raster staircase. Near a turn, keep a conservative speed.
      let aim = route[0], aimIndex = 0;
      for (let i = 1; i < route.length; i++) {
        if (!segmentSafe(level, fruit, route[i], fruit.type, fruit.radius + MARGIN, closedSet)) break;
        aim = route[i]; aimIndex = i;
      }
      const dx = aim.x - fruit.x, dy = aim.y - fruit.y;
      const d = Math.hypot(dx, dy);
      const final = aimIndex === route.length - 1;
      const maxSpeed = final ? 210 : 155;
      const speed = Math.min(maxSpeed, Math.sqrt(2 * 220 * Math.max(0, d - (final ? 0 : 5))));
      const desiredX = d ? dx / d * speed : 0;
      const desiredY = d ? dy / d * speed : 0;
      const tuning = RULES.tuning;
      const acceleration = tuning.acceleration;
      const damping = tuning.damping;
      const gustX = view.gust?.phase === 'active' ? view.gust.x * tuning.gustAcceleration : 0;
      const gustY = view.gust?.phase === 'active' ? view.gust.y * tuning.gustAcceleration : 0;
      const input = unitInput((5 * (desiredX - fruit.vx) + damping * fruit.vx - gustX) / acceleration,
        (5 * (desiredY - fruit.vy) + damping * fruit.vy - gustY) / acceleration);
      const bridgeMargin = 90;
      const crossing = fruit.x >= level.bridge.x - bridgeMargin && fruit.x <= level.bridge.x + level.bridge.width + bridgeMargin;
      if (crossing) { controls.jon = input; controls.lydia = { ...input }; }
      else controls[fruit.x < level.bridge.x + level.bridge.width / 2 ? 'jon' : 'lydia'] = input;
      diagnostic = { target: selected, fruitType: fruit.type, route: [aim, ...route.slice(aimIndex + 1)], mode: crossing ? 'cooperative-handoff' : 'delivery', controls };
      return controls;
    }
  };
}
