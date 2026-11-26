import { PartyError } from './rooms.mjs';
import { ROOM_CODE } from '../realtime/party/protocol.mjs';

export const PARTY_ROOMS_PATH = '/api/party/rooms';

export async function handlePartyRequest(request, pathname, rooms, peer) {
  try {
    if (pathname === PARTY_ROOMS_PATH && request.method === 'POST') {
      return { status: 201, body: rooms.create(await request.json(), peer) };
    }
    const [, codePart, operation] = /^\/api\/party\/rooms\/([^/]+)(?:\/(join))?$/.exec(pathname) ?? [];
    const code = codePart?.toUpperCase();
    if (code && ROOM_CODE.test(code) && operation === undefined && request.method === 'GET') {
      const room = rooms.find(code);
      if (room) return { status: 200, body: rooms.lookup(room) };
    }
    if (code && ROOM_CODE.test(code) && operation === 'join' && request.method === 'POST') {
      const body = await request.json();
      const room = rooms.find(code);
      if (room) return { status: 201, body: rooms.join(room, body, peer) };
    }
    return { status: 404, body: { code: 'party_not_found', error: 'That party is not available.' } };
  } catch (error) {
    if (error instanceof PartyError) return { status: error.status, body: { code: error.code, error: error.message } };
    if (error instanceof SyntaxError) return { status: 400, body: { code: 'invalid_json', error: 'Send valid JSON.' } };
    throw error;
  }
}
