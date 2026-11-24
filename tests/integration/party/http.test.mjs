import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { request as httpsRequest } from 'node:https';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startLanServer } from '../../../server/lan.mjs';
import { createCertificateStore, createSecureLanServer } from '../../../server/runtime/gravity-orchard-dependencies.mjs';
import { WebSocket } from 'ws';

function rejectedUpgrade(address, origin, protocols = [], options = {}) {
  return new Promise((resolve, reject) => {
    const client = new WebSocket(address, protocols, { ...options, origin });
    client.on('error', reject);
    client.once('open', () => { client.close(); resolve(101); });
    client.once('unexpected-response', (_, response) => {
      response.resume();
      resolve(response.statusCode);
    });
  });
}

test('party LAN routes share the same-origin JSON and upgrade rules', { timeout: 7000 }, async t => {
  const host = await startLanServer({ host: '127.0.0.1', port: 0, databasePath: ':memory:' });
  t.after(() => host.close());
  const address = host.origin + '/api/party/rooms';
  const body = JSON.stringify({ gameId: 'tap-race', requestId: 'key1'.repeat(8) });
  const post = headers => fetch(address, { method: 'POST', headers, body });
  const json = { 'Content-Type': 'application/json' };
  assert.equal((await post(json)).status, 403);
  assert.equal((await post({ ...json, Origin: 'https://example.test' })).status, 403);
  assert.equal((await post({ Origin: host.origin })).status, 415);
  const oversized = await fetch(address, { method: 'POST', headers: { ...json, Origin: host.origin }, body: ' '.repeat(1025) });
  assert.equal(oversized.status, 413);
  assert.equal((await fetch(address + '?', { method: 'POST', headers: { ...json, Origin: host.origin }, body })).status, 400);
  const created = await post({ ...json, Origin: host.origin });
  assert.equal(created.status, 201);
  const { code } = await created.json();
  const url = new URL('/api/realtime/party', host.origin);
  url.protocol = 'ws:';
  assert.equal(await rejectedUpgrade(url, undefined), 403);
  assert.equal(await rejectedUpgrade(url, 'https://example.test'), 403);
  assert.equal(await rejectedUpgrade(url, host.origin, ['extra']), 403);
  const withQuery = new URL(url);
  withQuery.searchParams.set('extra', '1');
  assert.equal(await rejectedUpgrade(withQuery, host.origin), 403);
  function socketCloseCode(payload) {
    return new Promise((resolve, reject) => {
      const client = new WebSocket(url, { origin: host.origin });
      client.on('error', reject);
      client.once('open', () => client.send(payload));
      client.once('close', resolve);
    });
  }
  assert.equal(await socketCloseCode(JSON.stringify({ type: 'auth', protocol: 1, code, token: 'A'.repeat(43) })), 4403);
  assert.equal(await socketCloseCode(' '.repeat(513)), 1009);
});

test('party join and WSS share the LAN authority and exact HTTPS origin', { timeout: 30_000 }, async t => {
  const directory = await mkdtemp(path.join(await realpath(tmpdir()), 'sofa-party-tls-'));
  const host = await startLanServer({ host: '127.0.0.1', port: 0, databasePath: ':memory:' });
  t.after(() => host.close());
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createCertificateStore({ appDataDir: directory });
  const identities = ['localhost', '127.0.0.1'];
  await store.provision({ identities, port: 4178 });
  const tlsMaterial = await store.loadTlsMaterial({ identities });
  const secure = await createSecureLanServer({
    tlsMaterial, host: '127.0.0.1', port: 0, requestHandler: host.requestHandler, onUpgrade: host.handleUpgrade,
  });
  t.after(() => secure.close());
  host.setSecureControllerStatus(secure.status);

  const response = await fetch(host.origin + '/api/party/rooms', {
    method: 'POST', headers: { Origin: host.origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId: 'tap-race', requestId: 'h'.repeat(32) }),
  });
  assert.equal(response.status, 201);
  const { code } = await response.json();
  const origin = `https://127.0.0.1:${secure.port}`;
  const tls = { ca: tlsMaterial.ca, servername: 'localhost' };
  function join(requestOrigin, contentType = 'application/json') {
    return new Promise((resolve, reject) => {
      const request = httpsRequest(`${origin}/api/party/rooms/${code}/join`, {
        ...tls, method: 'POST', headers: { Origin: requestOrigin, 'Content-Type': contentType },
      }, received => {
        let body = '';
        received.setEncoding('utf8');
        received.on('data', chunk => { body += chunk; });
        received.on('end', () => resolve({ status: received.statusCode, body: JSON.parse(body) }));
      });
      request.once('error', reject);
      request.end(JSON.stringify({ look: 0, name: 'Secure Mouse', requestId: 'p'.repeat(32) }));
    });
  }
  assert.equal((await join(host.origin)).status, 403);
  assert.equal((await join([origin, origin])).status, 403);
  assert.equal((await join(origin, 'text/plain')).status, 415);
  const joined = await join(origin);
  assert.equal(joined.status, 201);

  const url = origin.replace('https:', 'wss:') + '/api/realtime/party';
  assert.equal(await rejectedUpgrade(url, host.origin, [], tls), 403);
  const socket = new WebSocket(url, { ...tls, origin });
  t.after(() => socket.terminate());
  await once(socket, 'open');
  const message = once(socket, 'message');
  socket.send(JSON.stringify({ type: 'auth', protocol: 1, code, token: joined.body.token }));
  const [packet] = await message;
  const welcome = JSON.parse(packet);
  assert.equal(welcome.type, 'welcome');
  assert.equal(welcome.view.self.id, joined.body.playerId);
  assert.equal(welcome.view.self.name, 'Secure Mouse');
});

test('one LAN peer cannot take every party upgrade slot', { timeout: 5000 }, async t => {
  const host = await startLanServer({ host: '0.0.0.0', port: 0, databasePath: ':memory:' });
  t.after(() => host.close());
  if (!host.urls.length) return t.skip('No non-loopback IPv4 interface');
  const { origin } = new URL(host.urls[0]);
  const url = origin.replace('http:', 'ws:') + '/api/realtime/party';
  const peers = [];
  t.after(() => { for (const peer of peers) peer.terminate(); });
  for (let count = 0; count < 4; count++) {
    const peer = new WebSocket(url, { origin });
    peers.push(peer);
    await once(peer, 'open');
  }
  assert.equal(await rejectedUpgrade(url, origin), 429);
  const local = host.origin.replace('http:', 'ws:') + '/api/realtime/party';
  assert.equal(await rejectedUpgrade(local, host.origin), 101);
  const closed = once(peers[0], 'close');
  peers[0].close();
  await closed;
  assert.equal(await rejectedUpgrade(url, origin), 101);
});
