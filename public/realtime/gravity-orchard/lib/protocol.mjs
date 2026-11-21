// Browser-safe validation only. No authoritative simulation, credentials or IO.
export const ENDPOINT = '/api/realtime/gravity-orchard';
export const SAFE_INPUT = Object.freeze({ x: 0, y: 0, brake: true });
export const CLIENT_LIMITS = Object.freeze({
  inputIntervalMs: 50,
  commandRetryMs: 750,
  pingIntervalMs: 1000,
  welcomeTimeoutMs: 5000,
  idleTimeoutMs: 6000,
  reconnectMinMs: 250,
  reconnectMaxMs: 5000,
  softBufferedBytes: 16 * 1024,
  hardBufferedBytes: 64 * 1024,
  slowBufferMs: 2000,
  maxInboundBytes: 64 * 1024,
  maxPendingCommands: 32,
  maxSettledCommands: 64,
  commandFramesPerSecond: 8,
  commandBurst: 8,
  maxInputReceipts: 64,
  maxRetiredMatches: 32,
});

export const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const counter = value => Number.isSafeInteger(value) && value >= 0;
export const identifier = value => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
export const roomIdentifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
export const exact = (object, keys) => isObject(object) && Object.keys(object).length === keys.length
  && keys.every(key => Object.hasOwn(object, key));
export const byteLength = value => new TextEncoder().encode(value).length;

export function normalizeIntent(value) {
  if (!exact(value, ['x', 'y', 'brake']) || typeof value.brake !== 'boolean'
    || !Number.isFinite(value.x) || !Number.isFinite(value.y)
    || Math.abs(value.x) > 1 || Math.abs(value.y) > 1) return null;
  const scale = Math.max(1, Math.hypot(value.x, value.y));
  return { x: Math.round(value.x / scale * 10000) / 10000,
    y: Math.round(value.y / scale * 10000) / 10000, brake: value.brake };
}

export function normalizeCommand(value) {
  if (!exact(value, ['id', 'kind', 'payload']) || !identifier(value.id)) return null;
  const { id, kind, payload } = value;
  if (kind === 'ready' && exact(payload, ['value']) && typeof payload.value === 'boolean') {
    return { id, kind, payload: { value: payload.value } };
  }
  if (kind === 'pause' && exact(payload, ['reason']) && ['requested', 'help', 'recenter'].includes(payload.reason)) {
    return { id, kind, payload: { reason: payload.reason } };
  }
  if (kind === 'retry-stage' && exact(payload, [])) return { id, kind, payload: {} };
  if (kind === 'rematch' && exact(payload, ['seedMode']) && ['same', 'new'].includes(payload.seedMode)) {
    return { id, kind, payload: { seedMode: payload.seedMode } };
  }
  return null;
}

export function validateViewer(viewer) {
  return exact(viewer, ['role', 'playerId']) && ((viewer.role === 'host' && viewer.playerId === null)
    || (viewer.role === 'player' && ['jon', 'lydia'].includes(viewer.playerId)));
}

// The wire has finite, bounded public data. Check breadth/depth before any
// consumer sees it, including additive cosmetic metadata in future projections.
export function boundedJson(value) {
  const stack = [[value, 0]];
  let visited = 0;
  while (stack.length) {
    const [item, depth] = stack.pop();
    if (++visited > 4096 || depth > 12) return false;
    if (item === null || typeof item === 'boolean') continue;
    if (typeof item === 'number') { if (!Number.isFinite(item) || Math.abs(item) > Number.MAX_SAFE_INTEGER) return false; continue; }
    if (typeof item === 'string') { if (item.length > 2048) return false; continue; }
    if (!isObject(item) && !Array.isArray(item)) return false;
    const entries = Object.entries(item);
    if (entries.length > (Array.isArray(item) ? 256 : 64)) return false;
    for (const [key, child] of entries) {
      if (key.length > 128 || ['__proto__', 'prototype', 'constructor'].includes(key)) return false;
      stack.push([child, depth + 1]);
    }
  }
  return true;
}

const finite = value => typeof value === 'number' && Number.isFinite(value);
const phases = ['waiting', 'countdown', 'playing', 'paused', 'interlude', 'finished'];
const fruitTypes = ['apple', 'plum', 'pear', 'starfruit'];

export function validateSnapshot(message, roomCode) {
  if (!exact(message, ['type', 'protocol', 'roomCode', 'serverSeq', 'view', 'presence', 'ack'])
    || message.type !== 'snapshot' || message.protocol !== 1 || message.roomCode !== roomCode
    || !counter(message.serverSeq) || !boundedJson(message)) return false;
  const view = message.view;
  if (!isObject(view) || view.gameId !== 'gravity-orchard' || view.schemaVersion !== 1
    || !identifier(view.matchId) || !counter(view.runEpoch) || !counter(view.tick)
    || !phases.includes(view.phase) || !['campaign', 'practice'].includes(view.mode)
    || ![0, 1, 2].includes(view.stageIndex) || !identifier(view.levelId)
    || !(view.timeRemainingTicks === null || counter(view.timeRemainingTicks))
    || !counter(view.countdownTicks)
    || ![null, 'requested', 'help', 'recenter', 'network', 'host-stall', 'recovery'].includes(view.pauseReason)
    || !exact(view.ready, ['jon', 'lydia'])
    || !['jon', 'lydia'].every(seat => typeof view.ready[seat] === 'boolean')
    || !exact(message.presence, ['jon', 'lydia'])
    || !['jon', 'lydia'].every(seat => exact(message.presence[seat], ['connected', 'inputFresh'])
      && typeof message.presence[seat].connected === 'boolean' && typeof message.presence[seat].inputFresh === 'boolean')) return false;
  if (!Array.isArray(view.fruits) || view.fruits.length > 8 || !view.fruits.every(fruit => isObject(fruit)
    && identifier(fruit.id) && fruitTypes.includes(fruit.type)
    && ['x', 'y', 'vx', 'vy', 'radius'].every(key => finite(fruit[key])) && fruit.radius > 0)) return false;
  if (!exact(view.baskets, fruitTypes) || !fruitTypes.every(type => isObject(view.baskets[type])
    && view.baskets[type].capacity === 3 && counter(view.baskets[type].count) && view.baskets[type].count <= 3)) return false;
  if (!isObject(view.orders) || !Array.isArray(view.orders.recipes) || !counter(view.orders.activeIndex)
    || !Array.isArray(view.orders.completedIds) || !view.orders.completedIds.every(identifier)
    || !view.orders.recipes.every(recipe => isObject(recipe) && identifier(recipe.id)
      && exact(recipe.needs, fruitTypes) && fruitTypes.every(type => counter(recipe.needs[type])))) return false;
  if (!Array.isArray(view.gateStates) || !view.gateStates.every(gate => isObject(gate) && identifier(gate.id)
    && ['open', 'forecast', 'closed'].includes(gate.state) && counter(gate.ticksToChange)
    && typeof gate.closureDeferred === 'boolean')) return false;
  if (!(view.gust === null || (isObject(view.gust) && identifier(view.gust.id)
    && ['forecast', 'active'].includes(view.gust.phase) && finite(view.gust.x) && finite(view.gust.y)
    && counter(view.gust.ticksRemaining)))) return false;
  if (!exact(view.players, ['jon', 'lydia']) || !['jon', 'lydia'].every(seat => isObject(view.players[seat])
    && normalizeIntent(view.players[seat].input))) return false;
  if (!Array.isArray(view.results) || view.results.length > 3 || !view.results.every(result => isObject(result)
    && [0, 1, 2].includes(result.stageIndex)
    && ['ordersCompleted', 'composted', 'stars', 'elapsedTicks'].every(key => counter(result[key])))) return false;
  if (!Array.isArray(view.events) || view.events.length > 64 || !view.events.every(event => isObject(event)
    && identifier(event.id) && typeof event.kind === 'string' && event.kind.length <= 64 && counter(event.tick))) return false;
  return message.ack === null || (exact(message.ack, ['controllerEpoch', 'seq', 'appliedTick'])
    && identifier(message.ack.controllerEpoch) && counter(message.ack.seq) && counter(message.ack.appliedTick)
    && message.ack.appliedTick <= view.tick);
}

const resultCodes = new Set(['invalid_command', 'forbidden', 'stale_match', 'stale_epoch',
  'unavailable_controllers', 'command_conflict', 'storage_unavailable', 'invalid_phase',
  'unknown_command', 'not_ready', 'room_closed', 'server_busy', 'queue_full', 'replay_expired',
  'command_capacity', 'command_overload', 'wrong-phase', 'invalid-command', 'unknown-command']);
export function safeResultCode(code) { return resultCodes.has(code) ? code : 'server_rejected'; }

const errorMessages = {
  invalid_configuration: 'A valid realtime endpoint and joined-room credential are required.',
  invalid_command: 'This lifecycle command is not valid.',
  command_conflict: 'This command ID has already been used with different content.',
  not_connected: 'Wait for the authenticated connection before sending a command.',
  command_queue_full: 'Too many lifecycle commands are awaiting acknowledgment.',
  disposed: 'This realtime client has been disposed.',
  connection_ended: 'This realtime connection ended. Rejoin before sending commands.',
};
export function clientError(code) {
  const error = new Error(errorMessages[code] || 'The realtime operation could not complete.');
  error.code = code;
  return error;
}
