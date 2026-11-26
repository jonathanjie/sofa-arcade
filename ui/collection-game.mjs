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
  let viewEpoch = 0;
  let viewPreferences = Object.freeze({ ...preferences });
  let room = initialRoom;
  let status = { state: 'connecting' };
  let needsRecovery = false;
  let recovery = null;
  let recoveryBlocked = null;
  const sameRoom = next => next?.code === code && Number.isSafeInteger(next.revision) &&
    (!room || next.revision >= room.revision) && (!room?.gameId || next.gameId === room.gameId);

  function applyStatus(next) {
    if (disposed) return status;
    const normalized = connectionStatus(next);
    if (status.state === normalized.state && status.message === normalized.message) return status;
    status = normalized;
    view?.setConnection(status);
    onStatus(status);
    return status;
  }

  function pendingStatus() {
    return recovery
      ? { state: 'reconnecting', message: 'Confirming your last action…' }
      : { state: 'offline', message: 'Waiting to confirm your last action.' };
  }

  function clientStatus(next) {
    if (recoveryBlocked) return applyStatus(recoveryBlocked);
    // SSE can deliver the committed result while every POST acknowledgment is
    // lost. That proves a fresh board arrived, not that the client's retained
    // command identity has been resolved. Only reconnect() can close it.
    if (recovery || (needsRecovery && connectionStatus(next).state === 'connected')) return applyStatus(pendingStatus());
    return applyStatus(next);
  }

  function recoverCommand() {
    if (recovery || disposed) return;
    if (typeof client?.reconnect !== 'function') {
      recoveryBlocked = { state: 'error', message: 'Refresh this controller to confirm its last action.' };
      applyStatus(recoveryBlocked);
      return;
    }
    // Schedule after storing the promise so synchronous status callbacks from
    // reconnect cannot start a second recovery. The existing client retains
    // the original POST body/ID; the shell never recreates that command.
    recovery = Promise.resolve().then(() => disposed ? undefined : client.reconnect()).then(next => {
      if (disposed) return;
      needsRecovery = false;
      accept(next);
      applyStatus({ state: 'connected' });
    }, error => {
      if (disposed) return;
      needsRecovery = true;
      if ([401, 403, 404, 410].includes(error?.status) ||
          ['invalid_token', 'player_required', 'room_not_found', 'room_expired'].includes(error?.code)) {
        recoveryBlocked = { state: 'error', message: 'This controller session ended. Rejoin from the TV.' };
      }
      applyStatus(recoveryBlocked || { state: 'offline', message: 'Waiting to confirm your last action.' });
    }).finally(() => { recovery = null; });
    applyStatus(pendingStatus());
  }

  function setConnection(next) {
    if (disposed) return status;
    if (recoveryBlocked) return applyStatus(recoveryBlocked);
    if (needsRecovery && connectionStatus(next).state === 'connected') {
      recoverCommand();
      return applyStatus(recoveryBlocked || pendingStatus());
    }
    return applyStatus(next);
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

  if (viewer.role === 'player') {
    if (!token || typeof createRoomClient !== 'function') throw new TypeError('A joined controller is required.');
    client = createRoomClient({
      code, token, playerId: viewer.playerId, initialRoom,
      ...(fetcher ? { fetcher } : {}), onRoom: accept, onStatus: clientStatus,
    });
  }

  function mountView() {
    const epoch = ++viewEpoch;
    const active = () => !disposed && epoch === viewEpoch;
    const guardedSound = {
      unlock: () => active() ? sound?.unlock?.() : Promise.resolve(false),
      setScene: scene => { if (active()) sound?.setScene?.(scene); },
      effect: name => { if (active()) sound?.effect?.(name); },
    };
    view = mount(root, {
      viewer: Object.freeze({ ...viewer }),
      dispatch(action) {
        // This call is synchronous with the view's click/keyboard handler. Do
        // not move unlocking behind an awaited HTTP request or module import.
        guardedSound.unlock();
        if (!active()) return Promise.reject(new Error('This controller has closed.'));
        if (!client) return Promise.reject(new Error('Use a joined phone to choose an action.'));
        return Promise.resolve(client.submit(action)).then(next => {
          if (!disposed && needsRecovery && !recovery) {
            needsRecovery = false;
            applyStatus({ state: 'connected' });
          }
          return next;
        }, error => {
          if (!disposed && error?.code === 'unconfirmed_action') {
            needsRecovery = true;
            applyStatus(pendingStatus());
          }
          throw error;
        });
      },
      rules, assets, sound: guardedSound, preferences: viewPreferences,
      onExit: () => { if (active()) onExit?.(); },
      onHelp: () => { if (active()) onHelp?.(); },
    });
    if (!view || typeof view.update !== 'function' || typeof view.setConnection !== 'function' || typeof view.dispose !== 'function') {
      throw new TypeError('The game view does not implement its lifecycle contract.');
    }
    if (room) view.update(room);
    view.setConnection(status);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    viewEpoch++;
    client?.dispose();
    view?.dispose?.();
  }

  try {
    mountView();
    initializing = false;
  } catch (error) {
    dispose();
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
    setPreferences(next) {
      if (disposed || !next || typeof next !== 'object' ||
          Object.keys(next).every(key => viewPreferences[key] === next[key])) return false;
      viewPreferences = Object.freeze({ ...viewPreferences, ...next });
      if (view?.setReducedMotion && Object.keys(next).every(key => key === 'reducedMotion')) {
        view.setReducedMotion(viewPreferences.reducedMotion);
        return true;
      }
      // Other preferences are mount inputs. Keep the authenticated client and
      // acknowledged board if the adapter needs a new view.
      viewEpoch++;
      view?.dispose();
      view = null;
      try { mountView(); } catch (error) { dispose(); throw error; }
      return true;
    },
    dispose,
  });
}
