import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { once } from 'node:events';
import { X509Certificate } from 'node:crypto';
import { WebSocket } from 'ws';
import { startSecureLanFixture } from '../fixture.mjs';
import { SECURE_LAN_FIXTURE_ASSETS } from '../../../desktop/secure-lan/fixtures/assets.mjs';

function request(base, target, { ca, method = 'GET', headers = {}, json: value } = {}) {
  const url = new URL(base);
  const data = value === undefined ? undefined : JSON.stringify(value);
  return new Promise((resolve, reject) => {
    const req = (url.protocol === 'https:' ? https : http).request({
      protocol: url.protocol, hostname: url.hostname, port: url.port, path: target,
      method, ca, agent: false,
      headers: { ...headers, ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) },
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.once('error', reject);
    req.end(data);
  });
}

test('fixture serves the same authority through HTTP, verified HTTPS and real WSS', async t => {
  const f = await startSecureLanFixture();
  t.after(() => f.close());
  const secure = f.httpsOrigins.find(value => value.includes('127.0.0.1'));
  const plain = f.httpOrigins.find(value => value.includes('127.0.0.1'));
  assert.equal(JSON.parse((await request(plain, '/fixture/authority')).text).count, 0);
  assert.equal(JSON.parse((await request(plain, '/fixture/authority', { method: 'POST', headers: { Origin: plain }, json: { type: 'increment' } })).text).count, 1);
  const read = await request(secure, '/fixture/authority', { ca: f.publicCa });
  assert.equal(read.status, 200);
  assert.deepEqual(JSON.parse(read.text), { fixture: true, authority: 'one-injected-authority', count: 1 });
  const ws = new WebSocket(`${secure.replace('https:', 'wss:')}/api/realtime/gravity-orchard`, { ca: f.publicCa, origin: secure });
  t.after(() => ws.terminate());
  await once(ws, 'open');
  const received = once(ws, 'message');
  ws.send(JSON.stringify({ type: 'increment' }));
  const [message] = await received;
  assert.equal(JSON.parse(message).count, 2);
  assert.equal(JSON.parse((await request(plain, '/fixture/authority')).text).count, 2);
  await assert.rejects(request(secure, '/fixture/authority'), /unable to verify|self-signed|certificate/i);
});

test('fixture asset/public export allowlists exclude private APIs, filesystem, credentials and repositories', async t => {
  const f = await startSecureLanFixture();
  t.after(() => f.close());
  const base = f.httpOrigin;
  for (const asset of SECURE_LAN_FIXTURE_ASSETS) {
    const result = await request(base, asset.route);
    assert.equal(result.status, 200, asset.route);
    assert.equal(result.headers['x-content-type-options'], 'nosniff');
    assert.ok(result.headers['content-security-policy'].includes("frame-ancestors 'none'"));
    assert.doesNotMatch(result.text, /BEGIN (?:EC |RSA )?PRIVATE KEY/);
  }
  for (const route of [
    '/server/secure-lan/certificates/storage.mjs', '/desktop/host/entry.mjs', '/AGENTS.md',
    '/.git/config', '/.sofa-lan/rooms.sqlite', '/secure-lan-v1/installation.json',
    '/rootCA-key.pem', '/leaf-key.pem', '/etc/passwd', '/api/host/secure-lan',
    '/fixture/provision', '/fixture/remove', '/fixture/export-private',
    '/secure-lan/../secure-lan/setup', '/secure-lan/%2e%2e/index.mjs',
    '/fixture/public-trust?format=private-key', '/fixture/public-trust?format=pem&path=/private/key',
  ]) {
    const response = await request(base, route);
    assert.ok([400, 404].includes(response.status), `${route}: ${response.status}`);
    assert.doesNotMatch(response.text, /BEGIN|token|PRIVATE KEY|sqlite|\/tmp\/|\/private\//i);
  }
  for (const route of ['/api/host/secure-lan', '/fixture/provision', '/fixture/remove', '/fixture/public-trust?format=pem']) {
    assert.equal((await request(base, route, { method: 'POST', headers: { Origin: base }, json: { path: '../../secret', role: 'host' } })).status, 404);
  }
  for (const format of ['pem', 'mobileconfig']) {
    const result = await request(base, `/fixture/public-trust?format=${format}`);
    assert.equal(result.status, 200);
    const exported = JSON.parse(result.text);
    assert.deepEqual(Object.keys(exported).sort(), ['certificateFingerprint', 'contents', 'filename', 'mediaType', 'validUntil']);
    assert.doesNotMatch(result.text, /PRIVATE KEY|\.sqlite|appDataDir|Bearer |\.pem\//);
    if (format === 'pem') {
      assert.equal(new X509Certificate(exported.contents).fingerprint256, exported.certificateFingerprint);
      assert.equal(new X509Certificate(exported.contents).ca, true);
      assert.equal((exported.contents.match(/BEGIN CERTIFICATE/g) || []).length, 1);
    } else {
      assert.match(exported.contents, /com\.apple\.security\.root/);
      assert.doesNotMatch(exported.contents, /pkcs12|SCEP|com\.apple\.vpn/i);
    }
  }
  const status = JSON.parse((await request(base, '/fixture/status')).text);
  assert.equal(status.status, 'ready');
  assert.equal(status.requiresPhoneTrust, true);
  assert.doesNotMatch(JSON.stringify(status), /PRIVATE|key|\/tmp|token|database/);
});

test('fixture rejects scheme/Host/Origin spoofing and closes active WSS on disposal', async t => {
  const f = await startSecureLanFixture();
  t.after(() => f.close());
  const base = f.httpOrigin;
  assert.equal((await request(base, '/fixture/authority', { headers: { Host: 'attacker.local:4177', 'X-Forwarded-Host': new URL(base).host } })).status, 421);
  assert.equal((await request(base, '/fixture/authority', { headers: { Origin: 'https://attacker.example' } })).status, 403);
  assert.equal((await request(base, '/fixture/authority', { method: 'POST', json: { type: 'increment' } })).status, 403);
  assert.equal((await request(base, '/fixture/authority', { headers: { Origin: base.replace('http:', 'https:'), 'X-Forwarded-Proto': 'https' } })).status, 403);
  const secure = f.httpsOrigins.find(value => value.includes('127.0.0.1'));
  const ws = new WebSocket(`${secure.replace('https:', 'wss:')}/api/realtime/gravity-orchard`, { ca: f.publicCa, origin: secure });
  ws.on('error', () => {});
  await once(ws, 'open');
  const closed = new Promise(resolve => ws.once('close', resolve));
  const start = performance.now();
  await f.close();
  await closed;
  assert.ok(performance.now() - start < 2000, 'fixture has bounded owned-connection shutdown');
  await assert.rejects(request(base, '/fixture/authority'), /ECONNREFUSED|ECONNRESET/);
});
