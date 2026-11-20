/** Bounded, browser-only projection reader. Never imports an authority module. */
export const FRUIT_TYPES = Object.freeze(['apple', 'plum', 'pear', 'starfruit']);
export const STAGES = Object.freeze([
  { id: 'morning-delivery', name: 'Morning Delivery' },
  { id: 'switchback-grove', name: 'Switchback Grove' },
  { id: 'moonlight-picnic', name: "Lala’s Moonlight Picnic" },
]);
const PHASES = ['waiting', 'countdown', 'playing', 'paused', 'interlude', 'finished'];
const PAUSES = [null, 'requested', 'help', 'recenter', 'network', 'host-stall', 'recovery'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value, min = -1e6, max = 1e6) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 256;
const flag = value => typeof value === 'boolean';
const list = (value, max, test) => Array.isArray(value) && value.length <= max && value.every(test);
const unique = values => new Set(values).size === values.length;

function publicData(value, depth = 0) {
  if (value === null || flag(value)) return value;
  if (typeof value === 'string') return value.slice(0, 256);
  if (finite(value)) return value;
  if (depth >= 2) return undefined;
  if (Array.isArray(value)) return value.slice(0, 16).map(item => publicData(item, depth + 1)).filter(item => item !== undefined);
  if (!record(value)) return undefined;
  return Object.fromEntries(Object.entries(value).slice(0, 16).filter(([key]) => !['__proto__', 'prototype', 'constructor'].includes(key)).map(([key, item]) => [key.slice(0, 64), publicData(item, depth + 1)]).filter(([, item]) => item !== undefined));
}

/** Return an owned copy of exactly the public fields, or null; never repair a score. */
export function readPublicView(raw) {
  try {
    if (!record(raw) || raw.gameId !== 'gravity-orchard' || raw.schemaVersion !== 1 || !text(raw.matchId) || !integer(raw.runEpoch) || !integer(raw.tick)) return null;
    if (!PHASES.includes(raw.phase) || !['campaign', 'practice'].includes(raw.mode) || !integer(raw.stageIndex, 0, 2) || raw.levelId !== STAGES[raw.stageIndex].id) return null;
    if (!(raw.timeRemainingTicks === null || integer(raw.timeRemainingTicks, 0, 5400)) || !integer(raw.countdownTicks, 0, 180) || !PAUSES.includes(raw.pauseReason)) return null;
    if (!record(raw.ready) || !flag(raw.ready.jon) || !flag(raw.ready.lydia)) return null;
    if (!list(raw.fruits, 8, fruit => record(fruit) && text(fruit.id) && FRUIT_TYPES.includes(fruit.type) && ['x', 'y', 'vx', 'vy'].every(key => finite(fruit[key])) && finite(fruit.radius, 0.01, 640)) || !unique(raw.fruits.map(fruit => fruit.id))) return null;
    if (!record(raw.baskets) || !FRUIT_TYPES.every(type => record(raw.baskets[type]) && raw.baskets[type].capacity === 3 && integer(raw.baskets[type].count, 0, 3))) return null;
    if (!record(raw.orders) || !list(raw.orders.recipes, 4, recipe => record(recipe) && text(recipe.id) && record(recipe.needs) && FRUIT_TYPES.every(type => integer(recipe.needs[type], 0, 3)) && FRUIT_TYPES.reduce((sum, type) => sum + recipe.needs[type], 0) === 3) || raw.orders.recipes.length !== 4) return null;
    if (!unique(raw.orders.recipes.map(recipe => recipe.id)) || !integer(raw.orders.activeIndex, 0, raw.orders.recipes.length) || !list(raw.orders.completedIds, 4, text) || !unique(raw.orders.completedIds) || !raw.orders.completedIds.every(id => raw.orders.recipes.some(recipe => recipe.id === id))) return null;
    if (!list(raw.gateStates, 32, gate => record(gate) && text(gate.id) && ['open', 'forecast', 'closed'].includes(gate.state) && integer(gate.ticksToChange, 0, 1e6) && flag(gate.closureDeferred))) return null;
    if (raw.gust !== null && !(record(raw.gust) && text(raw.gust.id) && ['forecast', 'active'].includes(raw.gust.phase) && finite(raw.gust.x, -1, 1) && finite(raw.gust.y, -1, 1) && integer(raw.gust.ticksRemaining, 0, 5400))) return null;
    if (!record(raw.players) || !['jon', 'lydia'].every(id => record(raw.players[id]) && record(raw.players[id].input) && finite(raw.players[id].input.x, -1, 1) && finite(raw.players[id].input.y, -1, 1) && flag(raw.players[id].input.brake))) return null;
    if (!list(raw.results, 3, result => record(result) && integer(result.stageIndex, 0, 2) && integer(result.ordersCompleted, 0, 4) && integer(result.composted, 0, 24) && integer(result.stars, 0, 3) && integer(result.elapsedTicks))) return null;
    if (!unique(raw.results.map(result => result.stageIndex))) return null;
    if (!list(raw.events, 64, event => record(event) && text(event.id) && text(event.kind) && integer(event.tick, 0, raw.tick) && (event.entityId === undefined || text(event.entityId)) && (event.playerId === undefined || ['jon', 'lydia'].includes(event.playerId)) && (event.x === undefined || finite(event.x)) && (event.y === undefined || finite(event.y)))) return null;
    return {
      gameId: raw.gameId, schemaVersion: 1, matchId: raw.matchId, runEpoch: raw.runEpoch, tick: raw.tick,
      phase: raw.phase, mode: raw.mode, stageIndex: raw.stageIndex, levelId: raw.levelId,
      timeRemainingTicks: raw.timeRemainingTicks, countdownTicks: raw.countdownTicks,
      ready: { jon: raw.ready.jon, lydia: raw.ready.lydia }, pauseReason: raw.pauseReason,
      fruits: raw.fruits.map(({ id, type, x, y, vx, vy, radius }) => ({ id, type, x, y, vx, vy, radius })),
      baskets: Object.fromEntries(FRUIT_TYPES.map(type => [type, { count: raw.baskets[type].count, capacity: 3 }])),
      orders: { recipes: raw.orders.recipes.map(recipe => ({ id: recipe.id, needs: Object.fromEntries(FRUIT_TYPES.map(type => [type, recipe.needs[type]])) })), activeIndex: raw.orders.activeIndex, completedIds: [...raw.orders.completedIds] },
      gateStates: raw.gateStates.map(({ id, state, ticksToChange, closureDeferred }) => ({ id, state, ticksToChange, closureDeferred })),
      gust: raw.gust && { id: raw.gust.id, phase: raw.gust.phase, x: raw.gust.x, y: raw.gust.y, ticksRemaining: raw.gust.ticksRemaining },
      players: Object.fromEntries(['jon', 'lydia'].map(id => [id, { input: { x: raw.players[id].input.x, y: raw.players[id].input.y, brake: raw.players[id].input.brake } }])),
      results: raw.results.map(({ stageIndex, ordersCompleted, composted, stars, elapsedTicks }) => ({ stageIndex, ordersCompleted, composted, stars, elapsedTicks })),
      events: raw.events.map(({ id, kind, tick, entityId, playerId, x, y, data }) => ({ id, kind, tick, ...(entityId === undefined ? {} : { entityId }), ...(playerId === undefined ? {} : { playerId }), ...(x === undefined ? {} : { x }), ...(y === undefined ? {} : { y }), ...(data === undefined ? {} : { data: publicData(data) }) })),
    };
  } catch { return null; }
}

export function summarizeResults(view) {
  const totals = view.results.reduce((sum, stage) => ({ orders: sum.orders + stage.ordersCompleted, stars: sum.stars + stage.stars, composted: sum.composted + stage.composted }), { orders: 0, stars: 0, composted: 0 });
  return { ...totals, perfect: view.mode === 'campaign' && view.results.length === 3 && totals.orders === 12 && totals.composted === 0 };
}

export function clockLabel(view) {
  if (view.timeRemainingTicks === null) return 'Untimed';
  const seconds = Math.ceil(view.timeRemainingTicks / 60);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
