import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import https from 'node:https';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, realpath, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { startLanServer } from '../../../server/lan.mjs';
import { attachNativeSecureLan, validateSecureCommand } from '../../../desktop/host/secure-lan.mjs';
import { hostRecord, validateSecureControllerStatus, createHostLifecycle } from '../../../desktop/host/lifecycle.mjs';

const httpsGet = (url, ca, headers = {}) => new Promise((resolve, reject) => {
  const req = https.get(url, { ca, headers }, res => {
    const parts = []; res.on('data', part => parts.push(part));
    res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(parts).toString() }));
  });
  req.on('error', reject);
});

test('native adapter composes verified HTTPS into the existing authority and persists explicit disable', { timeout: 300_000 }, async t => {
  const directory = await mkdtemp(path.join(await realpath(tmpdir()), 'go7-native-secure-'));
  const databasePath = path.join(directory, 'rooms.sqlite');
  let host, lan;
  t.after(async () => { await host?.close(); await rm(directory, { recursive: true, force: true }); });
  const start = async () => {
    lan = await startLanServer({ host: '127.0.0.1', port: 0, databasePath, enableGravityOrchard: true });
    // Use a real loopback TLS listener so this test does not pretend to prove
    // wildcard LAN interface discovery or a physical phone's root trust.
    host = await attachNativeSecureLan(lan, { appDataDir: directory, host: '127.0.0.1' });
    return host;
  };
  await start();
  assert.equal(hostRecord(host).secureControllerStatus.status, 'needs-setup');
  const response = await fetch(`${host.origin}/api/rooms`, { method: 'POST', headers: { Origin: host.origin, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 201); const room = await response.json();
  const ready = (await host.secureCommand('provision', { replaceRoot: false })).status;
  assert.equal(ready.status, 'ready'); assert.equal(ready.requiresPhoneTrust, true);
  assert.deepEqual(lan.getSecureControllerStatus(), ready);
  const publicTrust = (await host.secureCommand('exportPublicTrust', { format: 'pem' })).publicTrust;
  assert.match(publicTrust.contents, /^-----BEGIN CERTIFICATE-----/);
  assert.doesNotMatch(JSON.stringify({ ready, publicTrust }), /PRIVATE KEY|rootKey|leafKey|\.sqlite|hostToken/);
  const secureOrigin = ready.controllerOrigins.find(origin => new URL(origin).hostname === '127.0.0.1');
  assert.ok(secureOrigin);
  const fetched = await httpsGet(`${secureOrigin}/api/rooms/${room.code}`, publicTrust.contents, { Authorization: `Bearer ${room.hostToken}` });
  assert.equal(fetched.status, 200); assert.equal(JSON.parse(fetched.body).code, room.code);
  for (const route of ['/api/host/secure-lan', '/desktop/host/secure-lan.mjs', '/secure-controller.json', '/server/secure-lan/certificates/index.mjs']) {
    assert.equal((await fetch(host.origin + route)).status, 404, route);
  }
  await assert.rejects(httpsGet(`${secureOrigin}/api/rooms/${room.code}`, undefined), /certificate|verify|issuer/i);
  assert.equal((await stat(path.join(directory, 'secure-controller.json'))).mode & 0o777, 0o600);
  const fingerprint = ready.certificateFingerprint;
  await host.close();
  await start();
  assert.equal(hostRecord(host).secureControllerStatus.status, 'ready');
  assert.equal(host.secureControllerStatus.certificateFingerprint, fingerprint);
  const disabled = (await host.secureCommand('remove', { mode: 'disable' })).status;
  assert.equal(disabled.status, 'disabled'); assert.deepEqual(disabled.controllerOrigins, []);
  await host.close(); await start();
  assert.equal(host.secureControllerStatus.enabled, false);
  assert.equal(host.secureControllerStatus.status, 'disabled');
  assert.equal(host.secureControllerStatus.certificateFingerprint, fingerprint);
  assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'secure-controller.json'), 'utf8')), { schemaVersion: 1, enabled: false });
  const removed = (await host.secureCommand('remove', { mode: 'remove' })).status;
  assert.equal(removed.status, 'disabled'); assert.equal(removed.certificateFingerprint, undefined);
});

test('private native command schema and safe readiness reject alternate capabilities and secret fields', () => {
  const valid = { type: 'secure', id: 'native-1', operation: 'provision', options: { replaceRoot: false } };
  assert.equal(validateSecureCommand(valid), valid);
  for (const value of [{ ...valid, token: 'bearer' }, { ...valid, operation: 'loadTlsMaterial' }, { ...valid, options: { path: '/tmp/private' } }, { ...valid, id: '../bad' }, { ...valid, options: { replaceRoot: 'true' } }]) assert.throws(() => validateSecureCommand(value));
  const good = { enabled: true, status: 'ready', controllerOrigins: ['https://127.0.0.1:4178'], requiresPhoneTrust: true, certificateFingerprint: Array(32).fill('AA').join(':'), validUntil: '2027-02-19T00:00:00.000Z' };
  assert.deepEqual(validateSecureControllerStatus(good), good);
  for (const value of [{ ...good, privateKey: 'secret' }, { ...good, controllerOrigins: ['https://example.com:4178'] }, { ...good, controllerOrigins: ['https://127.0.0.1:4178/?token=secret'] }, { ...good, status: 'disabled' }, { ...good, requiresPhoneTrust: false }]) assert.throws(() => validateSecureControllerStatus(value));
});

test('native refresh and Quit serialize with an active privileged operation and close both listeners', async () => {
  const events = []; const closed = []; let release;
  const operation = new Promise(resolve => { release = resolve; });
  let generation = 0;
  const lifecycle = createHostLifecycle({ options: { port: 4177 }, emit: record => events.push(record), start: async () => {
    const id = ++generation;
    return { port: 4177, origin: 'http://127.0.0.1:4177', urls: [], secureCommand: () => operation,
      close: async () => { closed.push(`secure-${id}`, `lan-${id}`); } };
  } });
  await lifecycle.start();
  const pending = lifecycle.secureCommand('provision', { replaceRoot: false });
  await Promise.resolve();
  const refreshing = lifecycle.refresh('network_change');
  assert.deepEqual(closed, []);
  release({ status: 'test-only' }); await pending; await refreshing;
  assert.deepEqual(closed, ['secure-1', 'lan-1']);
  assert.deepEqual(events.map(record => record.type), ['ready', 'refreshed']);
  await lifecycle.stop();
  assert.deepEqual(closed, ['secure-1', 'lan-1', 'secure-2', 'lan-2']);
  await assert.rejects(lifecycle.secureCommand('getStatus', {}));
});

test('real owned Node child exposes setup only on its inherited private pipe and shuts down on EOF', { timeout: 300_000 }, async t => {
  const directory = await mkdtemp(path.join(await realpath(tmpdir()), 'go7-native-pipe-'));
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const child = spawn(process.execPath, [path.join(root, 'desktop/host/entry.mjs'), '--root', root, '--database', path.join(directory, 'rooms.sqlite'), '--port', '0', '--gravity-orchard-candidate'], { env: { PATH: '/nonexistent', SOFA_NATIVE_E2E_TIMING: '1' }, stdio: ['pipe', 'pipe', 'ignore'] });
  const readyRecord = Promise.withResolvers();
  const secureResult = Promise.withResolvers();
  const records = []; let buffer = '';
  child.stdout.on('data', chunk => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const record = JSON.parse(buffer.slice(0, index));
      records.push(record);
      if (record.type === 'ready') readyRecord.resolve(record);
      if (record.type === 'secure-result') secureResult.resolve(record);
      buffer = buffer.slice(index + 1);
    }
    assert.ok(buffer.length < 16384);
  });
  const exited = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { child.stdin.end(); await exited; } await rm(directory, { recursive: true, force: true }); });
  const waitForReply = reply => Promise.race([reply.promise, exited.then(({ code, signal }) => {
    throw new Error(`The native child exited before replying (code ${code}, signal ${signal}).`);
  })]);
  const ready = await waitForReply(readyRecord);
  assert.equal(ready.secureControllerStatus.status, 'needs-setup');
  child.stdin.write(JSON.stringify({ type: 'secure', id: 'private-request-1', operation: 'getStatus', options: {} }) + '\n');
  const result = await waitForReply(secureResult);
  assert.equal(result.id, 'private-request-1'); assert.equal(result.ok, true); assert.equal(result.status.status, 'needs-setup');
  const created = await fetch(ready.hostUrl + 'api/rooms', { method: 'POST', headers: { Origin: ready.hostUrl.slice(0, -1), 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(created.status, 201); const room = await created.json();
  const forbidden = await fetch(ready.hostUrl + 'api/host/secure-lan', { method: 'POST', headers: { Origin: ready.hostUrl.slice(0, -1), 'Content-Type': 'application/json' }, body: JSON.stringify({ operation: 'provision' }) });
  assert.equal(forbidden.status, 404);
  assert.equal((await fetch(ready.hostUrl + 'host-timing.json')).status, 404);
  child.stdin.end();
  assert.deepEqual(await exited, { code: 0, signal: null });
  await assert.rejects(fetch(ready.hostUrl, { signal: AbortSignal.timeout(1000) }));
  const filename = path.join(directory, 'host-timing.json'), text = await readFile(filename, 'utf8');
  const timing = JSON.parse(text);
  assert.equal(timing.kind, 'native-e2e-host-runtime-timing');
  assert.ok(timing.operations['sqlite.run'].count > 0, 'Actual room writes are observed without serializing their SQL or values');
  assert.ok(timing.slowOperations.length <= 128); assert.ok(Buffer.byteLength(text) <= 128 * 1024);
  assert.equal(text.includes(room.hostToken), false); assert.equal(text.includes(room.code), false);
  assert.equal(text.includes(directory), false); assert.equal(text.includes('INSERT INTO'), false);
  assert.equal((await stat(filename)).mode & 0o777, 0o600);
  assert.ok(records.every(record => ['ready', 'secure-result'].includes(record.type)), 'Timing evidence must never enter the native stdout protocol');
});
