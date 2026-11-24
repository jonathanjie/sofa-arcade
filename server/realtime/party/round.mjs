export const PARTY_TICK_MS = 50;
export const PARTY_COUNTDOWN_MS = 3000;
const MAX_CATCH_UP_TICKS = 5;
const INTERRUPT_MS = 1000;

export const isActive = phase => phase === 'countdown' || phase === 'playing';

export function advancePartyClock(elapsed, previousRemainder) {
  if (elapsed > INTERRUPT_MS) return { ticks: 0, remainder: 0, interrupted: true };
  const accumulated = elapsed + previousRemainder;
  return {
    ticks: Math.min(MAX_CATCH_UP_TICKS, Math.floor(accumulated / PARTY_TICK_MS)),
    remainder: accumulated % PARTY_TICK_MS,
    interrupted: false,
  };
}

export function startRound(room, now, seed) {
  const players = [...room.seats.values()].filter(seat => seat.ready && seat.connection);
  if (players.length < room.game.minPlayers) return false;
  const roster = players.slice(0, room.game.maxPlayers).map(({ id, name, look }) => ({ id, name, look }));
  room.round++;
  room.gameRound++;
  const startsAt = now + PARTY_COUNTDOWN_MS;
  const match = {
    roomRound: room.round,
    gameId: room.game.id,
    startsAt,
    previousResults: room.previousResults.map(result => ({ ...result })),
  };
  room.activeRound = {
    roster,
    players: new Set(roster.map(({ id }) => id)),
    state: room.game.createRound(roster, seed, room.gameRound, match),
    inputs: [],
    departures: [],
    previousAt: now,
    remainder: 0,
    startsAt,
    endsAt: startsAt + room.game.durationMs,
    results: [],
  };
  room.notice = null;
  room.phase = 'countdown';
  return true;
}

function finishRound(room, notice) {
  const round = room.activeRound;
  const ranked = room.game.scores(round.state).filter(entry => room.seats.has(entry.playerId));
  // Scores are returned in game-defined rank order. Equal scores share a place.
  round.results = ranked.map(({ playerId, score }) => ({
    playerId,
    score,
    place: ranked.findIndex(entry => entry.score === score) + 1,
  }));
  room.previousResults = round.results;
  round.inputs.length = 0;
  room.phase = 'results';
  room.notice = notice;
}

export function tickRound(room, now) {
  if (!isActive(room.phase)) return;
  const round = room.activeRound;
  const elapsed = now - round.previousAt;
  round.previousAt = now;
  if (elapsed > INTERRUPT_MS) {
    round.inputs.length = 0;
    room.activeRound = null;
    room.phase = 'lobby';
    room.notice = 'host_stall';
    return;
  }
  let elapsedPlaying = elapsed;
  if (room.phase === 'countdown') {
    if (now < round.startsAt) return;
    room.phase = 'playing';
    elapsedPlaying = now - round.startsAt;
  }
  const { ticks, remainder } = advancePartyClock(elapsedPlaying, round.remainder);
  round.remainder = remainder;
  const lastElapsedMs = Math.round((now - round.startsAt - remainder) / PARTY_TICK_MS) * PARTY_TICK_MS;
  for (let tick = 0; tick < ticks; tick++) {
    const inputs = round.inputs.splice(0);
    const departures = round.departures.splice(0);
    // Keep rhythm schedules on the host clock even when catch-up drops ticks.
    const elapsedMs = lastElapsedMs - (ticks - tick - 1) * PARTY_TICK_MS;
    round.state = room.game.step(round.state, inputs, PARTY_TICK_MS, { departures, elapsedMs });
    if (room.game.isRoundOver(round.state)) {
      finishRound(room, null);
      return;
    }
  }
  if (now >= round.endsAt) finishRound(room, 'time_limit');
}

export function remainingMs(room, now) {
  if (room.phase === 'countdown') return Math.max(0, room.activeRound.startsAt - now);
  if (room.phase === 'playing') return Math.max(0, room.activeRound.endsAt - now);
  return 0;
}
