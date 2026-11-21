/** Native-owned secure listener. This module never registers a phone HTTP API. */
import path from 'node:path';
import { constants } from 'node:fs';
import { lstat, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createSecureLanHost, createCertificateStore } from '../../server/runtime/gravity-orchard-dependencies.mjs';
import { validateSecureControllerStatus } from './lifecycle.mjs';

const SETTINGS = 'secure-controller.json';
const safeFailure = () => Object.assign(new Error('Trusted local access could not complete this operation.'), { code: 'SECURE_OPERATION_FAILED' });

async function readSettings(directory) {
  const filename = path.join(directory, SETTINGS);
  try {
    const stat = await lstat(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (stat.mode & 0o077) || (process.getuid && stat.uid !== process.getuid()) || stat.size > 256) throw safeFailure();
    const value = JSON.parse(await readFile(filename, 'utf8'));
    if (!value || Object.keys(value).sort().join(',') !== 'enabled,schemaVersion' || value.schemaVersion !== 1 || typeof value.enabled !== 'boolean') throw safeFailure();
    return value;
  } catch (error) { if (error.code === 'ENOENT') return { schemaVersion: 1, enabled: false }; throw safeFailure(); }
}

async function writeSettings(directory, enabled) {
  // The canonical private application-data directory is established by entry.mjs.
  // O_EXCL avoids following/replacing any pre-existing temporary path.
  const temporary = path.join(directory, `.secure-controller-${randomUUID()}.tmp`);
  let handle;
  let temporaryOwned = false;
  try {
    await readSettings(directory);
    handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    temporaryOwned = true;
    await handle.writeFile(JSON.stringify({ schemaVersion: 1, enabled }) + '\n');
    await handle.sync(); await handle.close(); handle = null;
    await rename(temporary, path.join(directory, SETTINGS));
    temporaryOwned = false;
  } catch { throw safeFailure(); }
  finally { await handle?.close().catch(() => {}); if (temporaryOwned) await rm(temporary, { force: true }).catch(() => {}); }
}

/**
 * Keeps the most recent tilt-setup failure code in the app data folder, so a
 * failed setup can be diagnosed (the host's stderr is not kept). The code comes
 * from a fixed vocabulary such as PROVISION_FAILED:EADDRINUSE; no message,
 * path or certificate detail is written. Diagnostics never affect play.
 */
const DIAGNOSTIC_CODE = /^[A-Z][A-Z0-9_:]{2,80}$/;
async function recordDiagnostic(appDataDir, code) {
  if (typeof code !== 'string' || !DIAGNOSTIC_CODE.test(code)) return;
  try {
    await writeFile(path.join(appDataDir, 'secure-lan-last-error.json'),
      `${JSON.stringify({ schemaVersion: 1, code, at: new Date().toISOString() })}\n`, { mode: 0o600 });
  } catch { /* diagnostics are best effort */ }
}

/** Wrap exactly one LAN host. The unforgeable context never crosses a pipe or URL. */
export async function attachNativeSecureLan(lan, { appDataDir, host = '0.0.0.0', createHost = createSecureLanHost, createStore = createCertificateStore } = {}) {
  const context = Object.freeze({});
  let closed = false;
  let settings;
  let safeStatus = { enabled: false, status: 'needs-setup', controllerOrigins: [], requiresPhoneTrust: false };
  const getIdentities = () => [...new Set(['127.0.0.1', 'localhost', ...lan.urls.map(raw => new URL(raw).hostname)])];
  const publish = value => {
    safeStatus = validateSecureControllerStatus(value);
    lan.setSecureControllerStatus(safeStatus);
    return safeStatus;
  };
  const secure = createHost({
    certificateStore: createStore({ appDataDir }), getIdentities,
    authorizeHost: caller => caller === context && !closed,
    host, requestHandler: lan.requestHandler, onUpgrade: lan.handleUpgrade,
    // Listener expiry/error is reflected in HTTP metadata without emitting an
    // unsolicited native readiness record or silently renewing the root.
    onError: ({ code } = {}) => {
      if (closed) return;
      void recordDiagnostic(appDataDir, code);
      void secure.getStatus().then(publish).catch(() => {});
    },
  });
  try {
    settings = await readSettings(appDataDir);
    publish(settings.enabled ? await secure.start(context) : await secure.getStatus());
  } catch {
    settings = { schemaVersion: 1, enabled: false };
    publish({ enabled: false, status: 'failed', controllerOrigins: [], requiresPhoneTrust: false });
  }
  return {
    port: lan.port, origin: lan.origin, urls: lan.urls,
    get secureControllerStatus() { return safeStatus; },
    async secureCommand(operation, options = {}) {
      if (closed) throw safeFailure();
      if (operation === 'getStatus') return { status: publish(await secure.getStatus()) };
      if (operation === 'exportPublicTrust') return { publicTrust: await secure.exportPublicTrust(context, options) };
      if (operation === 'provision') {
        const status = await secure.provision(context, options);
        try { await writeSettings(appDataDir, true); settings.enabled = true; }
        catch { await secure.remove(context, { mode: 'disable' }); publish(await secure.getStatus()); throw safeFailure(); }
        return { status: publish(status) };
      }
      if (operation === 'remove') {
        // Persist disabled first: a crash during listener/material removal must
        // never re-enable trusted access on the next launch.
        await writeSettings(appDataDir, false); settings.enabled = false;
        const status = await secure.remove(context, options);
        return { status: publish(status) };
      }
      throw safeFailure();
    },
    async close() {
      if (closed) return;
      closed = true;
      try { await secure.close(); } finally { await lan.close(); }
    },
  };
}

/** Only the already-owned native parent can submit these private-pipe records. */
export function validateSecureCommand(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'id,operation,options,type'
      || value.type !== 'secure' || !/^[a-zA-Z0-9-]{1,64}$/.test(value.id || '')
      || !['getStatus', 'provision', 'exportPublicTrust', 'remove'].includes(value.operation)
      || !value.options || typeof value.options !== 'object' || Array.isArray(value.options)) throw safeFailure();
  const keys = Object.keys(value.options);
  const valid = value.operation === 'getStatus' ? keys.length === 0
    : value.operation === 'provision' ? keys.length === 1 && keys[0] === 'replaceRoot' && typeof value.options.replaceRoot === 'boolean'
    : value.operation === 'exportPublicTrust' ? keys.length === 1 && keys[0] === 'format' && ['pem', 'mobileconfig'].includes(value.options.format)
    : keys.length === 1 && keys[0] === 'mode' && ['disable', 'remove'].includes(value.options.mode);
  if (!valid) throw safeFailure();
  return value;
}
