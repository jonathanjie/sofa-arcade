/**
 * Diagnostic public fixtures for GO4. These are manually authored snapshots,
 * not a simulation, transport client, authority, or a substitute for GO1 maps.
 * Every fixture uses the frozen public-view and public-geometry schemas.
 */
export const FRUIT_TYPES = Object.freeze(['apple', 'plum', 'pear', 'starfruit']);
export const STAGES = Object.freeze(['morning-delivery', 'switchback-grove', 'moonlight-picnic']);
export const RECIPES = Object.freeze([
  { id: 'apple-picnic', needs: { apple: 2, plum: 0, pear: 1, starfruit: 0 } },
  { id: 'plum-picnic', needs: { apple: 0, plum: 2, pear: 0, starfruit: 1 } },
  { id: 'sunlit-mix', needs: { apple: 1, plum: 0, pear: 1, starfruit: 1 } },
  { id: 'moonlit-mix', needs: { apple: 0, plum: 1, pear: 1, starfruit: 1 } },
]);

const baseLevel = {
  bounds: { x: 0, y: 0, width: 1280, height: 720 },
  trays: [
    { id: 'jon', bounds: { x: 48, y: 112, width: 532, height: 518 } },
    { id: 'lydia', bounds: { x: 700, y: 112, width: 532, height: 518 } },
  ],
  bridge: { x: 580, y: 310, width: 120, height: 130 },
  baskets: [
    { id: 'apple', fruitType: 'apple', owner: 'jon', x: 145, y: 555, radius: 38 },
    { id: 'plum', fruitType: 'plum', owner: 'jon', x: 475, y: 555, radius: 38 },
    { id: 'pear', fruitType: 'pear', owner: 'lydia', x: 805, y: 555, radius: 38 },
    { id: 'starfruit', fruitType: 'starfruit', owner: 'lydia', x: 1135, y: 555, radius: 38 },
  ],
};

function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

export const LEVELS = freeze(Object.fromEntries(STAGES.map((id, index) => [id, {
  ...structuredClone(baseLevel), id,
  bumpers: index === 0
    ? [{ id: 'soft-west', kind: 'circle', x: 315, y: 315, radius: 35 }, { id: 'soft-east', kind: 'circle', x: 965, y: 315, radius: 35 }]
    : [{ id: 'hedge-west', kind: 'rect', x: 230, y: 265, width: 180, height: 28 }, { id: 'hedge-east', kind: 'rect', x: 870, y: 265, width: 180, height: 28 }, { id: 'soft-west', kind: 'circle', x: 310, y: 465, radius: 25 }, { id: 'soft-east', kind: 'circle', x: 970, y: 465, radius: 25 }],
  compost: index === 0 ? [] : [{ id: 'compost-west', x: 500, y: 190, width: 45, height: 75 }, { id: 'compost-east', x: 735, y: 190, width: 45, height: 75 }],
  gates: index === 0 ? [] : [{ id: 'bridge-gate', x: 625, y: 310, width: 30, height: 130, schedule: { periodTicks: 540, openTicks: 360, forecastTicks: 90 } }],
  gustSchedule: index !== 2 ? [] : [
    { forecastTick: 1170, startTick: 1350, durationTicks: 90, x: 1, y: 0 },
    { forecastTick: 2520, startTick: 2700, durationTicks: 90, x: 0, y: 1 },
    { forecastTick: 3870, startTick: 4050, durationTicks: 90, x: -1, y: 0 },
  ],
}])));

export function getLevel(id) { return LEVELS[id] ?? null; }
export const geometry = { LEVELS, getLevel };

export const CONNECTED = freeze({ state: 'connected', presence: { jon: { connected: true, inputFresh: true }, lydia: { connected: true, inputFresh: true } } });

const fruit = (id, type, x, y, vx = 0, vy = 0) => ({ id, type, x, y, vx, vy, radius: 18 });
const liveFruit = [fruit('apple-1', 'apple', 210, 350, 70, 0), fruit('pear-1', 'pear', 535, 375, 95, 0), fruit('plum-1', 'plum', 815, 360, -65, 0), fruit('starfruit-1', 'starfruit', 1080, 410, 0, 70)];
const extraFruit = [fruit('apple-2', 'apple', 945, 210, -25, 45), fruit('pear-2', 'pear', 200, 210, 40, 30), fruit('plum-2', 'plum', 430, 440, 30, 20), fruit('starfruit-2', 'starfruit', 645, 385, 90, 0)];

function result(stageIndex, ordersCompleted = 4, composted = 0) {
  return { stageIndex, ordersCompleted, composted, stars: ordersCompleted === 4 ? 3 : ordersCompleted === 3 ? 2 : ordersCompleted > 0 ? 1 : 0, elapsedTicks: ordersCompleted === 4 ? 3280 + 300 * stageIndex : 5400 };
}

function baseView(matchId) {
  return {
    gameId: 'gravity-orchard', schemaVersion: 1, matchId, runEpoch: 1, tick: 720,
    phase: 'playing', mode: 'campaign', stageIndex: 0, levelId: STAGES[0],
    timeRemainingTicks: 4860, countdownTicks: 0,
    ready: { jon: false, lydia: false }, pauseReason: null,
    fruits: structuredClone(liveFruit),
    baskets: Object.fromEntries(FRUIT_TYPES.map(id => [id, { count: id === 'apple' ? 1 : 0, capacity: 3 }])),
    orders: { recipes: structuredClone(RECIPES), activeIndex: 0, completedIds: [] },
    gateStates: [], gust: null,
    players: { jon: { input: { x: 0.65, y: 0.15, brake: false } }, lydia: { input: { x: -0.55, y: 0.35, brake: false } } },
    results: [], events: [],
  };
}

export const SCENES = Object.freeze([
  'waiting', 'countdown', 'playing', 'dense', 'full-baskets', 'gate-forecast',
  'gate-deferred', 'gate-closed', 'gust-forecast', 'gust-active', 'paused',
  'reconnect', 'interlude', 'timeout', 'finished', 'perfect', 'practice',
]);

export function makeFixture(scene = 'playing', { matchId = `diagnostic-${scene}` } = {}) {
  if (!SCENES.includes(scene)) throw new RangeError(`Unknown diagnostic scene: ${scene}`);
  const view = baseView(matchId);
  if (scene === 'waiting') {
    Object.assign(view, { phase: 'waiting', tick: 0, timeRemainingTicks: 5400, fruits: [], ready: { jon: true, lydia: false } });
  } else if (scene === 'countdown') {
    Object.assign(view, { phase: 'countdown', tick: 60, timeRemainingTicks: 5400, countdownTicks: 120, fruits: [] });
  } else if (scene === 'dense' || scene === 'full-baskets') {
    view.fruits.push(...structuredClone(extraFruit));
    if (scene === 'full-baskets') { view.baskets.plum.count = 3; view.baskets.starfruit.count = 3; }
  } else if (scene.startsWith('gate-')) {
    Object.assign(view, { stageIndex: 1, levelId: STAGES[1], results: [result(0)], runEpoch: 3, tick: 4500 });
    view.gateStates = [{ id: 'bridge-gate', state: scene === 'gate-closed' ? 'closed' : 'forecast', ticksToChange: scene === 'gate-deferred' ? 0 : 90, closureDeferred: scene === 'gate-deferred' }];
    if (scene === 'gate-deferred') view.fruits.push(fruit('bridge-pear', 'pear', 640, 375, 70, 0));
  } else if (scene.startsWith('gust-')) {
    Object.assign(view, { stageIndex: 2, levelId: STAGES[2], results: [result(0), result(1)], runEpoch: 5, tick: 9450, timeRemainingTicks: 4140 });
    view.gateStates = [{ id: 'bridge-gate', state: 'open', ticksToChange: 240, closureDeferred: false }];
    view.gust = { id: 'gust-1', phase: scene === 'gust-active' ? 'active' : 'forecast', x: 1, y: 0, ticksRemaining: scene === 'gust-active' ? 75 : 180 };
    view.players.lydia.input = { x: 0, y: 0, brake: true };
    view.events = [{ id: `${matchId}:forecast`, kind: scene === 'gust-active' ? 'gust-start' : 'gust-forecast', tick: view.tick, x: 1, y: 0 }];
  } else if (scene === 'paused' || scene === 'reconnect') {
    Object.assign(view, { phase: 'paused', runEpoch: 2, pauseReason: scene === 'reconnect' ? 'network' : 'requested', ready: { jon: true, lydia: false } });
  } else if (scene === 'interlude' || scene === 'timeout') {
    const completed = scene === 'timeout' ? 2 : 4;
    Object.assign(view, { phase: 'interlude', tick: scene === 'timeout' ? 5580 : 3460, runEpoch: 2, timeRemainingTicks: scene === 'timeout' ? 0 : 2120, results: [result(0, completed, scene === 'timeout' ? 2 : 0)], fruits: [] });
    view.orders.activeIndex = completed;
    view.orders.completedIds = view.orders.recipes.slice(0, completed).map(r => r.id);
    view.events = [{ id: `${matchId}:stage-complete`, kind: 'stage-complete', tick: view.tick, data: { stageIndex: 0, ordersCompleted: completed } }];
  } else if (scene === 'finished' || scene === 'perfect') {
    const perfect = scene === 'perfect';
    Object.assign(view, { phase: 'finished', stageIndex: 2, levelId: STAGES[2], runEpoch: 6, tick: 14400, timeRemainingTicks: perfect ? 1000 : 0, fruits: [], results: [result(0), result(1, perfect ? 4 : 3, perfect ? 0 : 1), result(2, perfect ? 4 : 2, perfect ? 0 : 2)] });
    view.orders.activeIndex = perfect ? 4 : 2;
    view.orders.completedIds = view.orders.recipes.slice(0, view.orders.activeIndex).map(r => r.id);
    view.events = [{ id: `${matchId}:finish`, kind: 'stage-complete', tick: view.tick, data: { stageIndex: 2, ordersCompleted: perfect ? 4 : 2 } }];
  } else if (scene === 'practice') {
    Object.assign(view, { mode: 'practice', timeRemainingTicks: null });
  }
  if (view.phase !== 'playing') for (const player of Object.values(view.players)) player.input = { x: 0, y: 0, brake: true };
  return view;
}

/** A coherent snapshot transcript; advancing is explicit, never a TV clock. */
export function makeJourney({ perfect = true, matchId = 'diagnostic-three-stage' } = {}) {
  const frames = [];
  let tick = 0;
  let epoch = 0;
  const completedResults = [];
  const add = (name, view) => frames.push({ name, view: structuredClone(view) });
  for (let stageIndex = 0; stageIndex < 3; stageIndex++) {
    let view = makeFixture('waiting', { matchId });
    Object.assign(view, { stageIndex, levelId: STAGES[stageIndex], tick, runEpoch: epoch, results: structuredClone(completedResults), ready: { jon: false, lydia: false } });
    if (stageIndex === 0) {
      add('stage-1-waiting', view);
      view.ready.jon = true;
      add('stage-1-jon-ready', view);
    } else {
      // Normal stage progression is interlude -> countdown; waiting is reserved
      // for the initial stage or an explicit host retry.
      const interlude = structuredClone(frames.at(-1).view);
      interlude.ready.jon = true;
      add(`stage-${stageIndex}-interlude-jon-ready`, interlude);
    }
    Object.assign(view, { phase: 'countdown', countdownTicks: 180, runEpoch: ++epoch, ready: { jon: false, lydia: false } });
    add(`stage-${stageIndex + 1}-countdown`, view);
    tick += 180;
    Object.assign(view, { phase: 'playing', countdownTicks: 0, tick, fruits: structuredClone(liveFruit), players: structuredClone(baseView(matchId).players) });
    if (stageIndex > 0) view.gateStates = [{ id: 'bridge-gate', state: 'open', ticksToChange: 360, closureDeferred: false }];
    add(`stage-${stageIndex + 1}-playing`, view);
    tick += 60;
    view.tick = tick;
    view.timeRemainingTicks = 5340;
    view.fruits[1].x = 645;
    view.events = [{ id: `${matchId}:${stageIndex}:transfer`, kind: 'transfer', tick, entityId: 'pear-1', playerId: 'lydia', x: 645, y: 375 }];
    add(`stage-${stageIndex + 1}-transfer`, view);
    if (stageIndex === 1) {
      view.gateStates[0] = { id: 'bridge-gate', state: 'forecast', ticksToChange: 0, closureDeferred: true };
      add('stage-2-gate-deferred', view);
    }
    if (stageIndex === 2) {
      tick += 1110;
      view.tick = tick;
      view.timeRemainingTicks = 4230;
      view.gust = { id: 'last-stage-gust', phase: 'forecast', x: 0, y: -1, ticksRemaining: 180 };
      view.events.push({ id: `${matchId}:gust`, kind: 'gust-forecast', tick, x: 0, y: -1 });
      add('stage-3-gust-forecast', view);
    }
    const completed = perfect || stageIndex === 0 ? 4 : stageIndex === 1 ? 3 : 2;
    const stageResult = result(stageIndex, completed, perfect ? 0 : stageIndex);
    completedResults.push(stageResult);
    tick = Math.max(tick + 120, completedResults.reduce((sum, r) => sum + r.elapsedTicks + 180, 0));
    Object.assign(view, { phase: stageIndex === 2 ? 'finished' : 'interlude', tick, runEpoch: ++epoch, fruits: [], gust: null, timeRemainingTicks: 5400 - stageResult.elapsedTicks, results: structuredClone(completedResults), ready: { jon: false, lydia: false } });
    view.orders.activeIndex = completed;
    view.orders.completedIds = view.orders.recipes.slice(0, completed).map(r => r.id);
    view.events.push({ id: `${matchId}:${stageIndex}:complete`, kind: 'stage-complete', tick, data: { stageIndex, ordersCompleted: completed } });
    for (const player of Object.values(view.players)) player.input = { x: 0, y: 0, brake: true };
    add(`stage-${stageIndex + 1}-${view.phase}`, view);
  }
  return frames;
}
