import { ENDPOINT, SAFE_INPUT, CLIENT_LIMITS, byteLength, boundedJson, exact, identifier,
  roomIdentifier, normalizeIntent, normalizeCommand, validateViewer, validateSnapshot,
  safeResultCode, clientError } from './lib/protocol.mjs';

export { CLIENT_LIMITS } from './lib/protocol.mjs';

/**
 * One authenticated browser socket, one latest control latch, one bounded set of
 * pending reliable commands. This module owns no room/simulation authority.
 *
 * connect()/dispose(): synchronous, idempotent. setInput(): boolean validity.
 * sendCommand({id,kind,payload}): Promise of the server's command-result; its
 * original match/epoch survives retries and reconnects. Local failures reject
 * with a fixed safe error.code. getStats(): copied, credential-free diagnostics.
 */
export function createRealtimeClient({ url, roomCode, token, onSnapshot = () => {},
  onStatus = () => {}, now = () => globalThis.performance.now(),
  WebSocketImpl = globalThis.WebSocket } = {}) {
  let endpoint;
  try {
    endpoint = new URL(url, globalThis.location?.href);
    if (!['ws:', 'wss:'].includes(endpoint.protocol) || endpoint.pathname !== ENDPOINT
      || endpoint.search || endpoint.hash || endpoint.username || endpoint.password
      || !roomIdentifier(roomCode) || typeof token !== 'string' || !/^[\x21-\x7e]{1,2048}$/.test(token)
      || typeof now !== 'function' || typeof WebSocketImpl !== 'function'
      || typeof onSnapshot !== 'function' || typeof onStatus !== 'function') throw new Error();
  } catch { throw clientError('invalid_configuration'); }

  let bearer = token;
  token = undefined; // Do not retain a second credential binding.
  let socket = null;
  let handlers = null;
  let generation = 0;
  let disposed = false;
  let authenticated = false;
  let attempted = false;
  let terminal = false;
  let state = 'offline';
  let statusMessage;
  let viewer = null;
  let controllerEpoch = null;
  let identity = null;
  let serverSeq = -1;
  let nextInputSeq = 0;
  let lastAckSeq = -1;
  let latestInput = { ...SAFE_INPUT };
  let inputDirty = false;
  let reconnectAttempts = 0;
  let reconnectTimer = null;
  let welcomeTimer = null;
  let pumpTimer = null;
  let lastTime = 0;
  let lastReceiveAt = 0;
  let lastPingAt = -Infinity;
  let pingSerial = 0;
  let ping = null;
  let slowSince = null;
  let commandTokens = CLIENT_LIMITS.commandBurst;
  let commandTokenAt = 0;
  const inputReceipts = new Map();
  const pending = new Map();
  const settled = new Map();
  const retiredMatches = new Set();
  const counters = { inputsSent: 0, inputsCoalesced: 0, inputsDropped: 0,
    snapshotsReceived: 0, snapshotsDropped: 0, commandsSent: 0, commandRetries: 0,
    reconnects: 0, maxBufferedBytes: 0, callbackErrors: 0, invalidMessages: 0,
    ackRttMs: null, ackRttEwmaMs: null, pingRttMs: null,
    lastAppliedTick: null, appliedInputAgeTicks: null, observedTickAgeAtApply: null };

  function time() {
    try { const value = now(); if (Number.isFinite(value)) lastTime = Math.max(lastTime, value); } catch {}
    return lastTime;
  }
  function callback(fn, value) {
    if (disposed) return;
    try { fn(value); } catch { counters.callbackErrors++; }
  }
  function status(next, message) {
    if (disposed || (state === next && statusMessage === message)) return;
    state = next;
    statusMessage = message;
    callback(onStatus, message ? { state: next, message } : { state: next });
  }
  function neutralize() {
    latestInput = { ...SAFE_INPUT };
    inputDirty = false;
    inputReceipts.clear();
    lastAckSeq = -1;
    counters.lastAppliedTick = null;
    counters.appliedInputAgeTicks = null;
    counters.observedTickAgeAtApply = null;
  }
  function buffered() {
    const value = socket?.bufferedAmount;
    const amount = Number.isFinite(value) && value >= 0 ? value : 0;
    counters.maxBufferedBytes = Math.max(counters.maxBufferedBytes, amount);
    return amount;
  }
  function writable() {
    if (!socket || socket.readyState !== 1) return false;
    const amount = buffered();
    if (amount >= CLIENT_LIMITS.hardBufferedBytes) { disconnect(4429, false); return false; }
    if (amount >= CLIENT_LIMITS.softBufferedBytes) {
      if (slowSince === null) slowSince = time();
      if (time() - slowSince >= CLIENT_LIMITS.slowBufferMs) disconnect(4429, false);
      return false;
    }
    slowSince = null;
    return true;
  }
  function send(message, limit = 4096) {
    if (!writable()) return false;
    const encoded = JSON.stringify(message);
    if (byteLength(encoded) > limit) return false;
    const connection = socket;
    const expectedGeneration = generation;
    try {
      connection.send(encoded);
      if (disposed || socket !== connection || expectedGeneration !== generation) return false;
      buffered();
      return true;
    }
    catch { disconnect(1006, false); return false; }
  }
  function clearSocket() {
    clearTimeout(welcomeTimer);
    clearTimeout(pumpTimer);
    welcomeTimer = pumpTimer = null;
    const previous = socket;
    socket = null;
    if (previous && handlers) for (const [type, handler] of Object.entries(handlers)) previous.removeEventListener(type, handler);
    handlers = null;
    authenticated = false;
    controllerEpoch = null;
    ping = null;
    slowSince = null;
    neutralize();
    generation++; // Fence callbacks already queued before removeEventListener.
    return previous;
  }
  function settle(entry, result, error) {
    if (pending.get(entry.envelope.id) !== entry) return;
    pending.delete(entry.envelope.id);
    settled.set(entry.envelope.id, entry);
    while (settled.size > CLIENT_LIMITS.maxSettledCommands) settled.delete(settled.keys().next().value);
    if (error) entry.reject(error); else entry.resolve(result);
  }
  function rejectPending(code) {
    for (const entry of [...pending.values()]) settle(entry, null, clientError(code));
  }
  function scheduleReconnect() {
    if (disposed || terminal || reconnectTimer !== null) return;
    status('reconnecting', 'Connection interrupted. Reconnecting safely…');
    if (disposed) return;
    const delay = Math.min(CLIENT_LIMITS.reconnectMaxMs,
      CLIENT_LIMITS.reconnectMinMs * 2 ** Math.min(reconnectAttempts++, 5));
    reconnectTimer = setTimeout(() => { reconnectTimer = null; openSocket(); }, delay);
  }
  function disconnect(code, fromSocket = true) {
    if (disposed || !socket) return;
    const previous = clearSocket();
    if (!fromSocket && previous) {
      try { previous.close(code >= 3000 ? code : 4000, 'realtime_connection_closed'); } catch {}
    }
    terminal = [1002, 1009, 4400, 4401, 4409, 4410].includes(code);
    if (terminal) {
      const message = code === 4409 ? 'This controller was replaced by another connection.'
        : code === 4410 ? 'This room has closed.'
          : code === 4401 ? 'This room credential is no longer authorized. Rejoin the room.'
            : 'The realtime protocol was rejected. Rejoin the room.';
      status(code === 4409 || code === 4410 ? 'offline' : 'error', message);
      rejectPending('connection_ended');
    } else scheduleReconnect();
  }

  function rememberMatch(matchId) {
    if (identity?.matchId && identity.matchId !== matchId) {
      retiredMatches.add(identity.matchId);
      while (retiredMatches.size > CLIENT_LIMITS.maxRetiredMatches) retiredMatches.delete(retiredMatches.values().next().value);
    }
  }
  function snapshot(message, isWelcome = false) {
    if (!validateSnapshot(message, roomCode)) return false;
    const view = message.view;
    if ((!isWelcome && message.serverSeq <= serverSeq) || retiredMatches.has(view.matchId)
      || (identity?.matchId === view.matchId && (view.runEpoch < identity.runEpoch
        || (!isWelcome && view.runEpoch === identity.runEpoch && view.tick < identity.tick)))) {
      counters.snapshotsDropped++;
      return !isWelcome; // An old cached result is harmless; an obsolete welcome is not a new authority.
    }
    if (message.ack !== null && (!controllerEpoch || message.ack.controllerEpoch !== controllerEpoch
      || message.ack.seq >= nextInputSeq)) return false;
    const boundary = !identity || view.matchId !== identity.matchId || view.runEpoch !== identity.runEpoch;
    if (boundary) { rememberMatch(view.matchId); neutralize(); }
    identity = { matchId: view.matchId, runEpoch: view.runEpoch, tick: view.tick, phase: view.phase };
    serverSeq = message.serverSeq;
    counters.snapshotsReceived++;
    if (message.ack && message.ack.seq > lastAckSeq) {
      const receipt = inputReceipts.get(message.ack.seq);
      if (receipt && receipt.matchId === view.matchId && receipt.runEpoch === view.runEpoch) {
        const rtt = Math.max(0, time() - receipt.sentAt);
        counters.ackRttMs = rtt;
        counters.ackRttEwmaMs = counters.ackRttEwmaMs === null ? rtt : counters.ackRttEwmaMs * 0.8 + rtt * 0.2;
        // This includes transport plus tick scheduling; it is not the exact
        // server receipt lag and is not a one-way wall-clock latency estimate.
        counters.observedTickAgeAtApply = Math.max(0, message.ack.appliedTick - receipt.observedTick);
      }
      lastAckSeq = message.ack.seq;
      counters.lastAppliedTick = message.ack.appliedTick;
      for (const seq of inputReceipts.keys()) if (seq <= message.ack.seq) inputReceipts.delete(seq);
    }
    if (message.ack) counters.appliedInputAgeTicks = view.tick - message.ack.appliedTick;
    callback(onSnapshot, message);
    return true;
  }
  function invalidMessage() {
    counters.invalidMessages++;
    disconnect(4400, false);
  }
  function receive(event, expectedGeneration) {
    if (disposed || expectedGeneration !== generation || !socket) return;
    if (typeof event.data !== 'string' || byteLength(event.data) > CLIENT_LIMITS.maxInboundBytes) { invalidMessage(); return; }
    let message;
    try { message = JSON.parse(event.data); } catch { invalidMessage(); return; }
    if (!boundedJson(message) || message?.protocol !== 1) { invalidMessage(); return; }
    lastReceiveAt = time();
    if (!authenticated) {
      if (!exact(message, ['type', 'protocol', 'viewer', 'controllerEpoch', 'snapshot'])
        || message.type !== 'welcome' || !validateViewer(message.viewer)
        || (message.viewer.role === 'player' ? !identifier(message.controllerEpoch) : message.controllerEpoch !== null)) {
        invalidMessage(); return;
      }
      viewer = { ...message.viewer };
      controllerEpoch = message.controllerEpoch;
      nextInputSeq = 0;
      serverSeq = -1;
      authenticated = true;
      clearTimeout(welcomeTimer);
      welcomeTimer = null;
      if (!snapshot(message.snapshot, true)) { invalidMessage(); return; }
      if (disposed || expectedGeneration !== generation) return;
      reconnectAttempts = 0;
      // Sending immediately gives the coordinator usable current controllers
      // before a fast user taps Ready. Later samples remain fixed at 20 Hz.
      pump();
      if (!disposed && expectedGeneration === generation && authenticated) status('connected');
      return;
    }
    if (message.type === 'snapshot') {
      if (!snapshot(message)) invalidMessage();
      return;
    }
    if (message.type === 'pong') {
      if (!exact(message, ['type', 'protocol', 'id']) || !identifier(message.id)) { invalidMessage(); return; }
      if (ping?.id === message.id) { counters.pingRttMs = Math.max(0, time() - ping.sentAt); ping = null; }
      return;
    }
    if (message.type === 'command-result') {
      if (!identifier(message.id) || typeof message.accepted !== 'boolean'
        || Object.keys(message).some(key => !['type', 'protocol', 'id', 'accepted', 'code', 'snapshot'].includes(key))) {
        invalidMessage(); return;
      }
      const entry = pending.get(message.id);
      if (!entry) return; // Late duplicate acknowledgments cannot change the view.
      if (message.snapshot !== undefined && !snapshot(message.snapshot)) { invalidMessage(); return; }
      const result = { type: 'command-result', protocol: 1, id: message.id, accepted: message.accepted };
      if (message.code !== undefined) result.code = safeResultCode(message.code);
      if (message.snapshot !== undefined) result.snapshot = message.snapshot;
      settle(entry, result);
      return;
    }
    invalidMessage();
  }
  function sendInput() {
    if (!authenticated || !identity || viewer?.role !== 'player') return;
    if (nextInputSeq >= Number.MAX_SAFE_INTEGER) { disconnect(4000, false); return; }
    const input = identity.phase === 'playing' ? latestInput : SAFE_INPUT;
    const message = { type: 'input', protocol: 1, matchId: identity.matchId,
      runEpoch: identity.runEpoch, controllerEpoch, seq: nextInputSeq,
      observedTick: identity.tick, x: input.x, y: input.y, brake: input.brake };
    if (!send(message, 512)) { counters.inputsDropped++; return; }
    inputReceipts.set(nextInputSeq++, { sentAt: time(), matchId: identity.matchId,
      runEpoch: identity.runEpoch, observedTick: identity.tick });
    while (inputReceipts.size > CLIENT_LIMITS.maxInputReceipts) inputReceipts.delete(inputReceipts.keys().next().value);
    counters.inputsSent++;
    inputDirty = false;
  }
  function sendPending() {
    const at = time();
    commandTokens = Math.min(CLIENT_LIMITS.commandBurst,
      commandTokens + Math.max(0, at - commandTokenAt) * CLIENT_LIMITS.commandFramesPerSecond / 1000);
    commandTokenAt = at;
    let sent = 0;
    // Least recently sent first prevents one uncertain command from starving
    // newer commands. Retries share the same bounded rate as first attempts.
    for (const entry of [...pending.values()].sort((a, b) => a.lastSentAt - b.lastSentAt)) {
      if (sent >= 4 || commandTokens < 1) break;
      if (time() - entry.lastSentAt < CLIENT_LIMITS.commandRetryMs) continue;
      if (!send(entry.envelope)) break;
      commandTokens -= 1;
      if (entry.attempts++) counters.commandRetries++;
      entry.lastSentAt = time();
      counters.commandsSent++;
      sent++;
    }
  }
  function pump() {
    clearTimeout(pumpTimer);
    pumpTimer = null;
    if (disposed || !authenticated || !socket) return;
    if (time() - lastReceiveAt >= CLIENT_LIMITS.idleTimeoutMs) { disconnect(4008, false); return; }
    sendInput();
    if (!authenticated || !socket) return;
    sendPending();
    if (!authenticated || !socket) return;
    if (time() - lastPingAt >= CLIENT_LIMITS.pingIntervalMs) {
      const id = `p:${++pingSerial}`;
      if (send({ type: 'ping', protocol: 1, id })) { ping = { id, sentAt: time() }; lastPingAt = time(); }
    }
    if (!disposed && authenticated && socket) pumpTimer = setTimeout(pump, CLIENT_LIMITS.inputIntervalMs);
  }
  function openSocket() {
    if (disposed || socket || terminal) return;
    const wasAttempted = attempted;
    attempted = true;
    if (wasAttempted) counters.reconnects++;
    status(wasAttempted ? 'reconnecting' : 'connecting');
    if (disposed) return;
    const expectedGeneration = ++generation;
    neutralize();
    let connection;
    try { connection = new WebSocketImpl(endpoint.href); }
    catch { scheduleReconnect(); return; }
    if (disposed || expectedGeneration !== generation) {
      try { connection.close(1000, 'client_disposed'); } catch {}
      return;
    }
    socket = connection;
    handlers = {
      open: () => {
        if (disposed || expectedGeneration !== generation || socket !== connection) return;
        if (!send({ type: 'auth', protocol: 1, roomCode, token: bearer })) disconnect(4008, false);
      },
      message: event => receive(event, expectedGeneration),
      close: event => {
        if (disposed || expectedGeneration !== generation || socket !== connection) return;
        disconnect(event.code, true);
      },
      error: () => {
        if (disposed || expectedGeneration !== generation || socket !== connection) return;
        disconnect(1006, false);
      },
    };
    try { for (const [type, handler] of Object.entries(handlers)) connection.addEventListener(type, handler); }
    catch { disconnect(4400, false); return; }
    welcomeTimer = setTimeout(() => {
      if (expectedGeneration === generation && !authenticated) disconnect(4008, false);
    }, CLIENT_LIMITS.welcomeTimeoutMs);
  }

  return Object.freeze({
    connect() {
      if (disposed || socket || reconnectTimer !== null) return;
      // A replaced mount never reconnects itself and steals the seat back. An
      // explicit new user connect() may reclaim it; invalid credentials cannot.
      if (terminal && state === 'error') return;
      terminal = false;
      openSocket();
    },
    setInput(value) {
      if (disposed) return false;
      const normalized = normalizeIntent(value);
      if (!normalized) { counters.inputsDropped++; return false; }
      if (inputDirty) counters.inputsCoalesced++;
      latestInput = authenticated && identity?.phase === 'playing' ? normalized : { ...SAFE_INPUT };
      inputDirty = true;
      return true;
    },
    sendCommand(command) {
      if (disposed) return Promise.reject(clientError('disposed'));
      const normalized = normalizeCommand(command);
      if (!normalized) return Promise.reject(clientError('invalid_command'));
      const fingerprint = JSON.stringify(normalized);
      const previous = pending.get(normalized.id) || settled.get(normalized.id);
      if (previous) return previous.fingerprint === fingerprint ? previous.promise : Promise.reject(clientError('command_conflict'));
      if (!authenticated || !identity) return Promise.reject(clientError('not_connected'));
      if (pending.size >= CLIENT_LIMITS.maxPendingCommands) return Promise.reject(clientError('command_queue_full'));
      const envelope = { type: 'command', protocol: 1, id: normalized.id,
        matchId: identity.matchId, runEpoch: identity.runEpoch,
        kind: normalized.kind, payload: normalized.payload };
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      const entry = { envelope, fingerprint, promise, resolve, reject, lastSentAt: -Infinity, attempts: 0 };
      pending.set(normalized.id, entry);
      sendPending();
      return promise;
    },
    getStats() {
      const bufferedBytes = buffered();
      return { ...counters, state, connected: authenticated && !disposed,
        viewer: viewer ? { ...viewer } : null, matchId: identity?.matchId ?? null,
        runEpoch: identity?.runEpoch ?? null, tick: identity?.tick ?? null,
        serverSeq, lastAckSeq: lastAckSeq < 0 ? null : lastAckSeq,
        bufferedBytes, pendingCommands: pending.size, inFlightInputs: inputReceipts.size };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      terminal = true;
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
      const previous = clearSocket();
      try { previous?.close(1000, 'client_disposed'); } catch {}
      rejectPending('disposed');
      settled.clear();
      retiredMatches.clear();
      bearer = null;
      viewer = null;
      identity = null;
      state = 'offline';
      onSnapshot = onStatus = null;
    },
  });
}
