export const PARTY_ENDPOINT = '/api/realtime/party';
export const ROOM_CODE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;
export const CREDENTIAL = /^[A-Za-z0-9_-]{32,64}$/;
export const MAX_PLAYERS = 16;

export const PARTY_LIMITS = Object.freeze({
  // One full room, one full set of replacement connections, and six spare slots.
  sockets: 40,
  localSocketReserve: 4,
  frameBytes: 512,
  maxFragments: 8,
  maxBufferedChunks: 16,
  authMs: 5_000,
  pingMs: 5_000,
  pongMs: 10_000,
  sendBufferBytes: 16 * 1024,
  phoneSnapshotBytes: 320,
  phoneSnapshotMs: 200,
  // The total message budget includes invalid frames and administrative commands.
  messagesPerSecond: 30,
  messageBurst: 12,
  inputsPerSecond: 20,
  inputBurst: 8,
});

export function exactFields(value, ...fields) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
}

export function validAuth(message) {
  return exactFields(message, 'type', 'protocol', 'code', 'token')
    && message.type === 'auth' && message.protocol === 1
    && typeof message.code === 'string' && ROOM_CODE.test(message.code)
    && typeof message.token === 'string' && CREDENTIAL.test(message.token);
}

export function validSequence(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function takeBudget(bucket, now, rate, burst) {
  bucket.tokens = Math.min(burst, bucket.tokens + (now - bucket.at) * rate / 1000);
  bucket.at = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens--;
  return true;
}
