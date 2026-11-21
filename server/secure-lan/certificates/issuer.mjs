import 'reflect-metadata';
import { randomBytes, randomUUID, webcrypto } from 'node:crypto';
import { isIP } from 'node:net';
import {
  AuthorityKeyIdentifierExtension, BasicConstraintsExtension, ExtendedKeyUsage,
  ExtendedKeyUsageExtension, KeyUsageFlags, KeyUsagesExtension, PemConverter,
  SubjectAlternativeNameExtension, SubjectKeyIdentifierExtension,
  X509Certificate, X509CertificateGenerator,
} from '@peculiar/x509';
import { normalizeIdentities } from './identities.mjs';
import { CLOCK_SKEW_MS, DAY_MS, LEAF_VALIDITY_DAYS, ROOT_VALIDITY_DAYS } from './material.mjs';

const ALGORITHM = Object.freeze({ name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' });

function serial() {
  const value = randomBytes(20);
  value[0] &= 0x7f;
  value[0] |= 1;
  return value.toString('hex');
}

function pemKey(buffer) {
  return Buffer.from(PemConverter.encode(buffer, 'PRIVATE KEY') + '\n');
}

export async function issueRoot({ now = Date.now(), installationId = randomUUID(), notBefore, notAfter } = {}) {
  const keys = await webcrypto.subtle.generateKey(ALGORITHM, true, ['sign', 'verify']);
  const ca = await X509CertificateGenerator.createSelfSigned({
    serialNumber: serial(),
    name: `CN=Sofa Arcade Local CA ${installationId}, O=Sofa Arcade`,
    notBefore: notBefore ?? new Date(now - CLOCK_SKEW_MS),
    notAfter: notAfter ?? new Date(now + ROOT_VALIDITY_DAYS * DAY_MS),
    signingAlgorithm: ALGORITHM,
    keys,
    extensions: [
      new BasicConstraintsExtension(true, 0, true),
      new KeyUsagesExtension(KeyUsageFlags.keyCertSign | KeyUsageFlags.cRLSign, true),
      await SubjectKeyIdentifierExtension.create(keys.publicKey, false, webcrypto),
    ],
  }, webcrypto);
  return {
    installationId,
    ca: Buffer.from(ca.toString('pem') + '\n'),
    caKey: pemKey(await webcrypto.subtle.exportKey('pkcs8', keys.privateKey)),
  };
}

export async function issueLeaf({ root, identities, now = Date.now(), notBefore, notAfter }) {
  const names = normalizeIdentities(identities);
  const ca = new X509Certificate(root.ca);
  const keyBytes = PemConverter.decode(root.caKey.toString('ascii'))[0];
  const signingKey = await webcrypto.subtle.importKey('pkcs8', keyBytes, ALGORITHM, false, ['sign']);
  const keys = await webcrypto.subtle.generateKey(ALGORITHM, true, ['sign', 'verify']);
  const certificate = await X509CertificateGenerator.create({
    serialNumber: serial(),
    subject: 'CN=Sofa Arcade Local Host, O=Sofa Arcade',
    issuer: ca.subject,
    notBefore: notBefore ?? new Date(Math.max(now - CLOCK_SKEW_MS, ca.notBefore.getTime())),
    notAfter: notAfter ?? new Date(Math.min(now + LEAF_VALIDITY_DAYS * DAY_MS, ca.notAfter.getTime())),
    publicKey: keys.publicKey,
    signingKey,
    signingAlgorithm: ALGORITHM,
    extensions: [
      new BasicConstraintsExtension(false, undefined, true),
      new KeyUsagesExtension(KeyUsageFlags.digitalSignature, true),
      new ExtendedKeyUsageExtension([ExtendedKeyUsage.serverAuth]),
      new SubjectAlternativeNameExtension(names.map((value) => ({ type: isIP(value) ? 'ip' : 'dns', value }))),
      await SubjectKeyIdentifierExtension.create(keys.publicKey, false, webcrypto),
      await AuthorityKeyIdentifierExtension.create(ca, false, webcrypto),
    ],
  }, webcrypto);
  return {
    key: pemKey(await webcrypto.subtle.exportKey('pkcs8', keys.privateKey)),
    cert: Buffer.from(certificate.toString('pem') + '\n'),
  };
}
