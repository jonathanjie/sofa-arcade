import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createRoomApi, handleApi, ROOM_TTL_MS, MAX_BODY_BYTES, EXPIRED_ROOM_RETENTION_MS } from './rooms.mjs';

const ORIGIN = 'https://sofa.example';

function fixture(handler = handleApi) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE sofa_rooms (
    code TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    jon_seen INTEGER NOT NULL DEFAULT 0, lydia_seen INTEGER NOT NULL DEFAULT 0
  )`);
  const stats = { writes: 0 };
  const DB = { prepare(sql) {
    const statement = sqlite.prepare(sql);
    const bound = args => ({
      bind(...values) { return bound(values); },
      async first() { return statement.get(...args) || null; },
      async run() { stats.writes++; const value = statement.run(...args); return { success: true, meta: { changes: Number(value.changes) } }; },
    });
    return bound([]);
  } };
  return { env: { DB }, sqlite, stats, handler };
}

async function api(f, path, { method = 'GET', body, token, origin = ORIGIN, rawBody, headers = {} } = {}) {
  const requestHeaders = { ...headers };
  if (method === 'POST') requestHeaders.Origin = origin;
  if (token) requestHeaders.Authorization = `Bearer ${token}`;
  if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';
  const request = new Request(`${ORIGIN}${path}`, {
    method, headers: requestHeaders,
    ...(rawBody !== undefined ? { body: rawBody } : body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const response = await f.handler(request, f.env);
  const value = await response.json();
  assert.match(response.headers.get('cache-control'), /no-store/);
  return { status: response.status, body: value, response };
}

async function openedRoom(f, start = true) {
  const created = await api(f, '/api/rooms', { method: 'POST', body: {} });
  assert.equal(created.status, 201);
  const code = created.body.code;
  const hostToken = created.body.hostToken;
  const clients = { jon: crypto.randomUUID(), lydia: crypto.randomUUID() };
  const tokens = {};
  for (const playerId of ['jon', 'lydia']) {
    const joined = await api(f, `/api/rooms/${code}/join`, { method: 'POST', body: { playerId, clientId: clients[playerId] } });
    assert.equal(joined.status, 200);
    tokens[playerId] = joined.body.playerToken;
  }
  const game = start
    ? await api(f, `/api/rooms/${code}/start`, { method: 'POST', token: hostToken, body: {} })
    : await api(f, `/api/rooms/${code}`);
  assert.equal(game.status, 200);
  const firstPlayer = game.body.state?.activePlayer;
  return { code, hostToken, clients, tokens, game: game.body, firstPlayer,
    secondPlayer: firstPlayer === 'jon' ? 'lydia' : 'jon',
    openingMove: { type: 'move', direction: firstPlayer === 'jon' ? 'up' : 'down' },
  };
}

function actionBody(revision, action, actionId = crypto.randomUUID()) { return { revision, actionId, action }; }
function rawRoom(f, code) { return f.sqlite.prepare('SELECT * FROM sofa_rooms WHERE code = ?').get(code); }

test('creation stores only token hashes and publicly exposes the small redacted envelope', async () => {
  const f = fixture();
  const before = Date.now();
  const created = await api(f, '/api/rooms', { method: 'POST' });
  assert.equal(created.status, 201);
  assert.match(created.body.code, /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
  assert.match(created.body.hostToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(created.body.revision, 0);
  assert.equal(created.body.phase, 'lobby');
  assert.equal(created.body.state, null);
  assert.ok(created.body.expiresAt >= before + ROOM_TTL_MS);
  const stored = rawRoom(f, created.body.code);
  assert.ok(!stored.data.includes(created.body.hostToken));
  assert.match(JSON.parse(stored.data).hostHash, /^[a-f0-9]{64}$/);
  const read = await api(f, `/api/rooms/${created.body.code.toLowerCase()}`);
  assert.equal(read.status, 200);
  for (const secret of ['hostToken', 'hostHash', 'seats', 'tokenHash', 'clientHash', 'recentActions']) {
    assert.ok(!JSON.stringify(read.body).includes(secret));
  }
  assert.deepEqual(Object.keys(read.body).sort(), ['code', 'expiresAt', 'gameId', 'phase', 'players', 'revision', 'state']);
  assert.equal(read.body.gameId, 'sofa-kingdoms');
  f.sqlite.close();
});

test('collection room creation accepts playable games and rejects planned or unknown games without writing', async () => {
  const f = fixture();
  for (const [gameId, status, errorCode] of [
    ['borrowed-minutes', 409, 'game_not_available'],
    ['missing-game', 400, 'invalid_game'],
    [null, 400, 'invalid_game'],
    [{ id: 'sofa-kingdoms' }, 400, 'invalid_game'],
  ]) {
    const result = await api(f, '/api/rooms', { method: 'POST', body: { gameId } });
    assert.equal(result.status, status);
    assert.equal(result.body.code, errorCode);
  }
  assert.equal(f.stats.writes, 0);
  const result = await api(f, '/api/rooms', { method: 'POST', body: { gameId: 'sofa-kingdoms' } });
  assert.equal(result.status, 201);
  assert.equal(result.body.gameId, 'sofa-kingdoms');
  assert.equal(JSON.parse(rawRoom(f, result.body.code).data).gameId, 'sofa-kingdoms');
  f.sqlite.close();
});

test('rooms created before the collection upgrade can still start and play', async () => {
  const f = fixture();
  const live = await openedRoom(f, false);
  const oldData = JSON.parse(rawRoom(f, live.code).data);
  delete oldData.gameId;
  f.sqlite.prepare('UPDATE sofa_rooms SET data = ? WHERE code = ?').run(JSON.stringify(oldData), live.code);
  const read = await api(f, `/api/rooms/${live.code}`);
  assert.equal(read.body.gameId, 'sofa-kingdoms');
  const started = await api(f, `/api/rooms/${live.code}/start`, { method: 'POST', token: live.hostToken });
  assert.equal(started.status, 200);
  assert.equal(started.body.gameId, 'sofa-kingdoms');
  const playerId = started.body.state.activePlayer;
  const moved = await api(f, `/api/rooms/${live.code}/action`, {
    method: 'POST', token: live.tokens[playerId],
    body: actionBody(started.body.revision, { type: 'move', direction: playerId === 'jon' ? 'up' : 'down' }),
  });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.state.players[playerId].row, playerId === 'jon' ? 3 : 1);
  f.sqlite.close();
});

test('both controllers are required, host starts once, and repeated start is idempotent', async () => {
  const f = fixture();
  const created = await api(f, '/api/rooms', { method: 'POST' });
  const code = created.body.code;
  const premature = await api(f, `/api/rooms/${code}/start`, { method: 'POST', token: created.body.hostToken });
  assert.equal(premature.status, 409);
  assert.equal(premature.body.code, 'players_required');
  const live = await openedRoom(f);
  assert.equal(live.game.revision, 3);
  assert.equal(live.game.phase, 'playing');
  assert.ok(['jon', 'lydia'].includes(live.game.state.activePlayer));
  assert.equal(live.game.state.activePlayer, live.game.state.firstPlayer);
  assert.equal(live.game.state.version, 3);
  assert.equal(live.game.state.players[live.firstPlayer].openingBonus, 0);
  assert.equal(live.game.state.players[live.secondPlayer].openingBonus, 1);
  assert.ok(live.game.players.jon.joined && live.game.players.lydia.joined);
  assert.ok(live.game.players.jon.connected && live.game.players.lydia.connected);
  const again = await api(f, `/api/rooms/${live.code}/start`, { method: 'POST', token: live.hostToken });
  assert.equal(again.status, 200);
  assert.equal(again.body.revision, 3);
  assert.deepEqual(again.body.state, live.game.state);
  const playerStart = await api(f, `/api/rooms/${live.code}/start`, { method: 'POST', token: live.tokens.jon });
  assert.equal(playerStart.status, 403);
  f.sqlite.close();
});

test('seat ownership can resume by secret client ID or token but another phone cannot steal it', async () => {
  const f = fixture();
  const live = await openedRoom(f, false);
  const taken = await api(f, `/api/rooms/${live.code}/join`, { method: 'POST', body: { playerId: 'jon', clientId: crypto.randomUUID() } });
  assert.equal(taken.status, 409);
  assert.equal(taken.body.code, 'seat_taken');
  const resumed = await api(f, `/api/rooms/${live.code}/join`, { method: 'POST', body: { playerId: 'jon', clientId: live.clients.jon } });
  assert.equal(resumed.status, 200);
  assert.notEqual(resumed.body.playerToken, live.tokens.jon);
  assert.equal((await api(f, `/api/rooms/${live.code}`, { token: live.tokens.jon })).status, 403);
  const newClient = crypto.randomUUID();
  const migrated = await api(f, `/api/rooms/${live.code}/join`, {
    method: 'POST', token: resumed.body.playerToken, body: { playerId: 'jon', clientId: newClient },
  });
  assert.equal(migrated.status, 200);
  assert.equal((await api(f, `/api/rooms/${live.code}`, { token: migrated.body.playerToken })).status, 200);
  const oldClient = await api(f, `/api/rooms/${live.code}/join`, { method: 'POST', body: { playerId: 'jon', clientId: live.clients.jon } });
  assert.equal(oldClient.status, 409);
  const raw = rawRoom(f, live.code).data;
  for (const secret of [live.clients.jon, live.clients.lydia, newClient, migrated.body.playerToken]) assert.ok(!raw.includes(secret));
  f.sqlite.close();
});

test('two simultaneous joins survive a compare-and-swap conflict without losing either seat', async () => {
  const f = fixture();
  const created = await api(f, '/api/rooms', { method: 'POST' });
  const code = created.body.code;
  const results = await Promise.all(['jon', 'lydia'].map(playerId => api(f, `/api/rooms/${code}/join`, {
    method: 'POST', body: { playerId, clientId: crypto.randomUUID() },
  })));
  assert.deepEqual(results.map(result => result.status), [200, 200]);
  const room = await api(f, `/api/rooms/${code}`);
  assert.equal(room.body.revision, 2);
  assert.ok(room.body.players.jon.joined && room.body.players.lydia.joined);
  f.sqlite.close();
});

test('only the active player can act; stale revisions fail; lost responses retry exactly once', async () => {
  const f = fixture();
  const live = await openedRoom(f);
  const body = actionBody(live.game.revision, live.openingMove);
  const hostMove = await api(f, `/api/rooms/${live.code}/action`, { method: 'POST', token: live.hostToken, body });
  assert.equal(hostMove.status, 403);
  const missingToken = await api(f, `/api/rooms/${live.code}/action`, { method: 'POST', body });
  assert.equal(missingToken.status, 401);
  const first = await api(f, `/api/rooms/${live.code}/action`, { method: 'POST', token: live.tokens[live.firstPlayer], body });
  assert.equal(first.status, 200);
  assert.equal(first.body.revision, 4);
  assert.equal(first.body.state.players[live.firstPlayer].row, live.firstPlayer === 'jon' ? 3 : 1);
  assert.equal(first.body.state.actionsLeft, 1);
  const outOfTurn = await api(f, `/api/rooms/${live.code}/action`, {
    method: 'POST', token: live.tokens[live.secondPlayer], body: actionBody(4, { type: 'end' }),
  });
  assert.equal(outOfTurn.status, 400);
  assert.match(outOfTurn.body.error, new RegExp(live.game.state.players[live.firstPlayer].name));
  const stale = await api(f, `/api/rooms/${live.code}/action`, {
    method: 'POST', token: live.tokens[live.firstPlayer], body: actionBody(3, { type: 'end' }),
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, 'stale_revision');
  const retry = await api(f, `/api/rooms/${live.code}/action`, { method: 'POST', token: live.tokens[live.firstPlayer], body });
  assert.equal(retry.status, 200);
  assert.deepEqual(retry.body, first.body);
  const reused = await api(f, `/api/rooms/${live.code}/action`, {
    method: 'POST', token: live.tokens[live.firstPlayer], body: { ...body, action: { type: 'end' } },
  });
  assert.equal(reused.status, 409);
  assert.equal(reused.body.code, 'action_id_reused');
  assert.equal(rawRoom(f, live.code).revision, 4);
  f.sqlite.close();
});

test('concurrent copies of one move both succeed while committing it only once', async () => {
  const f = fixture();
  const live = await openedRoom(f);
  const body = actionBody(live.game.revision, live.openingMove);
  const replies = await Promise.all([0, 1].map(() => api(f, `/api/rooms/${live.code}/action`, { method: 'POST', token: live.tokens[live.firstPlayer], body })));
  assert.deepEqual(replies.map(reply => reply.status), [200, 200]);
  assert.equal(replies[0].body.revision, 4);
  assert.equal(replies[1].body.revision, 4);
  assert.equal(rawRoom(f, live.code).revision, 4);
  assert.equal(replies[0].body.state.actionNumber, 1);
  f.sqlite.close();
});

test('different simultaneous moves at one revision commit only one and return a stale conflict', async () => {
  const f = fixture();
  const live = await openedRoom(f);
  const directions = live.firstPlayer === 'jon' ? ['up', 'right'] : ['down', 'left'];
  const replies = await Promise.all(directions.map(direction => api(f, `/api/rooms/${live.code}/action`, {
    method: 'POST', token: live.tokens[live.firstPlayer], body: actionBody(live.game.revision, { type: 'move', direction }),
  })));
  assert.deepEqual(replies.map(reply => reply.status).sort(), [200, 409]);
  const stored = rawRoom(f, live.code);
  assert.equal(stored.revision, 4);
  assert.equal(JSON.parse(stored.data).state.actionNumber, 1);
  f.sqlite.close();
});

test('heartbeat writes are throttled and never invalidate a gameplay revision', async () => {
  const f = fixture();
  const live = await openedRoom(f);
  const oldTime = Date.now() - 40_000;
  f.sqlite.prepare('UPDATE sofa_rooms SET jon_seen = ? WHERE code = ?').run(oldTime, live.code);
  const publicRead = await api(f, `/api/rooms/${live.code}`);
  assert.equal(publicRead.body.players.jon.connected, false);
  const first = await api(f, `/api/rooms/${live.code}`, { token: live.tokens.jon });
  assert.equal(first.body.players.jon.connected, true);
  assert.equal(first.body.revision, live.game.revision);
  assert.ok(first.body.players.jon.lastSeen > oldTime);
  const writes = f.stats.writes;
  const second = await api(f, `/api/rooms/${live.code}`, { token: live.tokens.jon });
  assert.equal(second.body.players.jon.lastSeen, first.body.players.jon.lastSeen);
  assert.equal(f.stats.writes, writes);
  const moved = await api(f, `/api/rooms/${live.code}/action`, {
    method: 'POST', token: live.tokens[live.firstPlayer], body: actionBody(live.game.revision, live.openingMove),
  });
  assert.equal(moved.status, 200);
  f.sqlite.close();
});

test('a complete game, retried final action, and host rematch preserve controller seats', async () => {
  const f = fixture();
  const live = await openedRoom(f);
  let game = live.game;
  let lastBody;
  let lastPlayer;
  for (let i = 0; i < 20; i++) {
    lastPlayer = game.state.activePlayer;
    lastBody = actionBody(game.revision, { type: 'end' });
    const reply = await api(f, `/api/rooms/${live.code}/action`, { method: 'POST', token: live.tokens[lastPlayer], body: lastBody });
    assert.equal(reply.status, 200);
    game = reply.body;
  }
  assert.equal(game.phase, 'finished');
  assert.equal(game.state.winner, live.secondPlayer, 'with no deliveries, the opening point decides the winner');
  const retried = await api(f, `/api/rooms/${live.code}/action`, { method: 'POST', token: live.tokens[lastPlayer], body: lastBody });
  assert.equal(retried.status, 200);
  assert.equal(retried.body.revision, game.revision);
  const playerRematch = await api(f, `/api/rooms/${live.code}/rematch`, { method: 'POST', token: live.tokens.jon });
  assert.equal(playerRematch.status, 403);
  const rematch = await api(f, `/api/rooms/${live.code}/rematch`, { method: 'POST', token: live.hostToken });
  assert.equal(rematch.status, 200);
  assert.equal(rematch.body.phase, 'playing');
  assert.equal(rematch.body.revision, game.revision + 1);
  assert.equal(rematch.body.state.round, 1);
  assert.notEqual(rematch.body.state.seed, game.state.seed);
  assert.equal(rematch.body.state.activePlayer, rematch.body.state.firstPlayer);
  const rematchSecond = rematch.body.state.firstPlayer === 'jon' ? 'lydia' : 'jon';
  assert.equal(rematch.body.state.players[rematchSecond].openingBonus, 1);
  assert.equal(rematch.body.state.players[rematch.body.state.firstPlayer].openingBonus, 0);
  assert.ok(rematch.body.players.jon.joined && rematch.body.players.lydia.joined);
  assert.equal((await api(f, `/api/rooms/${live.code}`, { token: live.tokens.jon })).status, 200);
  assert.equal((await api(f, `/api/rooms/${live.code}`, { token: live.tokens.lydia })).status, 200);
  assert.deepEqual(JSON.parse(rawRoom(f, live.code).data).recentActions, []);
  f.sqlite.close();
});

test('recent action history is capped separately at 64 per player', async () => {
  const f = fixture();
  const live = await openedRoom(f);
  const stored = rawRoom(f, live.code);
  const data = JSON.parse(stored.data);
  data.recentActions = ['jon', 'lydia'].flatMap(playerId => Array.from({ length: 70 }, (_, index) => ({ playerId, actionId: `earlier-${playerId}-${index}`, actionKey: '{"type":"end"}' })));
  f.sqlite.prepare('UPDATE sofa_rooms SET data = ? WHERE code = ?').run(JSON.stringify(data), live.code);
  const reply = await api(f, `/api/rooms/${live.code}/action`, {
    method: 'POST', token: live.tokens[live.firstPlayer], body: actionBody(stored.revision, live.openingMove),
  });
  assert.equal(reply.status, 200);
  const recent = JSON.parse(rawRoom(f, live.code).data).recentActions;
  assert.equal(recent.filter(item => item.playerId === 'jon').length, 64);
  assert.equal(recent.filter(item => item.playerId === 'lydia').length, 64);
  f.sqlite.close();
});

test('expired rooms reject reads and writes without recreating themselves', async () => {
  const f = fixture();
  const live = await openedRoom(f);
  f.sqlite.prepare('UPDATE sofa_rooms SET expires_at = ? WHERE code = ?').run(Date.now() - 1, live.code);
  const read = await api(f, `/api/rooms/${live.code}`);
  assert.equal(read.status, 410);
  assert.equal(read.body.code, 'room_expired');
  const move = await api(f, `/api/rooms/${live.code}/action`, { method: 'POST', token: live.tokens.jon, body: actionBody(live.game.revision, { type: 'end' }) });
  assert.equal(move.status, 410);
  assert.equal(rawRoom(f, live.code).revision, live.game.revision);
  f.sqlite.close();
});

test('creating a room deletes rooms past the expired-room retention window only', async () => {
  const f = fixture();
  const longExpired = await openedRoom(f);
  const recentlyExpired = await openedRoom(f);
  const live = await openedRoom(f);
  const now = Date.now();
  const setExpiry = (code, expiresAt) => f.sqlite.prepare('UPDATE sofa_rooms SET expires_at = ? WHERE code = ?').run(expiresAt, code);
  setExpiry(longExpired.code, now - EXPIRED_ROOM_RETENTION_MS - 1);
  setExpiry(recentlyExpired.code, now - 1);

  const created = await api(f, '/api/rooms', { method: 'POST', body: {} });
  assert.equal(created.status, 201);

  assert.equal(rawRoom(f, longExpired.code), undefined);
  assert.equal((await api(f, `/api/rooms/${longExpired.code}`)).status, 404);
  // A recently expired room still explains itself to an old TV or phone tab.
  const recentRead = await api(f, `/api/rooms/${recentlyExpired.code}`);
  assert.equal(recentRead.status, 410);
  assert.equal(recentRead.body.code, 'room_expired');
  assert.equal((await api(f, `/api/rooms/${live.code}`)).status, 200);
  f.sqlite.close();
});

test('a failed expired-room cleanup does not block room creation', async () => {
  const f = fixture();
  const prepare = f.env.DB.prepare;
  f.env.DB.prepare = sql => {
    if (sql.startsWith('DELETE')) throw new Error('cleanup unavailable');
    return prepare(sql);
  };
  const created = await api(f, '/api/rooms', { method: 'POST', body: {} });
  assert.equal(created.status, 201);
  assert.ok(rawRoom(f, created.body.code));
  f.sqlite.close();
});

test('cross-origin writes, oversized bodies, malformed inputs, and unknown tokens are rejected', async () => {
  const f = fixture();
  const originRejected = await api(f, '/api/rooms', { method: 'POST', origin: 'https://different.example' });
  assert.equal(originRejected.status, 403);
  assert.equal(originRejected.body.code, 'origin_rejected');
  const oversized = await api(f, '/api/rooms', { method: 'POST', rawBody: 'a'.repeat(MAX_BODY_BYTES + 1) });
  assert.equal(oversized.status, 413);
  const badJson = await api(f, '/api/rooms', { method: 'POST', rawBody: '{bad' });
  assert.equal(badJson.status, 400);
  const array = await api(f, '/api/rooms', { method: 'POST', rawBody: '[]' });
  assert.equal(array.status, 400);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM sofa_rooms').get().n, 0);
  const live = await openedRoom(f);
  const unknown = await api(f, `/api/rooms/${live.code}`, { token: 'not-the-real-token-but-long-enough-to-parse' });
  assert.equal(unknown.status, 403);
  const invalidClient = await api(f, `/api/rooms/${live.code}/join`, { method: 'POST', body: { playerId: 'jon', clientId: '123' } });
  assert.equal(invalidClient.status, 400);
  const invalidRevision = await api(f, `/api/rooms/${live.code}/action`, { method: 'POST', token: live.tokens.jon, body: { revision: '3', actionId: crypto.randomUUID(), action: { type: 'end' } } });
  assert.equal(invalidRevision.status, 400);
  const wrongMethod = await api(f, `/api/rooms/${live.code}/start`);
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.response.headers.get('allow'), 'POST');
  const absent = await api(f, '/api/rooms/ZZZZZZ');
  assert.equal(absent.status, 404);
  f.sqlite.close();
});

test('database faults and missing bindings produce safe errors without stack traces or secrets', async () => {
  const missing = await handleApi(new Request(`${ORIGIN}/api/rooms/ZZZZZZ`), {});
  assert.equal(missing.status, 503);
  const broken = await handleApi(new Request(`${ORIGIN}/api/rooms/ZZZZZZ`), { DB: { prepare() { throw new Error('sensitive internal diagnostic'); } } });
  assert.equal(broken.status, 500);
  const text = await broken.text();
  assert.ok(!text.includes('sensitive internal diagnostic'));
  assert.ok(!text.includes('stack'));
  assert.match(broken.headers.get('cache-control'), /no-store/);
});

test('steered swipe retries preserve axis and direction, and reject reused IDs with another plan', async () => {
  const f = fixture();
  const live = await openedRoom(f);
  const action = { type: 'lure', axis: 'column', index: 1, direction: -1 };
  const payload = actionBody(live.game.revision, action);
  const first = await api(f, `/api/rooms/${live.code}/action`, { method: 'POST', token: live.tokens[live.firstPlayer], body: payload });
  assert.equal(first.status, 200);
  assert.deepEqual([first.body.state.forecast.axis, first.body.state.forecast.index, first.body.state.forecast.direction], ['column', 1, -1]);
  const repeated = await api(f, `/api/rooms/${live.code}/action`, { method: 'POST', token: live.tokens[live.firstPlayer], body: payload });
  assert.equal(repeated.status, 200);
  assert.equal(repeated.body.revision, first.body.revision);
  for (const changed of [{ ...action, direction: 1 }, { ...action, axis: 'row' }]) {
    const reused = await api(f, `/api/rooms/${live.code}/action`, { method: 'POST', token: live.tokens[live.firstPlayer], body: { ...payload, action: changed } });
    assert.equal(reused.status, 409);
    assert.equal(reused.body.code, 'action_id_reused');
  }
  f.sqlite.close();
});

test('an index-only swipe retry stays valid after a later action changes the swipe axis', async () => {
  const f = fixture();
  const live = await openedRoom(f);
  const payload = actionBody(live.game.revision, { type: 'lure', index: (live.game.state.forecast.index + 1) % 5 });
  const first = await api(f, `/api/rooms/${live.code}/action`, { method: 'POST', token: live.tokens[live.firstPlayer], body: payload });
  assert.equal(first.status, 200);
  const changed = await api(f, `/api/rooms/${live.code}/action`, { method: 'POST', token: live.tokens[live.firstPlayer],
    body: actionBody(first.body.revision, { type: 'lure', axis: 'column', index: 2, direction: 1 }) });
  assert.equal(changed.status, 200);
  const retry = await api(f, `/api/rooms/${live.code}/action`, { method: 'POST', token: live.tokens[live.firstPlayer], body: payload });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.revision, changed.body.revision);
  assert.equal(retry.body.state.forecast.axis, 'column');
  f.sqlite.close();
});

test('a known committed ID cannot acknowledge a fabricated future revision', async () => {
  const f = fixture();
  const live = await openedRoom(f);
  const body = actionBody(live.game.revision, live.openingMove);
  const first = await api(f, `/api/rooms/${live.code}/action`, { method: 'POST', token: live.tokens[live.firstPlayer], body });
  assert.equal(first.status, 200);
  const future = await api(f, `/api/rooms/${live.code}/action`, {
    method: 'POST', token: live.tokens[live.firstPlayer], body: { ...body, revision: first.body.revision + 1 },
  });
  assert.equal(future.status, 409);
  assert.equal(future.body.code, 'stale_revision');
  assert.equal(rawRoom(f, live.code).revision, first.body.revision);
  f.sqlite.close();
});

for (const version of [1, 2]) {
  test(`restored Sofa Kingdoms v${version} rooms retain scoring and toys until a v3 rematch`, async () => {
    const f = fixture();
    const live = await openedRoom(f);
    const stored = rawRoom(f, live.code);
    const data = JSON.parse(stored.data);
    delete data.gameId;
    delete data.state.firstPlayer;
    data.state.version = version;
    data.state.activePlayer = 'jon';
    for (const player of Object.values(data.state.players)) {
      delete player.openingBonus;
      if (version === 1) delete player.bonusPoints;
    }
    data.state.players.jon.carried = 5;
    data.state.players.jon.lures = 1;
    f.sqlite.prepare('UPDATE sofa_rooms SET data = ? WHERE code = ?').run(JSON.stringify(data), live.code);
    const banked = await api(f, `/api/rooms/${live.code}/action`, {
      method: 'POST', token: live.tokens.jon, body: actionBody(stored.revision, { type: 'bank' }),
    });
    assert.equal(banked.status, 200);
    assert.equal(banked.body.state.version, version);
    assert.equal(banked.body.state.players.jon.banked, 5);
    assert.equal(banked.body.state.players.jon.bonusPoints || 0, version === 1 ? 0 : 2);
    assert.equal(banked.body.state.players.jon.lures, version === 1 ? 1 : 2);
    assert.equal(banked.body.state.players.jon.openingBonus, undefined);
    let current = banked.body;
    for (let index = 0; index < 20 && current.phase === 'playing'; index++) {
      const next = await api(f, `/api/rooms/${live.code}/action`, {
        method: 'POST', token: live.tokens[current.state.activePlayer], body: actionBody(current.revision, { type: 'end' }),
      });
      assert.equal(next.status, 200);
      current = next.body;
      assert.equal(current.state.version, version);
    }
    assert.equal(current.phase, 'finished');
    const rematch = await api(f, `/api/rooms/${live.code}/rematch`, { method: 'POST', token: live.hostToken });
    assert.equal(rematch.status, 200);
    assert.equal(rematch.body.state.version, 3);
    assert.ok(rematch.body.players.jon.joined && rematch.body.players.lydia.joined);
    f.sqlite.close();
  });
}

test('a new engine without the complete private adapter cannot create or expose a room', async () => {
  const handler = createRoomApi({
    resolveGame: () => ({ id: 'private-broken' }),
    resolveEngine: () => ({ playerIds: ['jon', 'lydia'], create() {}, apply() {} }),
  });
  const f = fixture(handler);
  const create = await api(f, '/api/rooms', { method: 'POST', body: { gameId: 'private-broken' } });
  assert.equal(create.status, 503);
  assert.equal(create.body.code, 'invalid_engine');
  assert.equal(f.stats.writes, 0);
  f.handler = handleApi;
  const live = await openedRoom(f);
  const data = JSON.parse(rawRoom(f, live.code).data);
  data.gameId = 'private-broken';
  data.state.secret = 'unprojected-state-must-not-be-returned';
  f.sqlite.prepare('UPDATE sofa_rooms SET data = ? WHERE code = ?').run(JSON.stringify(data), live.code);
  f.handler = handler;
  for (const token of [undefined, live.hostToken, live.tokens.jon, live.tokens.lydia]) {
    const read = await api(f, `/api/rooms/${live.code}`, { token });
    assert.equal(read.status, 503);
    assert.equal(read.body.code, 'invalid_engine');
    assert.ok(!JSON.stringify(read.body).includes(data.state.secret));
  }
  f.sqlite.close();
});

test('projector failures are redacted and do not start, rotate credentials, or commit actions', async () => {
  let failProjection = false;
  const secret = 'private-state-and-engine-diagnostic';
  const engine = {
    playerIds: ['jon', 'lydia'],
    create: ({ matchId }) => ({ matchId, phaseId: `${matchId}:city:0`, phase: 'playing', turns: 0, secret }),
    normalizeAction: action => action,
    actionKey: action => JSON.stringify(action),
    canRebaseAction: () => false,
    apply: state => ({ ...state, turns: state.turns + 1, phaseId: `${state.matchId}:city:1` }),
    project(state) {
      if (failProjection || state.turns > 0) throw new Error(secret);
      const { secret: omitted, ...publicState } = state;
      return publicState;
    },
  };
  const f = fixture(createRoomApi({ resolveGame: () => ({ id: 'private-projector' }), resolveEngine: () => engine }));
  const created = await api(f, '/api/rooms', { method: 'POST', body: { gameId: 'private-projector' } });
  const code = created.body.code;
  const tokens = {};
  const clients = {};
  for (const playerId of ['jon', 'lydia']) {
    clients[playerId] = crypto.randomUUID();
    const joined = await api(f, `/api/rooms/${code}/join`, { method: 'POST', body: { playerId, clientId: clients[playerId] } });
    tokens[playerId] = joined.body.playerToken;
  }
  const beforeStart = rawRoom(f, code);
  failProjection = true;
  const failedStart = await api(f, `/api/rooms/${code}/start`, { method: 'POST', token: created.body.hostToken });
  assert.equal(failedStart.status, 500);
  assert.ok(!JSON.stringify(failedStart.body).includes(secret));
  assert.deepEqual(rawRoom(f, code), beforeStart);
  failProjection = false;
  const started = await api(f, `/api/rooms/${code}/start`, { method: 'POST', token: created.body.hostToken });
  assert.equal(started.status, 200);
  const beforeAction = rawRoom(f, code);
  const failedAction = await api(f, `/api/rooms/${code}/action`, {
    method: 'POST', token: tokens.jon, body: actionBody(started.body.revision, {
      type: 'work', matchId: started.body.state.matchId, phaseId: started.body.state.phaseId,
    }),
  });
  assert.equal(failedAction.status, 500);
  assert.ok(!JSON.stringify(failedAction.body).includes(secret));
  assert.deepEqual(rawRoom(f, code), beforeAction);
  failProjection = true;
  const failedJoin = await api(f, `/api/rooms/${code}/join`, {
    method: 'POST', body: { playerId: 'jon', clientId: clients.jon },
  });
  assert.equal(failedJoin.status, 500);
  assert.ok(!JSON.stringify(failedJoin.body).includes(secret));
  assert.deepEqual(rawRoom(f, code), beforeAction);
  failProjection = false;
  assert.equal((await api(f, `/api/rooms/${code}`, { token: tokens.jon })).status, 200);
  f.sqlite.close();
});

test('foreign Origins are rejected on reads as well as writes', async () => {
  const f = fixture();
  const live = await openedRoom(f);
  const read = await api(f, `/api/rooms/${live.code}`, { token: live.tokens.jon, headers: { Origin: 'https://hostile.example' } });
  assert.equal(read.status, 403);
  assert.equal(read.body.code, 'origin_rejected');
  assert.equal(read.body.state, undefined);
  f.sqlite.close();
});
