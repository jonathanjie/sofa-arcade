import { PLAYER_IDS } from '../game/engine.mjs';
import { SOFA_GAME_ID, getGame } from '../games/catalog.mjs';
import { getGameEngine } from '../games/registry.mjs';

export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
// Expired rooms stay readable for this long, so an old phone or TV tab still sees
// "This room has expired" (410) instead of "not found" (404). After that, room
// creation deletes them so the database does not grow without limit.
export const EXPIRED_ROOM_RETENTION_MS = 24 * 60 * 60 * 1000;
export const MAX_BODY_BYTES = 12 * 1024;
const HEARTBEAT_INTERVAL_MS = 10_000;
const CONNECTED_WINDOW_MS = 30_000;
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_PATTERN = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{24,128}$/;
const ACTION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const MAX_ACTION_ATTEMPTS = 4;
const encoder = new TextEncoder();

class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function json(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function randomCode() {
  let code = '';
  const ceiling = 256 - (256 % CODE_ALPHABET.length);
  while (code.length < 6) {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    for (const byte of bytes) {
      if (byte < ceiling) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
      if (code.length === 6) break;
    }
  }
  return code;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function sameHash(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}

async function readBody(request) {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new ApiError(413, 'That request is too large. Please try a single action.', 'body_too_large');
  }
  if (!request.body) return {};
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new ApiError(413, 'That request is too large. Please try a single action.', 'body_too_large');
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'The request could not be read. Please try again.', 'invalid_json');
  }
  if (!text.trim()) return {};
  let parsed;
  try { parsed = JSON.parse(text); } catch {
    throw new ApiError(400, 'The request must contain valid JSON.', 'invalid_json');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ApiError(400, 'The request must be a JSON object.', 'invalid_json');
  }
  return parsed;
}

function checkOrigin(request) {
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== new URL(request.url).origin) {
    throw new ApiError(403, 'Open your controller from the Sofa Arcade game page.', 'origin_rejected');
  }
}

async function loadRoom(db, code) {
  const row = await db.prepare(
    'SELECT code, revision, data, created_at, updated_at, expires_at, jon_seen, lydia_seen FROM sofa_rooms WHERE code = ?',
  ).bind(code).first();
  if (!row) throw new ApiError(404, 'That room could not be found. Check the six-character code.', 'room_not_found');
  if (row.expires_at <= Date.now()) throw new ApiError(410, 'This room has expired. Start a new game on the TV.', 'room_expired');
  return { ...row, data: JSON.parse(row.data) };
}

/**
 * Creates an isolated authority for a registered engine set. The same handler must
 * serve HTTP and each authenticated SSE subscriber; never cache a shared view.
 * Resolvers are server configuration, never fields supplied by a request.
 */
export function createRoomApi({ resolveGame = getGame, resolveEngine = getGameEngine } = {}) {
  if (typeof resolveGame !== 'function' || typeof resolveEngine !== 'function') {
    throw new TypeError('Room engine resolvers must be functions.');
  }

  function adapter(gameId) {
    const engine = resolveEngine(gameId);
    if (!engine) throw new ApiError(409, 'This game is not available yet.', 'game_not_available');
    // This exact, already-public adapter is the sole compatibility exception. New
    // games cannot silently fall back to returning their complete authority state.
    const legacy = gameId === SOFA_GAME_ID && engine === getGameEngine(SOFA_GAME_ID)
      && typeof engine.project !== 'function';
    const methods = legacy ? ['create', 'apply'] : ['create', 'apply', 'normalizeAction', 'actionKey', 'project', 'canRebaseAction'];
    if (methods.some(method => typeof engine[method] !== 'function')
        || !Array.isArray(engine.playerIds) || engine.playerIds.length !== PLAYER_IDS.length
        || !PLAYER_IDS.every(id => engine.playerIds.includes(id))) {
      throw new ApiError(503, 'This game is not ready for private room play.', 'invalid_engine');
    }
    return { engine, legacy };
  }

  function envelope(room, viewer, now = Date.now()) {
    const gameId = room.data.gameId || SOFA_GAME_ID;
    let state = null;
    if (room.data.state !== null) {
      const { engine, legacy } = adapter(gameId);
      const fullState = structuredClone(room.data.state);
      const projected = legacy ? fullState : engine.project(fullState, Object.freeze({ ...viewer }));
      if (!projected || typeof projected !== 'object' || Array.isArray(projected)) throw new Error('Invalid game projection.');
      // Return JSON data only, with no aliases to authority or another viewer.
      state = JSON.parse(JSON.stringify(projected));
    }
    return {
      code: room.code,
      gameId,
      revision: room.revision,
      phase: room.data.phase,
      state,
      players: Object.fromEntries(PLAYER_IDS.map(id => {
        const lastSeen = Number(room[`${id}_seen`]) || 0;
        return [id, {
          joined: room.data.seats[id] !== null,
          connected: room.data.seats[id] !== null && lastSeen > 0 && now - lastSeen < CONNECTED_WINDOW_MS,
          lastSeen,
        }];
      })),
      expiresAt: room.expires_at,
    };
  }

  async function authenticate(request, room) {
    const header = request.headers.get('authorization');
    if (!header) return { role: 'public' };
    const match = /^Bearer ([A-Za-z0-9_-]{24,128})$/.exec(header);
    if (!match) throw new ApiError(403, 'That controller session is no longer valid. Rejoin the room.', 'invalid_token');
    const hash = await sha256(match[1]);
    const hostMatches = sameHash(hash, room.data.hostHash);
    const jonMatches = sameHash(hash, room.data.seats.jon?.tokenHash);
    const lydiaMatches = sameHash(hash, room.data.seats.lydia?.tokenHash);
    if (hostMatches) return { role: 'host' };
    if (jonMatches) return { role: 'player', playerId: 'jon' };
    if (lydiaMatches) return { role: 'player', playerId: 'lydia' };
    throw new ApiError(403, 'That controller session is no longer valid. Rejoin the room.', 'invalid_token');
  }

  function requireHost(auth) {
    if (auth.role === 'public') throw new ApiError(401, 'Open the TV host screen to do that.', 'host_required');
    if (auth.role !== 'host') throw new ApiError(403, 'Only the TV host can start or restart the game.', 'host_required');
  }

  function requirePlayer(auth) {
    if (auth.role === 'public') throw new ApiError(401, 'Join the room on your phone first.', 'player_required');
    if (auth.role !== 'player') throw new ApiError(403, 'Use your phone controller to take a turn.', 'player_required');
  }

  /** Every gameplay mutation is a compare-and-swap. Heartbeats deliberately are not. */
  async function commit(db, room, nextData, seenPlayer = null) {
    const now = Date.now();
    const revision = room.revision + 1;
    const seenColumn = seenPlayer && PLAYER_IDS.includes(seenPlayer) ? `${seenPlayer}_seen` : null;
    const fields = seenColumn ? `revision = ?, data = ?, updated_at = ?, ${seenColumn} = ?` : 'revision = ?, data = ?, updated_at = ?';
    const args = [revision, JSON.stringify(nextData), now];
    if (seenColumn) args.push(now);
    args.push(room.code, room.revision, now);
    const result = await db.prepare(
      `UPDATE sofa_rooms SET ${fields} WHERE code = ? AND revision = ? AND expires_at > ?`,
    ).bind(...args).run();
    if (Number(result.meta?.changes) !== 1) return null;
    return { ...room, data: nextData, revision, updated_at: now, ...(seenColumn ? { [seenColumn]: now } : {}) };
  }

  async function heartbeat(db, room, playerId) {
    const now = Date.now();
    const column = `${playerId}_seen`; // playerId comes only from authenticate's fixed two-player list.
    if (now - (Number(room[column]) || 0) < HEARTBEAT_INTERVAL_MS) return room;
    const result = await db.prepare(
      `UPDATE sofa_rooms SET ${column} = ? WHERE code = ? AND ${column} < ? AND expires_at > ?`,
    ).bind(now, room.code, now - HEARTBEAT_INTERVAL_MS, now).run();
    return Number(result.meta?.changes) === 1 ? { ...room, [column]: now } : room;
  }

  /**
   * Removes rooms whose retention window has ended. Room creation is rare and
   * already writes, so it is a cheap place to clean up without a scheduled job.
   * Cleanup is best effort: a failure must never block a new game.
   */
  async function deleteLongExpiredRooms(db) {
    const cutoff = Date.now() - EXPIRED_ROOM_RETENTION_MS;
    try {
      await db.prepare('DELETE FROM sofa_rooms WHERE expires_at <= ?').bind(cutoff).run();
    } catch {
      // The next room creation tries again.
    }
  }

  async function createRoom(db, body) {
    const gameId = body.gameId === undefined ? SOFA_GAME_ID : body.gameId;
    if (typeof gameId !== 'string' || !resolveGame(gameId)) {
      throw new ApiError(400, 'Choose a game from the collection.', 'invalid_game');
    }
    adapter(gameId);
    await deleteLongExpiredRooms(db);
    const hostToken = randomToken();
    const data = {
      gameId,
      hostHash: await sha256(hostToken), seats: { jon: null, lydia: null },
      phase: 'lobby', state: null, recentActions: [],
    };
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = randomCode();
      const now = Date.now();
      const room = { code, revision: 0, data, created_at: now, updated_at: now, expires_at: now + ROOM_TTL_MS, jon_seen: 0, lydia_seen: 0 };
      try {
        await db.prepare(
          'INSERT INTO sofa_rooms (code, revision, data, created_at, updated_at, expires_at, jon_seen, lydia_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ).bind(code, 0, JSON.stringify(data), now, now, room.expires_at, 0, 0).run();
        return json({ ...envelope(room, { role: 'host' }), hostToken }, 201);
      } catch (error) {
        if (!/UNIQUE constraint failed.*sofa_rooms\.code/i.test(String(error?.message || error))) throw error;
      }
    }
    throw new ApiError(503, 'The room could not be created. Please try again.', 'room_busy');
  }

  async function joinRoom(db, request, code, body) {
    if (!PLAYER_IDS.includes(body.playerId)) throw new ApiError(400, 'Choose Jon or Lydia.', 'invalid_player');
    if (typeof body.clientId !== 'string' || !TOKEN_PATTERN.test(body.clientId)) {
      throw new ApiError(400, 'This phone needs a new controller session. Reload the controller page.', 'invalid_client_id');
    }
    const clientHash = await sha256(body.clientId);
    const playerToken = randomToken();
    const tokenHash = await sha256(playerToken);
    for (let attempt = 0; attempt < 4; attempt++) {
      const room = await loadRoom(db, code);
      const auth = await authenticate(request, room);
      const seat = room.data.seats[body.playerId];
      const ownsSeat = seat && (sameHash(seat.clientHash, clientHash)
        || (auth.role === 'player' && auth.playerId === body.playerId));
      if (seat && !ownsSeat) {
        throw new ApiError(409, `${body.playerId === 'jon' ? 'Jon' : 'Lydia'} already has a controller. Use that phone or choose the other player.`, 'seat_taken');
      }
      if (!seat && room.data.phase !== 'lobby') throw new ApiError(409, 'This game has already started.', 'game_started');
      const nextData = structuredClone(room.data);
      nextData.seats[body.playerId] = { tokenHash, clientHash };
      // Reject a broken projection before rotating a live controller credential.
      envelope({ ...room, data: nextData }, { role: 'player', playerId: body.playerId });
      const committed = await commit(db, room, nextData, body.playerId);
      // Seat ownership was verified above (or newly claimed in the lobby). This
      // response belongs to the freshly issued credential, not a requested role.
      if (committed) return json({ ...envelope(committed, { role: 'player', playerId: body.playerId }), playerToken });
    }
    throw new ApiError(409, 'Another controller just joined. Please try joining again.', 'room_changed');
  }

  async function startRoom(db, request, code, rematch) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const room = await loadRoom(db, code);
      const auth = await authenticate(request, room);
      requireHost(auth);
      if (!rematch && room.data.phase === 'playing') return json(envelope(room, auth));
      if (rematch && room.data.phase !== 'finished') throw new ApiError(409, 'Finish this game before starting a rematch.', 'game_not_finished');
      if (!rematch && room.data.phase === 'finished') throw new ApiError(409, 'Choose rematch to play another game.', 'game_finished');
      if (!PLAYER_IDS.every(id => room.data.seats[id])) throw new ApiError(409, 'Both phones need to join before the game can start.', 'players_required');
      const nextData = structuredClone(room.data);
      const { engine, legacy } = adapter(room.data.gameId || SOFA_GAME_ID);
      const matchId = randomToken();
      nextData.state = engine.create({ seed: `${code}-${randomToken().slice(0, 10)}`, matchId });
      if (!legacy && (nextData.state?.matchId !== matchId || nextData.state.phase !== 'playing'
          || typeof nextData.state?.phaseId !== 'string' || !nextData.state.phaseId)) {
        throw new Error('The engine did not establish match and phase boundaries.');
      }
      nextData.phase = 'playing';
      nextData.recentActions = [];
      envelope({ ...room, data: nextData }, auth);
      const committed = await commit(db, room, nextData);
      if (committed) return json(envelope(committed, auth));
    }
    throw new ApiError(409, 'The room changed while starting. Please try again.', 'room_changed');
  }

  function validateActionBody(body) {
    if (!Number.isSafeInteger(body.revision) || body.revision < 0) throw new ApiError(400, 'Refresh the board before taking a turn.', 'invalid_revision');
    if (typeof body.actionId !== 'string' || !ACTION_ID_PATTERN.test(body.actionId)) throw new ApiError(400, 'This action needs a fresh controller request. Please try again.', 'invalid_action_id');
    if (!body.action || typeof body.action !== 'object' || Array.isArray(body.action) || typeof body.action.type !== 'string') {
      throw new ApiError(400, 'Choose a valid game action.', 'invalid_action');
    }
  }

  function legacyActionKey(action) {
    if (action.type === 'move') return JSON.stringify({ type: action.type, direction: action.direction });
    if (action.type === 'lure') return JSON.stringify({
      type: action.type, index: action.index,
      ...(Object.hasOwn(action, 'axis') ? { axis: action.axis } : {}),
      ...(Object.hasOwn(action, 'direction') ? { direction: action.direction } : {}),
      // Rules v4 toys can move a pounce to a square instead of choosing a line.
      ...(Object.hasOwn(action, 'row') ? { row: action.row } : {}),
      ...(Object.hasOwn(action, 'col') ? { col: action.col } : {}),
    });
    return JSON.stringify({ type: action.type });
  }

  const RULE_ERRORS = Object.freeze({
    invalid_action: 'Choose a valid action for this game.',
    invalid_choice: 'Choose one of the offered council options.',
    invalid_bid: 'Choose a whole-number bid within your available influence.',
    insufficient_influence: 'That bid exceeds your available influence.',
    already_committed: 'Your vote is already sealed for this council.',
    already_submitted: 'Your vote is already sealed for this council.',
    vote_locked: 'Your vote is already sealed for this council.',
    not_your_turn: 'Wait for your city action.',
    insufficient_coins: 'You do not have enough coins for that action.',
    no_stock: 'That building is no longer available.',
    plot_occupied: 'Choose an empty city plot.',
    festival_used: 'You have already held a Festival this session.',
    stale_match: 'This command belongs to a different match. Refresh the board.',
    stale_phase: 'This command belongs to an earlier phase. Refresh the board.',
    game_finished: 'This match has finished. Wait for a rematch.',
    reserve_full: 'Your reserve is full. Build from it first.',
    insufficient_influence: 'You do not have enough influence for that action.',
    duplicate_design: 'You already have this building in your city.',
    scout_used: 'You have already scouted this session.',
  });

  function ruleError(error) {
    // Even code-bearing engine errors can accidentally contain private details.
    // Only fixed platform text and known codes cross the boundary.
    const code = Object.hasOwn(RULE_ERRORS, error?.code) ? error.code : 'invalid_action';
    return new ApiError(400, RULE_ERRORS[code], code);
  }

  function stableJson(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
      return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
    }
    throw new Error('Actions must contain JSON data.');
  }

  function normalizeAction({ engine, legacy }, rawAction) {
    if (legacy) return { action: rawAction, actionKey: legacyActionKey(rawAction) };
    try {
      const action = engine.normalizeAction(structuredClone(rawAction));
      if (!action || typeof action !== 'object' || Array.isArray(action) || typeof action.type !== 'string'
          || typeof action.matchId !== 'string' || !action.matchId
          || typeof action.phaseId !== 'string' || !action.phaseId) throw new Error('Invalid normalized action.');
      const key = engine.actionKey(action);
      if (typeof key !== 'string' || !key || key.length > MAX_BODY_BYTES) throw new Error('Invalid action identity.');
      // Bind the adapter's key to all normalized content, so an omitted key field
      // cannot let changed private choices reuse an already committed action ID.
      const actionKey = JSON.stringify([key, stableJson(action)]);
      return { action: structuredClone(action), actionKey };
    } catch (error) { throw ruleError(error); }
  }

  function fenceAction(room, action, legacy) {
    if (legacy) return;
    if (action.matchId !== room.data.state?.matchId) {
      throw new ApiError(409, RULE_ERRORS.stale_match, 'stale_match');
    }
    if (action.phaseId !== room.data.state?.phaseId) {
      throw new ApiError(409, RULE_ERRORS.stale_phase, 'stale_phase');
    }
  }

  function staleRevision() {
    return new ApiError(409, 'The board has changed. Your controller is catching up; please try your move again.', 'stale_revision');
  }

  function alreadyApplied(room, playerId, body, actionKey) {
    const previous = (room.data.recentActions || []).find(item => item.playerId === playerId && item.actionId === body.actionId);
    if (!previous) return false;
    if (previous.actionKey !== actionKey) throw new ApiError(409, 'That request was already used for a different move. Choose the move again.', 'action_id_reused');
    return true;
  }

  function retainRecentActions(actions) {
    const counts = { jon: 0, lydia: 0 };
    return actions.slice().reverse().filter(item => {
      if (!PLAYER_IDS.includes(item.playerId)) return false;
      counts[item.playerId]++;
      return counts[item.playerId] <= 64;
    }).reverse();
  }

  async function act(db, request, code, body) {
    validateActionBody(body);
    let room = await loadRoom(db, code);
    // Authenticate before invoking the engine, including its normalization code.
    requirePlayer(await authenticate(request, room));
    const selected = adapter(room.data.gameId || SOFA_GAME_ID);
    const { engine, legacy } = selected;
    const { action, actionKey } = normalizeAction(selected, body.action);
    for (let attempt = 0; attempt <= MAX_ACTION_ATTEMPTS; attempt++) {
      const auth = await authenticate(request, room);
      requirePlayer(auth);
      // A known ID never authorizes a fabricated future revision.
      if (body.revision > room.revision) throw staleRevision();
      // Lost responses, including the match-winning response, acknowledge current
      // projected authority without reapplying or requiring the old phase to exist.
      if (alreadyApplied(room, auth.playerId, body, actionKey)) return json(envelope(room, auth));
      if (attempt === MAX_ACTION_ATTEMPTS) throw staleRevision();
      if (room.data.phase !== 'playing' || !room.data.state) {
        throw new ApiError(409, 'Wait for the TV host to start the game.', 'game_not_playing');
      }
      fenceAction(room, action, legacy);
      if (body.revision !== room.revision || attempt > 0) {
        // City turns are never rebased, even if an adapter accidentally opts in.
        let canRebase = false;
        if (!legacy && action.type === 'commitCouncil') {
          try { canRebase = engine.canRebaseAction(structuredClone(room.data.state), auth.playerId, structuredClone(action)) === true; }
          catch (error) { throw ruleError(error); }
        }
        if (!canRebase) throw staleRevision();
      }
      let nextState;
      try { nextState = engine.apply(structuredClone(room.data.state), auth.playerId, structuredClone(action)); }
      catch (error) {
        if (legacy) throw new ApiError(400, error instanceof Error ? error.message : 'That move is not available.', 'invalid_action');
        throw ruleError(error);
      }
      if (!nextState || !['playing', 'finished'].includes(nextState.phase)
          || (!legacy && (nextState.matchId !== room.data.state.matchId || typeof nextState.phaseId !== 'string' || !nextState.phaseId))) {
        throw new Error('The engine returned an invalid transition.');
      }
      const nextData = structuredClone(room.data);
      nextData.state = nextState;
      nextData.phase = nextState.phase;
      nextData.recentActions = retainRecentActions([
        ...(nextData.recentActions || []), { playerId: auth.playerId, actionId: body.actionId, actionKey },
      ]);
      // A deterministic projector failure must not commit an otherwise invisible
      // move. Transport loss after a successful commit is recovered by its ID.
      envelope({ ...room, data: nextData }, auth);
      // State, both revealed bids/payments, phase, and retry identity commit in one
      // CAS. A loser reloads and must re-authenticate and pass every guard again.
      const committed = await commit(db, room, nextData, auth.playerId);
      if (committed) return json(envelope(committed, auth));
      room = await loadRoom(db, code);
    }
    throw staleRevision();
  }

  /** Handles /api/rooms and its room routes. The caller supplies an existing D1 binding. */
  return async function handleApi(request, env) {
    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/$/, '');
      const parts = /^\/api\/rooms(?:\/([^/]+)(?:\/(join|start|rematch|action))?)?$/.exec(path);
      if (!parts) return json({ error: 'That game endpoint does not exist.', code: 'not_found' }, 404);
      const code = parts[1]?.toUpperCase();
      const operation = parts[2] || null;
      if (code && !CODE_PATTERN.test(code)) throw new ApiError(400, 'Enter a valid six-character room code.', 'invalid_room_code');
      const allowedMethods = !code || operation ? ['POST'] : ['GET'];
      if (!allowedMethods.includes(request.method)) {
        return json({ error: 'That action uses a different request method.', code: 'method_not_allowed' }, 405, { Allow: allowedMethods.join(', ') });
      }
      if (!env?.DB) throw new ApiError(503, 'The room service is not ready. Please try again shortly.', 'service_unavailable');
      const db = env.DB;
      let body;
      checkOrigin(request);
      if (request.method === 'POST') {
        body = await readBody(request);
      }
      if (!code) return await createRoom(db, body);
      if (request.method === 'GET') {
        let room = await loadRoom(db, code);
        const auth = await authenticate(request, room);
        if (auth.role === 'player') room = await heartbeat(db, room, auth.playerId);
        return json(envelope(room, auth));
      }
      if (operation === 'join') return await joinRoom(db, request, code, body);
      if (operation === 'start' || operation === 'rematch') return await startRoom(db, request, code, operation === 'rematch');
      if (operation === 'action') return await act(db, request, code, body);
      return json({ error: 'That game endpoint does not exist.', code: 'not_found' }, 404);
    } catch (error) {
      if (error instanceof ApiError) return json({ error: error.message, code: error.code }, error.status);
      return json({ error: 'The room could not be updated. Please try again.', code: 'server_error' }, 500);
    }
  };
}

/** Production entry point retained for existing Worker, LAN, and Tauri callers. */
export const handleApi = createRoomApi();
