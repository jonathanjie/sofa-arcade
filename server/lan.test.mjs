import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { request as httpRequest } from 'node:http';
import { startLanServer } from './lan.mjs';
import { handleApi } from './rooms.mjs';
import { legalActions } from '../game/engine.mjs';
import { createEventDecoder } from '../ui/transport.mjs';

async function request(host, route, { body, token, method = body === undefined ? 'GET' : 'POST', headers = {} } = {}) {
  const response = await fetch(host.origin + route, {
    method,
    headers: { ...(method === 'POST' ? { Origin: host.origin, 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json(), response };
}

async function room(host) {
  const created = await request(host, '/api/rooms', { body: {} });
  assert.equal(created.status, 201);
  const { code, hostToken } = created.body;
  const tokens = {};
  for (const playerId of ['jon', 'lydia']) {
    const joined = await request(host, `/api/rooms/${code}/join`, { body: { playerId, clientId: crypto.randomUUID() } });
    assert.equal(joined.status, 200);
    tokens[playerId] = joined.body.playerToken;
  }
  const started = await request(host, `/api/rooms/${code}/start`, { token: hostToken, body: {} });
  assert.equal(started.status, 200);
  return { code, hostToken, tokens, game: started.body };
}

async function listen(host, code, token) {
  const controller = new AbortController();
  const response = await fetch(`${host.origin}/api/rooms/${code}/events`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  const reader = response.body.getReader();
  const history = [];
  const waiting = new Set();
  let stopped = false;
  const decoder = new TextDecoder();
  const decode = createEventDecoder((type, value) => {
    history.push({ type, value });
    for (const item of [...waiting]) if (item.predicate(type, value)) {
      clearTimeout(item.timeout); waiting.delete(item); item.resolve(value);
    }
  });
  const pumping = (async () => {
    try { while (!stopped) { const { value, done } = await reader.read(); if (done) break; decode(decoder.decode(value, { stream: true })); } }
    catch (error) { if (!stopped) for (const item of waiting) item.reject(error); }
  })();
  return {
    history,
    waitFor(predicate) {
      const found = history.find(event => predicate(event.type, event.value));
      if (found) return Promise.resolve(found.value);
      return new Promise((resolve, reject) => {
        const item = { predicate, resolve, reject, timeout: null };
        item.timeout = setTimeout(() => { waiting.delete(item); reject(new Error('Timed out waiting for the pushed room.')); }, 2500);
        waiting.add(item);
      });
    },
    async close() {
      stopped = true; controller.abort(); await reader.cancel().catch(() => {}); await pumping;
      for (const item of waiting) { clearTimeout(item.timeout); item.reject(new Error('Stream closed.')); }
      waiting.clear();
    },
  };
}

test('real HTTP host uses both phone seats and pushes authoritative actions without polling or token leaks', async t => {
  const host = await startLanServer({ port: 0, host: '127.0.0.1', databasePath: ':memory:' });
  t.after(() => host.close());
  const live = await room(host);
  const tv = await listen(host, live.code, live.hostToken);
  t.after(() => tv.close());
  assert.deepEqual(await tv.waitFor((type, value) => type === 'room' && value.revision === live.game.revision), live.game);
  const playerId = live.game.state.activePlayer;
  const action = legalActions(live.game.state, playerId).find(action => action.type === 'move');
  const actionId = crypto.randomUUID();
  const applied = await request(host, `/api/rooms/${live.code}/action`, {
    token: live.tokens[playerId], body: { revision: live.game.revision, actionId, action },
  });
  assert.equal(applied.status, 200);
  const pushed = await tv.waitFor((type, value) => type === 'room' && value.revision === applied.body.revision);
  assert.deepEqual(pushed, applied.body);
  const retry = await request(host, `/api/rooms/${live.code}/action`, {
    token: live.tokens[playerId], body: { revision: live.game.revision, actionId, action },
  });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.revision, applied.body.revision);
  const transmitted = JSON.stringify(tv.history);
  for (const privateValue of [live.hostToken, live.tokens.jon, live.tokens.lydia, 'tokenHash', 'hostHash', 'recentActions']) assert.ok(!transmitted.includes(privateValue));
});

test('local streams require credentials and reject another origin; rotated credentials terminate existing streams', async t => {
  const host = await startLanServer({ port: 0, host: '127.0.0.1', databasePath: ':memory:' });
  t.after(() => host.close());
  const created = await request(host, '/api/rooms', { body: {} });
  const code = created.body.code;
  const clientId = crypto.randomUUID();
  const joined = await request(host, `/api/rooms/${code}/join`, { body: { playerId: 'jon', clientId } });
  const phone = await listen(host, code, joined.body.playerToken);
  t.after(() => phone.close());
  await phone.waitFor(type => type === 'room');
  assert.equal((await request(host, `/api/rooms/${code}/events`)).status, 401);
  assert.equal((await request(host, `/api/rooms/${code}/events`, { token: 'x'.repeat(43) })).status, 403);
  assert.equal((await request(host, '/api/rooms', { body: {}, headers: { Origin: 'https://foreign.example' } })).status, 403);
  assert.equal((await request(host, `/api/rooms/${code}/events`, { token: created.body.hostToken, headers: { Origin: 'https://foreign.example' } })).status, 403);
  const rotated = await request(host, `/api/rooms/${code}/join`, { body: { playerId: 'jon', clientId } });
  assert.equal(rotated.status, 200);
  const ended = await phone.waitFor((type, value) => type === 'error' && value.status === 403);
  assert.equal(ended.code, 'invalid_token');
});

test('local assets expose the game and LAN metadata without exposing source documents or arbitrary files', async t => {
  const host = await startLanServer({ port: 0, host: '127.0.0.1', databasePath: ':memory:' });
  t.after(() => host.close());
  const page = await fetch(host.origin + '/');
  const html = await page.text();
  assert.match(html, /name="sofa-transport" content="lan"/);
  assert.match(html, new RegExp(`name="sofa-join-origin" content="http://[^\"]+:${host.port}"`));
  for (const filename of ['/app.js', '/engine.mjs', '/transport.mjs', '/room-client.mjs', '/assets/qrcode.js', '/assets/characters.png']) {
    const asset = await fetch(host.origin + filename, { method: 'HEAD' });
    assert.equal(asset.status, 200, filename);
    assert.equal(await asset.text(), '');
  }
  for (const route of ['/AGENTS.md', '/server/rooms.mjs', '/.sofa-lan/rooms.sqlite', '/assets/%2e%2e%2f%2e%2e%2fAGENTS.md', '/assets/%ZZ']) {
    assert.equal((await fetch(host.origin + route)).status, 404, route);
  }
  const badHostStatus = await new Promise((resolve, reject) => {
    const message = httpRequest({ hostname: '127.0.0.1', port: host.port, path: '/', headers: { Host: `foreign.example:${host.port}` } }, response => {
      response.resume(); response.once('end', () => resolve(response.statusCode));
    });
    message.once('error', reject); message.end();
  });
  assert.equal(badHostStatus, 421);
  const oversized = await request(host, '/api/rooms', { body: 'x'.repeat(13 * 1024) });
  assert.equal(oversized.status, 413);
  const chunkedStatus = await new Promise((resolve, reject) => {
    const message = httpRequest({ hostname: '127.0.0.1', port: host.port, path: '/api/rooms', method: 'POST', headers: { Origin: host.origin, 'Transfer-Encoding': 'chunked' } }, response => {
      response.resume(); response.once('end', () => resolve(response.statusCode));
    });
    message.once('error', reject); message.write('x'.repeat(7 * 1024)); message.end('y'.repeat(7 * 1024));
  });
  assert.equal(chunkedStatus, 413);
});

test('the injectable authority handles ordinary requests and each authenticated stream read independently', async t => {
  const calls = [];
  const host = await startLanServer({ port: 0, host: '127.0.0.1', databasePath: ':memory:', roomApi: async (incoming, env) => {
    calls.push({ path: new URL(incoming.url).pathname, method: incoming.method, token: incoming.headers.get('authorization') });
    return handleApi(incoming, env);
  } });
  t.after(() => host.close());
  const live = await room(host);
  const tv = await listen(host, live.code, live.hostToken);
  t.after(() => tv.close());
  const phone = await listen(host, live.code, live.tokens.jon);
  t.after(() => phone.close());
  await tv.waitFor(type => type === 'room');
  await phone.waitFor(type => type === 'room');
  const path = `/api/rooms/${live.code}`;
  assert.ok(calls.some(value => value.path === '/api/rooms' && value.method === 'POST'));
  assert.ok(calls.some(value => value.path === path && value.method === 'GET' && value.token === `Bearer ${live.hostToken}`));
  assert.ok(calls.some(value => value.path === path && value.method === 'GET' && value.token === `Bearer ${live.tokens.jon}`));
  assert.deepEqual(Object.keys(host).sort(), ['close', 'databasePath', 'origin', 'port', 'urls']);
});

test('strict Host validation rejects userinfo, paths, fragments, missing authority and duplicate headers', async t => {
  const host = await startLanServer({ port: 0, host: '127.0.0.1', databasePath: ':memory:' });
  t.after(() => host.close());
  const authority = `127.0.0.1:${host.port}`;
  const raw = headers => new Promise((resolve, reject) => {
    const message = httpRequest({ hostname: '127.0.0.1', port: host.port, path: '/', setHost: false, headers }, response => {
      response.resume(); response.once('end', () => resolve(response.statusCode));
    });
    message.once('error', reject); message.end();
  });
  for (const value of [`forged@${authority}`, `${authority}/path`, `${authority}#fragment`, `${authority}?query`, `127.1:${host.port}`, '127.0.0.1:bad']) {
    assert.equal(await raw({ Host: value }), 421, value);
  }
  // Node may reject a missing HTTP/1.1 Host before dispatching the request.
  assert.ok([400, 421].includes(await raw({})));
  assert.equal(await raw(['Host', authority, 'Host', authority]), 421);
  assert.equal(await raw({ Host: authority }), 200);
  assert.equal((await request(host, '/api/rooms', { body: {}, headers: { Origin: '' } })).status, 403);
});

test('shutdown during an awaiting initial stream read never registers an orphan stream', async t => {
  let entered;
  let release;
  const waiting = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const host = await startLanServer({ port: 0, host: '127.0.0.1', databasePath: ':memory:', roomApi: async (_incoming, env) => {
    entered(); await gate;
    await env.DB.prepare('SELECT count(*) AS total FROM sofa_rooms').first();
    return new Response(JSON.stringify({ code: 'ABC234', revision: 0 }), { headers: { 'Content-Type': 'application/json' } });
  } });
  t.after(() => host.close());
  const response = fetch(`${host.origin}/api/rooms/ABC234/events`, { headers: { Authorization: `Bearer ${'x'.repeat(43)}` } });
  await waiting;
  const closing = host.close();
  assert.equal(host.close(), closing, 'Concurrent closes share one completion promise');
  release();
  const reply = await response;
  assert.ok(!reply.headers.get('content-type')?.includes('text/event-stream'));
  await reply.text();
  await closing;
});

test('shutdown waits for an aborted HTTP request still using the room database', async t => {
  let entered;
  let release;
  let databaseUsed = false;
  const waiting = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const host = await startLanServer({ port: 0, host: '127.0.0.1', databasePath: ':memory:', roomApi: async (_incoming, env) => {
    entered(); await gate;
    await env.DB.prepare('SELECT count(*) AS total FROM sofa_rooms').first();
    databaseUsed = true;
    return new Response('{}');
  } });
  t.after(() => host.close());
  const message = httpRequest({ hostname: '127.0.0.1', port: host.port, path: '/api/rooms/ABC234' });
  message.on('error', () => {}); message.end();
  await waiting;
  message.destroy();
  let completed = false;
  const closing = host.close().then(() => { completed = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(completed, false);
  release();
  await closing;
  assert.equal(databaseUsed, true);
});

test('explicit browser module entries serve only named public helpers/UI files and reject private aliases', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'sofa-browser-modules-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const folder of ['drizzle', 'ui/games/sample-game', 'ui/media/sample-game', 'games/sample-game', 'server']) {
    await mkdir(path.join(root, folder), { recursive: true });
  }
  const sources = [
    'ui/games/sample-game/view.mjs', 'ui/media/sample-game/score.mjs',
    'games/sample-game/catalog.mjs', 'games/sample-game/preview.mjs',
  ];
  for (const source of sources) await writeFile(path.join(root, source), 'export const publicValue = 7;');
  await writeFile(path.join(root, 'server/private.mjs'), 'PRIVATE-AUTHORITY');
  await symlink(path.join(root, 'server/private.mjs'), path.join(root, 'ui/games/sample-game/alias.mjs'));
  const entries = sources.map(source => ({ source, url: '/' + source }));
  // This synthetic root has no database migrations, so the realtime host stays off.
  const host = await startLanServer({ root, databasePath: ':memory:', host: '127.0.0.1', port: 0, browserModules: entries, enableGravityOrchard: false });
  t.after(() => host.close());
  for (const entry of entries) {
    const response = await fetch(host.origin + entry.url);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'export const publicValue = 7;');
  }
  assert.equal((await fetch(host.origin + '/server/private.mjs')).status, 404);
  assert.equal((await fetch(host.origin + '/ui/games/sample-game/alias.mjs')).status, 404);
  for (const entry of [
    { source: 'server/private.mjs', url: '/games/sample-game/view.mjs' },
    { source: 'games/sample-game/engine.mjs', url: '/games/sample-game/engine.mjs' },
    { source: 'ui/games/sample-game/fixtures/full-state.mjs', url: '/games/sample-game/data.mjs' },
    { source: 'ui/games/sample-game/view.test.mjs', url: '/games/sample-game/view.mjs' },
    { source: 'ui/games/sample-game/../sample-game/view.mjs', url: '/games/sample-game/view.mjs' },
    { source: 'ui/games/sample-game/*.mjs', url: '/games/sample-game/view.mjs' },
    { source: sources[0], url: '/api/rooms/view.mjs' },
    { source: sources[0], url: '/app.js' },
    { source: sources[0], url: '/games/catalog.mjs' },
    { source: 'ui/games/sample-game/alias.mjs', url: '/games/sample-game/alias.mjs' },
  ]) {
    await assert.rejects(startLanServer({ root, databasePath: ':memory:', host: '127.0.0.1', port: 0, browserModules: [entry] }), TypeError);
  }
  await assert.rejects(startLanServer({ root, databasePath: ':memory:', port: 0, browserModules: [entries[0], entries[0]] }), TypeError);
  // Changing the source into an alias after startup still fails closed.
  await rm(path.join(root, sources[0]));
  await symlink(path.join(root, 'server/private.mjs'), path.join(root, sources[0]));
  assert.equal((await fetch(host.origin + entries[0].url)).status, 404);
});

test('local SQLite rooms survive a host restart with the same credentials and revision', async t => {
  const folder = await mkdtemp(path.join(tmpdir(), 'sofa-lan-test-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const databasePath = path.join(folder, 'rooms.sqlite');
  let host = await startLanServer({ port: 0, host: '127.0.0.1', databasePath });
  t.after(() => host.close());
  const live = await room(host);
  await host.close();
  host = await startLanServer({ port: 0, host: '127.0.0.1', databasePath });
  const restored = await request(host, `/api/rooms/${live.code}`, { token: live.hostToken });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.revision, live.game.revision);
  assert.deepEqual(restored.body.state, live.game.state);
  assert.equal((await request(host, `/api/rooms/${live.code}`, { token: live.tokens.jon })).status, 200);
});
