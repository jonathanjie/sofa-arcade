const TARGET = 40;
const ROUND_MS = 20_000;

function seededOrder(players, seed) {
  // FNV-1a gives each runner a stable order for tied distances at the time limit.
  const key = id => {
    let hash = 2166136261;
    for (const letter of `${seed}/${id}`) hash = Math.imul(hash ^ letter.codePointAt(0), 16777619);
    return hash >>> 0;
  };
  return players.map(({ id }) => id).sort((a, b) => key(a) - key(b) || a.localeCompare(b, 'en'));
}

export const tapRace = Object.freeze({
  id: 'tap-race',
  minPlayers: 2,
  maxPlayers: 16,
  durationMs: ROUND_MS,
  target: TARGET,
  createRound(players, seed) {
    return {
      order: seededOrder(players, seed),
      distances: Object.fromEntries(players.map(({ id }) => [id, 0])),
      elapsedMs: 0,
      winner: null,
    };
  },
  normalizeInput(input) {
    return input && Object.keys(input).length === 1 && input.kind === 'tap' ? { kind: 'tap' } : null;
  },
  step(state, inputs, dt) {
    if (state.winner || state.elapsedMs >= ROUND_MS) return state;
    const distances = { ...state.distances };
    let winner = null;
    for (const { playerId, input } of inputs) {
      if (!Object.hasOwn(distances, playerId) || input.kind !== 'tap') continue;
      distances[playerId]++;
      if (distances[playerId] === TARGET) {
        winner = playerId;
        break;
      }
    }
    return { ...state, distances, winner, elapsedMs: state.elapsedMs + dt };
  },
  projectForPhone(state, playerId) {
    return { distance: state.distances[playerId], target: TARGET };
  },
  projectForTv(state) {
    return {
      target: TARGET,
      runners: Object.entries(state.distances).map(([playerId, distance]) => ({ playerId, distance })),
    };
  },
  isRoundOver(state) {
    return state.winner !== null || state.elapsedMs >= ROUND_MS;
  },
  scores(state) {
    return [...state.order]
      .sort((a, b) => state.distances[b] - state.distances[a])
      .map(playerId => ({ playerId, score: state.distances[playerId] }));
  },
});
