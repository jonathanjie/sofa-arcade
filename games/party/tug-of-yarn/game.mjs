import {
  BEATS, BREAK_MS, DELIVERY_GRACE_MS, HEAT_MS, HIT_WINDOW_MS, MATCH_MS, PERFECT_MS, closestBeat,
} from '../../../ui/party/games/tug-of-yarn/rhythm.mjs';

const PERFECT_PULL = 1000;
const EDGE_PULL = 250;
const WIN_LINE = 9 * PERFECT_PULL;
const UNITY_WINDOW_MS = 110;
const CLOCK_LEAD_MS = 100;
const RESOLVE_AFTER_MS = HIT_WINDOW_MS + DELIVERY_GRACE_MS;
// The first simulation tick can trail the platform's wall-clock countdown.
const WALL_CLOCK_ALLOWANCE_MS = 2000;

function seededOrder(players, seed) {
  function key(id) {
    let hash = 2166136261;
    for (const letter of `${seed}/${id}`) hash = Math.imul(hash ^ letter.codePointAt(0), 16777619);
    return hash >>> 0;
  }
  return players.map(({ id }) => id).sort((first, second) => key(first) - key(second) || first.localeCompare(second, 'en'));
}

function accuracy(error) {
  if (error <= PERFECT_MS) return PERFECT_PULL;
  const ratio = (error - PERFECT_MS) / (HIT_WINDOW_MS - PERFECT_MS);
  return PERFECT_PULL - Math.round((PERFECT_PULL - EDGE_PULL) * ratio);
}

function teamPull(hits) {
  const ordered = hits.sort((first, second) => first.at - second.at || first.id.localeCompare(second.id, 'en'));
  let strongest = { total: 0, ids: [] };
  for (const [start, first] of ordered.entries()) {
    let end = start;
    let total = 0;
    while (end < ordered.length && ordered[end].at - first.at <= UNITY_WINDOW_MS) {
      total += ordered[end].accuracy;
      end++;
    }
    if (total > strongest.total || (total === strongest.total && end - start > strongest.ids.length)) {
      strongest = { total, ids: ordered.slice(start, end).map(({ id }) => id) };
    }
  }
  return strongest;
}

function collectTaps(state, inputs) {
  if (!inputs.length) return state.pending;
  const pending = { ...state.pending };
  for (const { playerId, input } of inputs) {
    if (!Object.hasOwn(state.teams, playerId) || input.kind !== 'tap' || input.at > state.elapsedMs + CLOCK_LEAD_MS) continue;
    const relative = input.at - state.heatStart;
    const beat = closestBeat(relative);
    const error = Math.abs(relative - BEATS[beat]);
    if (beat <= state.lastBeat || error > HIT_WINDOW_MS) continue;
    const taps = pending[beat];
    if (!taps || !Object.hasOwn(taps, playerId)) pending[beat] = { ...taps, [playerId]: input.at };
  }
  return pending;
}

function resolveBeat(state, beat) {
  const pending = { ...state.pending };
  const beatMs = state.heatStart + BEATS[beat];
  const hits = [[], []];
  for (const [id, at] of Object.entries(pending[beat] ?? {})) {
    hits[state.teams[id]].push({ id, at, accuracy: accuracy(Math.abs(at - beatMs)) });
  }
  delete pending[beat];
  const teams = hits.map(teamPull);
  // Use a common denominator so, for example, 3/3 and 4/4 cancel exactly.
  const [mint, honey] = state.sizes.map(size => Math.max(1, size));
  const delta = teams[1].total * mint - teams[0].total * honey;
  const marker = Math.max(-state.line, Math.min(state.line, state.marker + delta));
  return { ...state, pending, lastBeat: beat, marker, beatResult: teams };
}

function startHeat(state) {
  return {
    ...state, heat: state.heat + 1, heatStart: state.breakUntil, breakUntil: null, heatWinner: null,
    marker: 0, lastBeat: -1, beatResult: null, pending: {},
  };
}

function endHeat(state) {
  const heatWinner = state.marker === 0 ? null : Number(state.marker > 0);
  const wins = state.wins.map((score, team) => score + Number(team === heatWinner));
  const finished = wins.includes(2) || state.heat === 3;
  return {
    ...state, wins, heatWinner, finished, pending: {},
    breakUntil: finished ? null : state.elapsedMs + BREAK_MS,
  };
}

export const tugOfYarn = Object.freeze({
  id: 'tug-of-yarn',
  minPlayers: 2,
  maxPlayers: 16,
  durationMs: MATCH_MS + WALL_CLOCK_ALLOWANCE_MS,
  createRound(players, seed) {
    const order = seededOrder(players, seed);
    const teams = Object.fromEntries(order.map((id, index) => [id, index % 2]));
    const sizes = [Math.ceil(order.length / 2), Math.floor(order.length / 2)];
    const line = WIN_LINE * Math.max(1, sizes[0]) * Math.max(1, sizes[1]);
    return {
      order, teams, sizes, line, wins: [0, 0], elapsedMs: 0, heat: 1, heatStart: 0,
      breakUntil: null, heatWinner: null, lastBeat: -1, beatResult: null, pending: {},
      marker: 0, finished: false,
    };
  },
  normalizeInput(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 2
      || !Object.hasOwn(input, 'kind') || !Object.hasOwn(input, 'at') || input.kind !== 'tap'
      || !Number.isInteger(input.at) || input.at < 0 || input.at > MATCH_MS) return null;
    return { kind: 'tap', at: input.at + 0 };
  },
  step(state, inputs, dt) {
    if (state.finished) return state;
    const elapsedMs = state.elapsedMs + dt;
    if (state.breakUntil !== null) {
      const next = { ...state, elapsedMs };
      return elapsedMs >= state.breakUntil ? startHeat(next) : next;
    }
    let next = { ...state, elapsedMs, pending: collectTaps(state, inputs) };
    const beat = state.lastBeat + 1;
    if (elapsedMs >= state.heatStart + BEATS[beat] + RESOLVE_AFTER_MS) next = resolveBeat(next, beat);
    if (Math.abs(next.marker) === next.line || elapsedMs >= next.heatStart + HEAT_MS) return endHeat(next);
    return next;
  },
  projectForPhone(state, playerId) {
    if (!Object.hasOwn(state.teams, playerId)) return null;
    // Short keys leave room for the envelope and 12 four-byte name characters.
    return { b: state.teams[playerId], t: state.elapsedMs, s: state.breakUntil ?? state.heatStart };
  },
  projectForTv(state) {
    const { wins, teams, beatResult } = state;
    const winner = wins[0] === wins[1] ? null : Number(wins[1] > wins[0]);
    return {
      teams: Object.entries(teams).map(([playerId, team]) => ({ playerId, team })),
      t: state.elapsedMs, heat: state.heat, heatStart: state.heatStart, breakUntil: state.breakUntil,
      heatWinner: state.heatWinner, position: state.marker / state.line, wins,
      winner: state.finished ? winner : null, beat: state.lastBeat,
      unity: state.sizes.map((size, team) => (beatResult?.[team].ids.length ?? 0) / Math.max(1, size)),
      pull: state.sizes.map((size, team) => (beatResult?.[team].total ?? 0) / (Math.max(1, size) * PERFECT_PULL)),
      hits: beatResult?.flatMap(team => team.ids) ?? [],
    };
  },
  isRoundOver(state) { return state.finished; },
  scores(state) {
    return state.order.map(playerId => ({ playerId, score: state.wins[state.teams[playerId]] }))
      .sort((first, second) => second.score - first.score);
  },
});
