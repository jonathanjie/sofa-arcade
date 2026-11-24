import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { WebSocket, WebSocketServer } from 'ws';
import {
  ENDPOINT, LIMITS, PLAYERS, PUBLIC_VIEWER, SAFE_INPUT, actorKey, boundedJson,
  checkedView, commandFingerprint, commandResult, exactKeys, identifier, normalizeCommand,
  roomIdentifier, takeToken, validAuth, validInput, validViewer,
} from './lib/protocol.mjs';
import { decodeCheckpoint, encodeCheckpoint, errorWithCode, insertDedup } from './lib/checkpoint.mjs';

export { ENDPOINT, LIMITS } from './lib/protocol.mjs';
const diagnostics = new WeakMap();

/** Safe host-only counters, deliberately outside the frozen production API. */
export function readCoordinatorDiagnostics(coordinator, roomCode) {
  const read = diagnostics.get(coordinator);
  return read ? read(roomCode) : null;
}

const realClock = { now: () => performance.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id) };
const activePhase = (view) => view.phase === 'playing' || view.phase === 'countdown';
const sameViewer = (left, right) => validViewer(right) && left.role === right.role && left.playerId === right.playerId;
const boundary = (before, after) => before.matchId !== after.matchId || before.runEpoch !== after.runEpoch
  || before.phase !== after.phase || before.stageIndex !== after.stageIndex;
const SAFE_SIMULATION_CODES = new Set(['forbidden', 'invalid_command', 'invalid-command', 'invalid_phase', 'invalid-phase',
  'wrong_phase', 'wrong-phase', 'host_required', 'player_required', 'not_ready', 'unknown_command', 'unknown-command']);

/**
 * One injected authority and checkpoint store; no listener or database is created.
 * clock = { now(): milliseconds, setTimeout(fn, ms), clearTimeout(handle) }.
 * startRoom/pauseRoom return promises of public SnapshotMessage (or null when absent).
 * getPublicView is synchronous. closeRoom/close return draining promises.
 */
export function createRealtimeCoordinator({ authorize, validateUpgrade, loadCheckpoint, saveCheckpoint, simulation, clock = realClock, onLifecycle = () => {} } = {}) {
  for (const [name, fn] of Object.entries({ authorize, loadCheckpoint, saveCheckpoint })) {
    if (typeof fn !== 'function') throw errorWithCode(`missing_${name}`);
  }
  for (const name of ['createRun', 'normalizeInput', 'step', 'applyCommand', 'pauseForSystem', 'project', 'serializeCheckpoint', 'restoreCheckpoint']) {
    if (typeof simulation?.[name] !== 'function') throw errorWithCode('invalid_simulation');
  }
  if (['now', 'setTimeout', 'clearTimeout'].some((name) => typeof clock?.[name] !== 'function')) throw errorWithCode('invalid_clock');
  const rooms = new Map();
  const starting = new Map();
  const closingRooms = new Map();
  const connections = new Set();
  const draining = new Set();
  const timers = new Set();
  const server = new WebSocketServer({ noServer: true, clientTracking: false, maxPayload: LIMITS.maxFrameBytes,
    maxFragments: LIMITS.maxFragments, maxBufferedChunks: LIMITS.maxBufferedChunks, perMessageDeflate: false, autoPong: false });
  let closed = false;
  let closing = null;
  let serverSeq = 0;
  let pendingAuth = 0;
  let pendingAuthorityCalls = 0;
  let lastNow = 0;
  const globalStats = { rejectedUpgrades: 0, authenticated: 0, rejectedAuth: 0, closedSockets: 0 };
  function now() {
    const value = clock.now();
    if (!Number.isFinite(value) || value < lastNow) throw errorWithCode('invalid_clock');
    lastNow = value;
    return value;
  }
  function schedule(fn, delay) {
    let handle;
    handle = clock.setTimeout(() => { timers.delete(handle); fn(); }, Math.max(0, delay));
    timers.add(handle);
    handle?.unref?.();
    return handle;
  }
  function cancel(handle) {
    if (handle === null || handle === undefined) return;
    timers.delete(handle);
    clock.clearTimeout(handle);
  }
  function withDeadline(promise, ms, code) {
    let handle;
    const timeout = new Promise((_, reject) => { handle = schedule(() => reject(errorWithCode(code)), ms); });
    return Promise.race([promise, timeout]).finally(() => cancel(handle));
  }
  function callAuthorize(args) {
    // A misbehaving injected authorizer may never settle. Bound outstanding calls,
    // including abandoned sockets, rather than repeatedly allocating hung work.
    if (pendingAuthorityCalls >= LIMITS.maxPendingAuth * 2) return Promise.resolve(null);
    pendingAuthorityCalls++;
    return Promise.resolve().then(() => authorize(args)).finally(() => { pendingAuthorityCalls--; });
  }
  function lifecycle(room, kind) {
    if (room.closed || closed) return;
    if (room.lifecyclePending) room.stats.lifecycleCoalesced++;
    room.lifecyclePending = { roomCode: room.roomCode, kind, view: structuredClone(room.view) };
    if (room.lifecycleRunning) return;
    room.lifecycleRunning = true;
    room.lifecycleTail = (async () => {
      while (room.lifecyclePending && !room.closed && !closed) {
        const packet = room.lifecyclePending;
        room.lifecyclePending = null;
        try { await onLifecycle(packet); } catch { room.stats.lifecycleErrors++; }
      }
    })().finally(() => { room.lifecycleRunning = false; });
  }
  function newSeat() {
    return { conn: null, latest: null, lastSeq: -1, lastValidAt: null, ack: null, graceAt: now() };
  }
  function clearInputs(room) {
    for (const seat of Object.values(room.seats)) {
      seat.latest = null;
      seat.lastValidAt = null;
      seat.ack = null;
      seat.graceAt = now();
      // Sequence remains increasing within the controller epoch, even across run epochs.
    }
  }
  function usable(conn) {
    return !!conn && conn.active && conn.authenticated && conn.ws.readyState === WebSocket.OPEN
      && now() - conn.verifiedAt < LIMITS.maxAuthAgeMs;
  }
  function fresh(seat) {
    return usable(seat.conn) && seat.latest !== null && now() - seat.lastValidAt + 1e-7 < LIMITS.staleInputMs;
  }
  function presence(room) {
    return Object.fromEntries(PLAYERS.map((id) => [id, { connected: usable(room.seats[id].conn), inputFresh: fresh(room.seats[id]) }]));
  }
  function snapshot(room, conn = null, viewer = PUBLIC_VIEWER) {
    if (!Number.isSafeInteger(serverSeq + 1)) throw errorWithCode('sequence_exhausted');
    const ack = conn?.viewer?.role === 'player' && room.seats[conn.viewer.playerId].conn === conn
      ? room.seats[conn.viewer.playerId].ack : null;
    return { type: 'snapshot', protocol: 1, roomCode: room.roomCode, serverSeq: ++serverSeq,
      view: checkedView(simulation, room.state, viewer), presence: presence(room), ack: ack ? { ...ack } : null };
  }
  function finishDisconnect(conn) {
    cancel(conn.closeTimer); conn.closeTimer = null; draining.delete(conn);
  }
  function disconnect(conn, code = 1000, reason = 'closed', terminate = false) {
    if (!conn.active) { if (conn.ws.readyState === WebSocket.CLOSED) finishDisconnect(conn); return; }
    conn.active = false;
    cancel(conn.authTimer); cancel(conn.reauthTimer);
    conn.authTimer = conn.reauthTimer = null;
    if (!conn.authenticated) pendingAuth--;
    const room = conn.room;
    if (room) {
      room.connections.delete(conn);
      if (conn.viewer?.role === 'player') {
        const seat = room.seats[conn.viewer.playerId];
        if (seat.conn === conn) {
          seat.conn = null; seat.latest = null; seat.ack = null;
          // Preserve last receipt time so repeated reconnects cannot reset the deadman.
          if (!room.closed && !room.fault && conn.authenticated) {
            enqueue(room, async () => {
              // This cleanup follows the departing socket's writes and precedes the next Welcome.
              if (!room.view.ready[conn.viewer.playerId]) return;
              const result = simulation.applyCommand(room.state, conn.viewer, { kind: 'ready', payload: { value: false } });
              if (result.accepted && result.state !== room.state) await commit(room, result.state, room.dedup, 'presence');
            }, { system: true }).catch(() => {});
          }
        }
      }
      room.stats.disconnections++;
      lifecycle(room, 'presence');
    }
    conn.bearer = null; conn.pendingSnapshot = null;
    connections.delete(conn);
    globalStats.closedSockets++;
    try {
      conn.ws.close(code, reason);
      if (terminate || conn.ws.readyState === WebSocket.CLOSED) { conn.ws.terminate(); finishDisconnect(conn); }
      else {
        draining.add(conn);
        conn.closeTimer = schedule(() => { conn.ws.terminate(); finishDisconnect(conn); }, 250);
      }
    } catch { conn.ws.terminate(); }
  }
  function send(conn, value, coalescible = false) {
    if (!conn.active || conn.ws.readyState !== WebSocket.OPEN) return false;
    const room = conn.room;
    const buffered = conn.ws.bufferedAmount;
    if (room) room.stats.maxBufferedBytes = Math.max(room.stats.maxBufferedBytes, buffered);
    if (buffered >= LIMITS.outgoingHardBytes) { disconnect(conn, 4429, 'slow_reader'); return false; }
    let data;
    try { data = JSON.stringify(value); } catch { disconnect(conn, 1011, 'invalid_projection'); return false; }
    if (Buffer.byteLength(data) > LIMITS.maxSnapshotBytes) { disconnect(conn, 1011, 'invalid_projection'); return false; }
    if (coalescible && (conn.sendingSnapshot || buffered >= LIMITS.outgoingSoftBytes)) {
      conn.pendingSnapshot = data;
      room.stats.snapshotsCoalesced++;
      conn.slowSince ??= now();
      if (now() - conn.slowSince >= LIMITS.slowReaderMs) disconnect(conn, 4429, 'slow_reader');
      return false;
    }
    if (!coalescible && buffered >= LIMITS.outgoingSoftBytes) { disconnect(conn, 4429, 'slow_reader'); return false; }
    if (coalescible) {
      // This newly emitted snapshot supersedes an older coalesced frame too.
      conn.pendingSnapshot = null;
      conn.sendingSnapshot = true;
    }
    try {
      conn.ws.send(data, (error) => {
        if (coalescible) conn.sendingSnapshot = false;
        if (error) { disconnect(conn, 1011, 'send_failed'); return; }
        if (conn.active && conn.pendingSnapshot && conn.ws.bufferedAmount < LIMITS.outgoingSoftBytes) {
          const latest = conn.pendingSnapshot;
          conn.pendingSnapshot = null; conn.slowSince = null;
          // One bounded latest snapshot, never a FIFO of historical world frames.
          conn.sendingSnapshot = true;
          conn.ws.send(latest, (failure) => { conn.sendingSnapshot = false; if (failure) disconnect(conn, 1011, 'send_failed'); });
        }
      });
      if (room && coalescible) room.stats.snapshotsSent++;
      if (buffered < LIMITS.outgoingSoftBytes && !conn.pendingSnapshot) conn.slowSince = null;
      return true;
    } catch { disconnect(conn, 1011, 'send_failed'); return false; }
  }
  function broadcast(room, periodic = false) {
    if (room.closed || room.fault || room.blocked) return;
    for (const conn of room.connections) if (usable(conn)) send(conn, snapshot(room, conn, conn.viewer), true);
    const at = now();
    room.lastSnapshotAt = at;
    room.nextSnapshotAt = periodic
      ? room.nextSnapshotAt + (Math.floor(Math.max(0, at - room.nextSnapshotAt) / LIMITS.snapshotMs) + 1) * LIMITS.snapshotMs
      : at + LIMITS.snapshotMs;
  }
  function storageFault(room) {
    if (room.closed || room.fault) return;
    room.fault = true; room.blocked = true; room.stats.checkpointErrors++;
    clearInputs(room); cancel(room.tickTimer); room.tickTimer = null;
    for (const conn of [...room.connections]) disconnect(conn, 1011, 'storage_unavailable');
    lifecycle(room, 'storage-error');
  }
  function persist(room, checkpoint) {
    room.stats.checkpointsQueued++;
    const write = room.storeTail.catch(() => {}).then(async () => {
      room.stats.checkpointsWriting++;
      try {
        await saveCheckpoint(room.roomCode, checkpoint);
        room.stats.checkpointsSaved++;
      } finally { room.stats.checkpointsWriting--; }
    });
    // Keep the actual store operation chained even if its deadline expires; no later
    // write can overtake an outstanding write and roll the durable epoch backwards.
    room.storeTail = write;
    return withDeadline(write, LIMITS.checkpointTimeoutMs, 'storage_unavailable');
  }
  async function commit(room, state, dedup, kind, metadata = room, countdownControllers = null) {
    if (room.closed || room.fault) throw errorWithCode('room_unavailable');
    let view = checkedView(simulation, state);
    const changedEpoch = view.matchId !== room.view.matchId || view.runEpoch !== room.view.runEpoch;
    room.blocked = true;
    if (changedEpoch) clearInputs(room);
    try {
      await persist(room, encodeCheckpoint(room, state, view, dedup, simulation, metadata));
      if (room.closed || closed) return false;
      if (room.fault) throw errorWithCode('storage_unavailable');
      if (countdownControllers && PLAYERS.some((id) => {
        const conn = room.seats[id].conn;
        return conn !== countdownControllers[id] || !usable(conn);
      })) {
        // The save yielded after both Ready checks. Fence the durable countdown
        // before any viewer can see it if either original controller went away.
        state = simulation.pauseForSystem(state, 'network');
        view = checkedView(simulation, state);
        kind = 'network';
        await persist(room, encodeCheckpoint(room, state, view, dedup, simulation, metadata));
        if (room.closed || closed) return false;
        if (room.fault) throw errorWithCode('storage_unavailable');
      }
      room.state = state; room.view = view; room.dedup = dedup;
      room.seed = metadata.seed; room.options = metadata.options;
      room.blocked = false; room.initializing = false; room.lastSchedulerAt = now(); room.accumulator = 0;
      room.lastCheckpointAt = now();
      if (changedEpoch) clearInputs(room);
      lifecycle(room, kind);
      broadcast(room);
      return true;
    } catch { storageFault(room); throw errorWithCode('storage_unavailable'); }
  }
  function enqueue(room, fn, { system = false } = {}) {
    if (room.closed || room.fault) return Promise.reject(errorWithCode('room_unavailable'));
    if (!system && room.pendingCommands >= LIMITS.maxPendingCommands) return Promise.reject(errorWithCode('command_overload'));
    room.pendingCommands++;
    const promise = room.commandTail.catch(() => {}).then(() => {
      if (room.closed || room.fault) throw errorWithCode('room_unavailable');
      room.executing = true;
      return Promise.resolve().then(fn).finally(() => { room.executing = false; });
    });
    room.commandTail = promise;
    return promise.finally(() => { room.pendingCommands--; });
  }
  function queuePause(room, reason) {
    if (room.pausePending || !activePhase(room.view) || room.closed || room.fault) return room.pausePending ?? Promise.resolve(null);
    room.blocked = true;
    clearInputs(room);
    room.pausePending = enqueue(room, async () => {
      if (!activePhase(room.view)) { room.blocked = false; return snapshot(room); }
      const state = simulation.pauseForSystem(room.state, reason);
      const view = checkedView(simulation, state);
      if (view.phase !== 'paused' || view.runEpoch <= room.view.runEpoch) throw errorWithCode('invalid_simulation');
      await commit(room, state, room.dedup, reason);
      return snapshot(room);
    }, { system: true }).catch((error) => { storageFault(room); throw error; }).finally(() => { room.pausePending = null; });
    return room.pausePending;
  }
  function periodicCheckpoint(room) {
    if (room.periodicPending || room.blocked || room.closed || room.fault || !activePhase(room.view)
      || now() - room.lastCheckpointAt < LIMITS.checkpointMs) return;
    room.lastCheckpointAt = now();
    let checkpoint;
    try { checkpoint = encodeCheckpoint(room, room.state, room.view, room.dedup, simulation); }
    catch { storageFault(room); return; }
    room.periodicPending = true;
    persist(room, checkpoint).catch(() => storageFault(room)).finally(() => { room.periodicPending = false; });
  }
  function tick(room) {
    room.tickTimer = null;
    if (closed || room.closed || room.fault) return;
    const at = now();
    const delta = at - room.lastSchedulerAt;
    room.lastSchedulerAt = at;
    if (room.blocked || room.executing) room.accumulator = 0;
    else if (activePhase(room.view) && delta > LIMITS.hostStallMs + 1e-7) {
      room.stats.hostStalls++;
      queuePause(room, 'host-stall').catch(() => {});
    } else {
      if (activePhase(room.view) && PLAYERS.some((id) => {
        const seat = room.seats[id];
        return at - (seat.lastValidAt ?? seat.graceAt) + 1e-7 >= LIMITS.pauseInputMs;
      })) {
        queuePause(room, 'network').catch(() => {});
      } else if (activePhase(room.view)) {
        room.accumulator += delta;
        const due = Math.floor((room.accumulator + 1e-7) / LIMITS.tickMs);
        const steps = Math.min(due, LIMITS.maxCatchUpTicks);
        if (due > steps) { room.stats.tickOverruns++; room.stats.skippedCatchUpTicks += due - steps; }
        room.accumulator -= due * LIMITS.tickMs;
        for (let index = 0; index < steps && !room.blocked; index++) {
          const inputs = Object.fromEntries(PLAYERS.map((id) => [id, fresh(room.seats[id]) ? room.seats[id].latest?.value ?? SAFE_INPUT : SAFE_INPUT]));
          let state, view;
          try {
            state = simulation.step(room.state, inputs); view = checkedView(simulation, state);
            if (view.matchId !== room.view.matchId || view.tick < room.view.tick || view.runEpoch < room.view.runEpoch
              || ((view.stageIndex !== room.view.stageIndex || view.phase === 'paused') && view.runEpoch <= room.view.runEpoch)) {
              throw errorWithCode('invalid_simulation');
            }
          } catch { storageFault(room); break; }
          room.stats.ticks++;
          if (boundary(room.view, view)) {
            room.blocked = true;
            enqueue(room, () => commit(room, state, room.dedup, view.phase), { system: true }).catch(() => storageFault(room));
            break;
          }
          room.state = state; room.view = view;
          if (view.phase !== 'playing') continue;
          for (const id of PLAYERS) {
            const seat = room.seats[id];
            if (fresh(seat) && seat.latest && seat.ack?.seq !== seat.latest.seq) {
              seat.ack = { controllerEpoch: seat.conn.controllerEpoch, seq: seat.latest.seq, appliedTick: view.tick };
              room.stats.inputsApplied++;
            }
          }
        }
      } else room.accumulator = 0;
      if (at + 1e-7 >= room.nextSnapshotAt) broadcast(room, true);
      periodicCheckpoint(room);
    }
    if (!room.closed && !room.fault) room.tickTimer = schedule(() => tick(room), LIMITS.tickMs);
  }
  function rejectInput(room, reason) {
    room.stats.inputsRejected++;
    room.stats.rejectedInputReasons[reason] = (room.stats.rejectedInputReasons[reason] ?? 0) + 1;
  }
  function input(conn, message, bytes) {
    const room = conn.room;
    if (bytes > LIMITS.maxInputBytes) { disconnect(conn, 4400, 'input_too_large'); return; }
    if (!takeToken(conn.inputBucket, now(), LIMITS.maxInputPerSecond, LIMITS.inputBurst)) {
      room.stats.rateLimited++; disconnect(conn, 4429, 'input_rate'); return;
    }
    if (!validInput(message)) { rejectInput(room, 'schema'); return; }
    if (conn.viewer.role !== 'player') { rejectInput(room, 'forbidden'); return; }
    const seat = room.seats[conn.viewer.playerId];
    if (!usable(conn) || seat.conn !== conn || room.closed || room.fault || room.blocked) { rejectInput(room, 'inactive'); return; }
    if (message.controllerEpoch !== conn.controllerEpoch) { rejectInput(room, 'controller_epoch'); return; }
    if (message.matchId !== room.view.matchId) { rejectInput(room, 'match'); return; }
    if (message.runEpoch !== room.view.runEpoch) { rejectInput(room, 'run_epoch'); return; }
    if (message.seq <= seat.lastSeq) { rejectInput(room, 'sequence'); return; }
    const age = room.view.tick - message.observedTick;
    if (age < 0 || age > LIMITS.maxObservedTickLag) { rejectInput(room, age < 0 ? 'future_tick' : 'stale_tick'); return; }
    let value;
    try { value = simulation.normalizeInput({ x: message.x, y: message.y, brake: message.brake }); } catch { value = null; }
    if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y) || typeof value.brake !== 'boolean') {
      rejectInput(room, 'normalization'); return;
    }
    if (seat.latest && seat.ack?.seq !== seat.latest.seq) room.stats.inputsCoalesced++;
    seat.latest = { value: { x: value.x, y: value.y, brake: value.brake }, seq: message.seq };
    seat.lastSeq = message.seq; seat.lastValidAt = now();
    room.stats.inputsAccepted++; room.stats.lastAcceptedTickAge = age;
    room.stats.maxAcceptedTickAge = Math.max(room.stats.maxAcceptedTickAge, age);
  }
  async function reauthorize(conn, force = false) {
    if (!conn.active || !conn.authenticated) return false;
    if (!force && now() - conn.verifiedAt < LIMITS.reauthorizeMs) return true;
    if (conn.authPromise) return conn.authPromise;
    conn.authPromise = withDeadline(callAuthorize({ roomCode: conn.room.roomCode, bearer: conn.bearer }),
      LIMITS.reauthorizeTimeoutMs, 'authorization_expired').then((viewer) => {
      if (!conn.active) return false;
      if (!sameViewer(conn.viewer, viewer)) { disconnect(conn, 4401, 'authorization_revoked'); return false; }
      conn.verifiedAt = now(); return true;
    }).catch(() => { disconnect(conn, 4401, 'authorization_expired'); return false; })
      .finally(() => { conn.authPromise = null; });
    return conn.authPromise;
  }
  function scheduleReauthorization(conn) {
    conn.reauthTimer = schedule(() => {
      conn.reauthTimer = null;
      reauthorize(conn, true).finally(() => { if (conn.active) scheduleReauthorization(conn); });
    }, LIMITS.reauthorizeMs);
  }
  async function command(conn, raw) {
    const room = conn.room;
    if (!takeToken(conn.commandBucket, now(), LIMITS.maxCommandsPerSecond, LIMITS.commandBurst)) {
      disconnect(conn, 4429, 'command_rate'); return;
    }
    const value = normalizeCommand(raw);
    if (!value) {
      if (identifier(raw?.id)) send(conn, commandResult(raw.id, false, 'invalid_command'));
      else disconnect(conn, 4400, 'invalid_command');
      return;
    }
    try {
      const result = await enqueue(room, async () => {
        if (!await reauthorize(conn, true) || !conn.active) return null;
        if (conn.viewer.role === 'player' && room.seats[conn.viewer.playerId].conn !== conn) return null;
        const key = `${actorKey(conn.viewer)}:${value.id}`;
        const known = room.dedup.get(key);
        if (known) return known.fingerprint === commandFingerprint(value) ? known.result : commandResult(value.id, false, 'command_conflict');
        const reject = (code) => {
          const result = commandResult(value.id, false, code);
          // Failed commands do not modify engine authority or write storage. Keep
          // their original result across reconnect, and include it at the next
          // durable checkpoint/boundary. Recovery itself fences the previous epoch.
          const saved = insertDedup(room, conn.viewer, value, result);
          room.dedup = saved.dedup;
          return saved.entry.result;
        };
        if (value.matchId !== room.view.matchId) return reject('stale_match');
        if (value.runEpoch !== room.view.runEpoch) return reject('stale_epoch');
        let state, metadata = room, countdownControllers = null;
        if (value.kind === 'rematch') {
          if (conn.viewer.role !== 'host') return reject('forbidden');
          if (!['paused', 'finished'].includes(room.view.phase)) return reject('invalid_phase');
          metadata = { seed: value.payload.seedMode === 'same' ? room.seed : randomUUID(), options: room.options };
          state = simulation.createRun({ seed: metadata.seed, matchId: randomUUID(), options: metadata.options });
        } else {
          if (value.kind === 'ready' && value.payload.value && conn.viewer.role === 'player' && !fresh(room.seats[conn.viewer.playerId])) {
            return reject('unavailable_controllers');
          }
          const applied = simulation.applyCommand(room.state, conn.viewer, { kind: value.kind, payload: value.payload });
          if (!applied?.accepted) {
            const code = typeof applied?.code === 'string' ? applied.code.toLowerCase() : '';
            return reject(SAFE_SIMULATION_CODES.has(code) ? code : 'invalid_command');
          }
          state = applied.state;
          const view = checkedView(simulation, state);
          if (view.phase === 'countdown' && room.view.phase !== 'countdown') {
            if (!PLAYERS.every((id) => fresh(room.seats[id]))) return reject('unavailable_controllers');
            countdownControllers = Object.fromEntries(PLAYERS.map((id) => [id, room.seats[id].conn]));
          }
        }
        let receipt;
        try {
          receipt = insertDedup(room, conn.viewer, value);
        } catch (error) {
          if (error.code !== 'command_capacity' || state === room.state) throw error;
          // Ready can be toggled repeatedly in a single epoch. Close a full
          // epoch so its receipts can expire without reapplying old retries.
          const reset = simulation.pauseForSystem(room.state, 'receipt-capacity');
          await commit(room, reset, room.dedup, 'receipt-capacity');
          throw error;
        }
        const { dedup, entry } = receipt;
        await commit(room, state, dedup, value.kind, metadata, countdownControllers);
        room.stats.commandsAccepted++;
        return entry.result;
      });
      if (result && conn.active) send(conn, result);
    } catch (error) {
      if (conn.active) send(conn, commandResult(value.id, false,
        ['command_capacity', 'command_overload'].includes(error?.code) ? error.code : 'storage_unavailable'));
    }
  }
  async function authenticate(conn, message) {
    if (!validAuth(message)) { globalStats.rejectedAuth++; disconnect(conn, 4401, 'invalid_auth'); return; }
    conn.authenticating = true;
    const room = rooms.get(message.roomCode);
    if (!room || room.closed) { globalStats.rejectedAuth++; disconnect(conn, 4401, 'room_unavailable'); return; }
    if (room.fault) { disconnect(conn, 1011, 'storage_unavailable'); return; }
    let viewer;
    try { viewer = await callAuthorize({ roomCode: message.roomCode, bearer: message.token }); }
    catch { viewer = null; }
    if (!conn.active) return;
    if (rooms.get(message.roomCode) !== room || room.closed) { disconnect(conn, 4410, 'room_unavailable'); return; }
    if (room.fault) { disconnect(conn, 1011, 'storage_unavailable'); return; }
    if (room.blocked) {
      try { await (starting.get(message.roomCode) ?? room.commandTail); } catch { disconnect(conn, 1011, 'room_unavailable'); return; }
      if (!conn.active || room.closed || room.fault || room.blocked) { disconnect(conn, 1011, 'room_unavailable'); return; }
    }
    if (!validViewer(viewer)) { globalStats.rejectedAuth++; disconnect(conn, 4401, 'invalid_auth'); return; }
    const actor = Object.freeze({ role: viewer.role, playerId: viewer.playerId });
    const old = actor.role === 'player' ? room.seats[actor.playerId].conn : null;
    if (room.connections.size >= LIMITS.maxRoomSockets && !old) { disconnect(conn, 4429, 'room_capacity'); return; }
    if (old) disconnect(old, 4409, 'controller_replaced', false);
    conn.room = room; conn.viewer = actor; conn.bearer = message.token;
    conn.verifiedAt = now();
    conn.controllerEpoch = actor.role === 'player' ? randomUUID() : null;
    room.connections.add(conn);
    if (actor.role === 'player') {
      const seat = room.seats[actor.playerId];
      seat.conn = conn; seat.latest = null; seat.lastSeq = -1; seat.ack = null;
      // A replacement does not inherit an old controller's held input/readiness.
      if (old && activePhase(room.view)) await queuePause(room, 'network');
    }
    await room.commandTail.catch(() => {});
    if (!conn.active || room.closed || room.fault) return;
    cancel(conn.authTimer); conn.authTimer = null;
    // Enable gameplay only once this socket can queue its Welcome as the first frame.
    conn.authenticated = true; pendingAuth--;
    if (!send(conn, { type: 'welcome', protocol: 1, viewer: actor, controllerEpoch: conn.controllerEpoch,
      snapshot: snapshot(room, conn, actor) })) return;
    globalStats.authenticated++; room.stats.connections++;
    scheduleReauthorization(conn); lifecycle(room, 'presence');
  }
  function receive(conn, bytes, binary) {
    if (!conn.active) return;
    if (binary || bytes.byteLength > LIMITS.maxFrameBytes) { disconnect(conn, 4400, 'invalid_frame'); return; }
    if (!takeToken(conn.messageBucket, now(), LIMITS.maxMessagesPerSecond, LIMITS.messageBurst)) {
      disconnect(conn, 4429, 'message_rate'); return;
    }
    let message;
    try { message = JSON.parse(bytes.toString('utf8')); } catch { disconnect(conn, 4400, 'invalid_json'); return; }
    if (!boundedJson(message)) { disconnect(conn, 4400, 'invalid_json'); return; }
    if (!conn.authenticated) {
      if (conn.authenticating || message?.type !== 'auth') { disconnect(conn, 4401, 'authentication_required'); return; }
      authenticate(conn, message).catch(() => disconnect(conn, 1011, 'unavailable'));
      return;
    }
    if (message?.type === 'input') input(conn, message, bytes.byteLength);
    else if (message?.type === 'command') command(conn, message).catch(() => disconnect(conn, 1011, 'unavailable'));
    else if (exactKeys(message, ['type', 'protocol', 'id']) && message.type === 'ping' && message.protocol === 1 && identifier(message.id)) {
      send(conn, { type: 'pong', protocol: 1, id: message.id });
    } else disconnect(conn, 4400, 'invalid_message');
  }
  function handleUpgrade(request, socket, head) {
    let permitted = false;
    try { permitted = !closed && request.url === ENDPOINT && !request.headers['sec-websocket-protocol']
      && typeof validateUpgrade === 'function' && validateUpgrade(request) === true; } catch { /* deny */ }
    if (!permitted || pendingAuth >= LIMITS.maxPendingAuth || pendingAuthorityCalls >= LIMITS.maxPendingAuth * 2
      || connections.size + draining.size >= LIMITS.maxSockets) {
      globalStats.rejectedUpgrades++;
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return false;
    }
    try {
      server.handleUpgrade(request, socket, head, (ws) => {
        const at = now();
        const conn = { ws, active: true, authenticated: false, authenticating: false, room: null, viewer: null,
          bearer: null, verifiedAt: -Infinity, controllerEpoch: null, authTimer: null, reauthTimer: null,
          authPromise: null, pendingSnapshot: null, sendingSnapshot: false, slowSince: null, closeTimer: null,
          inputBucket: { tokens: LIMITS.inputBurst, at }, messageBucket: { tokens: LIMITS.messageBurst, at },
          commandBucket: { tokens: LIMITS.commandBurst, at } };
        pendingAuth++; connections.add(conn);
        conn.authTimer = schedule(() => disconnect(conn, 4401, 'authentication_timeout'), LIMITS.authTimeoutMs);
        ws.on('message', (data, binary) => receive(conn, data, binary));
        const nativeControl = (data, reply) => {
          if (!conn.active) return;
          if (!takeToken(conn.messageBucket, now(), LIMITS.maxMessagesPerSecond, LIMITS.messageBurst)
            || ws.bufferedAmount >= LIMITS.outgoingSoftBytes) { disconnect(conn, 4429, 'control_rate'); return; }
          if (reply) ws.pong(data, false, (error) => { if (error) disconnect(conn, 1011, 'send_failed'); });
        };
        ws.on('ping', (data) => nativeControl(data, true));
        ws.on('pong', (data) => nativeControl(data, false));
        ws.on('error', () => disconnect(conn, 4400, 'invalid_frame'));
        ws.on('close', () => disconnect(conn, 1000, 'disconnected'));
      });
      return true;
    } catch { socket.destroy(); return false; }
  }
  async function startRoom({ roomCode, matchId, seed, options = { mode: 'campaign' } } = {}) {
    if (closed) throw errorWithCode('coordinator_closed');
    if (!roomIdentifier(roomCode) || !identifier(matchId) || !identifier(seed)
      || !exactKeys(options, ['mode']) || !['campaign', 'practice'].includes(options.mode)) throw errorWithCode('invalid_room');
    if (closingRooms.has(roomCode)) throw errorWithCode('room_closing');
    if (starting.has(roomCode)) return starting.get(roomCode);
    const existing = rooms.get(roomCode);
    if (existing) {
      if (existing.fault || existing.closed) throw errorWithCode('room_unavailable');
      if (existing.view.matchId !== matchId) throw errorWithCode('room_already_started');
      return snapshot(existing);
    }
    if (rooms.size + starting.size >= LIMITS.maxRooms) throw errorWithCode('room_capacity');
    const operation = (async () => {
      const saved = await withDeadline(Promise.resolve().then(() => loadCheckpoint(roomCode)), LIMITS.checkpointTimeoutMs, 'storage_unavailable');
      if (closed) throw errorWithCode('coordinator_closed');
      const restored = saved == null ? null : decodeCheckpoint(saved, roomCode, simulation);
      const state = restored?.state ?? simulation.createRun({ seed, matchId, options });
      const view = restored?.view ?? checkedView(simulation, state);
      const at = now();
      const room = { roomCode, state, view, seed: restored?.seed ?? seed, options: restored?.options ?? { ...options },
        dedup: restored?.dedup ?? new Map(), seats: { jon: newSeat(), lydia: newSeat() }, connections: new Set(),
        blocked: true, initializing: true, executing: false, closed: false, fault: false,
        tickTimer: null, accumulator: 0, lastSchedulerAt: at,
        lastSnapshotAt: at, nextSnapshotAt: at + LIMITS.snapshotMs, lastCheckpointAt: at,
        commandTail: Promise.resolve(), storeTail: Promise.resolve(),
        lifecycleTail: Promise.resolve(), lifecyclePending: null, lifecycleRunning: false,
        pendingCommands: 0, periodicPending: false, pausePending: null,
        stats: { inputsAccepted: 0, inputsRejected: 0, rejectedInputReasons: {}, inputsApplied: 0, inputsCoalesced: 0,
          lastAcceptedTickAge: 0, maxAcceptedTickAge: 0, ticks: 0, tickOverruns: 0, skippedCatchUpTicks: 0, hostStalls: 0,
          snapshotsSent: 0, snapshotsCoalesced: 0, maxBufferedBytes: 0, rateLimited: 0,
          commandsAccepted: 0, connections: 0, disconnections: 0, checkpointsQueued: 0, checkpointsSaved: 0,
          checkpointsWriting: 0, checkpointErrors: 0, lifecycleErrors: 0, lifecycleCoalesced: 0 } };
      rooms.set(roomCode, room);
      try { await commit(room, state, room.dedup, restored ? 'recovery' : 'started'); }
      catch (error) {
        rooms.delete(roomCode); room.closed = true;
        // A timed-out first save is still an outstanding writer. Do not allow a
        // second start to race it merely because initialization never published.
        const drain = Promise.allSettled([room.storeTail, room.lifecycleTail]);
        closingRooms.set(roomCode, drain);
        drain.finally(() => { if (closingRooms.get(roomCode) === drain) closingRooms.delete(roomCode); });
        throw error;
      }
      if (closed || room.closed) throw errorWithCode('coordinator_closed');
      room.tickTimer = schedule(() => tick(room), LIMITS.tickMs);
      return snapshot(room);
    })();
    starting.set(roomCode, operation);
    try { return await operation; } finally { starting.delete(roomCode); }
  }
  async function pauseRoom(roomCode, reason = 'network') {
    const room = rooms.get(roomCode);
    if (!room || room.closed) return null;
    if (!['network', 'host-stall', 'recovery', 'requested', 'help', 'recenter'].includes(reason)) throw errorWithCode('invalid_pause_reason');
    if (!activePhase(room.view)) return snapshot(room);
    if (['network', 'host-stall', 'recovery'].includes(reason)) return queuePause(room, reason);
    return enqueue(room, async () => {
      if (!activePhase(room.view)) return snapshot(room);
      const applied = simulation.applyCommand(room.state, { role: 'host', playerId: null }, { kind: 'pause', payload: { reason } });
      if (!applied.accepted) throw errorWithCode('invalid_phase');
      await commit(room, applied.state, room.dedup, 'pause');
      return snapshot(room);
    });
  }
  function getPublicView(roomCode, viewer = PUBLIC_VIEWER) {
    if (!validViewer(viewer, true)) throw errorWithCode('invalid_viewer');
    const room = rooms.get(roomCode);
    if (!room || room.closed || room.fault || room.initializing) return null;
    return checkedView(simulation, room.state, viewer);
  }
  async function closeRoom(roomCode) {
    const pending = starting.get(roomCode);
    if (pending) { try { await pending; } catch { /* already unavailable */ } }
    const room = rooms.get(roomCode);
    if (!room) return;
    room.closed = true; cancel(room.tickTimer); room.tickTimer = null;
    room.lifecyclePending = null;
    clearInputs(room);
    for (const conn of [...room.connections]) disconnect(conn, 4410, 'room_closed');
    const actualDrain = Promise.allSettled([room.commandTail, room.storeTail, room.lifecycleTail]);
    closingRooms.set(roomCode, actualDrain);
    rooms.delete(roomCode);
    actualDrain.finally(() => { if (closingRooms.get(roomCode) === actualDrain) closingRooms.delete(roomCode); });
    // Returning a bounded close does not release the single-writer lease. A
    // hanging store/callback must settle before the same room can start again.
    await withDeadline(actualDrain, LIMITS.checkpointTimeoutMs, 'close_timeout').catch(() => {});
  }
  async function close() {
    if (closing) return closing;
    closed = true;
    closing = (async () => {
      // Stopping the host does not revoke its persisted rooms. Keep mounted
      // clients retrying so a restarted listener can restore a paused epoch.
      for (const conn of [...connections]) disconnect(conn, 1012, 'coordinator_closed');
      await Promise.allSettled([...rooms.keys()].map((code) => closeRoom(code)));
      await Promise.allSettled([...starting.values()]);
      for (const conn of [...draining]) { conn.ws.terminate(); finishDisconnect(conn); }
      for (const handle of [...timers]) cancel(handle);
      await new Promise((resolve) => server.close(() => resolve()));
    })();
    return closing;
  }
  const api = { handleUpgrade, startRoom, pauseRoom, getPublicView, closeRoom, close };
  diagnostics.set(api, (roomCode) => {
    const roomData = (room) => ({ roomCode: room.roomCode, matchId: room.view.matchId, runEpoch: room.view.runEpoch,
      tick: room.view.tick, phase: room.view.phase, blocked: room.blocked, faulted: room.fault,
      sockets: room.connections.size, pendingCommands: room.pendingCommands,
      pendingInputs: PLAYERS.filter((id) => !!room.seats[id].latest && room.seats[id].ack?.seq !== room.seats[id].latest.seq).length,
      pendingSnapshots: [...room.connections].filter((conn) => conn.pendingSnapshot).length,
      pendingLifecycle: Number(room.lifecycleRunning) + Number(!!room.lifecyclePending),
      bufferedBytes: [...room.connections].reduce((sum, conn) => sum + conn.ws.bufferedAmount, 0),
      dedupRecords: room.dedup.size, presence: presence(room), ...structuredClone(room.stats) });
    if (roomCode !== undefined) return rooms.has(roomCode) ? roomData(rooms.get(roomCode)) : null;
    return { closed, sockets: connections.size, drainingSockets: draining.size, pendingAuth, pendingAuthorityCalls,
      rooms: rooms.size, closingRooms: closingRooms.size, timers: timers.size,
      ...globalStats, roomStats: [...rooms.values()].map(roomData) };
  });
  return api;
}
