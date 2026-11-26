import { performance } from 'node:perf_hooks';
import { createPartyRooms, PartyError } from '../../party/rooms.mjs';
import { rejectUpgrade } from '../../reject-upgrade.mjs';
import { WebSocketServer } from '../../runtime/gravity-orchard-dependencies.mjs';
import { PARTY_LIMITS as limits, exactFields, takeBudget, validAuth, validSequence } from './protocol.mjs';
import { PARTY_TICK_MS } from './round.mjs';

const realClock = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: handle => clearTimeout(handle),
};
const OPEN = 1;
const CLOSE_GRACE_MS = 150;

export function createPartyRealtime({ validateUpgrade, admitSocket, clock = realClock, seed }) {
  const rooms = createPartyRooms({ now: () => clock.now(), seed, onRoomCountChange });
  const server = new WebSocketServer({
    noServer: true, clientTracking: false, perMessageDeflate: false, autoPong: false,
    maxPayload: limits.frameBytes, maxFragments: limits.maxFragments, maxBufferedChunks: limits.maxBufferedChunks,
  });
  const connections = new Set();
  let closed = false;
  let roomCount = 0;
  let previousPump;
  let nextPing;
  let timer;

  function schedule(fn, ms) {
    const handle = clock.setTimeout(fn, ms);
    handle?.unref?.();
    return handle;
  }

  function onRoomCountChange(count) {
    const wasIdle = roomCount === 0;
    roomCount = count;
    if (count === 0) {
      clock.clearTimeout(timer);
      timer = undefined;
    } else if (wasIdle && !closed) {
      previousPump = clock.now();
      nextPing = previousPump + limits.pingMs;
      timer = schedule(pump, PARTY_TICK_MS);
    }
  }

  function send(connection, packet) {
    const { ws } = connection;
    if (connection.closing || ws.readyState !== OPEN) return;
    const payload = JSON.stringify(packet);
    const bytes = Buffer.byteLength(payload);
    const phone = connection.seat !== connection.room.host;
    if (ws.bufferedAmount > limits.sendBufferBytes
      || (phone && (bytes > limits.phoneSnapshotBytes || ws.bufferedAmount + bytes + 4 > limits.sendBufferBytes))) {
      connection.terminate(1011);
      return;
    }
    ws.send(payload);
    if (ws.bufferedAmount > limits.sendBufferBytes) connection.terminate(1011);
  }

  function snapshot(connection, time, type) {
    send(connection, { type, view: rooms.project(connection.room, connection.seat) });
    connection.nextSnapshot = time + (connection.seat === connection.room.host ? PARTY_TICK_MS : limits.phoneSnapshotMs);
  }

  function authenticate(connection, message, time) {
    if (time >= connection.authDeadline || !validAuth(message)) return connection.terminate(1008);
    const room = rooms.find(message.code);
    const seat = rooms.authorize(room, message.token);
    if (!seat) return connection.terminate(4403);
    if (!takeBudget(seat.messageBudget, time, limits.messagesPerSecond, limits.messageBurst)) {
      return connection.terminate(1008);
    }
    clock.clearTimeout(connection.authTimer);
    connection.room = room;
    connection.seat = seat;
    rooms.attach(seat, connection);
    snapshot(connection, time, 'welcome');
  }

  function receive(connection, data, binary) {
    if (connection.closing) return;
    const time = clock.now();
    const { seat, room } = connection;
    if (seat && (seat.connection !== connection
      || !takeBudget(seat.messageBudget, time, limits.messagesPerSecond, limits.messageBurst))) {
      connection.terminate(1008);
      return;
    }
    let message;
    if (!binary) {
      try { message = JSON.parse(data.toString('utf8')); } catch { /* Invalid messages close below. */ }
    }
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      connection.terminate(1008);
      return;
    }
    if (!seat) return authenticate(connection, message, time);
    if (message.type === 'clock-ping') {
      if (seat !== room.host && exactFields(message, 'type', 'id') && validSequence(message.id)
        && takeBudget(seat.clockBudget, time, limits.clocksPerSecond, limits.clockBurst)) {
        send(connection, { type: 'clock-pong', id: message.id, serverAt: time });
      }
      return;
    }
    if (message.type === 'input') {
      rooms.acceptInput(room, seat, message, connection);
      return;
    }
    try {
      rooms.command(room, seat, message);
    } catch (error) {
      if (!(error instanceof PartyError)) throw error;
      // Administrative rejections are useful, but cannot become a reply flood.
      if (time >= seat.nextError) {
        seat.nextError = time + 1000;
        send(connection, { type: 'error', code: error.code, message: error.message });
      }
    }
  }

  function open(ws) {
    const time = clock.now();
    const connection = {
      ws, seat: null, room: null, closing: false, lastPong: time, lastSeq: -1,
      nextSnapshot: 0, authDeadline: time + limits.authMs, authTimer: null, closeTimer: null,
      terminate(code) {
        if (connection.closing) return;
        connection.closing = true;
        clock.clearTimeout(connection.authTimer);
        if (connection.seat) rooms.detach(connection.seat, connection, connection.room);
        ws.close(code);
        connection.closeTimer = schedule(() => ws.terminate(), CLOSE_GRACE_MS);
      },
    };
    connections.add(connection);
    ws.on('error', () => ws.terminate());
    ws.on('pong', () => { connection.lastPong = clock.now(); });
    ws.on('message', (data, binary) => receive(connection, data, binary));
    ws.once('close', () => {
      connections.delete(connection);
      clock.clearTimeout(connection.authTimer);
      if (connection.closeTimer !== null) clock.clearTimeout(connection.closeTimer);
      if (connection.seat) rooms.detach(connection.seat, connection, connection.room);
    });
    connection.authTimer = schedule(() => connection.terminate(1008), limits.authMs);
  }

  function pump() {
    timer = undefined;
    const time = clock.now();
    const hostSlept = time - previousPump >= limits.pongMs;
    previousPump = time;
    rooms.tick(time);
    const ping = time >= nextPing;
    if (ping) nextPing = time + limits.pingMs;
    for (const connection of connections) {
      if (!connection.seat || connection.closing) continue;
      if (connection.ws.bufferedAmount > limits.sendBufferBytes) {
        connection.terminate(1011);
        continue;
      }
      // A sleeping host cannot observe pongs. Probe once more on wake.
      if (hostSlept) connection.lastPong = time;
      if (time - connection.lastPong >= limits.pongMs) {
        connection.terminate(4000);
        continue;
      }
      if (ping && connection.ws.readyState === OPEN) connection.ws.ping();
      if (time >= connection.nextSnapshot) snapshot(connection, time, 'snapshot');
    }
    if (!closed && roomCount > 0) timer = schedule(pump, PARTY_TICK_MS);
  }

  return {
    rooms,
    handleUpgrade(request, socket, head) {
      if (closed || !validateUpgrade(request)) return rejectUpgrade(socket, 403, 'Forbidden');
      if (!admitSocket(socket)) return rejectUpgrade(socket, 429, 'Too Many Requests');
      return server.handleUpgrade(request, socket, head, open);
    },
    close() {
      if (closed) return;
      closed = true;
      clock.clearTimeout(timer);
      rooms.close();
      for (const connection of connections) {
        clock.clearTimeout(connection.authTimer);
        if (connection.closeTimer !== null) clock.clearTimeout(connection.closeTimer);
        connection.ws.terminate();
      }
      connections.clear();
      server.close();
    },
  };
}
