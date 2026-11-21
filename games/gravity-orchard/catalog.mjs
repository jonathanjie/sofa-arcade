/** Public, immutable vocabulary and versioned starting tuning. No authority imports. */
export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export const FRUIT_TYPES = deepFreeze({
  apple: { id: 'apple', name: 'Apple', owner: 'jon', color: '#c44942', symbol: '●' },
  plum: { id: 'plum', name: 'Plum', owner: 'jon', color: '#785282', symbol: '◆' },
  pear: { id: 'pear', name: 'Pear', owner: 'lydia', color: '#718f37', symbol: '▲' },
  starfruit: { id: 'starfruit', name: 'Starfruit', owner: 'lydia', color: '#bb8819', symbol: '★' },
});

export const STAGES = deepFreeze([
  { id: 'morning-delivery', name: 'Morning Delivery', description: 'Broad paths and a generous bridge for the first picnic.' },
  { id: 'switchback-grove', name: 'Switchback Grove', description: 'Choose the longer safe path or the shortcut beside compost; watch the bridge gate.' },
  { id: 'moonlight-picnic', name: "Lala’s Moonlight Picnic", description: 'Prepare for three announced gusts and bring the final picnic home.' },
]);

export const RULES = deepFreeze({
  schemaVersion: 1,
  version: '0.2.0',
  tuningVersion: 'go1-1',
  tickRate: 60,
  spawnIntervalTicks: 210,
  maxActiveFruit: 8,
  stageDurationTicks: 5400,
  countdownTicks: 180,
  basketCapacity: 3,
  eventLimit: 64,
  rounding: 10000,
  fruitPerStage: 24,
  recipesPerStage: 4,
  tuning: {
    acceleration: 520,
    damping: 1.35,
    brakeDamping: 12,
    restitution: 0.35,
    radius: 14,
    speedCap: 220,
    substeps: 3,
    collisionIterations: 4,
    gustAcceleration: 260,
    brakeGustScale: 0.15,
    rejectSpeed: 45,
    basketSeparation: 0.001,
    rejectCueIntervalTicks: 30,
  },
});

export const SAFE_INPUT = deepFreeze({ x: 0, y: 0, brake: true });
export const PLAYER_IDS = deepFreeze(['jon', 'lydia']);
export const FRUIT_IDS = deepFreeze(Object.keys(FRUIT_TYPES));
export const PHASES = deepFreeze(['waiting', 'countdown', 'playing', 'paused', 'interlude', 'finished']);
export const EVENT_KINDS = deepFreeze([
  'spawn', 'transfer', 'catch', 'reject', 'compost', 'order-complete',
  'gate-forecast', 'gust-forecast', 'gust-start', 'stage-complete', 'phase-change',
]);
