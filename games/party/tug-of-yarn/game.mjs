import {
  BREAK_MS, DELIVERY_GRACE_MS, HEAT_MS, HIT_WINDOW_MS, MATCH_MS, PERFECT_MS, WALL_CLOCK_ALLOWANCE_MS, beatsFor, closestBeat, difficulty,
} from '../../../ui/party/games/tug-of-yarn/rhythm.mjs';

const PERFECT_PULL = 1000;
const EDGE_PULL = 250;
const UNITY_WINDOW_MS = 150;
const UNITY_STEP_MS = 5;
const CLOCK_LEAD_MS = 100;
const RESOLVE_AFTER_MS = HIT_WINDOW_MS + DELIVERY_GRACE_MS;

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

function teamPull(hits, windowMs) {
  const ordered = hits.sort((first, second) => first.at - second.at || first.id.localeCompare(second.id, 'en'));
  let strongest = { total: 0, ids: [] };
  for (const [start, first] of ordered.entries()) {
    let end = start;
    let total = 0;
    while (end < ordered.length && ordered[end].at - first.at <= windowMs) {
      total += ordered[end].accuracy;
      end++;
    }
    if (total > strongest.total || (total === strongest.total && end - start > strongest.ids.length)) {
      strongest = { total, ids: ordered.slice(start, end).map(({ id }) => id) };
    }
  }
  return strongest;
}

function collectTaps(state, inputs, beats, receiptFallback) {
  if (!inputs.length) return state.pending;
  const pending = { ...state.pending };
  for (const { playerId, input, receivedMs = receiptFallback } of inputs) {
    if (!Object.hasOwn(state.teams, playerId) || input.kind !== 'tap' || input.at > receivedMs + CLOCK_LEAD_MS) continue;
    const relative = input.at - state.heatStart;
    const beat = closestBeat(relative, beats);
    const beatAt = beats[beat] + state.heatStart;
    if (beat <= state.lastBeat || Math.abs(input.at - beatAt) > HIT_WINDOW_MS
      || receivedMs > beatAt + RESOLVE_AFTER_MS) continue;
    const taps = pending[beat];
    if (!taps || !Object.hasOwn(taps, playerId)) pending[beat] = { ...taps, [playerId]: input.at };
  }
  return pending;
}

function resolveBeat(state, beat, offset, level) {
  const pending = { ...state.pending };
  const beatMs = state.heatStart + offset;
  const hits = [[], []];
  for (const [id, at] of Object.entries(pending[beat] ?? {})) {
    hits[state.teams[id]].push({ id, at, accuracy: accuracy(Math.abs(at - beatMs)) });
  }
  delete pending[beat];
  const teams = hits.map(group => teamPull(group, UNITY_WINDOW_MS - level * UNITY_STEP_MS));
  // Use a common denominator so, for example, 3/3 and 4/4 cancel exactly.
  const [mint, honey] = state.sizes.map(size => Math.max(1, size));
  const delta = teams[1].total * mint - teams[0].total * honey;
  const marker = Math.max(-state.line, Math.min(state.line, state.marker + delta));
  return { ...state, pending, lastBeat: beat, marker, beatResult: teams };
}

function removeDeparted(state, departures) {
  if (!departures?.length) return state;
  const ids = new Set(departures.map(({ playerId }) => playerId));
  const teams = { ...state.teams };
  for (const id of ids) delete teams[id];
  const pending = Object.fromEntries(Object.entries(state.pending).map(([beat, taps]) => [
    beat, Object.fromEntries(Object.entries(taps).filter(([id]) => !ids.has(id))),
  ]));
  return { ...state, teams, pending, order: state.order.filter(id => !ids.has(id)) };
}

function startHeat(state) {
  return {
    ...state, heat: state.heat + 1, heatStart: state.breakUntil, breakUntil: null, heatWinner: null,
    marker: 0, lastBeat: -1, beatResult: null, pending: {},
  };
}

function endHeat(state, endedAt) {
  const heatWinner = state.marker === 0 ? null : Number(state.marker > 0);
  const wins = state.wins.map((score, team) => score + Number(team === heatWinner));
  const finished = wins.includes(2) || state.heat === 3;
  return {
    ...state, wins, heatWinner, finished, pending: {},
    breakUntil: finished ? null : endedAt + BREAK_MS,
  };
}

export const tugOfYarn = Object.freeze({
  id: 'tug-of-yarn',
  minPlayers: 2,
  maxPlayers: 16,
  durationMs: MATCH_MS + WALL_CLOCK_ALLOWANCE_MS,
  createRound(players, seed, gameRound = 1, { startsAt = 0 } = {}) {
    const order = seededOrder(players, seed);
    const teams = Object.fromEntries(order.map((id, index) => [id, index % 2]));
    const sizes = [Math.ceil(order.length / 2), Math.floor(order.length / 2)];
    // A duel needs fewer solo wins. Full teams get more room to recover from
    // a missed group pull while everyone learns the chant.
    const pullsToLine = order.length <= 2 ? 7 : order.length <= 8 ? 8 : 9;
    const line = pullsToLine * PERFECT_PULL * Math.max(1, sizes[0]) * Math.max(1, sizes[1]);
    return {
      order, teams, sizes, line, gameRound, startsAt: Math.round(startsAt), wins: [0, 0], elapsedMs: 0, heat: 1, heatStart: 0,
      breakUntil: null, heatWinner: null, lastBeat: -1, beatResult: null, pending: {},
      marker: 0, finished: false,
    };
  },
  normalizeInput(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 2
      || !Object.hasOwn(input, 'kind') || !Object.hasOwn(input, 'at') || input.kind !== 'tap'
      || !Number.isInteger(input.at) || input.at < 0 || input.at > MATCH_MS + WALL_CLOCK_ALLOWANCE_MS) return null;
    return { kind: 'tap', at: input.at + 0 };
  },
  step(state, inputs, dt, context) {
    if (state.finished) return state;
    const elapsedMs = context?.elapsedMs ?? state.elapsedMs + dt;
    let next = { ...removeDeparted(state, context?.departures), elapsedMs };
    if (next.breakUntil !== null) {
      if (elapsedMs < next.breakUntil) return next;
      next = startHeat(next);
    }
    const level = difficulty(next.gameRound, next.heat);
    const beats = beatsFor(level);
    next.pending = collectTaps(next, inputs, beats, state.elapsedMs);
    for (let beat = next.lastBeat + 1; beat < beats.length; beat++) {
      if (elapsedMs < next.heatStart + beats[beat] + RESOLVE_AFTER_MS) break;
      next = resolveBeat(next, beat, beats[beat], level);
      if (Math.abs(next.marker) === next.line) return endHeat(next, elapsedMs);
    }
    return elapsedMs >= next.heatStart + HEAT_MS ? endHeat(next, next.heatStart + HEAT_MS) : next;
  },
  projectForPhone(state, playerId) {
    if (!Object.hasOwn(state.teams, playerId)) return null;
    // Short keys leave room for the envelope and 12 four-byte name characters.
    const heat = state.heat + Number(state.breakUntil !== null);
    return { a: state.startsAt, b: state.teams[playerId], r: difficulty(state.gameRound, heat), s: state.breakUntil ?? state.heatStart };
  },
  projectForTv(state) {
    const { wins, teams, beatResult } = state;
    const winner = wins[0] === wins[1] ? null : Number(wins[1] > wins[0]);
    return {
      teams: Object.entries(teams).map(([playerId, team]) => ({ playerId, team })),
      t: state.elapsedMs, level: difficulty(state.gameRound, state.heat), heat: state.heat, heatStart: state.heatStart, breakUntil: state.breakUntil,
      heatWinner: state.heatWinner, position: state.marker / state.line, wins,
      winner: state.finished ? winner : null, beat: state.lastBeat,
      unity: state.sizes.map((size, team) => (beatResult?.[team].ids.length ?? 0) / Math.max(1, size)),
      pull: state.sizes.map((size, team) => (beatResult?.[team].total ?? 0) / (Math.max(1, size) * PERFECT_PULL)),
      hits: beatResult?.flatMap(team => team.ids.filter(id => Object.hasOwn(teams, id))) ?? [],
    };
  },
  isRoundOver(state) { return state.finished; },
  scores(state) {
    return state.order.map(playerId => ({ playerId, score: state.wins[state.teams[playerId]] }))
      .sort((first, second) => second.score - first.score);
  },
});
