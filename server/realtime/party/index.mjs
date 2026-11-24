import { performance } from 'node:perf_hooks';
import { createPartyRooms, PartyError } from '../../party/rooms.mjs';
import { rejectUpgrade } from '../../reject-upgrade.mjs';
import { WebSocketServer } from '../../runtime/gravity-orchard-dependencies.mjs';
import { PARTY_LIMITS as limits, takeBudget, validAuth } from './protocol.mjs';
import { PARTY_TICK_MS } from './round.mjs';

const realClock = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: handle => clearTimeout(handle),
};
const OPEN = 1;
const CLOSE_GRACE_MS = 150;

export function createPartyRealtime({ validateUpgrade, admitSocket, clock = realClock, seed }) {
  const rooms = createPartyRooms({ now: () => clock.now(), seed });
  const server = new WebSocketServer({
    noServer: true, clientTracking: false, perMessageDeflate: false, autoPong: false,
    maxPayload: limits.frameBytes, maxFragments: limits.maxFragments, maxBufferedChunks: limits.maxBufferedChunks,
  });
  const connections = new Set();
  let closed = false;
  let previousPump = clock.now();
  let nextPing = previousPump + limits.pingMs;
  let timer;

  function schedule(fn, ms) {
    const handle = clock.setTimeout(fn, ms);
    handle?.unref?.();
    return handle;
  }

  function send(connection, packet) {
    const { ws } = connection;
    if (connection.closing || ws.readyState !== OPEN) return;
    const payload = JSON.stringify(packet);
    if (ws.bufferedAmount > limits.sendBufferBytes
      || (connection.seat !== connection.room.host && Buffer.byteLength(payload) > limits.phoneSnapshotBytes)) {
      connection.terminate(1011);
      return;
    }
    ws.send(payload);
  }

  function snapshot(connection, time, type) {
    send(connection, { type, view: rooms.project(connection.room, connection.seat) });
    connection.nextSnapshot = time + (connection.seat === connection.room.host ? PARTY_TICK_MS : limits.phoneSnapshotMs);
  }

  function authenticate(connection, message, time) {
    if (!validAuth(message)) return connection.terminate(1008);
    const room = rooms.find(message.code);
    const seat = rooms.authorize(room, message.token);
    if (!seat) return connection.terminate(4403);
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
    if (message.type === 'input') {
      rooms.acceptInput(room, seat, message, connection);
      return;
    }
    try {
      rooms.command(room, seat, message);
    } catch (error) {
      if (!(error instanceof PartyError)) throw error;
      // Administrative rejections are useful, but cannot become a reply flood.
      if (time >= connection.nextError) {
        connection.nextError = time + 1000;
        send(connection, { type: 'error', code: error.code, message: error.message });
      }
    }
  }

  function open(ws) {
    const connection = {
      ws, seat: null, room: null, closing: false, lastPong: clock.now(), lastSeq: -1,
      nextSnapshot: 0, nextError: 0, authTimer: null, closeTimer: null,
      terminate(code) {
        if (connection.closing) return;
        connection.closing = true;
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
    const time = clock.now();
    const hostSlept = time - previousPump >= limits.pongMs;
    previousPump = time;
    rooms.tick(time);
    const ping = time >= nextPing;
    if (ping) nextPing = time + limits.pingMs;
    for (const connection of connections) {
      if (!connection.seat || connection.closing) continue;
      // A sleeping host cannot observe pongs. Probe once more on wake.
      if (hostSlept) connection.lastPong = time;
      if (time - connection.lastPong >= limits.pongMs) {
        connection.terminate(4000);
        continue;
      }
      if (ping && connection.ws.readyState === OPEN) connection.ws.ping();
      if (time >= connection.nextSnapshot) snapshot(connection, time, 'snapshot');
    }
    if (!closed) timer = schedule(pump, PARTY_TICK_MS);
  }
  timer = schedule(pump, PARTY_TICK_MS);

  return {
    rooms,
    handleUpgrade(request, socket, head) {
      if (closed || !validateUpgrade(request)) return rejectUpgrade(socket, 403, 'Forbidden');
      if (!admitSocket(socket)) return rejectUpgrade(socket, 429, 'Too Many Requests');
      return server.handleUpgrade(request, socket, head, open);
    },
    close() {
      closed = true;
      clock.clearTimeout(timer);
      for (const connection of connections) connection.ws.terminate();
      server.close();
    },
  };
}
