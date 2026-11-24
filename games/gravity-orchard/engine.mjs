/**
 * Gravity Orchard v0.2 authoritative simulation. No browser delivery, IO, clock
 * or random IDs. The coordinator supplies authenticated actors and fresh inputs.
 */
import { RULES, STAGES } from './catalog.mjs';
import { getLevel } from './geometry.mjs';
import { advanceFruit, overlapCircleRect, isPlacementClear } from './physics.mjs';
import { validatePublicView } from './public.mjs';
import { authorStage, TYPES, hashSeed } from './supply.mjs';

export const GAME_ID = 'gravity-orchard';
export const ENGINE_VERSION = '0.2.0';
export const CHECKPOINT_VERSION = 1;
export const PLAYER_IDS = Object.freeze(['jon', 'lydia']);
export const SAFE_INPUT = Object.freeze({ x: 0, y: 0, brake: true });
const PHASES = ['waiting', 'countdown', 'playing', 'paused', 'interlude', 'finished'];
const PAUSE_REASONS = ['requested', 'help', 'recenter', 'network', 'host-stall', 'recovery'];
const copy = value => JSON.parse(JSON.stringify(value));
const round = value => Math.round(value * RULES.rounding) / RULES.rounding || 0;
const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const emptyBuffers = () => Object.fromEntries(TYPES.map(type => [type, []]));
const neutralPlayers = () => ({ jon: { input: { ...SAFE_INPUT } }, lydia: { input: { ...SAFE_INPUT } } });
const freshDiagnostics = () => ({ hits: [], work: { substeps: 0, iterations: 0, checks: 0 }, fallbacks: 0 });

export class EngineError extends Error {
  constructor(code, message) { super(message); this.name = 'EngineError'; this.code = code; }
}
const fail = (code, message) => { throw new EngineError(code, message); };
function record(value, allowed, required = allowed) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const keys = Reflect.ownKeys(value);
  return keys.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return typeof key === 'string' && allowed.includes(key) && descriptor.enumerable && Object.hasOwn(descriptor, 'value');
  }) && required.every(key => Object.hasOwn(value, key));
}
function boundedString(value, max = 128) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && value.trim().length > 0
    && !/[\u0000-\u001f\u007f]/u.test(value);
}
function viewerValid(viewer) {
  return record(viewer, ['role', 'playerId']) &&
    (viewer.role === 'player' ? PLAYER_IDS.includes(viewer.playerId)
      : ['host', 'public'].includes(viewer.role) && viewer.playerId === null);
}
function increment(state, key) {
  if (!Number.isSafeInteger(state[key]) || state[key] < 0 || state[key] >= Number.MAX_SAFE_INTEGER) {
    fail('COUNTER_EXHAUSTED', 'A simulation identity counter is exhausted. Allocate a fresh match.');
  }
  state[key] += 1;
}
function emit(state, kind, fields = {}) {
  increment(state, 'nextEvent');
  state.events.push({ id: `${state.matchId}:e${state.nextEvent}`, kind, tick: state.tick, ...fields });
  if (state.events.length > RULES.eventLimit) state.events.splice(0, state.events.length - RULES.eventLimit);
}
function boundary(state, phase, reason = null) {
  increment(state, 'runEpoch');
  state.phase = phase;
  state.pauseReason = reason;
  state.ready = { jon: false, lydia: false };
  state.players = neutralPlayers();
  state.countdownTicks = 0;
  state.countdownTarget = null;
  state.diagnostics = freshDiagnostics();
  emit(state, 'phase-change', { data: { phase, reason } });
}

function installStage(state, stageIndex) {
  state.stageIndex = stageIndex;
  state.levelId = STAGES[stageIndex].id;
  state.elapsedTicks = 0;
  state.resumePhase = null;
  const authored = authorStage({ seed: state.seed, matchId: state.matchId, stageIndex, attempt: state.attempts[stageIndex] });
  state.supply = { entries: authored.entries, nextIndex: 0, nextSpawnTick: 0 };
  state.gustRotation = authored.gustRotation;
  state.fruits = [];
  state.buffers = emptyBuffers();
  state.consumed = [];
  state.composted = [];
  state.remainingAtEnd = { active: [], buffered: [] };
  state.orders = { recipes: authored.recipes, activeIndex: 0, completedIds: [] };
  state.gateStates = getLevel(state.levelId).gates.map(gate => ({
    id: gate.id, state: 'open', ticksToChange: gate.schedule.openTicks, closureDeferred: false,
  }));
  state.gust = null;
}

export function createRun(args) {
  if (!record(args, ['seed', 'matchId', 'options'], ['seed', 'matchId'])
      || !boundedString(args.seed) || !boundedString(args.matchId)) fail('INVALID_RUN', 'Bounded non-empty seed and matchId strings are required.');
  const options = args.options === undefined ? { mode: 'campaign' } : args.options;
  if (!record(options, ['mode']) || !['campaign', 'practice'].includes(options.mode)) fail('INVALID_OPTIONS', 'Choose campaign or practice mode.');
  const state = {
    gameId: GAME_ID, schemaVersion: 1, engineVersion: ENGINE_VERSION,
    seed: args.seed, matchId: args.matchId, mode: options.mode,
    runEpoch: 0, tick: 0, phase: 'waiting', stageIndex: 0,
    countdownTicks: 0, countdownTarget: null, resumePhase: null,
    ready: { jon: false, lydia: false }, pauseReason: null,
    players: neutralPlayers(), attempts: [0, 0, 0], results: [], stageArchives: [],
    nextEvent: 0, events: [], diagnostics: freshDiagnostics(),
  };
  installStage(state, 0);
  emit(state, 'phase-change', { data: { phase: 'waiting', reason: null } });
  return state;
}

export function normalizeInput(raw) {
  if (!record(raw, ['x', 'y', 'brake']) || typeof raw.brake !== 'boolean'
      || ![raw.x, raw.y].every(value => typeof value === 'number' && Number.isFinite(value) && value >= -1 && value <= 1)) return null;
  const magnitude = Math.hypot(raw.x, raw.y);
  const divisor = Math.max(1, magnitude);
  return { x: round(raw.x / divisor), y: round(raw.y / divisor), brake: raw.brake };
}

function commandValid(command) {
  const allowed = ['kind', 'payload', 'matchId', 'runEpoch', 'type', 'protocol', 'id'];
  if (!record(command, allowed, ['kind', 'payload']) || typeof command.kind !== 'string') return false;
  if (Object.hasOwn(command, 'type') && command.type !== 'command') return false;
  if (Object.hasOwn(command, 'protocol') && command.protocol !== 1) return false;
  if (Object.hasOwn(command, 'id') && !boundedString(command.id)) return false;
  if (Object.hasOwn(command, 'matchId') !== Object.hasOwn(command, 'runEpoch')) return false;
  if (Object.hasOwn(command, 'matchId') && (!boundedString(command.matchId) || !Number.isSafeInteger(command.runEpoch) || command.runEpoch < 0)) return false;
  return true;
}
function startCountdown(state, target = 'playing') {
  boundary(state, 'countdown');
  state.countdownTicks = RULES.countdownTicks;
  state.countdownTarget = target;
  state.resumePhase = null;
}

/** Accepts a trusted {kind,payload} seam or the validated versioned wire envelope. */
export function applyCommand(state, actor, command) {
  const reject = code => ({ accepted: false, state, code });
  if (!viewerValid(actor) || actor.role === 'public') return reject('FORBIDDEN');
  if (!commandValid(command)) return reject('INVALID_COMMAND');
  if (Object.hasOwn(command, 'matchId') && command.matchId !== state.matchId) return reject('STALE_MATCH');
  if (Object.hasOwn(command, 'runEpoch') && command.runEpoch !== state.runEpoch) return reject('STALE_EPOCH');
  if (command.kind === 'ready') {
    if (actor.role !== 'player') return reject('FORBIDDEN');
    if (!record(command.payload, ['value']) || typeof command.payload.value !== 'boolean') return reject('INVALID_COMMAND');
    if (!['waiting', 'paused', 'interlude'].includes(state.phase)) return reject('INVALID_PHASE');
    if (state.ready[actor.playerId] === command.payload.value) return { accepted: true, state };
    const next = copy(state);
    next.ready[actor.playerId] = command.payload.value;
    if (next.ready.jon && next.ready.lydia) {
      const previous = next.phase === 'paused' ? next.resumePhase : next.phase;
      if (previous === 'interlude') {
        next.stageArchives.push({ stageIndex: next.stageIndex, attempt: next.attempts[next.stageIndex], ledger: conservationReport(next) });
        installStage(next, next.stageIndex + 1);
      }
      startCountdown(next, previous === 'finished' ? 'finished' : 'playing');
    }
    return { accepted: true, state: next };
  }
  if (command.kind === 'pause') {
    if (!record(command.payload, ['reason']) || !['requested', 'help', 'recenter'].includes(command.payload.reason)) return reject('INVALID_COMMAND');
    if (!['playing', 'countdown'].includes(state.phase)) return reject('INVALID_PHASE');
    const next = copy(state);
    next.resumePhase = state.countdownTarget === 'finished' ? 'finished' : state.phase;
    boundary(next, 'paused', command.payload.reason);
    return { accepted: true, state: next };
  }
  if (command.kind === 'retry-stage') {
    if (actor.role !== 'host') return reject('FORBIDDEN');
    if (!record(command.payload, [])) return reject('INVALID_COMMAND');
    if (!['interlude', 'finished'].includes(state.phase) || state.results.length === 0) return reject('INVALID_PHASE');
    const next = copy(state);
    const index = next.results.at(-1).stageIndex;
    next.results.pop();
    if (next.attempts[index] >= Number.MAX_SAFE_INTEGER) fail('COUNTER_EXHAUSTED', 'Stage attempt counter is exhausted.');
    next.attempts[index] += 1;
    installStage(next, index);
    boundary(next, 'waiting');
    return { accepted: true, state: next };
  }
  if (command.kind === 'rematch') {
    if (actor.role !== 'host') return reject('FORBIDDEN');
    if (!record(command.payload, ['seedMode']) || !['same', 'new'].includes(command.payload.seedMode)) return reject('INVALID_COMMAND');
    if (!['paused', 'finished'].includes(state.phase)) return reject('INVALID_PHASE');
    return reject('COORDINATOR_REQUIRED');
  }
  return reject('INVALID_COMMAND');
}

export function pauseForSystem(state, reason) {
  // This internal boundary releases receipts without advancing the stage or
  // changing the visible phase. It is never a wire pause reason.
  if (reason === 'receipt-capacity') {
    const next = copy(state);
    boundary(next, state.phase, state.pauseReason);
    return next;
  }
  if (!['network', 'host-stall', 'recovery'].includes(reason)) fail('INVALID_PAUSE_REASON', 'A trusted network, host-stall or recovery reason is required.');
  if (reason !== 'recovery' && !['countdown', 'playing'].includes(state.phase)) return state;
  const next = copy(state);
  next.resumePhase = state.phase === 'paused' ? state.resumePhase
    : state.phase === 'countdown' && state.countdownTarget === 'finished' ? 'finished' : state.phase;
  boundary(next, 'paused', reason);
  return next;
}

function spawnIfDue(state) {
  if (state.supply.nextIndex >= state.supply.entries.length || state.elapsedTicks < state.supply.nextSpawnTick
      || state.fruits.length >= RULES.maxActiveFruit) return;
  const entry = state.supply.entries[state.supply.nextIndex];
  const point = getLevel(state.levelId).spawnPoints[entry.spawnOwner];
  const fruit = { id: entry.id, type: entry.type, x: point.x, y: point.y, vx: 0, vy: 0,
    radius: RULES.tuning.radius, lastOwner: entry.spawnOwner, rejectBasket: null, rejectUntilTick: 0 };
  state.fruits.push(fruit);
  state.supply.nextIndex += 1;
  state.supply.nextSpawnTick = state.elapsedTicks + RULES.spawnIntervalTicks;
  emit(state, 'spawn', { entityId: fruit.id, playerId: entry.spawnOwner, x: fruit.x, y: fruit.y, data: { fruitType: fruit.type } });
}

function plannedGust(state, level) {
  if (state.mode === 'practice') return null;
  for (let i = 0; i < level.gustSchedule.length; i += 1) {
    const planned = level.gustSchedule[i];
    if (state.elapsedTicks < planned.forecastTick || state.elapsedTicks >= planned.startTick + planned.durationTicks) continue;
    let x = planned.x; let y = planned.y;
    for (let rotation = 0; rotation < state.gustRotation; rotation += 1) [x, y] = [-y, x];
    const phase = state.elapsedTicks < planned.startTick ? 'forecast' : 'active';
    return { id: `${state.matchId}:s${state.stageIndex}:a${state.attempts[state.stageIndex]}:gust${i}`,
      phase, x: x || 0, y: y || 0,
      ticksRemaining: (phase === 'forecast' ? planned.startTick : planned.startTick + planned.durationTicks) - state.elapsedTicks };
  }
  return null;
}

function updateHazards(state, level) {
  const prior = new Map(state.gateStates.map(gate => [gate.id, gate]));
  state.gateStates = [...level.gates].sort(byId).map(gate => {
    const time = state.elapsedTicks % gate.schedule.periodTicks;
    const requestedClosed = time >= gate.schedule.openTicks;
    const overlaps = requestedClosed && state.fruits.some(fruit => overlapCircleRect(fruit, gate));
    const forecast = !requestedClosed && time >= gate.schedule.openTicks - gate.schedule.forecastTicks;
    const status = requestedClosed ? (overlaps ? 'forecast' : 'closed') : forecast ? 'forecast' : 'open';
    const result = { id: gate.id, state: status,
      ticksToChange: overlaps ? 0 : requestedClosed ? gate.schedule.periodTicks - time : gate.schedule.openTicks - time,
      closureDeferred: overlaps };
    if (status === 'forecast' && prior.get(gate.id)?.state !== 'forecast') {
      emit(state, 'gate-forecast', { entityId: gate.id, x: gate.x + gate.width / 2, y: gate.y + gate.height / 2,
        data: { ticksToChange: result.ticksToChange, closureDeferred: overlaps } });
    }
    return result;
  });
  const oldGust = state.gust;
  state.gust = plannedGust(state, level);
  if (state.gust && (oldGust?.id !== state.gust.id || oldGust?.phase !== state.gust.phase)) {
      emit(state, state.gust.phase === 'forecast' ? 'gust-forecast' : 'gust-start', { entityId: state.gust.id,
        data: { x: state.gust.x, y: state.gust.y, ticksRemaining: state.gust.ticksRemaining } });
  }
}

function resolveRecipes(state) {
  for (let count = 0; count < RULES.recipesPerStage && state.orders.activeIndex < state.orders.recipes.length; count += 1) {
    const recipe = state.orders.recipes[state.orders.activeIndex];
    if (!TYPES.every(type => state.buffers[type].length >= recipe.needs[type])) break;
    const fruitIds = TYPES.flatMap(type => state.buffers[type].splice(0, recipe.needs[type]));
    state.consumed.push({ recipeId: recipe.id, fruitIds });
    state.orders.completedIds.push(recipe.id);
    state.orders.activeIndex += 1;
    emit(state, 'order-complete', { entityId: recipe.id, data: { recipeType: recipe.recipeType, ordersCompleted: state.orders.activeIndex } });
  }
}

function basketContact(state, fruit, basket) {
  const dx = fruit.x - basket.x; const dy = fruit.y - basket.y;
  const distance = Math.hypot(dx, dy);
  const contact = fruit.radius + basket.radius;
  if (distance > contact) return false;
  if (fruit.type === basket.fruitType && state.buffers[fruit.type].length < RULES.basketCapacity) {
    state.buffers[fruit.type].push(fruit.id);
    emit(state, 'catch', { entityId: fruit.id, playerId: basket.owner, x: basket.x, y: basket.y,
      data: { fruitType: fruit.type, basketId: basket.id } });
    resolveRecipes(state);
    return true;
  }
  const speed = Math.hypot(fruit.vx, fruit.vy);
  const nx = distance > 0 ? dx / distance : speed > 0 ? -fruit.vx / speed : 1;
  const ny = distance > 0 ? dy / distance : speed > 0 ? -fruit.vy / speed : 0;
  fruit.x = round(basket.x + nx * (contact + RULES.tuning.basketSeparation));
  fruit.y = round(basket.y + ny * (contact + RULES.tuning.basketSeparation));
  const inward = fruit.vx * nx + fruit.vy * ny;
  const impulse = Math.max(RULES.tuning.rejectSpeed - inward, -(1 + RULES.tuning.restitution) * inward, 0);
  fruit.vx += nx * impulse; fruit.vy += ny * impulse;
  const limit = Math.max(1, Math.hypot(fruit.vx, fruit.vy) / RULES.tuning.speedCap);
  fruit.vx = round(fruit.vx / limit); fruit.vy = round(fruit.vy / limit);
  const roundedSpeed = Math.hypot(fruit.vx, fruit.vy);
  if (roundedSpeed > RULES.tuning.speedCap) {
    const scale = (RULES.tuning.speedCap - 1 / RULES.rounding) / roundedSpeed;
    fruit.vx = round(fruit.vx * scale); fruit.vy = round(fruit.vy * scale);
  }
  if (fruit.rejectBasket !== basket.id || state.elapsedTicks >= fruit.rejectUntilTick) {
    emit(state, 'reject', { entityId: fruit.id, playerId: basket.owner, x: fruit.x, y: fruit.y,
      data: { basketId: basket.id, reason: fruit.type !== basket.fruitType ? 'wrong' : 'full' } });
    fruit.rejectBasket = basket.id;
    fruit.rejectUntilTick = state.elapsedTicks + RULES.tuning.rejectCueIntervalTicks;
  }
  return false;
}

function finishStage(state) {
  state.remainingAtEnd.active = state.fruits.map(fruit => fruit.id);
  state.remainingAtEnd.buffered = TYPES.flatMap(type => state.buffers[type]);
  state.fruits = [];
  state.buffers = emptyBuffers();
  const ordersCompleted = state.orders.activeIndex;
  const result = { stageIndex: state.stageIndex, ordersCompleted, composted: state.composted.length,
    stars: ordersCompleted === 4 ? 3 : ordersCompleted === 3 ? 2 : ordersCompleted > 0 ? 1 : 0,
    elapsedTicks: state.elapsedTicks };
  state.results.push(result);
  emit(state, 'stage-complete', { data: { ...result, reason: ordersCompleted === 4 ? 'success' : 'timeout' } });
  state.gust = null;
  boundary(state, state.stageIndex === 2 ? 'finished' : 'interlude');
}

export function step(state, inputs = {}) {
  if (!['countdown', 'playing'].includes(state.phase)) return state;
  const next = copy(state);
  increment(next, 'tick');
  next.diagnostics = freshDiagnostics();
  if (state.phase === 'countdown') {
    next.countdownTicks -= 1;
    if (next.countdownTicks === 0) {
      next.phase = next.countdownTarget;
      next.countdownTarget = null;
      next.players = neutralPlayers();
      emit(next, 'phase-change', { data: { phase: next.phase, reason: null } });
      if (next.phase === 'playing') spawnIfDue(next);
    }
    return next;
  }
  increment(next, 'elapsedTicks');
  for (const id of PLAYER_IDS) {
    const descriptor = inputs && typeof inputs === 'object' ? Object.getOwnPropertyDescriptor(inputs, id) : null;
    next.players[id].input = descriptor && Object.hasOwn(descriptor, 'value') ? normalizeInput(descriptor.value) || { ...SAFE_INPUT } : { ...SAFE_INPUT };
  }
  const level = getLevel(next.levelId);
  updateHazards(next, level);
  spawnIfDue(next);
  const controls = { jon: next.players.jon.input, lydia: next.players.lydia.input };
  const closedGateIds = next.gateStates.filter(gate => gate.state === 'closed').map(gate => gate.id);
  const survivors = [];
  for (const original of [...next.fruits].sort(byId)) {
    const moved = advanceFruit(original, { level, controls, closedGateIds, gust: next.gust?.phase === 'active' ? next.gust : null });
    const fruit = moved.fruit;
    next.diagnostics.hits.push(...moved.hits.map(hit => ({ ...hit, entityId: fruit.id })));
    for (const key of ['substeps', 'iterations', 'checks']) next.diagnostics.work[key] += moved.work[key];
    next.diagnostics.fallbacks += moved.fallback ? 1 : 0;
    const region = fruit.x <= level.bridge.x ? 'jon' : fruit.x >= level.bridge.x + level.bridge.width ? 'lydia' : fruit.lastOwner;
    if (region !== fruit.lastOwner) {
      emit(next, 'transfer', { entityId: fruit.id, playerId: region, x: fruit.x, y: fruit.y,
        data: { from: fruit.lastOwner, to: region } });
      fruit.lastOwner = region;
    }
    const hole = level.compost.find(rect => fruit.x >= rect.x && fruit.x <= rect.x + rect.width && fruit.y >= rect.y && fruit.y <= rect.y + rect.height);
    if (hole) {
      next.composted.push(fruit.id);
      emit(next, 'compost', { entityId: fruit.id, x: fruit.x, y: fruit.y, data: { compostId: hole.id, fruitType: fruit.type } });
      continue;
    }
    let captured = false;
    for (const basket of [...level.baskets].sort(byId)) {
      if (basketContact(next, fruit, basket)) { captured = true; break; }
    }
    if (!captured) survivors.push(fruit);
  }
  next.fruits = survivors;
  if (next.orders.activeIndex === RULES.recipesPerStage
      || next.mode === 'campaign' && next.elapsedTicks >= RULES.stageDurationTicks) finishStage(next);
  return next;
}

/** Every current-stage ID appears in exactly one category, including leftovers. */
export function conservationReport(state) {
  return {
    unspawned: state.supply.entries.slice(state.supply.nextIndex).map(entry => entry.id),
    active: state.fruits.map(fruit => fruit.id),
    buffered: TYPES.flatMap(type => state.buffers[type]),
    consumedInOrders: state.consumed.flatMap(recipe => recipe.fruitIds),
    composted: [...state.composted],
    remainingAtEnd: [...state.remainingAtEnd.active, ...state.remainingAtEnd.buffered],
  };
}

export function project(state, viewer) {
  if (!viewerValid(viewer)) fail('INVALID_VIEWER', 'A trusted host, player or public viewer is required.');
  const view = {
    gameId: GAME_ID, schemaVersion: 1, matchId: state.matchId, runEpoch: state.runEpoch, tick: state.tick,
    phase: state.phase, mode: state.mode, stageIndex: state.stageIndex, levelId: state.levelId,
    timeRemainingTicks: state.mode === 'practice' ? null : Math.max(0, RULES.stageDurationTicks - state.elapsedTicks),
    countdownTicks: state.countdownTicks, ready: { ...state.ready }, pauseReason: state.pauseReason,
    fruits: state.fruits.map(({ id, type, x, y, vx, vy, radius }) => ({ id, type, x, y, vx, vy, radius })),
    baskets: Object.fromEntries(TYPES.map(type => [type, { count: state.buffers[type].length, capacity: 3 }])),
    orders: copy(state.orders), gateStates: copy(state.gateStates), gust: copy(state.gust),
    players: copy(state.players), results: copy(state.results), events: copy(state.events),
  };
  const ordersCompleted = view.results.reduce((sum, result) => sum + result.ordersCompleted, 0);
  const composted = view.results.reduce((sum, result) => sum + result.composted, 0);
  view.summary = { ordersCompleted, stars: view.results.reduce((sum, result) => sum + result.stars, 0), composted,
    perfectPicnic: state.mode === 'campaign' && view.results.length === 3 && ordersCompleted === 12 && composted === 0,
    recordEligible: state.mode === 'campaign' };
  return view;
}

function assertJSON(value, depth = 0, budget = { count: 0 }) {
  budget.count += 1;
  if (depth > 24 || budget.count > 25000) fail('INVALID_CHECKPOINT', 'Checkpoint exceeds structural bounds.');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') { if (value.length > 1024) fail('INVALID_CHECKPOINT', 'Checkpoint string is too long.'); return; }
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    if (value.length > 512) fail('INVALID_CHECKPOINT', 'Checkpoint array is too long.');
    for (let i = 0; i < value.length; i += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail('INVALID_CHECKPOINT', 'Checkpoint requires plain JSON.');
      assertJSON(descriptor.value, depth + 1, budget);
    }
    if (Reflect.ownKeys(value).some(key => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9]\d*)$/u.test(key)))) fail('INVALID_CHECKPOINT', 'Unexpected array properties.');
    return;
  }
  if (value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key) || !descriptor.enumerable
          || !Object.hasOwn(descriptor, 'value')) fail('INVALID_CHECKPOINT', 'Checkpoint requires plain JSON.');
      assertJSON(descriptor.value, depth + 1, budget);
    }
    return;
  }
  fail('INVALID_CHECKPOINT', 'Checkpoint requires finite plain JSON.');
}

function assertState(state) {
  assertJSON(state);
  const bad = message => fail('INVALID_CHECKPOINT', message);
  const keys = ['gameId', 'schemaVersion', 'engineVersion', 'seed', 'matchId', 'mode', 'runEpoch', 'tick', 'phase', 'stageIndex',
    'countdownTicks', 'countdownTarget', 'resumePhase', 'ready', 'pauseReason', 'players', 'attempts', 'results', 'stageArchives',
    'nextEvent', 'events', 'diagnostics', 'levelId', 'elapsedTicks', 'supply', 'gustRotation', 'fruits', 'buffers', 'consumed',
    'composted', 'remainingAtEnd', 'orders', 'gateStates', 'gust'];
  if (!record(state, keys)) bad('Unknown or missing state field.');
  if (state.gameId !== GAME_ID || state.schemaVersion !== 1 || state.engineVersion !== ENGINE_VERSION) bad('Unsupported engine state.');
  if (!boundedString(state.seed) || !boundedString(state.matchId) || !['campaign', 'practice'].includes(state.mode)) bad('Invalid run identity.');
  if (!PHASES.includes(state.phase) || ![0, 1, 2].includes(state.stageIndex) || state.levelId !== STAGES[state.stageIndex].id) bad('Invalid lifecycle.');
  for (const key of ['tick', 'runEpoch', 'elapsedTicks', 'nextEvent']) if (!Number.isSafeInteger(state[key]) || state[key] < 0) bad('Invalid counters.');
  // Restoring always allocates a fresh epoch and one phase event. Do not accept
  // a checkpoint that cannot perform that mandatory boundary without overflow.
  if (state.runEpoch >= Number.MAX_SAFE_INTEGER || state.nextEvent >= Number.MAX_SAFE_INTEGER
      || state.tick > Number.MAX_SAFE_INTEGER - RULES.countdownTicks
      || state.elapsedTicks > Number.MAX_SAFE_INTEGER - RULES.spawnIntervalTicks) bad('Exhausted recovery counters.');
  if (state.mode === 'campaign' && state.elapsedTicks > RULES.stageDurationTicks || state.tick < state.elapsedTicks) bad('Invalid stage clock.');
  if (!Array.isArray(state.attempts) || state.attempts.length !== 3 || state.attempts.some(value => !Number.isSafeInteger(value) || value < 0)) bad('Invalid attempts.');
  if (!record(state.ready, PLAYER_IDS) || PLAYER_IDS.some(id => typeof state.ready[id] !== 'boolean')) bad('Invalid readiness.');
  if (state.pauseReason !== null && !PAUSE_REASONS.includes(state.pauseReason)) bad('Invalid pause reason.');
  if (!Number.isInteger(state.countdownTicks) || state.countdownTicks < 0 || state.countdownTicks > RULES.countdownTicks
      || state.phase === 'countdown' && (state.countdownTicks < 1 || !['playing', 'finished'].includes(state.countdownTarget))
      || state.phase !== 'countdown' && (state.countdownTicks !== 0 || state.countdownTarget !== null)) bad('Invalid countdown.');
  if (state.phase === 'paused' ? !['waiting', 'countdown', 'playing', 'interlude', 'finished'].includes(state.resumePhase) || !PAUSE_REASONS.includes(state.pauseReason)
    : state.resumePhase !== null || state.pauseReason !== null) bad('Invalid resume phase or pause reason.');
  if (!record(state.players, PLAYER_IDS) || !PLAYER_IDS.every(id => record(state.players[id], ['input']))) bad('Invalid player fields.');
  for (const id of PLAYER_IDS) if (!normalizeInput(state.players?.[id]?.input)) bad('Invalid control.');
  if (!record(state.supply, ['entries', 'nextIndex', 'nextSpawnTick']) || !record(state.buffers, TYPES)
      || !record(state.orders, ['recipes', 'activeIndex', 'completedIds']) || !record(state.remainingAtEnd, ['active', 'buffered'])) bad('Invalid authority fields.');
  if (!validatePublicView(project(state, { role: 'public', playerId: null })).valid) bad('Invalid public state.');
  const authored = authorStage({ seed: state.seed, matchId: state.matchId, stageIndex: state.stageIndex, attempt: state.attempts[state.stageIndex] });
  if (JSON.stringify(state.supply.entries) !== JSON.stringify(authored.entries)
      || JSON.stringify(state.orders.recipes) !== JSON.stringify(authored.recipes) || state.gustRotation !== authored.gustRotation) bad('Authored supply differs.');
  if (!Number.isInteger(state.supply.nextIndex) || state.supply.nextIndex < 0 || state.supply.nextIndex > 24
      || !Number.isSafeInteger(state.supply.nextSpawnTick) || state.supply.nextSpawnTick < 0 || state.supply.nextSpawnTick > state.elapsedTicks + RULES.spawnIntervalTicks) bad('Invalid spawn cursor.');
  if (!Array.isArray(state.fruits) || state.fruits.length > RULES.maxActiveFruit) bad('Too many fruit.');
  const entries = new Map(authored.entries.map(entry => [entry.id, entry]));
  const level = getLevel(state.levelId);
  for (const gate of state.gateStates) {
    const schedule = level.gates.find(source => source.id === gate.id).schedule;
    const time = state.elapsedTicks % schedule.periodTicks;
    const closed = time >= schedule.openTicks;
    const forecast = !closed && time >= schedule.openTicks - schedule.forecastTicks;
    if (closed ? (!gate.closureDeferred && gate.state !== 'closed') || (gate.closureDeferred && gate.state !== 'forecast')
      : gate.state !== (forecast ? 'forecast' : 'open') || gate.closureDeferred) bad('Gate differs from its schedule.');
    const ticks = gate.closureDeferred ? 0 : closed ? schedule.periodTicks - time : schedule.openTicks - time;
    if (gate.ticksToChange !== ticks) bad('Gate forecast time differs.');
  }
  const closedGateIds = state.gateStates.filter(gate => gate.state === 'closed').map(gate => gate.id);
  for (const fruit of state.fruits) {
    if (!record(fruit, ['id', 'type', 'x', 'y', 'vx', 'vy', 'radius', 'lastOwner', 'rejectBasket', 'rejectUntilTick'])
        || !entries.has(fruit.id) || entries.get(fruit.id).type !== fruit.type || fruit.radius !== RULES.tuning.radius
        || ![fruit.x, fruit.y, fruit.vx, fruit.vy].every(Number.isFinite) || fruit.x < 0 || fruit.x > 1280 || fruit.y < 0 || fruit.y > 720
        || Math.hypot(fruit.vx, fruit.vy) > RULES.tuning.speedCap || !PLAYER_IDS.includes(fruit.lastOwner)
        || fruit.rejectBasket !== null && !TYPES.includes(fruit.rejectBasket)
        || !Number.isSafeInteger(fruit.rejectUntilTick) || fruit.rejectUntilTick < 0
        || !isPlacementClear(fruit, { level, closedGateIds })) bad('Invalid active fruit.');
  }
  for (const type of TYPES) {
    if (!Array.isArray(state.buffers[type]) || state.buffers[type].length > 3 || state.buffers[type].some(id => entries.get(id)?.type !== type)) bad('Invalid basket.');
  }
  const groups = conservationReport(state); const ids = Object.values(groups).flat();
  if (ids.length !== 24 || new Set(ids).size !== 24 || ids.some(id => !entries.has(id))) bad('Fruit conservation failed.');
  if (!Number.isInteger(state.orders.activeIndex) || state.orders.activeIndex < 0 || state.orders.activeIndex > 4
      || state.orders.completedIds.length !== state.orders.activeIndex || state.consumed.length !== state.orders.activeIndex
      || state.orders.completedIds.some((id, i) => id !== authored.recipes[i].id)) bad('Invalid recipe progress.');
  for (let i = 0; i < state.consumed.length; i += 1) {
    const consumed = state.consumed[i]; const recipe = authored.recipes[i];
    if (consumed.recipeId !== recipe.id || consumed.fruitIds.length !== 3
        || TYPES.some(type => consumed.fruitIds.filter(id => entries.get(id)?.type === type).length !== recipe.needs[type])) bad('Invalid recipe ingredients.');
  }
  if (!Array.isArray(state.results) || state.results.length > 3 || state.results.some((result, i) => result.stageIndex !== i
      || !Number.isInteger(result.ordersCompleted) || result.ordersCompleted < 0 || result.ordersCompleted > 4
      || !Number.isInteger(result.composted) || result.composted < 0 || result.composted > 24
      || !Number.isSafeInteger(result.elapsedTicks) || result.elapsedTicks < 0
      || result.stars !== (result.ordersCompleted === 4 ? 3 : result.ordersCompleted === 3 ? 2 : result.ordersCompleted > 0 ? 1 : 0))) bad('Invalid stage results.');
  const completed = ['interlude', 'finished'].includes(state.phase)
    || state.phase === 'paused' && ['interlude', 'finished'].includes(state.resumePhase)
    || state.phase === 'countdown' && state.countdownTarget === 'finished';
  const effectivePhase = state.phase === 'paused' ? state.resumePhase
    : state.phase === 'countdown' && state.countdownTarget === 'finished' ? 'finished' : state.phase;
  if (state.results.length !== state.stageIndex + Number(completed)) bad('Result/lifecycle mismatch.');
  if (completed) {
    const result = state.results.at(-1);
    if (state.fruits.length || TYPES.some(type => state.buffers[type].length) || result.ordersCompleted !== state.orders.activeIndex
        || result.composted !== state.composted.length || result.elapsedTicks !== state.elapsedTicks
        || effectivePhase === 'finished' && state.stageIndex !== 2 || effectivePhase === 'interlude' && state.stageIndex === 2
        || state.orders.activeIndex !== 4 && !(state.mode === 'campaign' && state.elapsedTicks === RULES.stageDurationTicks)) bad('Completed stage mismatch.');
  } else if (state.remainingAtEnd.active.length || state.remainingAtEnd.buffered.length
      || state.orders.activeIndex === 4 || state.mode === 'campaign' && state.elapsedTicks >= RULES.stageDurationTicks) bad('Live stage has ended.');
  const expectedGust = completed ? null : plannedGust(state, level);
  if (JSON.stringify(state.gust) !== JSON.stringify(expectedGust)) bad('Gust differs from its seeded schedule.');
  if (effectivePhase === 'waiting' && (state.elapsedTicks !== 0 || state.supply.nextIndex !== 0 || state.supply.nextSpawnTick !== 0
      || state.fruits.length || state.orders.activeIndex || state.composted.length || TYPES.some(type => state.buffers[type].length))) bad('Waiting stage must be fresh.');
  if (!Array.isArray(state.stageArchives) || state.stageArchives.length !== state.stageIndex) bad('Invalid stage archives.');
  for (let i = 0; i < state.stageArchives.length; i += 1) {
    const archive = state.stageArchives[i];
    if (!record(archive, ['stageIndex', 'attempt', 'ledger']) || archive.stageIndex !== i || archive.attempt !== state.attempts[i]
        || !record(archive.ledger, ['unspawned', 'active', 'buffered', 'consumedInOrders', 'composted', 'remainingAtEnd'])
        || Object.values(archive.ledger).some(group => !Array.isArray(group))) bad('Invalid archive.');
    const expected = authorStage({ seed: state.seed, matchId: state.matchId, stageIndex: i, attempt: state.attempts[i] }).entries.map(entry => entry.id).sort();
    const ids = Object.values(archive.ledger).flat().sort();
    if (JSON.stringify(ids) !== JSON.stringify(expected) || archive.ledger.active.length || archive.ledger.buffered.length
        || archive.ledger.consumedInOrders.length !== state.results[i].ordersCompleted * 3
        || archive.ledger.composted.length !== state.results[i].composted) bad('Archive conservation failed.');
  }
  if (!Array.isArray(state.events) || state.events.length > 64 || new Set(state.events.map(event => event.id)).size !== state.events.length) bad('Invalid event ring.');
  let previous = 0;
  for (const event of state.events) {
    const prefix = `${state.matchId}:e`; const number = event.id.startsWith(prefix) ? Number(event.id.slice(prefix.length)) : NaN;
    if (!Number.isSafeInteger(number) || number <= previous || number > state.nextEvent || !Number.isSafeInteger(event.tick) || event.tick < 0 || event.tick > state.tick) bad('Invalid event identity.');
    previous = number;
  }
  if (state.events.length !== Math.min(state.nextEvent, RULES.eventLimit) || previous !== state.nextEvent) bad('Truncated event history.');
  if (!record(state.diagnostics, ['hits', 'work', 'fallbacks']) || !Array.isArray(state.diagnostics.hits) || state.diagnostics.hits.length > 512
      || !record(state.diagnostics.work, ['substeps', 'iterations', 'checks'])
      || Object.values(state.diagnostics.work).some(value => !Number.isSafeInteger(value) || value < 0)
      || !Number.isSafeInteger(state.diagnostics.fallbacks) || state.diagnostics.fallbacks < 0 || state.diagnostics.fallbacks > 8) bad('Invalid diagnostics.');
}

export function serializeCheckpoint(state) {
  try { assertState(state); }
  catch (error) { if (error instanceof EngineError) throw error; fail('INVALID_CHECKPOINT', 'Malformed engine state.'); }
  const snapshot = copy(state);
  return { gameId: GAME_ID, schemaVersion: CHECKPOINT_VERSION, engineVersion: ENGINE_VERSION,
    checksum: hashSeed(JSON.stringify(snapshot)).toString(16).padStart(8, '0'), state: snapshot };
}

export function restoreCheckpoint(checkpoint) {
  try {
    assertJSON(checkpoint);
    if (!record(checkpoint, ['gameId', 'schemaVersion', 'engineVersion', 'checksum', 'state']) || checkpoint.gameId !== GAME_ID
        || checkpoint.schemaVersion !== CHECKPOINT_VERSION || checkpoint.engineVersion !== ENGINE_VERSION) fail('INVALID_CHECKPOINT', 'Unsupported checkpoint version.');
    if (checkpoint.checksum !== hashSeed(JSON.stringify(checkpoint.state)).toString(16).padStart(8, '0')) fail('INVALID_CHECKPOINT', 'Checkpoint checksum mismatch.');
    assertState(checkpoint.state);
    return pauseForSystem(checkpoint.state, 'recovery');
  } catch (error) {
    if (error instanceof EngineError) throw error;
    fail('INVALID_CHECKPOINT', 'Malformed checkpoint.');
  }
}
