import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { X509Certificate } from 'node:crypto';
import { createCertificateStore, validateTlsMaterial } from '../index.mjs';
import { DAY_MS } from '../material.mjs';
import { fixture, identities } from './store-fixture.mjs';

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
