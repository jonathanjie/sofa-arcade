import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createCertificateStore, validateTlsMaterial } from '../index.mjs';
import { fixture, identities } from './store-fixture.mjs';

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
