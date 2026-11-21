import { EVENT_KINDS, FRUIT_IDS, PHASES, RULES, SAFE_INPUT, STAGES } from './catalog.mjs';
import { getLevel } from './geometry.mjs';

const own = (object, key) => Object.hasOwn(object, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
const number = (value, min = -Number.MAX_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const string = (value, max = 256) => typeof value === 'string' && value.length > 0 && value.length <= max;
const input = value => object(value) && number(value.x, -1, 1) && number(value.y, -1, 1) && Math.hypot(value.x, value.y) <= 1.0002 && typeof value.brake === 'boolean';
const forbiddenKey = /^(seed|rng|rngState|queue|spawnQueue|futureSupply|checkpoint|storage|socket|sockets|diagnostics|rawSensor|rawSensorReadings|credentials|token|bearer|privateKey|secret|password)$/i;

/** Smooth and continuous force ownership, clamped outside the bridge's x extent. */
export function bridgeWeights(level, x) {
  const amount = Math.max(0, Math.min(1, (x - level.bridge.x) / level.bridge.width));
  const lydia = amount * amount * (3 - 2 * amount);
  return { jon: 1 - lydia, lydia };
}

/** Public diagnostic/display calculation shared by authoritative physics. */
export function forceAt(position, { level, controls, gust = null }) {
  const weights = bridgeWeights(level, position.x);
  const jon = controls?.jon ?? SAFE_INPUT;
  const lydia = controls?.lydia ?? SAFE_INPUT;
  const tuning = RULES.tuning;
  const brakeWeight = weights.jon * Number(jon.brake) + weights.lydia * Number(lydia.brake);
  const gustWeight = 1 - (1 - tuning.brakeGustScale) * brakeWeight;
  return {
    x: tuning.acceleration * (weights.jon * (jon.brake ? 0 : jon.x) + weights.lydia * (lydia.brake ? 0 : lydia.x)) + (gust?.x ?? 0) * tuning.gustAcceleration * gustWeight,
    y: tuning.acceleration * (weights.jon * (jon.brake ? 0 : jon.y) + weights.lydia * (lydia.brake ? 0 : lydia.y)) + (gust?.y ?? 0) * tuning.gustAcceleration * gustWeight,
    damping: tuning.damping + (tuning.brakeDamping - tuning.damping) * brakeWeight,
    brakeWeight,
    weights,
  };
}

/** Validate, never repair or mutate a received cooperative public snapshot. */
function inspectPublicView(view) {
  const errors = [];
  const check = (condition, path) => { if (!condition && errors.length < 32) errors.push(path); };
  if (!object(view)) return { valid: false, errors: ['view must be an object'] };
  let nodes = 0;
  const seen = new WeakSet();
  function safe(value, path, depth = 0) {
    if (++nodes > 8192 || depth > 10) { check(false, `${path}: excessive structure`); return; }
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'number') { check(number(value), `${path}: nonfinite/unbounded number`); return; }
    if (typeof value === 'string') { check(value.length <= 512, `${path}: oversized string`); return; }
    if (typeof value !== 'object' || seen.has(value)) { check(false, `${path}: not JSON data`); return; }
    seen.add(value);
    if (Array.isArray(value)) check(value.length <= 256, `${path}: oversized array`);
    else {
      check([Object.prototype, null].includes(Object.getPrototypeOf(value)), `${path}: not a plain object`);
      check(Object.keys(value).length <= 64, `${path}: oversized object`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (Array.isArray(value) && key === 'length') continue;
      const descriptor = descriptors[key];
      if (typeof key !== 'string' || !descriptor.enumerable || !own(descriptor, 'value')) {
        check(false, `${path}: accessor/symbol/nonenumerable field`);
        continue;
      }
      check(!forbiddenKey.test(key), `${path}.${key}: authority/private field`);
      safe(descriptor.value, `${path}.${key}`, depth + 1);
    }
    seen.delete(value);
  }
  safe(view, 'view');
  // Never read fields from an accessor-bearing, cyclic or non-JSON object.
  if (errors.length) return { valid: false, errors };
  check(view.gameId === 'gravity-orchard', 'gameId');
  check(view.schemaVersion === 1, 'schemaVersion');
  check(string(view.matchId, 128), 'matchId');
  check(integer(view.runEpoch), 'runEpoch');
  check(integer(view.tick), 'tick');
  check(PHASES.includes(view.phase), 'phase');
  check(['campaign', 'practice'].includes(view.mode), 'mode');
  check(integer(view.stageIndex, 0, 2), 'stageIndex');
  check(STAGES[view.stageIndex]?.id === view.levelId, 'levelId');
  check(view.mode === 'practice' ? view.timeRemainingTicks === null : integer(view.timeRemainingTicks, 0, RULES.stageDurationTicks), 'timeRemainingTicks');
  check(integer(view.countdownTicks, 0, RULES.countdownTicks), 'countdownTicks');
  check(object(view.ready) && typeof view.ready.jon === 'boolean' && typeof view.ready.lydia === 'boolean', 'ready');
  check([null, 'requested', 'help', 'recenter', 'network', 'host-stall', 'recovery'].includes(view.pauseReason), 'pauseReason');
  check(Array.isArray(view.fruits) && view.fruits.length <= RULES.maxActiveFruit, 'fruits');
  const fruitIds = new Set();
  for (const fruit of Array.isArray(view.fruits) ? view.fruits : []) {
    if (!object(fruit)) { check(false, 'fruits[]'); continue; }
    check(string(fruit.id) && !fruitIds.has(fruit.id), 'fruit.id');
    fruitIds.add(fruit.id);
    check(FRUIT_IDS.includes(fruit.type), 'fruit.type');
    check(number(fruit.x, 0, 1280) && number(fruit.y, 0, 720), 'fruit.position');
    check(number(fruit.vx, -RULES.tuning.speedCap, RULES.tuning.speedCap) && number(fruit.vy, -RULES.tuning.speedCap, RULES.tuning.speedCap) && Math.hypot(fruit.vx, fruit.vy) <= RULES.tuning.speedCap + 0.0002, 'fruit.velocity');
    check(number(fruit.radius, 1, 64), 'fruit.radius');
  }
  check(object(view.baskets), 'baskets');
  for (const type of FRUIT_IDS) {
    const basket = view.baskets?.[type];
    check(object(basket) && basket.capacity === RULES.basketCapacity && integer(basket.count, 0, RULES.basketCapacity), `baskets.${type}`);
  }
  check(object(view.orders), 'orders');
  const recipes = view.orders?.recipes;
  check(Array.isArray(recipes) && recipes.length === RULES.recipesPerStage, 'orders.recipes');
  const recipeIds = new Set();
  for (const recipe of Array.isArray(recipes) ? recipes : []) {
    if (!object(recipe)) { check(false, 'orders.recipes[]'); continue; }
    check(string(recipe.id) && !recipeIds.has(recipe.id), 'recipe.id');
    recipeIds.add(recipe.id);
    check(object(recipe.needs), 'recipe.needs');
    for (const type of FRUIT_IDS) check(integer(recipe.needs?.[type], 0, 3), `recipe.needs.${type}`);
    check(FRUIT_IDS.reduce((sum, type) => sum + (recipe.needs?.[type] ?? 0), 0) === 3, 'recipe.needs.total');
    if (own(recipe, 'recipeType')) check(string(recipe.recipeType, 64), 'recipe.recipeType');
  }
  check(integer(view.orders?.activeIndex, 0, RULES.recipesPerStage), 'orders.activeIndex');
  const completed = view.orders?.completedIds;
  check(Array.isArray(completed) && completed.length === view.orders?.activeIndex && new Set(completed).size === completed.length, 'orders.completedIds');
  if (Array.isArray(completed)) completed.forEach((id, index) => check(id === recipes?.[index]?.id, 'orders.completedIds.sequence'));
  const level = STAGES[view.stageIndex]?.id === view.levelId ? getLevel(view.levelId) : null;
  check(Array.isArray(view.gateStates) && view.gateStates.length === (level?.gates.length ?? -1), 'gateStates');
  const gateIds = new Set();
  for (const gate of Array.isArray(view.gateStates) ? view.gateStates : []) {
    if (!object(gate)) { check(false, 'gateStates[]'); continue; }
    const source = level?.gates.find(item => item.id === gate.id);
    check(Boolean(source) && !gateIds.has(gate.id), 'gate.id');
    gateIds.add(gate.id);
    check(['open', 'forecast', 'closed'].includes(gate.state), 'gate.state');
    check(integer(gate.ticksToChange, 0, source?.schedule.periodTicks ?? 0), 'gate.ticksToChange');
    check(typeof gate.closureDeferred === 'boolean', 'gate.closureDeferred');
    if (gate.closureDeferred) check(gate.state === 'forecast' && gate.ticksToChange === 0, 'gate.deferred');
  }
  if (view.gust !== null) {
    const gust = view.gust;
    check(object(gust) && string(gust.id) && ['forecast', 'active'].includes(gust.phase), 'gust');
    check(integer(gust?.x, -1, 1) && integer(gust?.y, -1, 1) && Math.abs(gust?.x) + Math.abs(gust?.y) === 1, 'gust.direction');
    check(integer(gust?.ticksRemaining, 0, gust?.phase === 'forecast' ? 180 : 90), 'gust.ticksRemaining');
    check(view.mode !== 'practice', 'gust.practice');
  }
  check(object(view.players) && input(view.players.jon?.input) && input(view.players.lydia?.input), 'players');
  check(Array.isArray(view.results) && view.results.length <= STAGES.length, 'results');
  let priorStage = -1;
  for (const result of Array.isArray(view.results) ? view.results : []) {
    if (!object(result)) { check(false, 'results[]'); continue; }
    check(integer(result.stageIndex, 0, 2) && result.stageIndex > priorStage, 'result.stageIndex');
    priorStage = result.stageIndex;
    check(integer(result.ordersCompleted, 0, 4) && integer(result.composted, 0, 24) && integer(result.stars, 0, 3), 'result.counts');
    check(integer(result.elapsedTicks, 0, view.mode === 'practice' ? Number.MAX_SAFE_INTEGER : RULES.stageDurationTicks), 'result.elapsedTicks');
  }
  check(Array.isArray(view.events) && view.events.length <= RULES.eventLimit, 'events');
  const eventIds = new Set();
  let priorTick = -1;
  for (const event of Array.isArray(view.events) ? view.events : []) {
    if (!object(event)) { check(false, 'events[]'); continue; }
    check(string(event.id) && !eventIds.has(event.id), 'event.id');
    eventIds.add(event.id);
    check(EVENT_KINDS.includes(event.kind), 'event.kind');
    check(integer(event.tick, 0, view.tick) && event.tick >= priorTick, 'event.tick');
    priorTick = event.tick;
    if (own(event, 'entityId')) check(string(event.entityId), 'event.entityId');
    if (own(event, 'playerId')) check(['jon', 'lydia'].includes(event.playerId), 'event.playerId');
    if (own(event, 'x')) check(number(event.x, 0, 1280), 'event.x');
    if (own(event, 'y')) check(number(event.y, 0, 720), 'event.y');
    if (own(event, 'data')) check(object(event.data) && Object.keys(event.data).length <= 16, 'event.data');
  }
  return { valid: errors.length === 0, errors };
}

export function validatePublicView(view) {
  try { return inspectPublicView(view); }
  catch { return { valid: false, errors: ['view: invalid JSON object'] }; }
}

export function isPublicView(view) { return validatePublicView(view).valid; }
export function assertPublicView(view) {
  const result = validatePublicView(view);
  if (!result.valid) throw new TypeError(`Invalid Gravity Orchard public view: ${result.errors.join(', ')}`);
  return view;
}

/** Active order plus at most the next two; returned objects are detached copies. */
export function recipePreview(view, count = 2) {
  const previewCount = Math.max(0, Math.min(2, Number.isInteger(count) ? count : 2));
  return view.orders.recipes.slice(view.orders.activeIndex, view.orders.activeIndex + 1 + previewCount)
    .map(recipe => ({ ...recipe, needs: { ...recipe.needs } }));
}

export function summarizeResults(view) {
  const ordersCompleted = view.results.reduce((sum, result) => sum + result.ordersCompleted, 0);
  const stars = view.results.reduce((sum, result) => sum + result.stars, 0);
  const composted = view.results.reduce((sum, result) => sum + result.composted, 0);
  return {
    ordersCompleted, ordersTotal: 12, stars, starsTotal: 9, composted,
    perfectPicnic: view.mode === 'campaign' && view.phase === 'finished' && view.results.length === 3 && ordersCompleted === 12 && composted === 0,
    practice: view.mode === 'practice',
  };
}

export function secondsRemaining(view) {
  return view.timeRemainingTicks === null ? null : Math.ceil(view.timeRemainingTicks / RULES.tickRate);
}
