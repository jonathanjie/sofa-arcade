/** Projected, server-authoritative commands. Never imports a private engine. */
const ROOM_CODE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;
const TOKEN = /^[A-Za-z0-9_-]{24,128}$/;
const PLAYERS = ['jon', 'lydia'];
const ERROR_TEXT = {
  disposed: 'This controller has closed. Rejoin the room to continue.',
  invalid_action: 'Choose a valid action from the current board.',
  stale_phase: 'That turn has ended. Choose an action from the current board.',
  stale_match: 'A new match has started. Choose an action from the current board.',
  stale_revision: 'The board changed. Check the current board before trying again.',
  future_revision: 'The controller needs the current board before acting.',
  invalid_revision: 'The controller needs the current board before acting.',
  action_id_reused: 'That request identity was already used. Reconnect the controller.',
  invalid_token: 'This controller session ended. Rejoin the room.',
  player_required: 'Join a player seat before taking an action.',
  room_not_found: 'This room could not be found. Rejoin from the TV.',
  room_expired: 'This room expired. Start a new room from the TV.',
  game_not_playing: 'Wait for the TV host to start the game.',
  already_committed: 'Your vote is sealed. Wait for the other player.',
  already_submitted: 'Your vote is sealed. Wait for the other player.',
  vote_locked: 'Your vote is sealed. Wait for the other player.',
  invalid_choice: 'Choose one of the offered council options.',
  invalid_bid: 'Choose a whole-number bid within your available influence.',
  insufficient_influence: 'That bid exceeds your available influence.',
  not_your_turn: 'Wait for your turn before taking this action.',
  insufficient_coins: 'You do not have enough coins for that action.',
  no_stock: 'That building is no longer available.',
  plot_occupied: 'Choose an empty city plot.',
  festival_used: 'You have already held a Festival this session.',
  game_finished: 'This match has finished. Wait for a rematch.',
  invalid_snapshot: 'The host returned an invalid board. Reconnect the controller.',
  unavailable: 'The local host is unavailable. Reconnecting…',
  unconfirmed_action: 'The last action is not confirmed. Reconnect to check it before choosing another.',
  request_rejected: 'That action was rejected. Check the current board.',
  queue_full: 'Let your pending action finish before choosing another.',
};

export class RoomClientError extends Error {
  constructor(code, status) {
    const safeCode = Object.hasOwn(ERROR_TEXT, code) ? code : 'request_rejected';
    super(ERROR_TEXT[safeCode]);
    this.name = 'RoomClientError';
    this.code = safeCode;
    if (status !== undefined) this.status = status;
  }
}

function makeActionId() {
  // randomUUID is unavailable on ordinary HTTP LAN phone origins. This member
  // of Web Crypto remains available there; never fall back to Math.random.
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}

function copyAction(action) {
  try {
    const copy = JSON.parse(JSON.stringify(action));
    if (!copy || Array.isArray(copy) || typeof copy !== 'object' || typeof copy.type !== 'string'
      || typeof copy.matchId !== 'string' || !copy.matchId || copy.matchId.length > 256
      || typeof copy.phaseId !== 'string' || !copy.phaseId || copy.phaseId.length > 256) throw new Error();
    return copy;
  } catch { throw new RoomClientError('invalid_action'); }
}

function stableKey(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableKey).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableKey(value[key])).join(',') + '}';
}

function copyRoom(candidate, code) {
  if (!candidate || candidate.code !== code || !Number.isSafeInteger(candidate.revision) || candidate.revision < 0
    || typeof candidate.gameId !== 'string' || !candidate.gameId
    || !['lobby', 'playing', 'finished'].includes(candidate.phase)
    || !candidate.players || typeof candidate.players !== 'object'
    || !Number.isFinite(candidate.expiresAt)
    || (candidate.phase === 'lobby' && candidate.state !== null)
    || (candidate.phase !== 'lobby' && (!candidate.state || typeof candidate.state !== 'object'
      || typeof candidate.state.matchId !== 'string' || !candidate.state.matchId
      || typeof candidate.state.phaseId !== 'string' || !candidate.state.phaseId))) return null;
  try {
    // Creation/join responses contain their newly issued credential. Only the
    // room envelope is sent to the view or retained with command snapshots.
    return structuredClone({ code, gameId: candidate.gameId, revision: candidate.revision,
      phase: candidate.phase, state: candidate.state, players: candidate.players, expiresAt: candidate.expiresAt });
  } catch { return null; }
}

/**
 * One authenticated seat. submit() serializes commands, receive() accepts SSE
 * or polling projections, and dispose() cancels every request/waiter. A retry
 * keeps the exact first POST body, including its revision and phase fence.
 *
 * reconnect() is an additive recovery seam: it resolves an uncertain request
 * with the SAME identity before fetching the current authenticated snapshot.
 * The shell connects subscribeRoom({onRoom: client.receive, onStatus}) itself.
 */
export function createRoomClient({ code, token, playerId, initialRoom,
  fetcher = globalThis.fetch, onRoom = () => {}, onStatus = () => {},
  retryMs = 250, maxRetries = 3, requestTimeoutMs = 10_000,
}) {
  if (!ROOM_CODE.test(code || '') || !TOKEN.test(token || '') || !PLAYERS.includes(playerId) || typeof fetcher !== 'function') {
    throw new TypeError('An authenticated player seat is required.');
  }
  if (!Number.isFinite(retryMs) || retryMs < 0 || !Number.isSafeInteger(maxRetries) || maxRetries < 0 || maxRetries > 10
    || !Number.isFinite(requestTimeoutMs) || requestTimeoutMs < 1) throw new TypeError('Invalid room client timing options.');
  let room = null;
  let disposed = false;
  let draining = false;
  let refreshing = null;
  let terminal = null;
  let uncertain = null;
  let active = null;
  const queue = [];
  const controllers = new Set();
  const waits = new Set();
  const retiredMatches = new Set();
  const notify = (callback, value) => { if (!disposed) { try { callback(value); } catch { /* UI callbacks cannot change delivery semantics. */ } } };
  const status = (state, message) => notify(onStatus, { state, ...(message ? { message } : {}) });

  function receive(candidate) {
    if (disposed) return false;
    const next = copyRoom(candidate, code);
    if (!next || (room && (next.gameId !== room.gameId || next.revision < room.revision))) return false;
    const matchId = next.state?.matchId;
    if (matchId && retiredMatches.has(matchId)) return false;
    if (room) {
      if (room.state && !next.state) return false;
      if (next.revision === room.revision) {
        // Equal revisions can refresh presence, but cannot roll back a locked
        // vote, a phase, or a match through a late read.
        if (next.phase !== room.phase || matchId !== room.state?.matchId || next.state?.phaseId !== room.state?.phaseId) return false;
        room = { ...room, players: next.players, expiresAt: next.expiresAt };
      } else {
        if (room.state?.matchId && matchId !== room.state.matchId) retiredMatches.add(room.state.matchId);
        room = next;
      }
    } else room = next;
    notify(onRoom, structuredClone(room));
    if (!terminal) status('connected');
    return true;
  }

  function wait(delay) {
    if (disposed) return Promise.reject(new RoomClientError('disposed'));
    return new Promise((resolve, reject) => {
      const entry = { reject, timer: null };
      entry.timer = setTimeout(() => { waits.delete(entry); resolve(); }, delay);
      waits.add(entry);
    });
  }

  async function request(suffix = '', payload) {
    if (disposed) throw new RoomClientError('disposed');
    const controller = new AbortController();
    controllers.add(controller);
    let abort;
    const interrupted = new Promise((_, reject) => {
      abort = () => reject(new RoomClientError(disposed ? 'disposed' : 'unavailable'));
      controller.signal.addEventListener('abort', abort, { once: true });
    });
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const pending = Promise.resolve().then(() => {
        if (controller.signal.aborted || disposed) throw new RoomClientError(disposed ? 'disposed' : 'unavailable');
        return fetcher(`/api/rooms/${code}${suffix}`, {
          method: payload === undefined ? 'GET' : 'POST',
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }) },
          cache: 'no-store', signal: controller.signal,
          ...(payload === undefined ? {} : { body: payload }),
        });
      }).then(response => {
        if (controller.signal.aborted) void response.body?.cancel().catch(() => {});
        return response;
      });
      const response = await Promise.race([pending, interrupted]);
      let value;
      try {
        const reader = response.body?.getReader();
        if (!reader) throw new Error('Missing response body.');
        const cancel = () => { void reader.cancel().catch(() => {}); };
        controller.signal.addEventListener('abort', cancel, { once: true });
        const decoder = new TextDecoder();
        let text = '';
        let size = 0;
        try {
          while (true) {
            const part = await Promise.race([reader.read(), interrupted]);
            if (part.done) break;
            size += part.value.byteLength;
            if (size > 1024 * 1024) throw new Error('Response too large.');
            text += decoder.decode(part.value, { stream: true });
          }
          text += decoder.decode();
          value = JSON.parse(text);
        } finally {
          controller.signal.removeEventListener('abort', cancel);
          cancel();
        }
      }
      catch (error) {
        if (error instanceof RoomClientError) throw error;
        if (response.ok) throw new RoomClientError('unavailable', response.status);
        value = null;
      }
      if (disposed) throw new RoomClientError('disposed');
      return { response, value };
    } catch (error) {
      if (error instanceof RoomClientError) throw error;
      throw new RoomClientError(disposed ? 'disposed' : 'unavailable');
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', abort);
      controllers.delete(controller);
    }
  }

  function responseError(response, value) {
    const error = new RoomClientError(value?.code, response.status);
    if ([401, 403, 404, 410].includes(response.status)) terminal = error;
    return error;
  }

  function snapshot() {
    if (disposed) return Promise.reject(new RoomClientError('disposed'));
    if (terminal) return Promise.reject(terminal);
    if (refreshing) return refreshing;
    status(room ? 'reconnecting' : 'connecting');
    refreshing = (async () => {
      try {
        const { response, value } = await request();
        if (!response.ok) throw responseError(response, value);
        if (!receive(value)) {
          // A slower GET may be overtaken by an SSE update. Return the newer
          // acknowledged room, but never accept a foreign or malformed room.
          if (!copyRoom(value, code) || value.gameId !== room?.gameId || value.revision > room.revision) throw new RoomClientError('invalid_snapshot');
        }
        return structuredClone(room);
      } catch (error) {
        if (!disposed) status(error.code === 'unavailable' ? 'offline' : 'error', error.message);
        throw error;
      } finally { refreshing = null; }
    })();
    return refreshing;
  }

  function fence(action) {
    if (!room || room.phase !== 'playing' || !room.state) throw new RoomClientError('game_not_playing');
    if (action.matchId !== room.state.matchId) throw new RoomClientError('stale_match');
    if (action.phaseId !== room.state.phaseId) throw new RoomClientError('stale_phase');
    if (action.type === 'commitCouncil') {
      if (room.state.council?.ownCommitment || room.state.council?.ready?.[playerId]) throw new RoomClientError('already_committed');
    } else if (room.state.activePlayer !== playerId) throw new RoomClientError('not_your_turn');
  }

  async function deliver(item) {
    if (!item.payload) {
      if (!room) await snapshot();
      fence(item.action);
      item.revision = room.revision;
      item.payload = JSON.stringify({ revision: room.revision, actionId: item.id, action: item.action });
    }
    for (let attempt = 0; ; attempt++) {
      if (disposed) throw new RoomClientError('disposed');
      try {
        const { response, value } = await request('/action', item.payload);
        if (response.ok) {
          const valid = copyRoom(value, code);
          if (!valid || valid.gameId !== room?.gameId || valid.revision <= item.revision) throw new RoomClientError('unavailable');
          receive(value);
          uncertain = null;
          status('connected');
          return structuredClone(room);
        }
        if (response.status >= 500 || response.status === 429) throw new RoomClientError('unavailable', response.status);
        uncertain = null;
        const error = responseError(response, value);
        // A rejected command can include a projected snapshot. Never surface
        // arbitrary server error text, exception details, or private history.
        if (value?.room) receive(value.room);
        if (!terminal) { try { await snapshot(); } catch {} }
        throw error;
      } catch (error) {
        if (disposed) throw new RoomClientError('disposed');
        if (error.code !== 'unavailable') throw error;
        status('offline', error.message);
        if (attempt >= maxRetries) {
          uncertain = item;
          throw new RoomClientError('unconfirmed_action');
        }
        await wait(Math.min(5000, retryMs * 2 ** attempt));
        status('reconnecting');
        // Even if SSE advanced the phase, this already-sent request retries
        // the original body; the authority can acknowledge its receipt safely.
      }
    }
  }

  async function drain() {
    if (draining || disposed) return;
    draining = true;
    try {
      while (queue.length && !disposed) {
        const item = queue.shift();
        active = item;
        try {
          if (terminal) throw terminal;
          if (uncertain && uncertain !== item) throw new RoomClientError('unconfirmed_action');
          item.resolve(await deliver(item));
        } catch (error) {
          if (!disposed) status(error.code === 'unconfirmed_action' ? 'offline' : 'error', error.message);
          item.reject(error);
        } finally { active = null; }
      }
    } finally { draining = false; }
  }

  function enqueue(item) {
    return new Promise((resolve, reject) => {
      queue.push({ ...item, resolve, reject });
      void drain();
    });
  }

  function submit(action) {
    if (disposed) return Promise.reject(new RoomClientError('disposed'));
    if (terminal) return Promise.reject(terminal);
    let copy;
    try { copy = copyAction(action); } catch (error) { return Promise.reject(error); }
    const key = stableKey(copy);
    if (uncertain) {
      if (uncertain.key !== key) return Promise.reject(new RoomClientError('unconfirmed_action'));
      const item = uncertain;
      uncertain = null;
      return enqueue(item);
    }
    if (queue.length >= 4) return Promise.reject(new RoomClientError('queue_full'));
    return enqueue({ action: copy, key, id: makeActionId(), payload: null });
  }

  async function reconnect() {
    if (disposed) throw new RoomClientError('disposed');
    if (uncertain) {
      const item = uncertain;
      uncertain = null;
      // A stale-phase rejection conclusively closes an uncommitted request.
      try { await enqueue(item); }
      catch (error) { if (!['stale_phase', 'stale_match', 'stale_revision', 'game_not_playing'].includes(error.code)) throw error; }
    }
    return snapshot();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    const error = new RoomClientError('disposed');
    for (const controller of controllers) controller.abort();
    for (const entry of waits) { clearTimeout(entry.timer); entry.reject(error); }
    waits.clear();
    for (const item of queue.splice(0)) item.reject(error);
    active?.reject(error);
    uncertain = null;
  }

  if (initialRoom !== undefined) {
    if (!receive(initialRoom)) throw new TypeError('A valid projected room snapshot is required.');
  } else void snapshot().catch(() => {});

  return Object.freeze({ submit, receive, reconnect, dispose });
}
