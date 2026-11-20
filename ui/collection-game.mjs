/** Shared lifecycle bridge for a projected, server-authoritative collection view. */
const STATES = new Set(['connecting', 'connected', 'reconnecting', 'offline', 'error']);

export function connectionStatus(value) {
  const state = typeof value === 'string' ? value : value?.state;
  return {
    state: STATES.has(state) ? state : 'reconnecting',
    ...(typeof value?.message === 'string' ? { message: value.message } : {}),
  };
}

/**
 * The component owns rendering; this bridge owns the command client and teardown.
 * It never imports an authority engine, predicts a vote, or constructs a viewer
 * from room data. The shell supplies the seat it authenticated at join time.
 */
export function createCollectionGame({
  root, mount, createRoomClient, viewer, code, token, initialRoom,
  rules, assets, sound, preferences, fetcher,
  onRoom = () => {}, onStatus = () => {}, onExit, onHelp,
}) {
  if (!['host', 'public', 'player'].includes(viewer?.role) ||
      (viewer.role === 'player' && !['jon', 'lydia'].includes(viewer.playerId))) {
    throw new TypeError('An authenticated viewer is required.');
  }
  if (typeof mount !== 'function') throw new TypeError('A game view is required.');
  let disposed = false;
  let initializing = true;
  let client = null;
  let view = null;
  let room = initialRoom;
  let status = { state: 'connecting' };
  const sameRoom = next => next?.code === code && Number.isSafeInteger(next.revision) &&
    (!room || next.revision >= room.revision) && (!room?.gameId || next.gameId === room.gameId);

  function setConnection(next) {
    if (disposed) return;
    status = connectionStatus(next);
    view?.setConnection(status);
    onStatus(status);
  }

  function update(next) {
    if (disposed || !sameRoom(next)) return;
    room = next;
    view?.update(next);
  }

  function accept(next) {
    if (disposed || !sameRoom(next)) return;
    update(next);
    if (!initializing) onRoom(next);
  }

  const guardedSound = {
    unlock: () => disposed ? Promise.resolve(false) : sound?.unlock?.(),
    setScene: scene => { if (!disposed) sound?.setScene?.(scene); },
    effect: name => { if (!disposed) sound?.effect?.(name); },
  };

  if (viewer.role === 'player') {
    if (!token || typeof createRoomClient !== 'function') throw new TypeError('A joined controller is required.');
    client = createRoomClient({
      code, token, playerId: viewer.playerId, initialRoom,
      ...(fetcher ? { fetcher } : {}), onRoom: accept, onStatus: setConnection,
    });
  }

  try {
    view = mount(root, {
      viewer: Object.freeze({ ...viewer }),
      dispatch(action) {
        // This call is synchronous with the view's click/keyboard handler. Do
        // not move unlocking behind an awaited HTTP request or module import.
        guardedSound.unlock();
        if (disposed) return Promise.reject(new Error('This controller has closed.'));
        if (!client) return Promise.reject(new Error('Use a joined phone to choose an action.'));
        return client.submit(action);
      },
      rules, assets, sound: guardedSound, preferences,
      onExit: () => { if (!disposed) onExit?.(); },
      onHelp: () => { if (!disposed) onHelp?.(); },
    });
    if (!view || typeof view.update !== 'function' || typeof view.setConnection !== 'function' || typeof view.dispose !== 'function') {
      throw new TypeError('The game view does not implement its lifecycle contract.');
    }
    if (room) view.update(room);
    view.setConnection(status);
    initializing = false;
  } catch (error) {
    disposed = true;
    client?.dispose();
    view?.dispose?.();
    throw error;
  }

  return Object.freeze({
    update,
    receive(next) {
      if (disposed || !sameRoom(next)) return;
      if (client) client.receive(next);
      else accept(next);
    },
    setConnection,
    dispose() {
      if (disposed) return;
      disposed = true;
      client?.dispose();
      view.dispose();
    },
  });
}
