import test from 'node:test';
import assert from 'node:assert/strict';
import { createSecureLanHost, createLoopbackHostAuthorizer } from '../host-capabilities.mjs';

const fingerprint = Array(32).fill('AB').join(':');
const hostContext = Object.freeze({ nativeIdentity: Symbol('host') });
const origin = 'http://127.0.0.1:4177';
const safeKeys = ['enabled', 'status', 'controllerOrigins', 'requiresPhoneTrust', 'certificateFingerprint', 'validUntil'];

function request({ remote = '127.0.0.1', method = 'POST', target = '/api/host/secure-lan', extra = {}, bearer = 'host-only' } = {}) {
  const headers = { host: '127.0.0.1:4177', origin, authorization: `Bearer ${bearer}`, ...extra };
  return { method, url: target, socket: { remoteAddress: remote }, headers, rawHeaders: Object.entries(headers).flat() };
}

function fixture(overrides = {}) {
  const counts = { provision: 0, remove: 0, exported: 0, started: 0, closed: 0 };
  let addresses = ['127.0.0.1'];
  let inspection = { state: 'missing', identities: [], rootReplacementRequired: false };
  let provisionGate;
  const store = {
    async inspect({ identities } = {}) {
      return { ...inspection, ...(inspection.state === 'valid' && JSON.stringify(inspection.identities) !== JSON.stringify(identities)
        ? { state: 'address-mismatch' } : {}) };
    },
    async provision({ identities, port }) {
      counts.provision++;
      if (provisionGate) await provisionGate;
      inspection = { state: 'valid', identities, port, certificateFingerprint: fingerprint, validUntil: '2027-11-20T00:00:00.000Z', rootReplacementRequired: false };
      return { ...inspection };
    },
    async loadTlsMaterial() { return { key: Buffer.from('temporary fixture private material'), cert: Buffer.from('cert'), ca: Buffer.from('ca'), identities: addresses }; },
    async exportPublicTrust() {
      counts.exported++;
      return { filename: 'installation.crt', mediaType: 'application/x-pem-file', contents: 'PUBLIC CERTIFICATE', certificateFingerprint: fingerprint, validUntil: inspection.validUntil, privatePath: '/must-never-escape', token: 'never' };
    },
    async remove() { counts.remove++; inspection = { state: 'missing', identities: [], rootReplacementRequired: false }; },
  };
  const errors = [];
  const host = createSecureLanHost({
    certificateStore: store,
    getIdentities: () => addresses,
    authorizeHost: ctx => ctx === hostContext,
    requestHandler: () => {},
    onError: error => errors.push(error),
    createServer: async ({ port }) => {
      counts.started++;
      let closed = false;
      return { port: port || 45178, origins: [`https://127.0.0.1:${port || 45178}`], get status() { return { status: closed ? 'disabled' : 'ready' }; }, close: async () => { if (!closed) counts.closed++; closed = true; } };
    },
    ...overrides,
  });
  return { host, counts, store, errors, addresses(value) { addresses = value; }, corrupt(state = 'failed') { inspection.state = state; }, blockProvision(gate) { provisionGate = gate; } };
}

test('privileged operations deny phones, absent authority and truthy non-boolean authorization before IO', async () => {
  const { host, counts } = fixture();
  for (const ctx of [undefined, {}, { role: 'host' }, { nativeIdentity: 'host' }, request({ remote: '192.168.1.10' }), request()]) {
    for (const method of ['start', 'provision', 'exportPublicTrust', 'remove']) {
      await assert.rejects(host[method](ctx), { code: 'HOST_FORBIDDEN' });
    }
  }
  assert.deepEqual(counts, { provision: 0, remove: 0, exported: 0, started: 0, closed: 0 });
  for (const authorizeHost of [undefined, () => 'yes', () => ({}), () => { throw new Error('private credential'); }]) {
    const denied = fixture({ authorizeHost });
    await assert.rejects(denied.host.provision(hostContext), { code: 'HOST_FORBIDDEN' });
    await denied.host.close();
  }
  await host.close();
});

test('authenticated loopback example requires exact Host/Origin, original local socket and host authority', async () => {
  let authenticated = 0;
  const authorize = createLoopbackHostAuthorizer({ origin, verifyHost: ({ request: req }) => {
    authenticated++;
    return req.headers.authorization === 'Bearer host-only';
  } });
  assert.equal(await authorize(request(), 'provision'), true);
  for (const bad of [
    request({ bearer: 'player-only' }), request({ bearer: '' }),
    request({ remote: '192.168.1.10' }), request({ remote: '::ffff:192.168.1.10' }),
    request({ remote: '192.168.1.10', extra: { 'x-forwarded-for': '127.0.0.1', 'x-forwarded-host': '127.0.0.1:4177' } }),
    request({ extra: { origin: 'https://attacker.example' } }), request({ extra: { host: 'attacker.local:4177' } }),
    request({ extra: { origin: 'https://127.0.0.1:4177', 'x-forwarded-proto': 'https' } }),
    request({ method: 'GET' }), request({ target: '/api/host/secure-lan?token=hidden' }),
    request({ target: '/api/host/secure-lan/remove' }),
  ]) assert.equal(await authorize(bad, 'provision'), false);
  const duplicate = request(); duplicate.rawHeaders.push('Origin', origin);
  assert.equal(await authorize(duplicate, 'remove'), false);
  assert.equal(await authorize(request(), 'read-arbitrary-file'), false);
  assert.equal(authenticated, 3, 'network and origin failures never reach credential verifier');
  const missingVerifier = createLoopbackHostAuthorizer({ origin });
  assert.equal(await missingVerifier(request(), 'provision'), false);
  for (const invalid of ['https://127.0.0.1:4177', 'http://192.168.1.2:4177', 'http://localhost:4177', `${origin}/`, `${origin}?secret=1`]) {
    assert.throws(() => createLoopbackHostAuthorizer({ origin: invalid }), { code: 'INVALID_HOST_ORIGIN' });
  }
});

test('host setup, persisted startup, disable and removal keep exact safe contract and own one listener', async () => {
  const f = fixture();
  const first = await f.host.getStatus();
  assert.equal(first.status, 'needs-setup');
  assert.equal(first.enabled, false);
  let ready = await f.host.provision(hostContext);
  assert.equal(ready.status, 'ready');
  assert.equal(ready.enabled, true);
  assert.equal(ready.requiresPhoneTrust, true, 'host ready does not claim either phone trusts root');
  assert.deepEqual(ready.controllerOrigins, ['https://127.0.0.1:4178']);
  assert.ok(Object.keys(ready).every(key => safeKeys.includes(key)));
  assert.equal((await f.host.getStatus()).status, 'ready');
  const exported = await f.host.exportPublicTrust(hostContext, { format: 'pem' });
  assert.deepEqual(Object.keys(exported).sort(), ['certificateFingerprint', 'contents', 'filename', 'mediaType', 'validUntil']);
  assert.doesNotMatch(JSON.stringify({ ready, exported }), /private|token|key/i);
  const disabled = await f.host.remove(hostContext, { mode: 'disable' });
  assert.equal(disabled.status, 'disabled');
  assert.equal(f.counts.remove, 0);
  assert.equal(f.counts.closed, 1);
  ready = await f.host.start(hostContext);
  assert.equal(ready.status, 'ready');
  assert.equal(f.counts.provision, 1, 'restart does not reissue valid material');
  assert.equal((await f.host.remove(hostContext, { mode: 'remove' })).status, 'disabled');
  assert.equal(f.counts.remove, 1);
  assert.equal(f.counts.started, f.counts.closed);
  await f.host.close();
});

test('changed addresses, missing, expired and corrupted material stop old listener without implicit reissue', async () => {
  for (const state of ['missing', 'certificate-expired', 'failed', 'address-mismatch']) {
    const f = fixture();
    await f.host.provision(hostContext);
    if (state === 'address-mismatch') f.addresses(['192.168.1.20']);
    else f.corrupt(state);
    const status = await f.host.getStatus();
    assert.equal(status.status, state === 'missing' ? 'needs-setup' : state);
    assert.deepEqual(status.controllerOrigins, []);
    assert.equal(f.counts.closed, 1);
    assert.equal(f.counts.provision, 1);
    await f.host.close();
  }
});

test('UI cannot supply addresses, private paths, formats or uncontrolled config to host operations', async () => {
  const f = fixture();
  for (const options of [{ identities: ['evil.example'] }, { appDataDir: '/tmp/foreign' }, { port: 1 }, { replaceRoot: 'yes' }]) {
    await assert.rejects(f.host.provision(hostContext, options), { code: 'INVALID_OPTIONS' });
  }
  for (const options of [{ format: 'private-key' }, { filename: '/tmp/secret' }, { path: '../key' }]) {
    await assert.rejects(f.host.exportPublicTrust(hostContext, options), { code: 'INVALID_OPTIONS' });
  }
  await assert.rejects(f.host.remove(hostContext, { mode: 'everything' }), { code: 'INVALID_OPTIONS' });
  await assert.rejects(f.host.remove(hostContext, { path: '/tmp/other' }), { code: 'INVALID_OPTIONS' });
  assert.deepEqual(f.counts, { provision: 0, remove: 0, exported: 0, started: 0, closed: 0 });
  await f.host.close();
});

test('listener failure leaves safe status, supports retry and never reports native/path errors', async () => {
  let fail = true;
  const f = fixture({ createServer: async () => {
    if (fail) throw Object.assign(new Error('secret path /private/key.pem token=HIDDEN'), { code: 'EADDRINUSE' });
    return { port: 4178, origins: ['https://127.0.0.1:4178'], status: { status: 'ready' }, async close() {} };
  } });
  await assert.rejects(f.host.provision(hostContext), error => error.code === 'PROVISION_FAILED' && !/secret|private|HIDDEN/.test(error.message));
  assert.equal((await f.host.getStatus()).status, 'failed');
  assert.deepEqual(f.errors, [{ code: 'PROVISION_FAILED' }]);
  fail = false;
  assert.equal((await f.host.start(hostContext)).status, 'ready');
  await f.host.close();
});

test('dispose during provisioning prevents a late orphan, repeated close is identical and later operations fail', async () => {
  const f = fixture();
  let release;
  f.blockProvision(new Promise(resolve => { release = resolve; }));
  const work = f.host.provision(hostContext);
  const rejected = assert.rejects(work, { code: 'HOST_CLOSED' });
  while (f.counts.provision === 0) await new Promise(resolve => setImmediate(resolve));
  const close = f.host.close();
  assert.equal(close, f.host.close());
  release();
  await Promise.all([rejected, close]);
  assert.equal(f.counts.started, 0);
  assert.equal((await f.host.getStatus()).status, 'disabled');
  await assert.rejects(f.host.start(hostContext), { code: 'HOST_CLOSED' });
});

test('serial operations never overlap listeners and an ephemeral bound port is persisted', async () => {
  const f = fixture({ port: 0 });
  const [first, second] = await Promise.all([f.host.provision(hostContext), f.host.provision(hostContext)]);
  assert.deepEqual(first.controllerOrigins, ['https://127.0.0.1:45178']);
  assert.deepEqual(second.controllerOrigins, first.controllerOrigins);
  assert.equal((await f.store.inspect({ identities: ['127.0.0.1'] })).port, 45178);
  assert.equal(f.counts.started, 2);
  assert.equal(f.counts.closed, 1);
  await f.host.close();
  assert.equal(f.counts.closed, 2);
});

test('host disposal immediately closes live listener while a status callback is blocked', async () => {
  let block = false;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = fixture({ getIdentities: async () => {
    if (block) await gate;
    return ['127.0.0.1'];
  } });
  await f.host.provision(hostContext);
  block = true;
  const status = f.host.getStatus();
  await new Promise(resolve => setImmediate(resolve));
  await f.host.close();
  assert.equal(f.counts.closed, 1, 'network shutdown does not wait for blocked status');
  release();
  assert.equal((await status).status, 'disabled');
});
