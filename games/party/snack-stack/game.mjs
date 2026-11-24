import { CHALLENGES, makeSchedule } from './schedule.mjs';
import { EXACT_TAP_TARGET, PLAY_MS, PREVIEW_MS, REVEAL_MS, SLOT_MS, slotPhase } from '../../../ui/party/games/snack-stack/cards.mjs';

const MAX_INPUT_LAG_MS = 450;
const MAX_INPUT_LEAD_MS = 100;
// The platform can discard simulation ticks after short scheduler gaps.
const STALL_RESERVE_MS = 6000;
const EMPTY_ATTEMPT = Object.freeze({ count: 0, misses: 0, mark: null, finish: null });
const SIMPLE_KINDS = new Set(['tap', 'down', 'up', 'cancel', 'trace-end']);

function integer(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function normalizeInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (Object.keys(input).length !== 4) return null;
  const { kind, slot, at, value } = input;
  if (!integer(slot, 0, CHALLENGES.length - 1) || !integer(at, 0, PLAY_MS - 1)) return null;
  if (kind === 'point' || kind === 'trace-start') {
    if (!Array.isArray(value) || value.length !== 2 || !integer(value[0], 0, 100) || !integer(value[1], 0, 100)) return null;
    return { kind, slot, at, value: [...value] };
  }
  if (kind === 'choose' && integer(value, 0, 8)) return { kind, slot, at, value };
  if (kind === 'axis' && integer(value, -100, 100)) return { kind, slot, at, value };
  if (SIMPLE_KINDS.has(kind) && value === 0) return { kind, slot, at, value: 0 };
  return null;
}

function currentSlot(state) {
  const index = Math.min(Math.floor(state.elapsed / SLOT_MS), state.slots.length - 1);
  const { card, variant } = state.slots[index];
  return { index, card, variant, elapsed: state.elapsed - index * SLOT_MS, challenge: CHALLENGES[card] };
}

function isRoundOver(state) {
  return state.elapsed >= state.slots.length * SLOT_MS;
}

function multiplier(index) {
  return (index + 1) % 4 === 0 ? 2 : 1;
}

function grade(attempt, challenge) {
  return attempt.points ?? Math.max(0, challenge.score(attempt));
}

function step(state, inputs, dt, { departures = [] } = {}) {
  if (isRoundOver(state)) return state;
  const { index, elapsed, challenge, variant } = currentSlot(state);
  const nextElapsed = elapsed + dt;
  const now = elapsed - PREVIEW_MS;
  const acceptsInput = elapsed >= PREVIEW_MS && elapsed < REVEAL_MS;
  const settle = elapsed < REVEAL_MS && nextElapsed >= REVEAL_MS;
  const advance = nextElapsed >= SLOT_MS && index + 1 < state.slots.length;
  let players = state.players;
  if (departures.length) {
    players = { ...players };
    for (const { playerId } of departures) delete players[playerId];
  }
  if (acceptsInput && inputs.length) {
    if (players === state.players) players = { ...players };
    for (const { playerId, input } of inputs) {
      if (!Object.hasOwn(players, playerId) || input.slot !== index) continue;
      const player = players[playerId];
      const attempt = player.attempt;
      if (attempt.finish !== null || input.at < (attempt.last ?? 0)) continue;
      if (input.at < now - MAX_INPUT_LAG_MS || input.at > now + MAX_INPUT_LEAD_MS) continue;
      const updated = challenge.input(attempt, input, variant, state.difficulty);
      if (updated !== attempt) players[playerId] = { ...player, attempt: { ...updated, last: input.at } };
    }
  }
  if (settle) {
    players = Object.fromEntries(Object.entries(players).map(([id, player]) => {
      const gain = grade(player.attempt, challenge) * multiplier(index);
      return [id, { ...player, total: player.total + gain, gain }];
    }));
  }
  if (advance) {
    players = Object.fromEntries(Object.entries(players).map(([id, player]) => [
      id, { ...player, gain: 0, attempt: EMPTY_ATTEMPT },
    ]));
  }
  return { ...state, elapsed: state.elapsed + dt, players };
}

export const snackStack = Object.freeze({
  id: 'snack-stack',
  minPlayers: 2,
  maxPlayers: 16,
  durationMs: CHALLENGES.length * SLOT_MS + STALL_RESERVE_MS,
  createRound(players, seed, gameRound = 1, { startsAt } = {}) {
    return {
      slots: makeSchedule(seed),
      elapsed: 0,
      startsAt,
      difficulty: Math.min(2, Math.max(0, gameRound - 1)),
      players: Object.fromEntries(players.map(({ id }) => [id, { total: 0, gain: 0, attempt: EMPTY_ATTEMPT }])),
    };
  },
  normalizeInput,
  step,
  isRoundOver,
  scores(state) {
    return Object.entries(state.players).map(([playerId, player]) => ({ playerId, score: player.total }))
      .sort((a, b) => b.score - a.score);
  },
  projectForPhone(state, playerId, { tickAt = state.startsAt === undefined ? undefined : state.startsAt + state.elapsed } = {}) {
    if (!Object.hasOwn(state.players, playerId)) return null;
    const { index, card, variant, elapsed, challenge } = currentSlot(state);
    const { attempt, gain, total } = state.players[playerId];
    const view = { i: index, c: card, t: elapsed, n: attempt.count, d: Number(attempt.finish !== null) };
    if (challenge.phoneVariant) view.v = variant;
    if (elapsed >= REVEAL_MS) {
      view.g = gain;
      view.s = total;
    } else if (Number.isFinite(tickAt)) {
      view.a = Math.round(tickAt - elapsed + PREVIEW_MS);
      if (state.difficulty && challenge.timing) view.b = state.difficulty;
    }
    return view;
  },
  projectForTv(state) {
    const { index, card, variant, elapsed, challenge } = currentSlot(state);
    const phase = slotPhase(elapsed);
    return {
      index, card, variant, elapsed, phase, multiplier: multiplier(index), difficulty: state.difficulty,
      nextCard: state.slots[index + 1]?.card,
      players: Object.entries(state.players).map(([id, { attempt, total, gain }]) => ({
        id, total, gain,
        done: phase === 'score' || attempt.finish !== null
          || (challenge.id === 'exact-seven' && attempt.count === EXACT_TAP_TARGET),
      })),
    };
  },
});
