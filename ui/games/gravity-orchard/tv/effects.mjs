const CUES = Object.freeze({ catch: 'catch', reject: 'reject', compost: 'compost', 'order-complete': 'order', 'gate-forecast': 'forecast', 'gust-forecast': 'forecast', 'stage-complete': 'finish' });

/** Bounded event identity ledger. Initial/reconnected history is consumed silently. */
export function createEventCursor({ limit = 2048 } = {}) {
  let matchId = null, epoch = null, floorTick = -1;
  const seen = new Map();
  return {
    consume(view, { silent = false } = {}) {
      const newMatch = matchId !== view.matchId;
      if (newMatch) { seen.clear(); floorTick = -1; matchId = view.matchId; }
      if (epoch !== view.runEpoch) { epoch = view.runEpoch; floorTick = -1; }
      const fresh = [];
      for (const event of view.events) {
        if (seen.has(event.id) || event.tick <= floorTick) continue;
        seen.set(event.id, { tick: event.tick, epoch });
        if (!silent && !newMatch) fresh.push(event);
      }
      while (seen.size > Math.max(64, limit)) {
        const [id, entry] = seen.entries().next().value;
        seen.delete(id); if (entry.epoch === epoch) floorTick = Math.max(floorTick, entry.tick);
      }
      return fresh;
    },
    clear() { matchId = null; epoch = null; floorTick = -1; seen.clear(); },
  };
}

export function effectName(event) { return CUES[event.kind] ?? null; }
export function sceneName(view) {
  if (!view || view.phase === 'waiting' || view.phase === 'countdown') return view?.mode === 'practice' ? 'practice' : 'menu';
  if (view.phase === 'paused') return 'paused';
  if (view.phase === 'interlude' || view.phase === 'finished') return 'celebrate';
  return view.mode === 'practice' ? 'practice' : `stage${view.stageIndex + 1}`;
}
