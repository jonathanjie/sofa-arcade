/** Immediate local feedback with ordered, authoritative server confirmation. */
export function createActionQueue({ room, playerId, apply, send, makeId, onView, onError = () => {} }) {
  let confirmed = room;
  let observed = room;
  let view = room;
  let pending = [];
  let draining = false;
  let disposed = false;
  const sameRoom = candidate => candidate && candidate.code === confirmed.code;
  const sameMatch = (left, right) => left.gameId === right.gameId && left.state?.seed === right.state?.seed;
  const newest = (left, right) => sameRoom(right) && right.revision > left.revision ? right : left;
  const emit = () => { if (!disposed) onView(view, pending.length); };

  function rebuild() {
    view = confirmed;
    for (const item of pending) {
      const next = apply(view.state, playerId, item.action);
      view = { ...view, state: next, phase: next.phase };
    }
  }

  async function drain() {
    if (draining || disposed) return;
    draining = true;
    try {
      while (pending.length && !disposed) {
        const item = pending[0];
        try {
          // Each request uses the revision acknowledged by the previous one.
          // A queued move never races its predecessor or invents a server revision.
          const reply = await send({ revision: confirmed.revision, actionId: item.id, action: item.action });
          if (disposed) return;
          if (!sameRoom(reply) || !Number.isSafeInteger(reply.revision) || reply.revision < confirmed.revision) {
            throw new Error('The room response was out of date. Reconnecting…');
          }
          const previous = confirmed;
          pending.shift();
          confirmed = newest(reply, observed);
          observed = confirmed;
          try {
            if (pending.length && !sameMatch(previous, confirmed)) {
              throw new Error('The next match has started.');
            }
            rebuild();
          }
          catch {
            // Another device may have acted after the acknowledged move.
            // Discard only unsent predictions that are no longer legal.
            pending = [];
            view = confirmed;
            onError(new Error('The board changed. Check your turn before your next move.'));
          }
          emit();
        } catch (error) {
          if (disposed) return;
          pending = [];
          confirmed = newest(confirmed, observed);
          view = confirmed;
          emit();
          onError(error);
        }
      }
    } finally { draining = false; }
  }

  return Object.freeze({
    dispatch(action) {
      if (disposed) throw new Error('Rejoin this controller to continue.');
      if (pending.length >= 4) throw new Error('Let your last moves catch up for a moment.');
      const next = apply(view.state, playerId, action);
      pending.push({ id: makeId(), action: structuredClone(action) });
      view = { ...view, state: next, phase: next.phase };
      emit();
      void drain();
    },
    receive(candidate) {
      if (disposed || !sameRoom(candidate) || !Number.isSafeInteger(candidate.revision)
        || candidate.revision < 0 || candidate.revision < confirmed.revision) return;
      // Reads may arrive before the POST response. Keep them as evidence without
      // replaying an in-flight action on a state that may already include it.
      observed = newest(observed, candidate);
      if (pending.length) return;
      confirmed = candidate;
      observed = candidate;
      view = candidate;
      emit();
    },
    get pendingCount() { return pending.length; },
    get confirmedRoom() { return confirmed; },
    dispose() { disposed = true; pending = []; },
  });
}
