// Test-only issuance. Never package this file or generated temporary material.
import { issueLeaf, issueRoot } from '../issuer.mjs';
import { createPrivateTlsMaterial } from '../material.mjs';
import { webcrypto } from 'node:crypto';
import { PemConverter, X509Certificate, X509CertificateGenerator } from '@peculiar/x509';

export async function createTestMaterial({
  identities = ['127.0.0.1', 'localhost'], now = Date.now(),
  notBefore, notAfter, rootNotBefore, rootNotAfter, root,
} = {}) {
  const authority = root ?? await issueRoot({ now, notBefore: rootNotBefore, notAfter: rootNotAfter });
  const leaf = await issueLeaf({ root: authority, identities, now, notBefore, notAfter });
  return { tlsMaterial: createPrivateTlsMaterial({ ...leaf, ca: authority.ca, identities }), root: authority };
}

/** Produce a correctly signed but deliberately misconfigured test leaf. */
export async function reissueTestLeaf({ root, tlsMaterial, extensions, subject }) {
  const leaf = new X509Certificate(tlsMaterial.cert);
  const ca = new X509Certificate(root.ca);
  const algorithm = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' };
  const signingKey = await webcrypto.subtle.importKey('pkcs8', PemConverter.decode(root.caKey.toString('ascii'))[0],
    algorithm, false, ['sign']);
  const changed = await X509CertificateGenerator.create({
    serialNumber: leaf.serialNumber, subject: subject ?? leaf.subject, issuer: ca.subject,
    notBefore: leaf.notBefore, notAfter: leaf.notAfter, publicKey: leaf.publicKey,
    signingKey, signingAlgorithm: algorithm, extensions: extensions(leaf.extensions),
  }, webcrypto);
  return { ...tlsMaterial, cert: Buffer.from(changed.toString('pem') + '\n') };
}
