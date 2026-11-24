import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { getPartyGame } from '../../games/party/registry.mjs';
import { CREDENTIAL, MAX_PLAYERS, PARTY_LIMITS, exactFields, takeBudget, validSequence } from '../realtime/party/protocol.mjs';
import { isActive, remainingMs, startRound, tickRound } from '../realtime/party/round.mjs';

export const PARTY_ROOM_LIMITS = Object.freeze({
  rooms: 8,
  joinsPerRoom: 256,
  seatHoldMs: 30_000,
  idleRoomMs: 30 * 60_000,
  nameLength: 12,
  bodyBytes: 1024,
  roomsPerPeer: 2,
  seatsPerPeer: 2,
  joinsPerPeer: 16,
});

const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const generateCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
const digest = value => createHash('sha256').update(value).digest();
const retryKey = value => typeof value === 'string' && CREDENTIAL.test(value);
const isLook = value => Number.isInteger(value) && value >= 0 && value < MAX_PLAYERS;
const publicSeat = seat => ({ id: seat.id, name: seat.name, look: seat.look, ready: seat.ready });
const fail = (status, code, message) => { throw new PartyError(status, code, message); };

export class PartyError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function cleanName(value) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFC').replace(/[\p{C}\p{Zl}\p{Zp}]/gu, '').trim();
}

function newSeat(id, token, time, extra = {}) {
  return {
    id, tokenHash: digest(token), connection: null, expiresAt: time + PARTY_ROOM_LIMITS.seatHoldMs,
    ready: false, nextError: time, inputBudget: { at: time, tokens: PARTY_LIMITS.inputBurst },
    messageBudget: { at: time, tokens: PARTY_LIMITS.messageBurst }, ...extra,
    clockBudget: { at: time, tokens: PARTY_LIMITS.clockBurst },
  };
}

/** Process-local authority. No party records use the two-seat database. */
export function createPartyRooms({ now, seed = () => randomBytes(16).toString('hex'), onRoomCountChange = () => {} }) {
  const rooms = new Map();
  const createReceipts = new Map();
  const secret = randomBytes(32);
  let closed = false;
  // Derive retry tokens so the store only keeps digests and cannot broadcast a bearer.
  const tokenFor = (purpose, room, key) => createHmac('sha256', secret)
    .update(`${purpose}:${room.nonce}:${key}`).digest('base64url');

  function sweepRoom(room, time) {
    for (const seat of room.seats.values()) {
      if (!seat.connection && time >= seat.expiresAt) forgetSeat(room, seat, 'expired');
    }
  }

  function endRoom(room) {
    rooms.delete(room.code);
    createReceipts.delete(room.createKey);
    for (const seat of [room.host, ...room.seats.values()]) {
      const connection = seat.connection;
      seat.connection = null;
      connection?.terminate?.(4403);
    }
    room.seats.clear();
    room.revoked.clear();
    room.peerJoins.clear();
    room.activeRound = null;
    onRoomCountChange(rooms.size);
  }

  function sweep(time) {
    for (const room of rooms.values()) {
      sweepRoom(room, time);
      if (!room.host.connection && ![...room.seats.values()].some(seat => seat.connection)
        && time - room.touchedAt >= PARTY_ROOM_LIMITS.idleRoomMs) {
        endRoom(room);
      }
    }
  }

  function create(body, peer) {
    if (closed) fail(503, 'party_closed', 'The local host is closing.');
    const game = getPartyGame(body?.gameId);
    if (!exactFields(body, 'gameId', 'requestId') || !game || !retryKey(body.requestId)) {
      fail(400, 'invalid_create', 'Choose an available party game.');
    }
    const time = now();
    sweep(time);
    const key = digest(body.requestId).toString('hex');
    const previous = createReceipts.get(key);
    if (previous) {
      if (previous.initialGameId !== game.id) fail(409, 'retry_mismatch', 'This request has already been used.');
      return { code: previous.code, token: tokenFor('host', previous, key) };
    }
    if (peer && [...rooms.values()].filter(room => room.creatorPeer === peer).length >= PARTY_ROOM_LIMITS.roomsPerPeer) {
      fail(429, 'party_peer_capacity', 'This device has too many open parties.');
    }
    if (rooms.size >= PARTY_ROOM_LIMITS.rooms) fail(503, 'party_capacity', 'The host has too many open parties.');
    let code;
    do { code = generateCode(); } while (rooms.has(code));
    const room = {
      code, game, nonce: randomBytes(16).toString('hex'), initialGameId: game.id, createKey: key, creatorPeer: peer,
      seats: new Map(), revoked: new Set(), peerJoins: new Map(),
      nextPlayer: 1, phase: 'lobby', round: 0, activeRound: null, notice: null, touchedAt: time,
      gameRound: 0, previousResults: [],
    };
    const token = tokenFor('host', room, key);
    room.host = newSeat('host', token, time);
    createReceipts.set(key, room);
    rooms.set(code, room);
    onRoomCountChange(rooms.size);
    return { code, token };
  }

  function find(code) {
    const time = now();
    sweep(time);
    return rooms.get(code);
  }

  function authorize(room, token) {
    if (!room || rooms.get(room.code) !== room || typeof token !== 'string' || !CREDENTIAL.test(token)) return null;
    sweepRoom(room, now());
    const hash = digest(token);
    for (const seat of [room.host, ...room.seats.values()]) {
      if (timingSafeEqual(hash, seat.tokenHash)) return seat;
    }
    return null;
  }

  function join(room, body, peer) {
    if (rooms.get(room.code) !== room) fail(404, 'party_not_found', 'That party is not available.');
    const name = cleanName(body?.name);
    if (!exactFields(body, 'name', 'look', 'requestId') || !name || [...name].length > PARTY_ROOM_LIMITS.nameLength
      || !isLook(body.look) || !retryKey(body.requestId)) {
      fail(400, 'invalid_join', 'Enter a name up to 12 characters and choose a look.');
    }
    const time = now();
    sweepRoom(room, time);
    const key = digest(body.requestId).toString('hex');
    const token = tokenFor('player', room, key);
    const previous = authorize(room, token);
    if (previous) {
      if (previous.name !== name || previous.look !== body.look) fail(409, 'retry_mismatch', 'This request has already been used.');
      return { code: room.code, token, playerId: previous.id };
    }
    // Keep bounded tombstones so a kicked or expired join cannot revive by replay.
    if (room.revoked.has(key)) fail(410, 'seat_lost', 'That seat has expired. Join again.');
    const previousJoins = room.peerJoins.get(peer) ?? 0;
    if (peer && (previousJoins >= PARTY_ROOM_LIMITS.joinsPerPeer
      || [...room.seats.values()].filter(seat => seat.peer === peer).length >= PARTY_ROOM_LIMITS.seatsPerPeer)) {
      fail(429, 'party_peer_capacity', 'This device has reached its seat limit for this party.');
    }
    if (room.nextPlayer > PARTY_ROOM_LIMITS.joinsPerRoom) fail(409, 'party_retired', 'Start a new party for more guests.');
    if (room.seats.size >= MAX_PLAYERS) fail(409, 'party_full', 'This party is full.');
    if ([...room.seats.values()].some(seat => seat.look === body.look)) fail(409, 'look_taken', 'That look is taken. Choose another.');
    const id = `p${room.nextPlayer++}`;
    room.seats.set(id, newSeat(id, token, time, { name, look: body.look, retryKey: key, peer }));
    if (peer) room.peerJoins.set(peer, previousJoins + 1);
    room.touchedAt = time;
    return { code: room.code, token, playerId: id };
  }

  function forgetSeat(room, seat, reason) {
    room.revoked.add(seat.retryKey);
    room.seats.delete(seat.id);
    const round = room.activeRound;
    if (isActive(room.phase) && round.players.delete(seat.id)) {
      round.inputs = round.inputs.filter(input => input.playerId !== seat.id);
      round.departures.push({ playerId: seat.id, reason });
    }
    seat.connection?.terminate?.(4403);
  }

  function attach(seat, connection) {
    const old = seat.connection;
    seat.connection = connection;
    old?.terminate?.(4409);
  }

  function detach(seat, connection, room) {
    if (seat.connection !== connection) return;
    seat.connection = null;
    seat.expiresAt = now() + PARTY_ROOM_LIMITS.seatHoldMs;
    if (room) room.touchedAt = now();
  }

  function command(room, seat, message) {
    const time = now();
    room.touchedAt = time;
    if (seat !== room.host) {
      if (!exactFields(message, 'type', 'value') || message.type !== 'ready' || typeof message.value !== 'boolean') {
        fail(403, 'forbidden', 'Only the TV can control the party.');
      }
      seat.ready = message.value;
      return;
    }
    if (message?.type === 'end' && exactFields(message, 'type')) {
      endRoom(room);
      return;
    }
    if (message?.type === 'kick' && exactFields(message, 'type', 'playerId')
      && typeof message.playerId === 'string' && /^p[1-9][0-9]{0,2}$/.test(message.playerId)) {
      const player = room.seats.get(message.playerId);
      if (player) forgetSeat(room, player, 'kicked');
      return;
    }
    const starting = message?.type === 'start' && exactFields(message, 'type', 'round');
    const selecting = message?.type === 'select' && exactFields(message, 'type', 'round', 'gameId');
    if ((!starting && !selecting) || !validSequence(message.round)) fail(400, 'invalid_command', 'That party command is invalid.');
    if (message.round !== room.round || isActive(room.phase)) fail(409, 'round_changed', 'Wait for the current round to finish.');
    if (starting) {
      if (!startRound(room, time, seed())) fail(409, 'not_enough_ready', 'Wait for more players to get ready.');
    } else {
      const game = getPartyGame(message.gameId);
      if (!game) fail(400, 'invalid_game', 'Choose an available party game.');
      room.game = game;
      room.gameRound = 0;
      room.previousResults = [];
      room.activeRound = null;
      room.phase = 'lobby';
      room.notice = null;
    }
  }

  function acceptInput(room, seat, message, connection) {
    const time = now();
    if (seat.connection !== connection || seat === room.host) return false;
    if (!takeBudget(seat.inputBudget, time, PARTY_LIMITS.inputsPerSecond, PARTY_LIMITS.inputBurst)) return false;
    if (!exactFields(message, 'type', 'round', 'seq', 'input') || message.type !== 'input' || !validSequence(message.seq)
      || message.seq <= connection.lastSeq || room.phase !== 'playing'
      || message.round !== room.round || time >= room.activeRound.endsAt || !room.activeRound.players.has(seat.id) || !room.seats.has(seat.id)) return false;
    const input = room.game.normalizeInput(message.input);
    if (input == null) return false;
    if (room.activeRound.inputs.length >= PARTY_LIMITS.queuedInputs) return false;
    connection.lastSeq = message.seq;
    room.activeRound.inputs.push({ playerId: seat.id, input, receivedMs: time - room.activeRound.startsAt });
    return true;
  }

  function project(room, seat) {
    const round = room.activeRound;
    const time = now();
    const common = {
      phase: room.phase, round: room.round, ms: Math.ceil(remainingMs(room, time)), notice: room.notice, gameId: room.game.id,
    };
    if (seat === room.host) {
      const players = [...room.seats.values()].map(player => ({ ...publicSeat(player), connected: Boolean(player.connection) }));
      return {
        ...common, players, minPlayers: room.game.minPlayers,
        roster: round?.roster ?? [],
        scene: round ? room.game.projectForTv(round.state) : null,
        results: round?.results ?? [],
      };
    }
    const waiting = isActive(room.phase) && !round.players.has(seat.id);
    const inRound = round?.players.has(seat.id);
    return {
      ...common, self: publicSeat(seat), waiting,
      state: inRound ? room.game.projectForPhone(round.state, seat.id, {
        now: time,
        // Use the wall-clock position of the last applied tick, including after catch-up drops ticks.
        tickAt: room.phase === 'countdown' ? round.startsAt : round.previousAt - round.remainder,
      }) : null,
      place: round?.results.find(entry => entry.playerId === seat.id)?.place ?? null,
    };
  }

  return {
    create, find, join, authorize, attach, detach, command, acceptInput, project,
    lookup: room => ({ code: room.code, gameId: room.game.id, occupiedLooks: [...room.seats.values()].map(seat => seat.look) }),
    tick(time) {
      sweep(time);
      for (const room of rooms.values()) tickRound(room, time);
    },
    close() {
      closed = true;
      for (const room of rooms.values()) endRoom(room);
    },
  };
}
