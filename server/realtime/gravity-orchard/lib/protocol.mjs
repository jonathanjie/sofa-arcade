/** Server-only protocol validation. No received object is ever used as authority. */
export const ENDPOINT = '/api/realtime/gravity-orchard';
export const SAFE_INPUT = Object.freeze({ x: 0, y: 0, brake: true });
export const PUBLIC_VIEWER = Object.freeze({ role: 'public', playerId: null });
export const PLAYERS = Object.freeze(['jon', 'lydia']);
export const LIMITS = Object.freeze({
  tickMs: 1000 / 60, snapshotMs: 50, staleInputMs: 250, pauseInputMs: 2000,
  maxObservedTickLag: 30, maxCatchUpTicks: 5, hostStallMs: 1000,
  authTimeoutMs: 5000, reauthorizeMs: 1000, reauthorizeTimeoutMs: 1000,
  maxAuthAgeMs: 2000, maxFrameBytes: 4096, maxInputBytes: 512,
  maxFragments: 16, maxBufferedChunks: 64,
  maxJsonDepth: 4, maxJsonFields: 32, maxInputPerSecond: 40, inputBurst: 8,
  maxMessagesPerSecond: 80, messageBurst: 24, maxCommandsPerSecond: 10,
  commandBurst: 8, maxPendingCommands: 16, maxDedupRecords: 256,
  maxRoomSockets: 8, maxPendingAuth: 32, maxSockets: 128, maxRooms: 32,
  outgoingSoftBytes: 32 * 1024, outgoingHardBytes: 128 * 1024,
  maxSnapshotBytes: 64 * 1024, slowReaderMs: 2000,
  checkpointMs: 5000, checkpointTimeoutMs: 5000, maxCheckpointBytes: 1024 * 1024,
});

export const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
export const counter = (value) => Number.isSafeInteger(value) && value >= 0;
export const identifier = (value) => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
export const roomIdentifier = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
export const tokenString = (value) => typeof value === 'string' && /^[\x21-\x7e]{1,2048}$/.test(value);
export const exactKeys = (value, keys) => isRecord(value) && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key));

export function validViewer(value, allowPublic = false) {
  if (!isRecord(value)) return false;
  return (value.role === 'host' && value.playerId === null)
    || (value.role === 'player' && PLAYERS.includes(value.playerId))
    || (allowPublic && value.role === 'public' && value.playerId === null);
}

export function boundedJson(value, depth = 0, budget = { fields: 0 }) {
  if (depth > LIMITS.maxJsonDepth) return false;
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (!isRecord(value) && !Array.isArray(value)) return false;
  const entries = Object.entries(value);
  budget.fields += entries.length;
  if (budget.fields > LIMITS.maxJsonFields) return false;
  return entries.every(([key, child]) => !['__proto__', 'constructor', 'prototype'].includes(key)
    && boundedJson(child, depth + 1, budget));
}

export function validAuth(value) {
  return exactKeys(value, ['type', 'protocol', 'roomCode', 'token'])
    && value.type === 'auth' && value.protocol === 1 && roomIdentifier(value.roomCode) && tokenString(value.token);
}

export function validInput(value) {
  return exactKeys(value, ['type', 'protocol', 'matchId', 'runEpoch', 'controllerEpoch', 'seq', 'observedTick', 'x', 'y', 'brake'])
    && value.type === 'input' && value.protocol === 1 && identifier(value.matchId)
    && counter(value.runEpoch) && identifier(value.controllerEpoch) && counter(value.seq) && counter(value.observedTick)
    && typeof value.x === 'number' && Number.isFinite(value.x) && Math.abs(value.x) <= 1
    && typeof value.y === 'number' && Number.isFinite(value.y) && Math.abs(value.y) <= 1
    && typeof value.brake === 'boolean';
}

export function normalizeCommand(value) {
  if (!exactKeys(value, ['type', 'protocol', 'id', 'matchId', 'runEpoch', 'kind', 'payload'])
    || value.type !== 'command' || value.protocol !== 1 || !identifier(value.id)
    || !identifier(value.matchId) || !counter(value.runEpoch)) return null;
  let payload;
  if (value.kind === 'ready' && exactKeys(value.payload, ['value']) && typeof value.payload.value === 'boolean') {
    payload = { value: value.payload.value };
  } else if (value.kind === 'pause' && exactKeys(value.payload, ['reason'])
    && ['requested', 'help', 'recenter'].includes(value.payload.reason)) {
    payload = { reason: value.payload.reason };
  } else if (value.kind === 'retry-stage' && exactKeys(value.payload, [])) {
    payload = {};
  } else if (value.kind === 'rematch' && exactKeys(value.payload, ['seedMode']) && ['same', 'new'].includes(value.payload.seedMode)) {
    payload = { seedMode: value.payload.seedMode };
  } else return null;
  return { type: 'command', protocol: 1, id: value.id, matchId: value.matchId, runEpoch: value.runEpoch, kind: value.kind, payload };
}

export const commandFingerprint = (command) => JSON.stringify(command);
export const actorKey = (viewer) => `${viewer.role}:${viewer.playerId ?? ''}`;
export const commandResult = (id, accepted, code) => ({
  type: 'command-result', protocol: 1, id, accepted, ...(code ? { code } : {}),
});

export function takeToken(bucket, now, perSecond, capacity) {
  bucket.tokens = Math.min(capacity, bucket.tokens + Math.max(0, now - bucket.at) * perSecond / 1000);
  bucket.at = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

export function checkedView(simulation, state, viewer = PUBLIC_VIEWER) {
  const view = structuredClone(simulation.project(state, Object.freeze({ role: viewer.role, playerId: viewer.playerId })));
  if (!isRecord(view) || view.gameId !== 'gravity-orchard' || view.schemaVersion !== 1
    || !identifier(view.matchId) || !counter(view.runEpoch) || !counter(view.tick)
    || !['waiting', 'countdown', 'playing', 'paused', 'interlude', 'finished'].includes(view.phase)
    || !['campaign', 'practice'].includes(view.mode) || ![0, 1, 2].includes(view.stageIndex)
    || !exactKeys(view.ready, ['jon', 'lydia']) || PLAYERS.some((seat) => typeof view.ready[seat] !== 'boolean')) {
    throw Object.assign(new Error('Simulation projection is invalid.'), { code: 'invalid_simulation' });
  }
  const encoded = JSON.stringify(view);
  if (Buffer.byteLength(encoded) > LIMITS.maxSnapshotBytes - 1024) {
    throw Object.assign(new Error('Simulation projection is too large.'), { code: 'invalid_simulation' });
  }
  return view;
}
