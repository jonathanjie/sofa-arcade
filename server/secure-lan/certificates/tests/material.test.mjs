import test from 'node:test';
import assert from 'node:assert/strict';
import { X509Certificate } from 'node:crypto';
import { normalizeIdentities, normalizeIdentity, validateTlsMaterial } from '../index.mjs';
import { createTestMaterial, reissueTestLeaf } from './helpers.mjs';
import { DAY_MS } from '../material.mjs';
import {
  AuthorityKeyIdentifierExtension, BasicConstraintsExtension, ExtendedKeyUsage, ExtendedKeyUsageExtension,
  KeyUsageFlags, KeyUsagesExtension,
} from '@peculiar/x509';

test('identity admission canonicalizes explicit LAN/loopback SANs and local DNS only', () => {
  assert.deepEqual(normalizeIdentities(['Orchard-Mac.Local', '127.0.0.1', '127.0.0.1', 'fd01:0:0:0::12', '::1']),
    ['127.0.0.1', '::1', 'fd01::12', 'orchard-mac.local']);
  for (const value of ['10.0.0.5', '172.16.1.20', '172.31.0.5', '192.168.9.1', '169.254.2.1', '127.0.0.2', 'localhost', 'fe80::12', 'fc00::1']) {
    assert.equal(normalizeIdentity(value), value);
  }
});

test('identity admission rejects public, ambiguous, wildcard, scoped, credential and URL input', () => {
  const invalid = [
    '', ' ', ' localhost', 'localhost ', 'example.com', '*.local', '-mac.local', 'mac-.local', 'mac..local',
    'mac.local.', 'xn--.local', 'https://mac.local', 'user@mac.local', 'mac.local:4178', 'mac.local/path',
    'mac.local?token=secret', 'mac.local#token', 'localhost\nX: y', 'LOCALHOST\0', '..', '/', '\\server',
    '0.0.0.0', '8.8.8.8', '100.64.1.2', '172.15.1.2', '172.32.1.2', '192.169.1.2', '224.1.1.1',
    '255.255.255.255', '127.1', '0177.0.0.1', '0x7f000001', '::', '2001:4860:4860::8888',
    '::ffff:127.0.0.1', 'fe80::1%en0', '[::1]', '猫.local', `${'a'.repeat(64)}.local`, null, 4178,
  ];
  for (const value of invalid) assert.throws(() => normalizeIdentity(value), { code: 'INVALID_IDENTITIES' });
  for (const value of [null, {}, 'localhost', [], Array(17).fill('localhost')]) {
    assert.throws(() => normalizeIdentities(value), { code: 'INVALID_IDENTITIES' });
  }
});

test('real issued material has a unique root, bounded SAN leaf and server-only purpose', async () => {
  const first = await createTestMaterial({ identities: ['192.168.1.6', 'orchard.local', '127.0.0.1', 'fd00::6'] });
  const second = await createTestMaterial();
  const summary = validateTlsMaterial(first.tlsMaterial);
  assert.notEqual(summary.certificateFingerprint, validateTlsMaterial(second.tlsMaterial).certificateFingerprint);
  const leaf = new X509Certificate(first.tlsMaterial.cert);
  const root = new X509Certificate(first.root.ca);
  assert.equal(leaf.verify(root.publicKey), true);
  assert.equal(root.verify(root.publicKey), true);
  assert.equal(root.ca, true);
  assert.equal(leaf.ca, false);
  assert.equal(leaf.checkIP('192.168.1.6'), '192.168.1.6');
  assert.equal(leaf.checkHost('orchard.local', { subject: 'never' }), 'orchard.local');
  assert.deepEqual(leaf.keyUsage, ['1.3.6.1.5.5.7.3.1']);
  assert.ok(leaf.validToDate - leaf.validFromDate <= 91 * DAY_MS);
  assert.deepEqual(Object.keys(summary).sort(), ['certificateFingerprint', 'identities', 'validUntil']);
  assert.throws(() => JSON.stringify(first.tlsMaterial), { code: 'MATERIAL_INVALID' });
});

test('missing material is a failed admission, distinct from an advertised SAN mismatch', async () => {
  for (const value of [undefined, null, {}, { identities: ['localhost'] }]) {
    assert.throws(() => validateTlsMaterial(value), { code: 'MATERIAL_INVALID', status: 'failed' });
  }
  const { tlsMaterial } = await createTestMaterial();
  assert.throws(() => validateTlsMaterial({ ...tlsMaterial, identities: ['192.168.1.99'] }),
    { code: 'ADDRESS_MISMATCH', status: 'address-mismatch' });
  assert.throws(() => validateTlsMaterial({ ...tlsMaterial, identities: ['127.0.0.1'] }),
    { code: 'ADDRESS_MISMATCH' });
});

test('wrong issuer and key mismatch fail cryptographic validation', async () => {
  const a = await createTestMaterial();
  const b = await createTestMaterial();
  assert.throws(() => validateTlsMaterial({ ...a.tlsMaterial, ca: b.root.ca }), { code: 'MATERIAL_INVALID' });
  assert.throws(() => validateTlsMaterial({ ...a.tlsMaterial, key: b.tlsMaterial.key }), { code: 'MATERIAL_INVALID' });
});

test('correct signatures cannot excuse wrong certificate purpose, CA flags or issuer identifiers', async () => {
  const fixture = await createTestMaterial();
  const wrongCases = [
    ['2.5.29.19', new BasicConstraintsExtension(true, 0, true)],
    ['2.5.29.15', new KeyUsagesExtension(KeyUsageFlags.keyCertSign, true)],
    ['2.5.29.37', new ExtendedKeyUsageExtension([ExtendedKeyUsage.clientAuth])],
    ['2.5.29.35', new AuthorityKeyIdentifierExtension('01'.repeat(20))],
  ];
  for (const [oid, replacement] of wrongCases) {
    const changed = await reissueTestLeaf({ ...fixture,
      extensions: (current) => current.map((extension) => extension.type === oid ? replacement : extension),
    });
    assert.equal(new X509Certificate(changed.cert).verify(new X509Certificate(fixture.root.ca).publicKey), true);
    assert.throws(() => validateTlsMaterial(changed), { code: 'MATERIAL_INVALID' }, `reject ${oid}`);
  }
});

test('SAN is mandatory even with a matching common name; duplicate extensions are rejected', async () => {
  const fixture = await createTestMaterial({ identities: ['localhost'] });
  const withoutSAN = await reissueTestLeaf({ ...fixture, subject: 'CN=localhost',
    extensions: (current) => current.filter((extension) => extension.type !== '2.5.29.17'),
  });
  assert.throws(() => validateTlsMaterial(withoutSAN), { code: 'ADDRESS_MISMATCH' });
  const duplicate = await reissueTestLeaf({ ...fixture,
    extensions: (current) => [...current, current.find((extension) => extension.type === '2.5.29.17')],
  });
  assert.throws(() => validateTlsMaterial(duplicate), { code: 'MATERIAL_INVALID' });
});

test('malformed, appended and signature-tampered PEM fail closed', async () => {
  const { tlsMaterial } = await createTestMaterial();
  const leaf = new X509Certificate(tlsMaterial.cert);
  const bytes = Buffer.from(leaf.raw);
  bytes[bytes.length - 1] ^= 1;
  const damaged = Buffer.from(`-----BEGIN CERTIFICATE-----\n${bytes.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`);
  for (const cert of [Buffer.from('not a certificate'), damaged, Buffer.concat([tlsMaterial.cert, tlsMaterial.ca]),
    Buffer.concat([tlsMaterial.cert, Buffer.from('secret.txt')])]) {
    assert.throws(() => validateTlsMaterial({ ...tlsMaterial, cert }), { code: 'MATERIAL_INVALID' });
  }
});

test('expired and not-yet-valid leaves receive actionable safe codes', async () => {
  const now = Date.now();
  const { tlsMaterial } = await createTestMaterial({ now: now - 4 * DAY_MS,
    notBefore: new Date(now - 3 * DAY_MS), notAfter: new Date(now - DAY_MS) });
  assert.throws(() => validateTlsMaterial(tlsMaterial), { code: 'CERTIFICATE_EXPIRED', status: 'certificate-expired' });
  const future = await createTestMaterial({ notBefore: new Date(now + DAY_MS) });
  assert.throws(() => validateTlsMaterial(future.tlsMaterial), { code: 'CERTIFICATE_NOT_YET_VALID' });
});

test('expired root is explicitly distinguished from a renewable leaf', async () => {
  const now = Date.now();
  const { tlsMaterial } = await createTestMaterial({ now: now - 100 * DAY_MS,
    rootNotAfter: new Date(now - DAY_MS), notBefore: new Date(now - 50 * DAY_MS),
    notAfter: new Date(now - 2 * DAY_MS) });
  assert.throws(() => validateTlsMaterial(tlsMaterial), (error) => {
    assert.equal(error.code, 'CERTIFICATE_EXPIRED');
    assert.equal(error.rootReplacementRequired, true);
    assert.deepEqual(Object.keys(error.toJSON()).sort(), ['code', 'message', 'status']);
    return true;
  });
});

test('valid IPv6 SANs round-trip through the established X.509 parser', async () => {
  const { tlsMaterial } = await createTestMaterial({ identities: ['::1', 'fd12:3456::9', 'fe80::4'] });
  assert.deepEqual(validateTlsMaterial(tlsMaterial).identities, ['::1', 'fd12:3456::9', 'fe80::4']);
});
