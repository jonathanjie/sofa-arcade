import { readPublicView } from './public-view.mjs';

/** Interpolate only known positions. All non-position fields are the newest projection. */
export function createPresentationTimeline({ now = () => globalThis.performance?.now?.() ?? Date.now(), delayMs = 75, staleMs = 750 } = {}) {
  const delay = Number.isFinite(delayMs) ? Math.min(150, Math.max(0, delayMs)) : 75;
  const staleAfter = Number.isFinite(staleMs) ? Math.max(250, staleMs) : 750;
  let frames = [], latest = null, receivedAt = 0, stopped = false, frozen = false;
  const retiredMatches = new Set();
  function push(raw) {
    if (stopped) return { accepted: false, reason: 'disposed' };
    const view = readPublicView(raw);
    if (!view) return { accepted: false, reason: 'invalid-view' };
    if (retiredMatches.has(view.matchId)) return { accepted: false, reason: 'old-match' };
    const sameMatch = latest?.matchId === view.matchId;
    // A durable recovery can roll back several seconds, but must fence the old epoch.
    if (sameMatch && (view.runEpoch < latest.runEpoch || (view.runEpoch === latest.runEpoch && view.tick < latest.tick))) return { accepted: false, reason: 'old-frame' };
    const reset = !sameMatch || view.runEpoch !== latest?.runEpoch || view.levelId !== latest?.levelId || view.phase !== latest?.phase || frozen;
    if (latest && !sameMatch) {
      retiredMatches.add(latest.matchId);
      // Presentation is subordinate to GO2's stream fencing; bound a very long mount.
      if (retiredMatches.size > 128) retiredMatches.delete(retiredMatches.values().next().value);
    }
    const at = now();
    if (reset) frames = [];
    // Repeated 20 Hz pause/waiting snapshots refresh receipt health, but not a trajectory.
    if (frames.at(-1)?.view.tick === view.tick) frames[frames.length - 1] = { view, at };
    else frames.push({ view, at });
    if (frames.length > 12) frames.shift();
    latest = view; receivedAt = at; frozen = false;
    return { accepted: true, reset, view };
  }
  function sample(at = now()) {
    if (stopped || !latest) return { view: null, fruits: [], stale: true, ageMs: Infinity, interpolating: false };
    const ageMs = Math.max(0, Number.isFinite(at) ? at - receivedAt : 0);
    const stale = frozen || ageMs > staleAfter;
    if (frozen || latest.phase !== 'playing' || frames.length < 2) return { view: latest, fruits: latest.fruits.map(fruit => ({ ...fruit })), stale, ageMs, interpolating: false };
    const targetTick = Math.min(latest.tick, latest.tick + (Math.min(ageMs, delay) - delay) * 60 / 1000);
    let before = frames[0].view, after = latest;
    for (let i = 1; i < frames.length; i += 1) {
      if (frames[i].view.tick >= targetTick) { after = frames[i].view; before = frames[i - 1].view; break; }
      before = frames[i].view;
    }
    const span = after.tick - before.tick;
    const weight = span > 0 ? Math.max(0, Math.min(1, (targetTick - before.tick) / span)) : 1;
    const oldFruits = new Map(before.fruits.map(fruit => [fruit.id, fruit]));
    const nextFruits = new Map(after.fruits.map(fruit => [fruit.id, fruit]));
    // Membership/type/radius always come from latest; catches disappear immediately.
    const fruits = latest.fruits.map(fruit => {
      const a = oldFruits.get(fruit.id), b = nextFruits.get(fruit.id);
      if (!a || !b || a.type !== fruit.type || b.type !== fruit.type) return { ...fruit };
      return { ...fruit, x: a.x + (b.x - a.x) * weight, y: a.y + (b.y - a.y) * weight };
    });
    return { view: latest, fruits, stale, ageMs, interpolating: weight < 1 && span > 0 };
  }
  return {
    push, sample,
    freeze() { if (!stopped) { frozen = true; frames = latest ? [{ view: latest, at: receivedAt }] : []; } },
    clear() { frames = []; latest = null; receivedAt = 0; frozen = false; retiredMatches.clear(); },
    dispose() { stopped = true; frames = []; latest = null; retiredMatches.clear(); },
  };
}
