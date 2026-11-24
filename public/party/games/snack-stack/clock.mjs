import { PREVIEW_MS } from './cards.mjs';

// A receive timestamp contains time spent in transit. Keep the fastest
// observed sample per card to avoid making later packets reset the timer.
export function createCardClock() {
  let offset = -Infinity;
  return {
    reset() { offset = -Infinity; },
    sample(elapsed, localTime) {
      const measured = elapsed - PREVIEW_MS - localTime;
      // Reacquire after the host has discarded simulation ticks.
      if (offset - measured > 300) offset = measured;
      else offset = Math.max(offset, measured);
    },
    at(localTime) { return Math.round(localTime + offset); },
  };
}
