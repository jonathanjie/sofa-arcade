import { X509Certificate as NodeCertificate } from 'node:crypto';
import { certificateError, safeCertificateError } from './errors.mjs';
import { normalizeIdentities, validatePort } from './identities.mjs';
import { issueLeaf, issueRoot } from './issuer.mjs';
import { createPrivateTlsMaterial, validateRootMaterial, validateTlsMaterial } from './material.mjs';
import { createPrivateStorage } from './storage.mjs';

export { SecureLanCertificateError } from './errors.mjs';
export { normalizeIdentity, normalizeIdentities } from './identities.mjs';
export { validateTlsMaterial } from './material.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RECORD_KEYS = ['schemaVersion', 'installationId', 'identities', 'port', 'ca', 'caKey', 'cert', 'key'];

function parseRecord(bytes) {
  try {
    const record = JSON.parse(bytes.toString('utf8'));
    if (!record || Array.isArray(record) || Object.keys(record).length !== RECORD_KEYS.length ||
        RECORD_KEYS.some((key) => !Object.hasOwn(record, key)) || record.schemaVersion !== 1 ||
        !UUID.test(record.installationId)) throw certificateError('MATERIAL_INVALID');
    const identities = normalizeIdentities(record.identities);
    if (JSON.stringify(identities) !== JSON.stringify(record.identities)) throw certificateError('MATERIAL_INVALID');
    validatePort(record.port);
    for (const key of ['ca', 'caKey', 'cert', 'key']) {
      if (typeof record[key] !== 'string' || record[key].length > 32_768) throw certificateError('MATERIAL_INVALID');
    }
    return record;
  } catch {
    throw certificateError('MATERIAL_INVALID', { rootReplacementRequired: true });
  }
}

function rootFrom(record) {
  return { installationId: record.installationId, ca: Buffer.from(record.ca), caKey: Buffer.from(record.caKey) };
}

function validateWitness(record, bytes) {
  try {
    if (!bytes) throw new Error();
    const witness = JSON.parse(bytes.toString('utf8'));
    if (!witness || Object.keys(witness).length !== 2 || witness.schemaVersion !== 1 ||
        !Array.isArray(witness.roots) || witness.roots.length < 1 || witness.roots.length > 2 ||
        witness.roots.some((root) => !root || Object.keys(root).length !== 2 || !UUID.test(root.installationId) ||
          !/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(root.certificateFingerprint))) throw new Error();
    const fingerprint = new NodeCertificate(record.ca).fingerprint256;
    if (!witness.roots.some((root) => root.installationId === record.installationId &&
        root.certificateFingerprint === fingerprint)) throw new Error();
  } catch { throw certificateError('ROOT_REPLACEMENT_REQUIRED', { rootReplacementRequired: true }); }
}

function identityWitness(records) {
  return Buffer.from(JSON.stringify({
    schemaVersion: 1,
    roots: records.map((record) => ({
      installationId: record.installationId,
      certificateFingerprint: new NodeCertificate(record.ca).fingerprint256,
    })),
  }) + '\n');
}

function readSnapshot({ bytes, witness }) {
  if (!bytes) {
    if (witness) throw certificateError('ROOT_REPLACEMENT_REQUIRED', { rootReplacementRequired: true });
    return null;
  }
  const record = parseRecord(bytes);
  validateWitness(record, witness);
  return record;
}

function tlsFrom(record, identities = record.identities) {
  return createPrivateTlsMaterial({
    key: Buffer.from(record.key), cert: Buffer.from(record.cert), ca: Buffer.from(record.ca), identities,
  });
}

function missingInspection() {
  return Object.freeze({ state: 'missing', identities: Object.freeze([]), rootReplacementRequired: false });
}

function inspectRecord(record, identities, now) {
  const publicFields = { identities: Object.freeze([...record.identities]), port: record.port };
  try {
    const root = validateRootMaterial(rootFrom(record), { now, checkTime: false });
    publicFields.certificateFingerprint = root.node.fingerprint256;
    try {
      const cert = new NodeCertificate(record.cert);
      publicFields.validUntil = cert.validToDate.toISOString();
    } catch { /* Invalid leaf is actionable; no parser messages cross the seam. */ }
    validateRootMaterial(rootFrom(record), { now });
    const checked = validateTlsMaterial(tlsFrom(record, identities ?? record.identities), { now });
    return Object.freeze({ state: 'valid', ...publicFields, validUntil: checked.validUntil, rootReplacementRequired: false });
  } catch (error) {
    const safe = safeCertificateError(error);
    return Object.freeze({
      state: ['certificate-expired', 'address-mismatch'].includes(safe.status) ? safe.status : 'failed',
      ...publicFields,
      rootReplacementRequired: safe.rootReplacementRequired,
    });
  }
}

/**
 * Host capability only. GO7 supplies an already-created canonical native
 * app-data directory; this module never accepts a path from an HTTP request.
 * `now` is a host clock/test seam, not a browser-provided timestamp.
 */
export function createCertificateStore({ appDataDir, now = () => Date.now() }) {
  if (typeof now !== 'function') throw certificateError('INVALID_CONFIGURATION');
  const storage = createPrivateStorage(appDataDir);
  const time = () => {
    const value = now();
    if (!Number.isFinite(value)) throw certificateError('INVALID_CONFIGURATION');
    return value;
  };

  async function inspect({ identities } = {}) {
    try {
      const requested = identities === undefined ? undefined : normalizeIdentities(identities);
      const record = readSnapshot(await storage.snapshot());
      if (!record) return missingInspection();
      return inspectRecord(record, requested, time());
    } catch (error) {
      const safe = safeCertificateError(error);
      return Object.freeze({
        state: safe.status === 'address-mismatch' ? 'address-mismatch' : 'failed',
        identities: Object.freeze([]), rootReplacementRequired: safe.rootReplacementRequired,
      });
    }
  }

  async function provision({ identities, port = 4178, renewLeaf = false, replaceRoot = false }) {
    const names = normalizeIdentities(identities);
    validatePort(port);
    if (typeof renewLeaf !== 'boolean' || typeof replaceRoot !== 'boolean') throw certificateError('INVALID_CONFIGURATION');
    return storage.transaction(async ({ read, readWitness, write, writeWitness }) => {
      const stamp = time();
      const previous = await read();
      const witness = await readWitness();
      let record;
      if (previous) {
        try {
          record = parseRecord(previous);
          if (!replaceRoot) validateWitness(record, witness);
        }
        catch (error) { if (!replaceRoot) throw error; }
      } else if (witness && !replaceRoot) {
        throw certificateError('ROOT_REPLACEMENT_REQUIRED', { rootReplacementRequired: true });
      }
      let root;
      if (record && !replaceRoot) {
        root = rootFrom(record);
        try { validateRootMaterial(root, { now: stamp }); }
        catch (error) {
          const safe = safeCertificateError(error);
          if (safe.status === 'certificate-expired') throw safe;
          throw certificateError('ROOT_REPLACEMENT_REQUIRED', { rootReplacementRequired: true });
        }
      } else {
        root = await issueRoot({ now: stamp });
      }
      let leaf;
      if (record && !replaceRoot && !renewLeaf) {
        try {
          validateTlsMaterial(tlsFrom(record, names), { now: stamp });
          leaf = { key: Buffer.from(record.key), cert: Buffer.from(record.cert) };
        } catch { /* Explicit setup refreshes only the leaf while preserving the root. */ }
      }
      if (!leaf) leaf = await issueLeaf({ root, identities: names, now: stamp });
      const next = {
        schemaVersion: 1, installationId: root.installationId,
        identities: [...names], port,
        ca: root.ca.toString('utf8'), caKey: root.caKey.toString('utf8'),
        cert: leaf.cert.toString('utf8'), key: leaf.key.toString('utf8'),
      };
      validateTlsMaterial(tlsFrom(next), { now: stamp });
      if (!record || replaceRoot) {
        // During explicit root rotation the witness temporarily admits the
        // old and candidate identities. A crash or failed private rename must
        // not make the intact old root unusable. The private envelope is still
        // a single atomic commit; after success compact the public witness.
        let previousIdentity = null;
        if (record) {
          try { validateWitness(record, witness); previousIdentity = record; }
          catch { /* A corrupt previous identity was explicitly replaced. */ }
        }
        await writeWitness(identityWitness(previousIdentity ? [previousIdentity, next] : [next]));
      }
      // A complete root + leaf + configuration is committed by one atomic
      // rename. Failed refreshes leave the previous installation intact.
      await write(Buffer.from(JSON.stringify(next) + '\n'));
      if (!record || replaceRoot) await writeWitness(identityWitness([next]));
      return inspectRecord(next, names, stamp);
    }).catch((error) => { throw safeCertificateError(error, 'PROVISION_FAILED'); });
  }

  async function loadTlsMaterial({ identities } = {}) {
    const requested = identities === undefined ? undefined : normalizeIdentities(identities);
    const record = readSnapshot(await storage.snapshot());
    if (!record) throw certificateError('MATERIAL_MISSING');
    validateRootMaterial(rootFrom(record), { now: time() });
    const material = tlsFrom(record, requested ?? record.identities);
    validateTlsMaterial(material, { now: time() });
    return material;
  }

  async function exportPublicTrust({ format = 'pem' } = {}) {
    if (!['pem', 'mobileconfig'].includes(format)) throw certificateError('INVALID_CONFIGURATION');
    const record = readSnapshot(await storage.snapshot());
    if (!record) throw certificateError('MATERIAL_MISSING');
    const root = validateRootMaterial(rootFrom(record), { now: time() });
    const fingerprint = root.node.fingerprint256;
    const suffix = record.installationId.slice(0, 8);
    if (format === 'pem') return Object.freeze({
      filename: `sofa-arcade-${suffix}-root.crt`,
      mediaType: 'application/x-x509-ca-cert', contents: record.ca,
      certificateFingerprint: fingerprint, validUntil: root.parsed.notAfter.toISOString(),
    });
    // Public certificate payload only. A manually installed profile is NOT
    // automatically trusted for TLS; the user must explicitly enable it.
    const rootId = record.installationId.toUpperCase();
    const profileId = `com.sofa-arcade.local-trust.${record.installationId}`;
    const payloadId = `com.sofa-arcade.local-trust.root.${record.installationId}`;
    const contents = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>
<key>PayloadType</key><string>Configuration</string>
<key>PayloadVersion</key><integer>1</integer>
<key>PayloadIdentifier</key><string>${profileId}</string>
<key>PayloadUUID</key><string>${rootId}</string>
<key>PayloadDisplayName</key><string>Sofa Arcade ${suffix} — local phone trust</string>
<key>PayloadDescription</key><string>Trust certificates issued by this Sofa Arcade installation. Compare the root fingerprint with the host, then enable full TLS trust only if you choose. Remove this profile to revoke phone trust.</string>
<key>PayloadRemovalDisallowed</key><false/>
<key>PayloadContent</key><array><dict>
<key>PayloadType</key><string>com.apple.security.root</string>
<key>PayloadVersion</key><integer>1</integer>
<key>PayloadIdentifier</key><string>${payloadId}</string>
<key>PayloadUUID</key><string>${rootId.slice(0, -1)}${rootId.endsWith('0') ? '1' : '0'}</string>
<key>PayloadDisplayName</key><string>Sofa Arcade Local CA ${suffix}</string>
<key>PayloadCertificateFileName</key><string>sofa-arcade-${suffix}-root.cer</string>
<key>PayloadContent</key><data>${root.node.raw.toString('base64')}</data>
</dict></array></dict></plist>\n`;
    return Object.freeze({
      filename: `sofa-arcade-${suffix}-trust.mobileconfig`,
      mediaType: 'application/x-apple-aspen-config', contents,
      certificateFingerprint: fingerprint, validUntil: root.parsed.notAfter.toISOString(),
    });
  }

  const remove = () => storage.transaction(({ remove: removeOwned }) => removeOwned(), { create: false });
  return Object.freeze({ inspect, provision, loadTlsMaterial, exportPublicTrust, remove });
}
