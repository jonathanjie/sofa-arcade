import 'reflect-metadata';
import { createPrivateKey, createPublicKey, X509Certificate as NodeCertificate } from 'node:crypto';
import { isIP } from 'node:net';
import {
  AuthorityKeyIdentifierExtension, BasicConstraintsExtension, ExtendedKeyUsage, ExtendedKeyUsageExtension,
  KeyUsageFlags, KeyUsagesExtension, SubjectAlternativeNameExtension, SubjectKeyIdentifierExtension, X509Certificate,
} from '@peculiar/x509';
import { certificateError, safeCertificateError } from './errors.mjs';
import { normalizeIdentities, normalizeIdentity } from './identities.mjs';

export const DAY_MS = 86_400_000;
export const LEAF_VALIDITY_DAYS = 90;
export const ROOT_VALIDITY_DAYS = 1825;
export const CLOCK_SKEW_MS = 5 * 60_000;
const MAX_PEM_BYTES = 32_768;
const ALLOWED_EXTENSIONS = new Set(['2.5.29.19', '2.5.29.15', '2.5.29.37', '2.5.29.17', '2.5.29.14', '2.5.29.35']);

function checkPem(value, label) {
  if (!Buffer.isBuffer(value) || value.length === 0 || value.length > MAX_PEM_BYTES) {
    throw certificateError('MATERIAL_INVALID');
  }
  const text = value.toString('ascii');
  const expression = new RegExp(`^-----BEGIN ${label}-----\\r?\\n(?:[A-Za-z0-9+/=]+\\r?\\n)+-----END ${label}-----\\r?\\n?$`);
  if (!expression.test(text) || !Buffer.from(text, 'ascii').equals(value)) {
    throw certificateError('MATERIAL_INVALID');
  }
  return text;
}

function parseCertificate(pem) {
  const text = checkPem(pem, 'CERTIFICATE');
  return { parsed: new X509Certificate(text), node: new NodeCertificate(pem) };
}

function requireP256(key) {
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
    throw certificateError('MATERIAL_INVALID');
  }
}

function validateStructure(cert, maxDays) {
  const { parsed, node } = cert;
  requireP256(node.publicKey);
  const algorithm = parsed.signatureAlgorithm;
  if (algorithm.name !== 'ECDSA' || algorithm.hash?.name !== 'SHA-256') {
    throw certificateError('MATERIAL_INVALID');
  }
  const from = parsed.notBefore.getTime();
  const until = parsed.notAfter.getTime();
  if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from ||
      until - from > maxDays * DAY_MS + CLOCK_SKEW_MS) throw certificateError('MATERIAL_INVALID');
  const seen = new Set();
  for (const ext of parsed.extensions) {
    if (seen.has(ext.type) || (ext.critical && !ALLOWED_EXTENSIONS.has(ext.type))) {
      throw certificateError('MATERIAL_INVALID');
    }
    seen.add(ext.type);
  }
}

function validateDates(cert, now, root = false) {
  if (!Number.isFinite(now)) throw certificateError('INVALID_CONFIGURATION');
  if (now >= cert.parsed.notAfter.getTime()) {
    throw certificateError('CERTIFICATE_EXPIRED', { rootReplacementRequired: root });
  }
  if (now < cert.parsed.notBefore.getTime()) {
    throw certificateError('CERTIFICATE_NOT_YET_VALID', { rootReplacementRequired: root });
  }
}

function validateKeyPair(key, certificate) {
  checkPem(key, 'PRIVATE KEY');
  const parsed = createPrivateKey(key);
  requireP256(parsed);
  const expected = certificate.node.publicKey.export({ type: 'spki', format: 'der' });
  const actual = createPublicKey(parsed).export({ type: 'spki', format: 'der' });
  if (!actual.equals(expected)) throw certificateError('MATERIAL_INVALID');
}

/** Internal root check also used when a damaged/expired leaf needs renewal. */
export function validateRootMaterial({ ca, caKey }, { now = Date.now(), checkTime = true } = {}) {
  try {
    const root = parseCertificate(ca);
    validateStructure(root, ROOT_VALIDITY_DAYS);
    const constraints = root.parsed.getExtension(BasicConstraintsExtension);
    const usage = root.parsed.getExtension(KeyUsagesExtension);
    const subjectKeyId = root.parsed.getExtension(SubjectKeyIdentifierExtension)?.keyId;
    if (!root.node.ca || !constraints?.critical || constraints.ca !== true || constraints.pathLength !== 0 ||
        !usage?.critical || usage.usages !== (KeyUsageFlags.keyCertSign | KeyUsageFlags.cRLSign) ||
        !/^[0-9a-f]{40}$/i.test(subjectKeyId ?? '') ||
        root.parsed.getExtension(ExtendedKeyUsageExtension) || root.parsed.getExtension(SubjectAlternativeNameExtension) ||
        root.parsed.subject !== root.parsed.issuer || !root.node.verify(root.node.publicKey)) {
      throw certificateError('MATERIAL_INVALID', { rootReplacementRequired: true });
    }
    if (caKey !== undefined) validateKeyPair(caKey, root);
    if (checkTime) validateDates(root, now, true);
    return root;
  } catch (error) {
    const safe = safeCertificateError(error);
    safe.rootReplacementRequired = true;
    throw safe;
  }
}

/**
 * Pure synchronous admission check before a listener receives private bytes.
 * Checks issuer, key pairing, purpose, dates and every advertised SAN. It does
 * not infer that a phone trusts this root, nor alter any OS trust store.
 */
export function validateTlsMaterial(tlsMaterial, { now = Date.now() } = {}) {
  try {
    if (!tlsMaterial || typeof tlsMaterial !== 'object' ||
        !Buffer.isBuffer(tlsMaterial.key) || !Buffer.isBuffer(tlsMaterial.cert) ||
        !Buffer.isBuffer(tlsMaterial.ca) || !Array.isArray(tlsMaterial.identities)) {
      throw certificateError('MATERIAL_INVALID');
    }
    const identities = normalizeIdentities(tlsMaterial.identities);
    const root = validateRootMaterial({ ca: tlsMaterial.ca }, { now });
    const leaf = parseCertificate(tlsMaterial.cert);
    validateStructure(leaf, 398);
    const constraints = leaf.parsed.getExtension(BasicConstraintsExtension);
    const usage = leaf.parsed.getExtension(KeyUsagesExtension);
    const extended = leaf.parsed.getExtension(ExtendedKeyUsageExtension);
    const authorityKeyId = leaf.parsed.getExtension(AuthorityKeyIdentifierExtension)?.keyId;
    if (leaf.node.ca || !constraints?.critical || constraints.ca !== false || constraints.pathLength !== undefined ||
        !usage?.critical || usage.usages !== KeyUsageFlags.digitalSignature ||
        extended?.usages.length !== 1 || extended.usages[0] !== ExtendedKeyUsage.serverAuth ||
        authorityKeyId !== root.parsed.getExtension(SubjectKeyIdentifierExtension)?.keyId ||
        leaf.parsed.issuer !== root.parsed.subject || !leaf.node.verify(root.node.publicKey) ||
        leaf.parsed.notBefore < root.parsed.notBefore || leaf.parsed.notAfter > root.parsed.notAfter) {
      throw certificateError('MATERIAL_INVALID');
    }
    validateKeyPair(tlsMaterial.key, leaf);
    validateDates(leaf, now);
    const san = leaf.parsed.getExtension(SubjectAlternativeNameExtension);
    if (!san || san.names.items.length === 0 || san.names.items.length > 16) throw certificateError('ADDRESS_MISMATCH');
    const certificateIdentities = [];
    for (const name of san.names.items) {
      if ((name.type !== 'dns' && name.type !== 'ip') || (name.type === 'dns' && isIP(name.value)) ||
          (name.type === 'ip' && !isIP(name.value))) throw certificateError('MATERIAL_INVALID');
      certificateIdentities.push(normalizeIdentity(name.value));
    }
    const covered = new Set(certificateIdentities);
    // Unexpected names are rejected too: the component only admits certificates
    // issued for this exact, explicit local address set.
    if (covered.size !== certificateIdentities.length || covered.size !== identities.length ||
        identities.some((identity) => !covered.has(identity))) throw certificateError('ADDRESS_MISMATCH');
    for (const identity of identities) {
      const match = isIP(identity)
        ? leaf.node.checkIP(identity)
        : leaf.node.checkHost(identity, { subject: 'never', wildcards: false, partialWildcards: false });
      if (!match) throw certificateError('ADDRESS_MISMATCH');
    }
    return Object.freeze({
      identities,
      certificateFingerprint: root.node.fingerprint256,
      validUntil: leaf.parsed.notAfter.toISOString(),
    });
  } catch (error) {
    throw safeCertificateError(error);
  }
}

/** Host-only object. JSON logging of it fails closed instead of exporting keys. */
export function createPrivateTlsMaterial({ key, cert, ca, identities }) {
  const material = {
    key: Buffer.from(key), cert: Buffer.from(cert), ca: Buffer.from(ca),
    identities: normalizeIdentities(identities),
  };
  Object.defineProperty(material, 'toJSON', { value() { throw certificateError('MATERIAL_INVALID'); } });
  return Object.freeze(material);
}
