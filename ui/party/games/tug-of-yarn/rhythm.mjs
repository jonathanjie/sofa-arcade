// This public schedule is shared by the TV, phones and rules engine.
export const HEAT_MS = 38_000;
export const BREAK_MS = 2_000;
export const MATCH_MS = 3 * HEAT_MS + 2 * BREAK_MS;
export const RUSH_MS = 10_000;
export const PERFECT_MS = 45;
export const HIT_WINDOW_MS = 150;
export const DELIVERY_GRACE_MS = 250;

const FIRST_BEAT_MS = 1100;
const BASE_INTERVAL_MS = 800;
const FAST_INTERVAL_MS = 550;
const TEMPO_STEP_MS = 50;

function schedule() {
  const beats = [];
  const rushStart = HEAT_MS - RUSH_MS;
  for (let at = FIRST_BEAT_MS; at + HIT_WINDOW_MS + DELIVERY_GRACE_MS <= HEAT_MS;) {
    beats.push(at);
    const rush = Math.max(0, (at - rushStart) / RUSH_MS);
    const steps = (BASE_INTERVAL_MS - FAST_INTERVAL_MS) / TEMPO_STEP_MS;
    at += BASE_INTERVAL_MS - Math.round(rush * steps) * TEMPO_STEP_MS;
  }
  return Object.freeze(beats);
}

export const BEATS = schedule();

/** Find the closest beat, preferring the earlier one at the midpoint. */
export function closestBeat(elapsedMs) {
  let low = 0;
  let high = BEATS.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (elapsedMs > (BEATS[middle] + BEATS[middle + 1]) / 2) low = middle + 1;
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

/** Align a local monotonic clock with match time using the least-delayed recent tick. */
export function createBeatClock() {
  const samples = [];
  const sampleCount = 5;
  let offset = 0;
  return {
    sync(elapsed, receivedAt, halfTrip = 0) {
      samples.push(receivedAt - elapsed);
      if (samples.length > sampleCount) samples.shift();
      offset = Math.min(...samples) - halfTrip;
    },
    elapsed(at) { return at - offset; },
    reset() { samples.length = 0; offset = 0; },
  };
}
