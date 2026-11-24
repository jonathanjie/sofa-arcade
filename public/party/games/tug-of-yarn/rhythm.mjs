// This public schedule is shared by the TV, phones and rules engine.
export const HEAT_MS = 38_000;
export const BREAK_MS = 2_000;
export const MATCH_MS = 3 * HEAT_MS + 2 * BREAK_MS;
export const WALL_CLOCK_ALLOWANCE_MS = 2_000;
export const RUSH_MS = 10_000;
// A 110 ms one-way path imbalance shifts a midpoint clock estimate by 55 ms.
export const PERFECT_MS = 60;
export const HIT_WINDOW_MS = 165;
export const DELIVERY_GRACE_MS = 250;

const FIRST_BEAT_MS = 1100;
const BASE_INTERVAL_MS = 800;
const FAST_INTERVAL_MS = 550;
const MAX_REMATCH_STEP = 2;
const MAX_DIFFICULTY = MAX_REMATCH_STEP + 2;
const TEMPO_STEP_MS = 50;

export function difficulty(gameRound, heat) {
  return Math.min(gameRound - 1, MAX_REMATCH_STEP) + heat - 1;
}

function schedule(level) {
  const base = BASE_INTERVAL_MS - 50 * level;
  const fast = Math.max(450, FAST_INTERVAL_MS - 25 * level);
  const beats = [];
  const rushStart = HEAT_MS - RUSH_MS;
  for (let at = FIRST_BEAT_MS; at + HIT_WINDOW_MS + DELIVERY_GRACE_MS <= HEAT_MS;) {
    beats.push(at);
    const rush = Math.max(0, (at - rushStart) / RUSH_MS);
    const steps = (base - fast) / TEMPO_STEP_MS;
    at += base - Math.round(rush * steps) * TEMPO_STEP_MS;
  }
  return Object.freeze(beats);
}

const SCHEDULES = Array.from({ length: MAX_DIFFICULTY + 1 }, (_, level) => schedule(level));
export const beatsFor = level => SCHEDULES[level];
export const BEATS = beatsFor(0);

/** Find the closest beat, preferring the earlier one at the midpoint. */
export function closestBeat(elapsedMs, beats) {
  let low = 0;
  let high = beats.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (elapsedMs > (beats[middle] + beats[middle + 1]) / 2) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function timingGrade(errorMs) {
  if (errorMs <= PERFECT_MS) return 'Perfect';
  return errorMs <= HIT_WINDOW_MS ? 'Good' : 'Miss';
}

export const TEAMS = Object.freeze([
  Object.freeze({ name: 'Mint', colour: '#8de4cf', dark: '#164d49' }),
  Object.freeze({ name: 'Honey', colour: '#ffcc73', dark: '#6c3729' }),
]);
