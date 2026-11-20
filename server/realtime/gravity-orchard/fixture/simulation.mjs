/**
 * Deterministic transport fixture, deliberately NOT Gravity Orchard game physics.
 * It implements the frozen GO1 seam so GO2 can be exercised independently.
 * Two bounded markers show which authenticated tray received applied input.
 */
const SEATS = Object.freeze(['jon', 'lydia']);
const LEVELS = Object.freeze(['morning-delivery', 'switchback-grove', 'moonlight-picnic']);
const PHASES = new Set(['waiting', 'countdown', 'playing', 'paused', 'interlude', 'finished']);
const SYSTEM_REASONS = new Set(['network', 'host-stall', 'recovery']);
const SAFE = Object.freeze({ x: 0, y: 0, brake: true });
const clone = (value) => structuredClone(value);
const round = (value) => Math.round(value * 10000) / 10000;
const boundedText = (value) => typeof value === 'string' && value.length > 0 && value.length <= 128;
const counter = (value) => Number.isSafeInteger(value) && value >= 0;
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key));

export function normalizeInput(raw) {
  if (!exact(raw, ['x', 'y', 'brake']) || !Number.isFinite(raw.x) || !Number.isFinite(raw.y)
    || Math.abs(raw.x) > 1 || Math.abs(raw.y) > 1 || typeof raw.brake !== 'boolean') return null;
  const magnitude = Math.max(1, Math.hypot(raw.x, raw.y));
  return { x: round(raw.x / magnitude), y: round(raw.y / magnitude), brake: raw.brake };
}

function clearControls(state) {
  state.ready = { jon: false, lydia: false };
  state.players = { jon: { input: { ...SAFE } }, lydia: { input: { ...SAFE } } };
  for (const fruit of state.fruits) { fruit.vx = 0; fruit.vy = 0; }
}

function event(state, kind) {
  state.eventSequence += 1;
  state.events.push({ id: `${state.matchId}:${state.eventSequence}`, kind, tick: state.tick });
  state.events = state.events.slice(-64);
}

function boundary(state, phase, reason = null) {
  state.phase = phase;
  state.pauseReason = reason;
  state.runEpoch += 1;
  clearControls(state);
  event(state, 'phase-change');
  return state;
}

function markers(matchId, stageIndex) {
  return [
    { id: `${matchId}:s${stageIndex}:jon-marker`, type: 'apple', x: 280, y: 360, vx: 0, vy: 0, radius: 24 },
    { id: `${matchId}:s${stageIndex}:lydia-marker`, type: 'pear', x: 1000, y: 360, vx: 0, vy: 0, radius: 24 },
  ];
}

function validateState(state) {
  if (!plain(state) || state.fixtureSchema !== 1 || state.gameId !== 'gravity-orchard'
    || state.schemaVersion !== 1 || !boundedText(state.seed) || !boundedText(state.matchId)
    || !counter(state.runEpoch) || !counter(state.tick) || !counter(state.elapsedTicks)
    || !counter(state.eventSequence) || !PHASES.has(state.phase)
    || !['campaign', 'practice'].includes(state.mode)
    || !Number.isInteger(state.stageIndex) || state.stageIndex < 0 || state.stageIndex > 2
    || state.levelId !== LEVELS[state.stageIndex] || !counter(state.countdownTicks)
    || !plain(state.ready) || SEATS.some((seat) => typeof state.ready[seat] !== 'boolean')
    || !plain(state.players) || SEATS.some((seat) => !normalizeInput(state.players[seat]?.input))
    || !Array.isArray(state.fruits) || state.fruits.length !== 2
    || state.fruits.some((fruit) => !boundedText(fruit.id) || !['apple', 'pear'].includes(fruit.type)
      || ['x', 'y', 'vx', 'vy', 'radius'].some((key) => !Number.isFinite(fruit[key]))
      || fruit.x < 0 || fruit.x > 1280 || fruit.y < 0 || fruit.y > 720 || fruit.radius !== 24)
    || !Array.isArray(state.events) || state.events.length > 64
    || state.events.some((entry) => !boundedText(entry.id) || !boundedText(entry.kind) || !counter(entry.tick))
    || !Array.isArray(state.results) || state.results.length > 3
    || !plain(state.baskets) || !plain(state.orders) || !Array.isArray(state.gateStates)) {
    throw new Error('fixture-checkpoint-invalid');
  }
  // JSON is the store seam. Reject non-finite values rather than silently mapping them to null.
  const visit = (value, depth = 0) => {
    if (depth > 12) throw new Error('fixture-checkpoint-invalid');
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('fixture-checkpoint-invalid');
    if (Array.isArray(value)) value.forEach((item) => visit(item, depth + 1));
    else if (plain(value)) Object.values(value).forEach((item) => visit(item, depth + 1));
  };
  visit(state);
}

/** Test-only tuning shortens journeys without changing the exported seam. */
export function createMockSimulation({ countdownTicks = 180, stageTicks = 5400 } = {}) {
  if (!Number.isSafeInteger(countdownTicks) || countdownTicks < 1 || countdownTicks > 180
    || !Number.isSafeInteger(stageTicks) || stageTicks < 1 || stageTicks > 5400) {
    throw new TypeError('fixture-timing-invalid');
  }

  function createRun({ seed, matchId, options = { mode: 'campaign' } }) {
    if (!boundedText(seed) || !boundedText(matchId) || !plain(options)
      || !['campaign', 'practice'].includes(options.mode ?? 'campaign')) throw new TypeError('fixture-run-invalid');
    const mode = options.mode ?? 'campaign';
    return {
      fixtureSchema: 1, seed, elapsedTicks: 0, eventSequence: 0,
      gameId: 'gravity-orchard', schemaVersion: 1, matchId, runEpoch: 1, tick: 0,
      phase: 'waiting', mode, stageIndex: 0, levelId: LEVELS[0],
      timeRemainingTicks: mode === 'practice' ? null : stageTicks,
      countdownTicks: 0, ready: { jon: false, lydia: false }, pauseReason: null,
      fruits: markers(matchId, 0),
      baskets: Object.fromEntries(['apple', 'plum', 'pear', 'starfruit'].map((type) => [type, { count: 0, capacity: 3 }])),
      orders: { recipes: [{ id: 'fixture-only', needs: { apple: 0, plum: 0, pear: 0, starfruit: 0 } }], activeIndex: 0, completedIds: [] },
      gateStates: [], gust: null,
      players: { jon: { input: { ...SAFE } }, lydia: { input: { ...SAFE } } },
      results: [], events: [],
    };
  }

  function step(state, inputs) {
    if (!['countdown', 'playing'].includes(state.phase)) return state;
    const next = clone(state);
    next.tick += 1;
    if (next.phase === 'countdown') {
      next.countdownTicks = Math.max(0, next.countdownTicks - 1);
      if (next.countdownTicks === 0) { next.phase = 'playing'; event(next, 'phase-change'); }
      return next;
    }
    next.elapsedTicks += 1;
    for (const [index, seat] of SEATS.entries()) {
      const input = normalizeInput(inputs?.[seat]) ?? { ...SAFE };
      next.players[seat].input = input;
      const fruit = next.fruits[index];
      fruit.vx = input.brake ? 0 : round(input.x * 180);
      fruit.vy = input.brake ? 0 : round(input.y * 180);
      const range = seat === 'jon' ? [104, 514] : [766, 1176];
      fruit.x = round(Math.min(range[1], Math.max(range[0], fruit.x + fruit.vx / 60)));
      fruit.y = round(Math.min(574, Math.max(164, fruit.y + fruit.vy / 60)));
    }
    if (next.mode === 'campaign') {
      next.timeRemainingTicks = Math.max(0, stageTicks - next.elapsedTicks);
      if (next.timeRemainingTicks === 0) {
        next.results.push({ stageIndex: next.stageIndex, ordersCompleted: 0, composted: 0, stars: 0, elapsedTicks: next.elapsedTicks });
        event(next, 'stage-complete');
        boundary(next, next.stageIndex === 2 ? 'finished' : 'interlude');
      }
    }
    return next;
  }

  function applyCommand(state, actor, command) {
    const reject = (code) => ({ accepted: false, state, code });
    if (!plain(actor) || !plain(command)
      || !((actor.role === 'host' && actor.playerId === null)
        || (actor.role === 'player' && SEATS.includes(actor.playerId)))) return reject('forbidden');
    const payload = command.payload;
    if (command.kind === 'ready') {
      if (actor.role !== 'player') return reject('forbidden');
      if (!['waiting', 'paused', 'interlude'].includes(state.phase)) return reject('wrong-phase');
      if (!exact(payload, ['value']) || typeof payload.value !== 'boolean') return reject('invalid-command');
      const next = clone(state);
      next.ready[actor.playerId] = payload.value;
      if (next.ready.jon && next.ready.lydia) {
        if (next.phase === 'interlude') {
          next.stageIndex += 1;
          next.levelId = LEVELS[next.stageIndex];
          next.elapsedTicks = 0;
          next.timeRemainingTicks = next.mode === 'practice' ? null : stageTicks;
          next.fruits = markers(next.matchId, next.stageIndex);
        }
        boundary(next, 'countdown');
        next.countdownTicks = countdownTicks;
      }
      return { accepted: true, state: next };
    }
    if (command.kind === 'pause') {
      if (!['playing', 'countdown'].includes(state.phase)) return reject('wrong-phase');
      if (!exact(payload, ['reason']) || !['requested', 'help', 'recenter'].includes(payload.reason)) return reject('invalid-command');
      return { accepted: true, state: boundary(clone(state), 'paused', payload.reason) };
    }
    if (command.kind === 'retry-stage') {
      if (actor.role !== 'host') return reject('forbidden');
      if (!['interlude', 'finished'].includes(state.phase)) return reject('wrong-phase');
      if (!exact(payload, [])) return reject('invalid-command');
      const next = clone(state);
      next.stageIndex = next.results.pop()?.stageIndex ?? next.stageIndex;
      next.levelId = LEVELS[next.stageIndex];
      next.elapsedTicks = 0;
      next.countdownTicks = 0;
      next.timeRemainingTicks = next.mode === 'practice' ? null : stageTicks;
      next.fruits = markers(next.matchId, next.stageIndex);
      return { accepted: true, state: boundary(next, 'waiting') };
    }
    return reject('unknown-command');
  }

  function pauseForSystem(state, reason) {
    if (!SYSTEM_REASONS.has(reason)) throw new TypeError('fixture-system-reason-invalid');
    if (state.phase === 'paused' && reason !== 'recovery') return state;
    return boundary(clone(state), 'paused', reason);
  }

  function project(state, viewer) {
    if (!plain(viewer) || !((viewer.role === 'public' || viewer.role === 'host') && viewer.playerId === null)
      && !(viewer.role === 'player' && SEATS.includes(viewer.playerId))) throw new TypeError('fixture-viewer-invalid');
    const { fixtureSchema: _schema, seed: _seed, elapsedTicks: _elapsed, eventSequence: _sequence, ...view } = clone(state);
    return view;
  }

  function serializeCheckpoint(state) {
    validateState(state);
    return { schemaVersion: 1, gameId: 'gravity-orchard-fixture', state: clone(state) };
  }

  function restoreCheckpoint(checkpoint) {
    if (!exact(checkpoint, ['schemaVersion', 'gameId', 'state']) || checkpoint.schemaVersion !== 1
      || checkpoint.gameId !== 'gravity-orchard-fixture') throw new Error('fixture-checkpoint-unsupported');
    validateState(checkpoint.state);
    return pauseForSystem(checkpoint.state, 'recovery');
  }

  return Object.freeze({ createRun, normalizeInput, step, applyCommand, pauseForSystem, project, serializeCheckpoint, restoreCheckpoint });
}

export const simulation = createMockSimulation();
export const { createRun, step, applyCommand, pauseForSystem, project, serializeCheckpoint, restoreCheckpoint } = simulation;
