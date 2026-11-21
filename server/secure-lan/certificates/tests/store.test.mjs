import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { X509Certificate } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createCertificateStore, validateTlsMaterial } from '../index.mjs';
import { DAY_MS, ROOT_VALIDITY_DAYS } from '../material.mjs';

const identities = ['127.0.0.1', '192.168.1.22', 'orchard.local'];

async function fixture(t, options = {}) {
  const appDataDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'sofa-go6-cert-')));
  const privateDir = path.join(appDataDir, 'secure-lan-v1');
  const privateFile = path.join(privateDir, 'installation.json');
  t.after(async () => {
    t.mock.restoreAll();
    await fs.chmod(appDataDir, 0o700).catch(() => {});
    await fs.chmod(privateDir, 0o700).catch(() => {});
    await fs.rm(appDataDir, { recursive: true, force: true });
  });
  return { appDataDir, privateDir, privateFile, store: createCertificateStore({ appDataDir, ...options }) };
}

async function rewrite(file, change) {
  const record = JSON.parse(await fs.readFile(file, 'utf8'));
  change(record);
  await fs.writeFile(file, JSON.stringify(record), { mode: 0o600 });
}

test('inspection is read-only before setup; material is private and parent mode unchanged', async (t) => {
  const { appDataDir, privateDir, privateFile, store } = await fixture(t);
  await fs.chmod(appDataDir, 0o755);
  assert.equal((await store.inspect()).state, 'missing');
  assert.deepEqual(await fs.readdir(appDataDir), []);
  await assert.rejects(store.loadTlsMaterial(), { code: 'MATERIAL_MISSING' });
  const result = await store.provision({ identities });
  assert.equal(result.state, 'valid');
  assert.equal((await fs.stat(appDataDir)).mode & 0o777, 0o755);
  assert.equal((await fs.stat(privateDir)).mode & 0o777, 0o700);
  assert.equal((await fs.stat(privateFile)).mode & 0o777, 0o600);
  assert.equal((await fs.stat(path.join(privateDir, 'installation-identity.json'))).mode & 0o777, 0o600);
  assert.equal((await fs.stat(privateFile)).nlink, 1);
  assert.equal(JSON.stringify(result).includes(appDataDir), false);
  assert.equal(JSON.stringify(result).includes('PRIVATE KEY'), false);
});

test('unique installs and restart persistence retain only the intended root identity', async (t) => {
  const a = await fixture(t);
  const b = await fixture(t);
  const first = await a.store.provision({ identities });
  const other = await b.store.provision({ identities });
  assert.notEqual(first.certificateFingerprint, other.certificateFingerprint);
  const originalMaterial = await a.store.loadTlsMaterial();
  const restarted = createCertificateStore({ appDataDir: a.appDataDir });
  assert.deepEqual(await restarted.inspect(), first);
  const nextMaterial = await restarted.loadTlsMaterial();
  assert.ok(originalMaterial.key.equals(nextMaterial.key));
  assert.ok(originalMaterial.cert.equals(nextMaterial.cert));
  assert.equal((await restarted.provision({ identities })).certificateFingerprint, first.certificateFingerprint);
  assert.ok((await restarted.loadTlsMaterial()).key.equals(originalMaterial.key));
});

test('explicit leaf renewal rotates leaf key and preserves already-trusted root', async (t) => {
  const { store } = await fixture(t);
  const initial = await store.provision({ identities });
  const oldMaterial = await store.loadTlsMaterial();
  const renewed = await store.provision({ identities, renewLeaf: true });
  const current = await store.loadTlsMaterial();
  assert.equal(renewed.certificateFingerprint, initial.certificateFingerprint);
  assert.equal(oldMaterial.ca.equals(current.ca), true);
  assert.equal(oldMaterial.key.equals(current.key), false);
  assert.equal(oldMaterial.cert.equals(current.cert), false);
});

test('expired leaf is actionable and can renew under the same root', async (t) => {
  let clock = Date.now();
  const { store } = await fixture(t, { now: () => clock });
  const initial = await store.provision({ identities });
  clock += 91 * DAY_MS;
  const expired = await store.inspect();
  assert.equal(expired.state, 'certificate-expired');
  assert.equal(expired.rootReplacementRequired, false);
  await assert.rejects(store.loadTlsMaterial(), { code: 'CERTIFICATE_EXPIRED' });
  const refreshed = await store.provision({ identities });
  assert.equal(refreshed.state, 'valid');
  assert.equal(refreshed.certificateFingerprint, initial.certificateFingerprint);
  assert.ok(Date.parse(refreshed.validUntil) > clock);
});

test('address changes and removed addresses replace the leaf, never the root', async (t) => {
  const { store } = await fixture(t);
  const initial = await store.provision({ identities });
  const changed = ['127.0.0.1', '192.168.3.9'];
  assert.equal((await store.inspect({ identities: changed })).state, 'address-mismatch');
  await assert.rejects(store.loadTlsMaterial({ identities: changed }), { code: 'ADDRESS_MISMATCH' });
  const refreshed = await store.provision({ identities: changed, port: 5190 });
  assert.equal(refreshed.certificateFingerprint, initial.certificateFingerprint);
  assert.equal(refreshed.port, 5190);
  const current = await store.loadTlsMaterial({ identities: changed });
  assert.equal(new X509Certificate(current.cert).checkIP('192.168.1.22'), undefined);
  assert.deepEqual(validateTlsMaterial(current).identities, changed);
});

test('malformed configuration does not touch a valid installation', async (t) => {
  const { store, privateFile } = await fixture(t);
  await store.provision({ identities });
  const original = await fs.readFile(privateFile);
  for (const port of [0, -1, 65536, 4178.2, '4178', NaN]) {
    await assert.rejects(store.provision({ identities, port }), { code: 'INVALID_CONFIGURATION' });
  }
  await assert.rejects(store.provision({ identities: ['evil.example'] }), { code: 'INVALID_IDENTITIES' });
  await assert.rejects(store.provision({ identities, replaceRoot: 'true' }), { code: 'INVALID_CONFIGURATION' });
  assert.ok(original.equals(await fs.readFile(privateFile)));
});

test('corrupt leaf recovers without replacing the root; corrupt root requires explicit action', async (t) => {
  const { store, privateFile } = await fixture(t);
  const original = await store.provision({ identities });
  await rewrite(privateFile, (record) => { record.cert = 'damaged leaf'; });
  const brokenLeaf = await store.inspect();
  assert.equal(brokenLeaf.state, 'failed');
  assert.equal(brokenLeaf.rootReplacementRequired, false);
  assert.equal((await store.provision({ identities })).certificateFingerprint, original.certificateFingerprint);
  await rewrite(privateFile, (record) => { record.caKey = ''; });
  const damaged = await fs.readFile(privateFile);
  assert.equal((await store.inspect()).rootReplacementRequired, true);
  await assert.rejects(store.provision({ identities }), { code: 'ROOT_REPLACEMENT_REQUIRED' });
  assert.ok(damaged.equals(await fs.readFile(privateFile)));
  const replaced = await store.provision({ identities, replaceRoot: true });
  assert.notEqual(replaced.certificateFingerprint, original.certificateFingerprint);
});

test('corrupted envelope and lost private file never silently reissue the installation root', async (t) => {
  const { store, privateFile } = await fixture(t);
  const original = await store.provision({ identities });
  await fs.writeFile(privateFile, '{corrupted', { mode: 0o600 });
  assert.equal((await store.inspect()).state, 'failed');
  await assert.rejects(store.provision({ identities }), { code: 'MATERIAL_INVALID' });
  await store.provision({ identities, replaceRoot: true });
  await fs.unlink(privateFile);
  assert.equal((await store.inspect()).rootReplacementRequired, true);
  await assert.rejects(store.provision({ identities }), { code: 'ROOT_REPLACEMENT_REQUIRED' });
  const replaced = await store.provision({ identities, replaceRoot: true });
  assert.notEqual(replaced.certificateFingerprint, original.certificateFingerprint);
});

test('expired root is not silently replaced and explicit replacement changes trust identity', async (t) => {
  let clock = Date.now();
  const { store } = await fixture(t, { now: () => clock });
  const first = await store.provision({ identities });
  clock += (ROOT_VALIDITY_DAYS + 1) * DAY_MS;
  const expired = await store.inspect();
  assert.equal(expired.state, 'certificate-expired');
  assert.equal(expired.rootReplacementRequired, true);
  await assert.rejects(store.provision({ identities }), { code: 'CERTIFICATE_EXPIRED' });
  const replaced = await store.provision({ identities, replaceRoot: true });
  assert.equal(replaced.state, 'valid');
  assert.notEqual(replaced.certificateFingerprint, first.certificateFingerprint);
});

test('atomic refresh failure keeps the old private envelope and leaves no staging files', async (t) => {
  const { store, privateFile, privateDir } = await fixture(t);
  const original = await store.provision({ identities });
  const bytes = await fs.readFile(privateFile);
  const rename = fs.rename;
  const mocked = t.mock.method(fs, 'rename', async (from, to) => {
    if (to === privateFile) throw Object.assign(new Error('injected private path must never escape'), { code: 'EIO' });
    return rename(from, to);
  });
  await assert.rejects(store.provision({ identities, renewLeaf: true }), (error) => {
    assert.equal(error.code, 'STORAGE_UNAVAILABLE');
    assert.equal(error.message.includes('injected'), false);
    assert.equal(error.message.includes(privateDir), false);
    return true;
  });
  mocked.mock.restore();
  assert.ok(bytes.equals(await fs.readFile(privateFile)));
  assert.equal((await store.inspect()).certificateFingerprint, original.certificateFingerprint);
  assert.deepEqual((await fs.readdir(privateDir)).sort(), ['installation-identity.json', 'installation.json']);
});

test('failed explicit root rotation preserves the old root across restart', async (t) => {
  const { store, privateFile, appDataDir, privateDir } = await fixture(t);
  const original = await store.provision({ identities });
  const bytes = await fs.readFile(privateFile);
  const rename = fs.rename;
  const mocked = t.mock.method(fs, 'rename', async (from, to) => {
    if (to === privateFile) throw Object.assign(new Error('injected commit failure'), { code: 'EIO' });
    return rename(from, to);
  });
  await assert.rejects(store.provision({ identities, replaceRoot: true }), { code: 'STORAGE_UNAVAILABLE' });
  mocked.mock.restore();
  assert.ok(bytes.equals(await fs.readFile(privateFile)));
  const restarted = createCertificateStore({ appDataDir });
  const inspected = await restarted.inspect();
  assert.equal(inspected.state, 'valid');
  assert.equal(inspected.certificateFingerprint, original.certificateFingerprint);
  assert.equal(validateTlsMaterial(await restarted.loadTlsMaterial()).certificateFingerprint, original.certificateFingerprint);
  const witness = JSON.parse(await fs.readFile(path.join(privateDir, 'installation-identity.json'), 'utf8'));
  assert.equal(witness.roots.length, 2);
  const changed = await restarted.provision({ identities, replaceRoot: true });
  assert.notEqual(changed.certificateFingerprint, original.certificateFingerprint);
  assert.equal(JSON.parse(await fs.readFile(path.join(privateDir, 'installation-identity.json'), 'utf8')).roots.length, 1);
});

test('lock-write failure is cleaned so the same live host can retry immediately', async (t) => {
  const { store, privateDir } = await fixture(t);
  await store.provision({ identities });
  const open = fs.open;
  const mocked = t.mock.method(fs, 'open', async (file, flags, mode) => {
    const handle = await open(file, flags, mode);
    if (path.basename(file) === '.host-operation.lock' && mode === 0o600) {
      handle.writeFile = async () => { throw Object.assign(new Error('injected lock failure'), { code: 'EIO' }); };
    }
    return handle;
  });
  await assert.rejects(store.provision({ identities, renewLeaf: true }), { code: 'STORAGE_UNAVAILABLE' });
  mocked.mock.restore();
  assert.equal((await fs.readdir(privateDir)).includes('.host-operation.lock'), false);
  assert.equal((await store.provision({ identities, renewLeaf: true })).state, 'valid');
});

test('concurrent store instances serialize updates under one persistent root', async (t) => {
  const { appDataDir, store } = await fixture(t);
  const stores = [store, createCertificateStore({ appDataDir }), createCertificateStore({ appDataDir })];
  const values = await Promise.all(stores.map((current, index) => current.provision({ identities, port: 4178 + index, renewLeaf: true })));
  assert.equal(new Set(values.map((value) => value.certificateFingerprint)).size, 1);
  assert.equal((await store.inspect()).port, 4180);
});

test('live cross-process lock denies mutation; dead-process lock can be recovered', async (t) => {
  const { store, privateDir } = await fixture(t);
  await store.provision({ identities });
  const lockFile = path.join(privateDir, '.host-operation.lock');
  await fs.writeFile(lockFile, JSON.stringify({ pid: process.pid, nonce: 'test-live-owner' }), { mode: 0o600 });
  await assert.rejects(store.provision({ identities, renewLeaf: true }), { code: 'STORE_BUSY' });
  assert.equal((await store.inspect()).state, 'valid');
  const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
  await once(child, 'exit');
  await fs.writeFile(lockFile, JSON.stringify({ pid: child.pid, nonce: 'test-dead-owner' }), { mode: 0o600 });
  assert.equal((await store.provision({ identities, renewLeaf: true })).state, 'valid');
});

test('unsafe private permissions fail closed without silently chmodding existing data', async (t) => {
  const { store, privateFile } = await fixture(t);
  await store.provision({ identities });
  await fs.chmod(privateFile, 0o644);
  assert.equal((await store.inspect()).state, 'failed');
  await assert.rejects(store.loadTlsMaterial(), { code: 'STORAGE_UNSAFE' });
  await assert.rejects(store.provision({ identities }), { code: 'STORAGE_UNSAFE' });
  assert.equal((await fs.stat(privateFile)).mode & 0o777, 0o644);
  await fs.chmod(privateFile, 0o600);
  assert.equal((await store.inspect()).state, 'valid');
});

test('canonical private directories reject symlinks, traversal and inaccessible storage', async (t) => {
  const { appDataDir, store } = await fixture(t);
  for (const bad of ['.', '../data', '/', `${appDataDir}/../other`, `${appDataDir}/`]) {
    assert.throws(() => createCertificateStore({ appDataDir: bad }), { code: 'STORAGE_UNSAFE' });
  }
  const link = `${appDataDir}-link`;
  await fs.symlink(appDataDir, link, 'dir');
  t.after(() => fs.unlink(link));
  const aliased = createCertificateStore({ appDataDir: link });
  assert.equal((await aliased.inspect()).state, 'failed');
  await assert.rejects(aliased.provision({ identities }), { code: 'STORAGE_UNSAFE' });
  await fs.chmod(appDataDir, 0o500);
  await assert.rejects(store.provision({ identities }), { code: 'STORAGE_UNSAFE' });
  await fs.chmod(appDataDir, 0o777);
  await assert.rejects(store.provision({ identities }), { code: 'STORAGE_UNSAFE' });
});

test('symlink and hardlink private files cannot redirect reads, removal or replacement', async (t) => {
  const { store, appDataDir, privateFile } = await fixture(t);
  await store.provision({ identities });
  const external = path.join(appDataDir, 'other-data');
  await fs.writeFile(external, 'unrelated data', { mode: 0o600 });
  const original = await fs.readFile(privateFile);
  await fs.unlink(privateFile);
  await fs.symlink(external, privateFile);
  await assert.rejects(store.loadTlsMaterial(), { code: 'STORAGE_UNSAFE' });
  await assert.rejects(store.provision({ identities, replaceRoot: true }), { code: 'STORAGE_UNSAFE' });
  await assert.rejects(store.remove(), { code: 'STORAGE_UNSAFE' });
  assert.equal(await fs.readFile(external, 'utf8'), 'unrelated data');
  await fs.unlink(privateFile);
  await fs.writeFile(privateFile, original, { mode: 0o600 });
  const duplicate = path.join(appDataDir, 'hard-linked-file');
  await fs.link(privateFile, duplicate);
  await assert.rejects(store.loadTlsMaterial(), { code: 'STORAGE_UNSAFE' });
  await assert.rejects(store.remove(), { code: 'STORAGE_UNSAFE' });
  await fs.unlink(duplicate);
  assert.equal((await store.inspect()).state, 'valid');
});

test('public PEM and Apple profile contain only one CA certificate and safe metadata', async (t) => {
  const { store, appDataDir } = await fixture(t);
  const result = await store.provision({ identities });
  const publicPem = await store.exportPublicTrust();
  assert.deepEqual(Object.keys(publicPem).sort(), ['certificateFingerprint', 'contents', 'filename', 'mediaType', 'validUntil']);
  assert.equal(new X509Certificate(publicPem.contents).fingerprint256, result.certificateFingerprint);
  const profile = await store.exportPublicTrust({ format: 'mobileconfig' });
  assert.equal(profile.mediaType, 'application/x-apple-aspen-config');
  assert.equal((profile.contents.match(/<data>/g) ?? []).length, 1);
  const embedded = Buffer.from(profile.contents.match(/<data>([^<]+)<\/data>/)[1], 'base64');
  assert.equal(new X509Certificate(embedded).fingerprint256, result.certificateFingerprint);
  for (const value of [JSON.stringify(await store.inspect()), JSON.stringify(publicPem), JSON.stringify(profile)]) {
    assert.equal(value.includes('PRIVATE KEY'), false);
    assert.equal(value.includes(appDataDir), false);
    assert.equal(value.includes('caKey'), false);
    assert.equal(value.includes('roomToken'), false);
    assert.equal(value.includes('installation.json'), false);
  }
  await assert.rejects(store.exportPublicTrust({ format: '../installation.json' }), { code: 'INVALID_CONFIGURATION' });
});

test('removal is idempotent, limited to this installation and permits an explicit fresh setup', async (t) => {
  const { store, appDataDir, privateDir } = await fixture(t);
  const first = await store.provision({ identities });
  const sibling = path.join(appDataDir, 'rooms.db');
  const unknown = path.join(privateDir, 'unrelated-file');
  await fs.writeFile(sibling, 'other application data');
  await fs.writeFile(unknown, 'leave me', { mode: 0o600 });
  assert.deepEqual(await store.remove(), { removed: true });
  assert.deepEqual(await store.remove(), { removed: false });
  assert.equal((await store.inspect()).state, 'missing');
  assert.equal(await fs.readFile(sibling, 'utf8'), 'other application data');
  assert.equal(await fs.readFile(unknown, 'utf8'), 'leave me');
  await assert.rejects(store.exportPublicTrust(), { code: 'MATERIAL_MISSING' });
  assert.notEqual((await store.provision({ identities })).certificateFingerprint, first.certificateFingerprint);
});
