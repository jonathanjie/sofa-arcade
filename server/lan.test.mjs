import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { request as httpRequest } from 'node:http';
import { startLanServer } from './lan.mjs';
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
  for (const filename of ['/app.js', '/engine.mjs', '/transport.mjs', '/assets/qrcode.js', '/assets/characters.png']) {
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
