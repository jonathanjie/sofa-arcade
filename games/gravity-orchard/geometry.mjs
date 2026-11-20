import { deepFreeze } from './catalog.mjs';

/** Geometry is the collision source of truth, in 1280 × 720 logical units. */
const common = () => ({
  bounds: { x: 0, y: 0, width: 1280, height: 720 },
  trays: [
    { id: 'jon', bounds: { x: 40, y: 100, width: 520, height: 520 } },
    { id: 'lydia', bounds: { x: 720, y: 100, width: 520, height: 520 } },
  ],
  baskets: [
    { id: 'apple', fruitType: 'apple', owner: 'jon', x: 260, y: 210, radius: 34 },
    { id: 'plum', fruitType: 'plum', owner: 'jon', x: 260, y: 510, radius: 34 },
    { id: 'pear', fruitType: 'pear', owner: 'lydia', x: 1020, y: 210, radius: 34 },
    { id: 'starfruit', fruitType: 'starfruit', owner: 'lydia', x: 1020, y: 510, radius: 34 },
  ],
  // Additive public authoring metadata. These are spawn positions, not teleports.
  spawnPoints: { jon: { x: 430, y: 360 }, lydia: { x: 850, y: 360 } },
});

export const LEVELS = deepFreeze({
  'morning-delivery': {
    id: 'morning-delivery',
    ...common(),
    bridge: { x: 540, y: 235, width: 200, height: 250 },
    bumpers: [
      { id: 'morning-left-stump', kind: 'circle', x: 300, y: 360, radius: 26 },
      { id: 'morning-right-stump', kind: 'circle', x: 980, y: 360, radius: 26 },
    ],
    compost: [],
    gates: [],
    gustSchedule: [],
  },
  'switchback-grove': {
    id: 'switchback-grove',
    ...common(),
    bridge: { x: 540, y: 270, width: 200, height: 180 },
    bumpers: [
      { id: 'switchback-left-hedge', kind: 'rect', x: 340, y: 270, width: 28, height: 160 },
      { id: 'switchback-right-hedge', kind: 'rect', x: 912, y: 270, width: 28, height: 160 },
    ],
    // The upper shortcut passes beside these holes. The lower passage is safe.
    compost: [
      { id: 'switchback-left-compost', x: 376, y: 195, width: 60, height: 25 },
      { id: 'switchback-right-compost', x: 844, y: 195, width: 60, height: 25 },
    ],
    gates: [
      { id: 'bridge-gate', x: 630, y: 270, width: 20, height: 180,
        schedule: { periodTicks: 540, openTicks: 360, forecastTicks: 120 } },
    ],
    gustSchedule: [],
  },
  'moonlight-picnic': {
    id: 'moonlight-picnic',
    ...common(),
    bridge: { x: 540, y: 270, width: 200, height: 180 },
    bumpers: [
      { id: 'moonlight-left-fern', kind: 'circle', x: 330, y: 360, radius: 26 },
      { id: 'moonlight-right-fern', kind: 'circle', x: 950, y: 360, radius: 26 },
      { id: 'moonlight-left-hedge', kind: 'rect', x: 150, y: 340, width: 70, height: 24 },
      { id: 'moonlight-right-hedge', kind: 'rect', x: 1060, y: 340, width: 70, height: 24 },
    ],
    compost: [
      { id: 'moonlight-left-compost', x: 390, y: 560, width: 110, height: 28 },
      { id: 'moonlight-right-compost', x: 780, y: 132, width: 110, height: 28 },
    ],
    gates: [],
    // Canonical directions. The authoritative seeded stage rotation is shown in PublicView.gust.
    gustSchedule: [
      { forecastTick: 1170, startTick: 1350, durationTicks: 90, x: 1, y: 0 },
      { forecastTick: 2520, startTick: 2700, durationTicks: 90, x: 0, y: 1 },
      { forecastTick: 3870, startTick: 4050, durationTicks: 90, x: -1, y: 0 },
    ],
  },
});

/** Throws for an unknown id rather than silently drawing a different stage. */
export function getLevel(id) {
  if (typeof id !== 'string' || !Object.hasOwn(LEVELS, id)) throw new RangeError('Unknown Gravity Orchard level.');
  return LEVELS[id];
}
