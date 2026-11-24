import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { request, createServer as createUnsafeFixtureServer } from 'node:https';
import { createServer as createHttpServer, request as httpRequest } from 'node:http';
import { X509Certificate } from 'node:crypto';
import { connect as connectTcp } from 'node:net';
import { connect as connectTls } from 'node:tls';
import os from 'node:os';
import { once } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import { createSecureLanServer } from '../index.mjs';
import { createRequestPolicy } from '../request-policy.mjs';
import { createTestMaterial } from '../certificates/tests/helpers.mjs';

let good;
let unrelated;
before(async () => {
  good = (await createTestMaterial()).tlsMaterial;
  unrelated = (await createTestMaterial()).tlsMaterial;
});

function httpsGet(port, { ca = good.ca, servername = 'localhost', headers, path = '/', method = 'GET', agent = false } = {}) {
  return new Promise((resolve, reject) => {
    const client = request({ host: '127.0.0.1', port, path, method, ca, servername, headers, agent, timeout: 3000 }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body, headers: response.headers }));
    });
    client.on('timeout', () => client.destroy(new Error('test request timed out')));
    client.on('error', reject);
    client.end();
  });
}

async function listener(t, extra = {}) {
  const value = await createSecureLanServer({ tlsMaterial: good, host: '127.0.0.1', port: 0, requestHandler: (_req, res) => res.end('shared authority'), ...extra });
  t.after(() => value.close());
  return value;
}

function policyRequest({ encrypted = true, method = 'GET', url = '/', host = '127.0.0.1:4178', origin = 'https://127.0.0.1:4178', extra = [], headers = {} } = {}) {
  const rawHeaders = ['Host', host, ...(origin === undefined ? [] : ['Origin', origin]), ...extra];
  const bag = { host, ...(origin === undefined ? {} : { origin }), ...headers };
  for (let index = 0; index < extra.length; index += 2) if (!(extra[index].toLowerCase() in bag)) bag[extra[index].toLowerCase()] = extra[index + 1];
  return { socket: { encrypted }, method, url, headers: bag, rawHeaders };
}

function rawTls(port, lines) {
  return new Promise((resolve, reject) => {
    const socket = connectTls({ host: '127.0.0.1', port, ca: good.ca }, () => socket.end(lines));
    let body = '';
    socket.setEncoding('utf8');
    socket.setTimeout(3000, () => socket.destroy(new Error('raw fixture timed out')));
    socket.on('data', chunk => { body += chunk; });
    socket.on('end', () => resolve(body));
    socket.on('error', reject);
  });
}

test('actual trusted HTTPS serves the injected handler and only safe ready metadata', async t => {
  const seen = [];
  const value = await listener(t, { requestHandler(req, res) { seen.push(req); res.end('existing room store'); } });
  const result = await httpsGet(value.port);
  assert.equal(result.status, 200);
  assert.equal(result.body, 'existing room store');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].socket.encrypted, true);
  assert.ok(value.port > 0);
  assert.ok(value.origins.includes(`https://127.0.0.1:${value.port}`));
  assert.deepEqual(Object.keys(value).sort(), ['close', 'origins', 'port', 'status']);
  assert.deepEqual(Object.keys(value.status).sort(), ['certificateFingerprint', 'controllerOrigins', 'enabled', 'requiresPhoneTrust', 'status', 'validUntil']);
  assert.equal(value.status.status, 'ready');
  assert.equal(value.status.requiresPhoneTrust, true);
  assert.equal(value.status.controllerOrigins, value.origins);
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, /PRIVATE KEY|BEGIN CERTIFICATE|Bearer|database|\/tmp|\.pem|\.key/);
  assert.ok(Object.isFrozen(value.status) && Object.isFrozen(value.origins));
});

test('wrong root, wrong DNS name and no test trust are rejected by actual TLS verification', async t => {
  const value = await listener(t);
  await assert.rejects(httpsGet(value.port, { ca: unrelated.ca }), error => /CERT|VERIFY|ISSUER/.test(error.code));
  await assert.rejects(httpsGet(value.port, { servername: 'wrong.local' }), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' });
  await assert.rejects(httpsGet(value.port, { ca: [] }), error => /CERT|VERIFY|ISSUER/.test(error.code));
});

test('verified TLS rejects an actually expired test leaf; production factory refuses it before binding', async t => {
  const now = Date.now();
  const expired = (await createTestMaterial({ rootNotBefore: new Date(now - 86400000 * 3), rootNotAfter: new Date(now + 86400000 * 365), notBefore: new Date(now - 86400000 * 2), notAfter: new Date(now - 86400000) })).tlsMaterial;
  await assert.rejects(createSecureLanServer({ tlsMaterial: expired, port: 0, requestHandler() {} }), error => error.status === 'certificate-expired');
  // Deliberately invalid TLS fixture demonstrates client verification. This is
  // not the production factory, which correctly refuses expired material.
  const raw = createUnsafeFixtureServer({ key: expired.key, cert: expired.cert }, (_req, res) => res.end('must never arrive'));
  raw.on('tlsClientError', (_err, socket) => socket.destroy());
  await new Promise(resolve => raw.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => raw.close(resolve)));
  await assert.rejects(httpsGet(raw.address().port, { ca: expired.ca }), { code: 'CERT_HAS_EXPIRED' });
});

test('a listener stops advertising ready and stops accepting connections when its leaf expires', async t => {
  const expiry = new X509Certificate(good.cert).validToDate.getTime();
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: expiry - 1000 });
  const value = await listener(t);
  assert.equal((await httpsGet(value.port)).status, 200);
  t.mock.timers.tick(999);
  assert.equal(value.status.status, 'ready');
  t.mock.timers.tick(1);
  assert.equal(value.status.status, 'certificate-expired');
  assert.deepEqual(value.status.controllerOrigins, []);
  await assert.rejects(httpsGet(value.port), { code: 'ECONNREFUSED' });
});

test('bad material, mismatched advertised SANs, invalid local hosts and ports fail safely', async () => {
  const opts = { tlsMaterial: good, host: '127.0.0.1', port: 0, requestHandler() {} };
  for (const tlsMaterial of [null, {}, { ...good, key: Buffer.from('private diagnostic sentinel') }, { ...good, ca: unrelated.ca }]) {
    await assert.rejects(createSecureLanServer({ ...opts, tlsMaterial }), error => {
      assert.doesNotMatch(error.message + JSON.stringify(error), /sentinel|PRIVATE KEY|BEGIN CERT|\/tmp|openssl/i);
      return error.status === 'failed';
    });
  }
  await assert.rejects(createSecureLanServer({ ...opts, tlsMaterial: { ...good, identities: ['uncovered.local'] } }), error => error.status === 'address-mismatch');
  for (const host of ['example.com', '8.8.8.8', '127.0.0.1/../../secret', '/tmp/a.sock']) {
    await assert.rejects(createSecureLanServer({ ...opts, host }), { code: 'configuration_invalid' });
  }
  for (const port of [-1, 65536, '4178', NaN, 1.5]) await assert.rejects(createSecureLanServer({ ...opts, port }), { code: 'configuration_invalid' });
  await assert.rejects(createSecureLanServer({ ...opts, requestHandler: null }), { code: 'configuration_invalid' });
  await assert.rejects(createSecureLanServer({ ...opts, onUpgrade: false }), { code: 'configuration_invalid' });
});

test('bound origins never advertise certificate identities unreachable through a specific bind', async t => {
  const withLan = (await createTestMaterial({ identities: ['127.0.0.1', 'localhost', '192.168.234.56', 'garden.local'] })).tlsMaterial;
  const value = await listener(t, { tlsMaterial: withLan });
  assert.deepEqual([...value.origins].sort(), [`https://127.0.0.1:${value.port}`, `https://localhost:${value.port}`]);
  const onlyOther = (await createTestMaterial({ identities: ['192.168.234.56'] })).tlsMaterial;
  await assert.rejects(listener(t, { tlsMaterial: onlyOther }), error => error.status === 'address-mismatch');
});

test('stale wildcard SAN addresses and unavailable specific binds fail without orphan services', async t => {
  // Only the address-discovery boundary is mocked; TLS binding and client
  // verification are real. This runner may deny interface enumeration.
  t.mock.method(os, 'networkInterfaces', () => ({ lo: [{ address: '127.0.0.1' }] }));
  const stale = '192.168.254.254';
  const material = (await createTestMaterial({ identities: [stale] })).tlsMaterial;
  await assert.rejects(listener(t, { tlsMaterial: material, host: '0.0.0.0' }), error => error.status === 'address-mismatch');
  await assert.rejects(listener(t, { tlsMaterial: material, host: stale }), { code: 'bind_failed' });
  const current = await listener(t);
  assert.equal((await httpsGet(current.port)).status, 200);
  const wildcard = await listener(t, { host: '0.0.0.0' });
  assert.equal((await httpsGet(wildcard.port)).status, 200);
});

test('unavailable interface discovery produces a safe failure instead of stale wildcard origins', async t => {
  t.mock.method(os, 'networkInterfaces', () => { throw new Error('/private/path SECRET interface failure'); });
  await assert.rejects(listener(t, { host: '0.0.0.0' }), error => error.code === 'bind_failed' && !/SECRET|private/.test(error.message));
});

test('original IncomingMessage headers and raw headers are untouched by the TLS wrapper', async t => {
  let original;
  let before;
  const value = await listener(t, { requestHandler(req, res) { original = req; before = JSON.stringify(req.rawHeaders); res.end('ok'); } });
  const supplied = { Origin: `https://127.0.0.1:${value.port}`, 'X-Forwarded-Proto': 'http', 'X-Forwarded-Host': 'attacker.invalid', Forwarded: 'host=attacker.invalid;proto=http', 'X-Test-Header': 'unchanged' };
  await httpsGet(value.port, { headers: supplied });
  assert.equal(original.headers.origin, supplied.Origin);
  assert.equal(original.headers['x-forwarded-proto'], 'http');
  assert.equal(original.headers['x-forwarded-host'], 'attacker.invalid');
  assert.equal(original.headers.forwarded, supplied.Forwarded);
  assert.equal(original.headers['x-test-header'], 'unchanged');
  assert.equal(JSON.stringify(original.rawHeaders), before);
});

test('scheme-aware policy enforces exact Host/Origin using the real encrypted socket', async t => {
  let policy;
  let accepted = 0;
  const value = await listener(t, { requestHandler(req, res) {
    const result = policy.validateRequest(req);
    if (!result.ok) { res.writeHead(result.status); res.end(result.code); return; }
    accepted += 1;
    res.end(`${result.scheme} ${result.url.pathname}${result.url.search}`);
  } });
  policy = createRequestPolicy({ httpsOrigins: [...value.origins] });
  assert.equal((await httpsGet(value.port, { path: '/safe?q=yes' })).body, 'https /safe?q=yes');
  assert.equal((await httpsGet(value.port, { headers: { Origin: `https://127.0.0.1:${value.port}` }, method: 'POST' })).status, 200);
  for (const headers of [
    { Host: `attacker.local:${value.port}` },
    { Host: `127.0.0.1:${value.port + 1}` },
    { Origin: 'https://attacker.invalid' },
    { Origin: `http://127.0.0.1:${value.port}`, 'X-Forwarded-Proto': 'http' },
    { Host: `attacker.local:${value.port}`, 'X-Forwarded-Host': `127.0.0.1:${value.port}`, Origin: `https://127.0.0.1:${value.port}` },
    { Origin: 'null' },
  ]) assert.ok([403, 421].includes((await httpsGet(value.port, { headers })).status));
  assert.equal((await httpsGet(value.port, { method: 'POST' })).status, 403);
  assert.equal((await httpsGet(value.port, { path: 'https://attacker.invalid/' })).status, 400);
  assert.equal(accepted, 2);
});

test('raw duplicate Origin/Host rejection and forwarded spoofing cannot bypass policy', () => {
  const policy = createRequestPolicy({ httpOrigins: ['http://127.0.0.1:4177'], httpsOrigins: ['https://127.0.0.1:4178'] });
  assert.equal(policy.validateRequest(policyRequest()).ok, true);
  assert.equal(policy.validateRequest(policyRequest({ extra: ['Origin', 'https://127.0.0.1:4178'] })).ok, false);
  assert.equal(policy.validateRequest(policyRequest({ extra: ['Host', '127.0.0.1:4178'] })).ok, false);
  assert.equal(policy.validateRequest(policyRequest({ encrypted: false, extra: ['X-Forwarded-Proto', 'https'] })).ok, false);
  assert.equal(policy.validateRequest(policyRequest({ host: '127.0.0.1:4177', encrypted: false, origin: 'http://127.0.0.1:4177', extra: ['X-Forwarded-Proto', 'https'] })).ok, true);
  for (const host of ['user@127.0.0.1:4178', '127.0.0.1:4178/other', '127.0.0.1:4178#x', '127.0.0.1:4178?x', '127.000.000.001:4178']) {
    assert.equal(policy.validateRequest(policyRequest({ host })).ok, false);
  }
  for (const url of ['//attacker.local/path', '/\\attacker.local/path', '/path#fragment', '/bad\naddress']) {
    assert.equal(policy.validateRequest(policyRequest({ url })).ok, false);
  }
  for (const origins of [['https://example.com'], ['https://127.0.0.1:4178/'], ['https://user@127.0.0.1:4178'], ['https://127.0.0.1:0'], ['http://127.0.0.1:4178']]) {
    assert.throws(() => createRequestPolicy({ httpsOrigins: origins }));
  }
});

test('HTTP and HTTPS share one injected handler; spoofed Forwarded does not change the HTTP scheme', async t => {
  let policy;
  const authority = { requests: 0 };
  const shared = (req, res) => {
    const result = policy.validateRequest(req);
    if (!result.ok) { res.writeHead(result.status); res.end(result.code); return; }
    authority.requests += 1;
    res.end(`${result.scheme}:${authority.requests}`);
  };
  const plain = createHttpServer(shared);
  await new Promise(resolve => plain.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => plain.close(resolve)));
  const value = await listener(t, { requestHandler: shared });
  const plainOrigin = `http://127.0.0.1:${plain.address().port}`;
  policy = createRequestPolicy({ httpOrigins: [plainOrigin], httpsOrigins: [...value.origins] });
  async function plainGet(origin) {
    return await new Promise((resolve, reject) => {
      const req = httpRequest(plainOrigin, { headers: { Origin: origin, 'X-Forwarded-Proto': 'https', Forwarded: 'proto=https' } }, res => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      req.on('error', reject);
      req.end();
    });
  }
  assert.equal((await plainGet(plainOrigin)).body, 'http:1');
  assert.equal((await httpsGet(value.port)).body, 'https:2');
  assert.equal((await plainGet(plainOrigin.replace('http:', 'https:'))).status, 403);
  assert.equal(authority.requests, 2);
});

test('real duplicate Origin request reaches injected denial without leaking headers into response', async t => {
  let policy;
  const value = await listener(t, { requestHandler(req, res) { const result = policy.validateRequest(req); res.writeHead(result.ok ? 200 : result.status); res.end(result.ok ? 'ok' : result.code); } });
  policy = createRequestPolicy({ httpsOrigins: [...value.origins] });
  const raw = await rawTls(value.port, `GET / HTTP/1.1\r\nHost: 127.0.0.1:${value.port}\r\nOrigin: https://127.0.0.1:${value.port}\r\nOrigin: https://secret.invalid\r\nConnection: close\r\n\r\n`);
  assert.match(raw, /^HTTP\/1\.1 403 /);
  assert.doesNotMatch(raw, /secret\.invalid/);
});

test('real WSS carries data to the same injected authority and preserves upgrade headers', async t => {
  let policy;
  let upgradeRequest;
  const authority = { count: 0 };
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  const value = await listener(t, {
    requestHandler(_req, res) { res.end(String(authority.count)); },
    onUpgrade(req, socket, head) {
      upgradeRequest = req;
      if (!policy.validateUpgrade(req)) { socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'); return; }
      wss.handleUpgrade(req, socket, head, ws => ws.on('message', data => { authority.count += 1; ws.send(data.toString()); }));
    },
  });
  policy = createRequestPolicy({ httpsOrigins: [...value.origins] });
  const ws = new WebSocket(`wss://127.0.0.1:${value.port}/api/realtime/gravity-orchard`, { ca: good.ca, origin: `https://127.0.0.1:${value.port}`, headers: { 'X-Forwarded-Proto': 'http' } });
  t.after(() => { ws.terminate(); wss.close(); });
  await once(ws, 'open');
  const received = once(ws, 'message');
  ws.send('shared coordinator');
  assert.equal((await received)[0].toString(), 'shared coordinator');
  assert.equal((await httpsGet(value.port)).body, '1');
  assert.equal(upgradeRequest.socket.encrypted, true);
  assert.equal(upgradeRequest.headers['x-forwarded-proto'], 'http');
  assert.equal(upgradeRequest.headers.origin, `https://127.0.0.1:${value.port}`);
  const clientClosed = once(ws, 'close');
  await value.close();
  await clientClosed;
  assert.equal(ws.readyState, WebSocket.CLOSED);
});

test('upgrade policy denies missing/wrong Origin, credentials in URL, queries and wrong route', () => {
  const policy = createRequestPolicy({ httpsOrigins: ['https://127.0.0.1:4178'] });
  const base = { url: '/api/realtime/gravity-orchard', extra: ['Upgrade', 'websocket', 'Connection', 'Upgrade'] };
  assert.equal(policy.validateUpgrade(policyRequest(base)), true);
  for (const change of [{ origin: 'null' }, { origin: 'https://attacker.local' }, { method: 'POST' }, { url: base.url + '?token=secret' }, { url: '/other' }, { extra: [] }]) {
    assert.equal(policy.validateUpgrade(policyRequest({ ...base, ...change })), false);
  }
  const absent = policyRequest(base);
  delete absent.headers.origin;
  absent.rawHeaders.splice(2, 2);
  assert.equal(policy.validateUpgrade(absent), false);
});

test('real WSS rejection paths obey exact scheme, route, Host and Origin', async t => {
  let policy;
  let denied = 0;
  const value = await listener(t, { onUpgrade(req, socket) {
    assert.equal(policy.validateUpgrade(req), false);
    denied += 1;
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  } });
  policy = createRequestPolicy({ httpsOrigins: [...value.origins] });
  const same = `https://127.0.0.1:${value.port}`;
  for (const { path, origin, headers } of [
    { path: '/api/realtime/gravity-orchard', origin: 'https://attacker.invalid' },
    { path: '/api/realtime/gravity-orchard', origin: same.replace('https:', 'http:'), headers: { 'X-Forwarded-Proto': 'http' } },
    { path: '/api/realtime/gravity-orchard' },
    { path: '/api/realtime/gravity-orchard?token=not-a-real-token', origin: same },
    { path: '/api/realtime/gravity-orchard', origin: same, headers: { Host: `attacker.local:${value.port}`, 'X-Forwarded-Host': `127.0.0.1:${value.port}` } },
    { path: '/not-the-route', origin: same },
  ]) {
    const ws = new WebSocket(`wss://127.0.0.1:${value.port}${path}`, { ca: good.ca, origin, headers });
    t.after(() => ws.terminate());
    await assert.rejects(once(ws, 'open'), /403/);
  }
  assert.equal(denied, 6);
});

test('missing upgrade handler denies WSS and rejected clients leave no shutdown hang', async t => {
  const value = await listener(t);
  const ws = new WebSocket(`wss://127.0.0.1:${value.port}/api/realtime/gravity-orchard`, { ca: good.ca, origin: `https://127.0.0.1:${value.port}` });
  t.after(() => ws.terminate());
  await assert.rejects(once(ws, 'open'), /404/);
  await value.close();
});

test('request/upgrade callback failures and onError rejection never disclose raw exception content', async t => {
  const codes = [];
  const secret = 'PRIVATE KEY at /tmp/private.pem Bearer SECRET-DIAGNOSTIC';
  const value = await listener(t, {
    requestHandler: async () => { throw new Error(secret); },
    onUpgrade: () => { throw new Error(secret); },
    onError(event) { codes.push(event); throw new Error(secret); },
  });
  const result = await httpsGet(value.port);
  assert.equal(result.status, 500);
  assert.doesNotMatch(result.body, /PRIVATE|tmp|Bearer|SECRET/);
  const ws = new WebSocket(`wss://127.0.0.1:${value.port}/echo`, { ca: good.ca });
  t.after(() => ws.terminate());
  await assert.rejects(once(ws, 'open'));
  assert.ok(codes.some(event => event.code === 'request_failed'));
  assert.ok(codes.some(event => event.code === 'upgrade_failed'));
  for (const event of codes) assert.deepEqual(Object.keys(event), ['code']);
  assert.doesNotMatch(JSON.stringify(codes), /PRIVATE|tmp|Bearer|SECRET/);
});

test('port conflicts fail closed without attaching to or closing the existing listener', async t => {
  const first = await listener(t);
  await assert.rejects(createSecureLanServer({ tlsMaterial: good, host: '127.0.0.1', port: first.port, requestHandler() {} }), { code: 'port_in_use' });
  assert.equal((await httpsGet(first.port)).body, 'shared authority');
  await first.close();
  const replacement = await listener(t, { port: first.port });
  assert.equal((await httpsGet(replacement.port)).status, 200);
});

test('bounded idempotent close stops raw handshakes and active HTTP and releases the port', { timeout: 15_000 }, async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let handlerEntered;
  const entered = new Promise(resolve => { handlerEntered = resolve; });
  const value = await listener(t, { requestHandler() { handlerEntered(); } });
  const raw = connectTcp({ host: '127.0.0.1', port: value.port });
  raw.on('error', () => {});
  raw.resume();
  await once(raw, 'connect');
  t.after(() => raw.destroy());
  const pending = httpsGet(value.port).catch(error => error);
  await entered;
  const rawClosed = new Promise(resolve => raw.once('close', resolve));
  const closing = value.close();
  assert.equal(closing, value.close());
  // Advance through the 250 ms grace period with I/O still open.
  t.mock.timers.tick(250);
  await Promise.all([closing, rawClosed]);
  assert.equal(value.status.status, 'disabled');
  assert.deepEqual(value.status.controllerOrigins, []);
  assert.ok(await pending instanceof Error);
  assert.equal(raw.destroyed, true);
  const replacement = await listener(t, { port: value.port });
  assert.equal((await httpsGet(replacement.port)).status, 200);
});

test('repeated startup and host disposal are independently reusable without orphan listeners', async () => {
  for (let i = 0; i < 5; i += 1) {
    const value = await createSecureLanServer({ tlsMaterial: good, host: '127.0.0.1', port: 0, requestHandler(_req, res) { res.end('ok'); } });
    const port = value.port;
    assert.equal((await httpsGet(port)).body, 'ok');
    await value.close();
    await value.close();
    await assert.rejects(httpsGet(port), { code: 'ECONNREFUSED' });
  }
});
