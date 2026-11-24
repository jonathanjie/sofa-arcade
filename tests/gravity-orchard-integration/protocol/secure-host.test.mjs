import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpsRequest } from 'node:https';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { DatabaseSync } from 'node:sqlite';
import { createCertificateStore, createSecureLanServer } from '../../../server/runtime/gravity-orchard-dependencies.mjs';
import { startLanServer } from '../../../server/lan.mjs';
import { harness, api, connectPeer, flush, manualClock, until } from './helpers.mjs';

function httpsCall(origin, route, { ca, body, token, servername = 'localhost', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(route, origin);
    const request = httpsRequest(url, { ca, servername, method: body === undefined ? 'GET' : 'POST',
      headers: { Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers } }, response => {
      let text = ''; response.setEncoding('utf8'); response.on('data', chunk => { text += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, text, headers: response.headers }));
    });
    request.on('error', reject); request.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

test('verified HTTPS/WSS and HTTP/WS share the original request, credential authority, run and SQLite store', async t => {
  const directory = await mkdtemp(path.join(await realpath(tmpdir()), 'go7-tls-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const h = await harness(t);
  const store = createCertificateStore({ appDataDir: directory });
  await store.provision({ identities: ['localhost', '127.0.0.1'], port: 4178 });
  const material = await store.loadTlsMaterial({ identities: ['localhost', '127.0.0.1'] });
  const originalRequests = [];
  const secure = await createSecureLanServer({ tlsMaterial: material, host: '127.0.0.1', port: 0,
    requestHandler: (request, response) => { originalRequests.push({ encrypted: request.socket.encrypted, host: request.headers.host, origin: request.headers.origin }); return h.host.requestHandler(request, response); },
    onUpgrade: h.host.handleUpgrade,
  });
  t.after(() => secure.close());
  h.host.setSecureControllerStatus(secure.status);
  const origin = `https://127.0.0.1:${secure.port}`;
  const html = await httpsCall(origin, '/', { ca: material.ca });
  assert.equal(html.status, 200);
  assert.match(html.text, new RegExp(`name="sofa-join-origin" content="https://127.0.0.1:${secure.port}"`));
  assert.deepEqual(originalRequests[0], { encrypted: true, host: `127.0.0.1:${secure.port}`, origin });
  const publicRead = await httpsCall(origin, `/api/rooms/${h.room.code}`, { ca: material.ca });
  assert.equal(publicRead.status, 200);
  assert.equal(JSON.parse(publicRead.text).state.matchId, h.room.started.state.matchId);
  const jon = await h.connect('jon', { origin, ca: material.ca });
  assert.equal(jon.welcome.viewer.playerId, 'jon');
  h.players.jon = jon;
  jon.input(); h.lydia.input(); await flush();
  assert.equal((await jon.command('ready', { value: true })).result.accepted, true);
  assert.equal((await h.lydia.command('ready', { value: true })).result.accepted, true);
  await h.pump(3200, { x: -0.4, y: 0.5, brake: false });
  assert.equal(h.tv.snapshot.view.phase, 'playing');
  assert.equal(jon.snapshot.view.matchId, h.lydia.snapshot.view.matchId);
  assert.ok(h.host.realtimeDiagnostics(h.room.code).coordinator.inputsAccepted > 120);
  const tlsRead = JSON.parse((await httpsCall(origin, `/api/rooms/${h.room.code}`, { ca: material.ca, token: h.room.tokens.host })).text);
  const httpRead = (await api(h.host, `/api/rooms/${h.room.code}`, { token: h.room.tokens.host })).value;
  assert.deepEqual(tlsRead.state, httpRead.state);
  assert.equal(tlsRead.revision, httpRead.revision);
  assert.equal((await httpsCall(origin, `/api/rooms/${h.room.code}`, { ca: material.ca, headers: { Origin: h.host.origin } })).status, 403);
  assert.equal((await api(h.host, `/api/rooms/${h.room.code}`, { headers: { Origin: origin, 'X-Forwarded-Proto': 'https' } })).status, 403);
  await assert.rejects(httpsCall(origin, '/', { ca: [] }), error => /CERT|VERIFY|ISSUER/.test(error.code));
  await assert.rejects(httpsCall(origin, '/', { ca: material.ca, servername: 'wrong.local' }), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' });
  for (const route of ['/api/host/secure-lan', '/server/gravity-orchard-host.mjs', '/server/runtime/gravity-orchard-dependencies.mjs', '/games/gravity-orchard/engine.mjs', '/desktop/secure-lan/fixture.mjs', '/secure-lan-v1/root-key.pem']) {
    assert.equal((await httpsCall(origin, route, { ca: material.ca })).status, 404, route);
  }
  await t.test('real WSS revokes the old phone after an HTTP seat rejoin', { timeout: 30_000 }, async () => {
    const oldInput = jon.input({ x: 1, y: 0, brake: false });
    await flush();
    const closed = once(jon.ws, 'close');
    const rotated = await api(h.host, `/api/rooms/${h.room.code}/join`, { body: { playerId: 'jon', clientId: h.room.clientIds.jon } });
    assert.equal(rotated.status, 200);
    const id = crypto.randomUUID();
    const { matchId, runEpoch } = jon.snapshot.view;
    jon.send({ type: 'command', protocol: 1, matchId, runEpoch, id, kind: 'pause', payload: { reason: 'help' } });
    const [code] = await closed;
    assert.equal(code, 4401);
    assert.equal(jon.ws.readyState, WebSocket.CLOSED);
    assert.ok(!jon.messages.some(m => m.type === 'command-result' && m.id === id && m.accepted));
    const revoked = await connectPeer(h.host, h.room, 'jon', { origin, ca: material.ca });
    assert.equal(revoked.welcome, null);
    revoked.ws.terminate();
    await h.clock.advance(2200);
    assert.equal(h.tv.snapshot.view.phase, 'paused');
    const replacement = await h.connect('jon', { origin, ca: material.ca, token: rotated.value.playerToken });
    h.players.jon = replacement;
    assert.equal(replacement.welcome.viewer.playerId, 'jon');
    assert.notEqual(replacement.welcome.controllerEpoch, jon.welcome.controllerEpoch);
    replacement.input(); h.lydia.input(); await flush();
    assert.equal((await replacement.command('ready', { value: true })).result.accepted, true);
    assert.equal(h.tv.snapshot.view.phase, 'paused');
    assert.equal((await h.lydia.command('ready', { value: true })).result.accepted, true);
    await h.pump(3200);
    assert.equal(h.tv.snapshot.view.phase, 'playing');
    const before = h.host.realtimeDiagnostics(h.room.code).coordinator;
    replacement.send(oldInput);
    await until(() => h.host.realtimeDiagnostics(h.room.code).coordinator.rejectedInputReasons.controller_epoch
      === (before.rejectedInputReasons.controller_epoch || 0) + 1);
    await h.clock.advance(100);
    assert.equal(h.host.realtimeDiagnostics(h.room.code).coordinator.inputsAccepted, before.inputsAccepted);
    assert.deepEqual(h.tv.snapshot.view.players.jon.input, { x: 0, y: 0, brake: true });
  });
});

test('unknown checkpoint schemas fail closed without preventing Sofa Kingdoms room creation', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'go7-corrupt-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const databasePath = path.join(directory, 'rooms.sqlite');
  const h = await harness(t, { databasePath });
  for (const peer of h.peers) peer.ws.terminate(); await flush(); await h.host.close();
  const raw = new DatabaseSync(databasePath);
  try {
    const record = JSON.parse(raw.prepare('SELECT checkpoint FROM sofa_gravity_checkpoints WHERE code = ?').get(h.room.code).checkpoint);
    record.coordinatorSchema = 999;
    raw.prepare('UPDATE sofa_gravity_checkpoints SET checkpoint = ? WHERE code = ?').run(JSON.stringify(record), h.room.code);
  } finally { raw.close(); }
  const host = await startLanServer({ host: '127.0.0.1', port: 0, databasePath, enableGravityOrchard: true, realtimeClock: manualClock() });
  t.after(() => host.close());
  const read = await api(host, `/api/rooms/${h.room.code}`, { token: h.room.tokens.host });
  assert.equal(read.status, 503);
  assert.equal(read.value.code, 'realtime_unavailable');
  assert.ok(!('state' in read.value));
  assert.equal((await api(host, '/api/rooms', { body: {} })).status, 201);
  assert.equal(host.realtimeDiagnostics(h.room.code).coordinator, null);
});
