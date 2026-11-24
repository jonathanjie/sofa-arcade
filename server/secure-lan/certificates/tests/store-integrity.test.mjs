import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createCertificateStore } from '../index.mjs';
import { DAY_MS, ROOT_VALIDITY_DAYS } from '../material.mjs';
import { fixture, identities, rewrite } from './store-fixture.mjs';

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
