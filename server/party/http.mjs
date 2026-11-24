import { PartyError } from './rooms.mjs';
import { ROOM_CODE } from '../realtime/party/protocol.mjs';

export const PARTY_ROOMS_PATH = '/api/party/rooms';

export async function handlePartyRequest(request, pathname, rooms) {
  try {
    if (pathname === PARTY_ROOMS_PATH && request.method === 'POST') {
      return { status: 201, body: rooms.create(await request.json()) };
    }
    const [, codePart, operation] = /^\/api\/party\/rooms\/([^/]+)(?:\/(join))?$/.exec(pathname) ?? [];
    const code = codePart?.toUpperCase();
    const room = code && ROOM_CODE.test(code) ? rooms.find(code) : null;
    if (room && operation === undefined && request.method === 'GET') {
      return { status: 200, body: rooms.lookup(room) };
    }
    if (room && operation === 'join' && request.method === 'POST') {
      return { status: 201, body: rooms.join(room, await request.json()) };
    }
    return { status: 404, body: { code: 'party_not_found', error: 'That party is not available.' } };
  } catch (error) {
    if (error instanceof PartyError) return { status: error.status, body: { code: error.code, error: error.message } };
    if (error instanceof SyntaxError) return { status: 400, body: { code: 'invalid_json', error: 'Send valid JSON.' } };
    throw error;
  }
}
