/** Hand-authored, public-only presentation fixture. This is not a game engine. */
const recipes = [
  { id: 'apple-picnic', needs: { apple: 2, plum: 0, pear: 1, starfruit: 0 } },
  { id: 'plum-picnic', needs: { apple: 0, plum: 2, pear: 0, starfruit: 1 } },
  { id: 'sunlit-mix', needs: { apple: 1, plum: 0, pear: 1, starfruit: 1 } },
  { id: 'moonlit-mix', needs: { apple: 0, plum: 1, pear: 1, starfruit: 1 } },
];

export function publicView({ phase = 'waiting', stageIndex = 0, runEpoch = 1, tick = 0, mode = 'campaign', ...overrides } = {}) {
  return {
    gameId: 'gravity-orchard', schemaVersion: 1,
    matchId: 'go3-public-fixture', runEpoch, tick, phase, mode, stageIndex,
    levelId: ['morning-delivery', 'switchback-grove', 'moonlight-picnic'][stageIndex],
    timeRemainingTicks: mode === 'practice' ? null : 5400,
    countdownTicks: phase === 'countdown' ? 180 : 0,
    ready: { jon: false, lydia: false },
    pauseReason: phase === 'paused' ? 'requested' : null,
    fruits: [
      { id: 'fixture-apple', type: 'apple', x: 280, y: 320, vx: 0, vy: 0, radius: 14 },
      { id: 'fixture-pear', type: 'pear', x: 980, y: 360, vx: 0, vy: 0, radius: 14 },
    ],
    baskets: {
      apple: { count: 1, capacity: 3 }, plum: { count: 0, capacity: 3 },
      pear: { count: 0, capacity: 3 }, starfruit: { count: 1, capacity: 3 },
    },
    orders: { recipes: structuredClone(recipes), activeIndex: 0, completedIds: [] },
    gateStates: [], gust: null,
    players: {
      jon: { input: { x: 0, y: 0, brake: true } },
      lydia: { input: { x: 0, y: 0, brake: true } },
    },
    results: phase === 'finished'
      ? [0, 1, 2].map(index => ({ stageIndex: index, ordersCompleted: 4, composted: 0, stars: 3, elapsedTicks: 4800 }))
      : phase === 'interlude'
        ? [{ stageIndex, ordersCompleted: 3, composted: 2, stars: 2, elapsedTicks: 5400 }]
        : [],
    events: [],
    ...overrides,
  };
}
