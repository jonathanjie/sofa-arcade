export function createCardClock(serverNow) {
  return {
    at(opensAt) {
      const now = serverNow();
      if (!Number.isFinite(now) || !Number.isFinite(opensAt)) return null;
      return Math.round(now - opensAt);
    },
  };
}
