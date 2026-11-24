/**
 * Host-only composition seam. Import into the owned Node process, never a phone
 * bundle. Neither this module nor its return value registers an HTTP/native API.
 * GO7 supplies authority from its existing native/host authentication boundary.
 */
import { isIP } from 'node:net';
import { createSecureLanServer } from './index.mjs';
import { createRequestPolicy } from './request-policy.mjs';
import { normalizeIdentities } from './certificates/index.mjs';

const STATES = new Set(['certificate-expired', 'address-mismatch', 'failed']);
/** System error codes that may be attached to an operation failure for diagnosis. */
const DIAGNOSTIC_SYSTEM_CODES = new Set(['EADDRINUSE', 'EADDRNOTAVAIL', 'EACCES', 'EPERM', 'ENOENT', 'ENOSPC', 'EROFS', 'ETIMEDOUT']);
const OPERATIONS = new Set(['start', 'provision', 'exportPublicTrust', 'remove']);
const LISTENER_CODES = new Set(['tls_client_rejected', 'request_rejected', 'request_failed', 'upgrade_failed', 'certificate_expired', 'listener_failed', 'close_failed']);

function failure(code) {
  const error = new Error('The secure local operation could not be completed.');
  error.code = code;
  return error;
}

function exactOptions(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(key => !allowed.includes(key))) throw failure('INVALID_OPTIONS');
}

function publicStatus({ enabled = false, status = 'disabled', origins = [], material } = {}) {
  const result = {
    enabled,
    status,
    controllerOrigins: Object.freeze(status === 'ready' ? [...origins] : []),
    requiresPhoneTrust: Boolean(material?.certificateFingerprint),
  };
  // Construct the frozen contract explicitly; never spread private store data.
  if (/^(?:[\dA-F]{2}:){31}[\dA-F]{2}$/i.test(material?.certificateFingerprint || '')) {
    result.certificateFingerprint = material.certificateFingerprint;
  }
  if (typeof material?.validUntil === 'string' && Number.isFinite(Date.parse(material.validUntil))) {
    result.validUntil = new Date(material.validUntil).toISOString();
  }
  return Object.freeze(result);
}

/**
 * Optional example for an authenticated loopback bridge, NOT authorization by
 * loopback alone. `verifyHost` must verify existing *host* authority, not a player
 * bearer or a body field. `request` must be the original Node IncomingMessage.
 * A native IPC adapter can supply its own authorizeHost instead of using this.
 */
export function createLoopbackHostAuthorizer({ origin, verifyHost } = {}) {
  let url;
  try { url = new URL(origin); } catch { throw failure('INVALID_HOST_ORIGIN'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname)
      || url.origin !== origin || url.username || url.password || url.search || url.hash) {
    throw failure('INVALID_HOST_ORIGIN');
  }
  const policy = createRequestPolicy({ httpOrigins: [origin] });
  return async (request, operation) => {
    if (!OPERATIONS.has(operation) || typeof verifyHost !== 'function') return false;
    const address = request?.socket?.remoteAddress;
    const loopback = address === '::1' || address === '::ffff:127.0.0.1'
      || (isIP(address || '') === 4 && address.startsWith('127.'));
    if (!loopback || request?.method !== 'POST' || request?.socket?.encrypted) return false;
    const checked = policy.validateRequest(request);
    if (!checked.ok || checked.url.pathname !== '/api/host/secure-lan' || checked.url.search) return false;
    try { return await verifyHost({ request, operation }) === true; } catch { return false; }
  };
}

/**
 * createSecureLanHost({ certificateStore, getIdentities, authorizeHost, host?,
 *   port?, requestHandler, onUpgrade?, onError?, createServer? })
 *
 * getIdentities() is a trusted host callback (e.g. native network inventory).
 * authorizeHost(context, operation) -> boolean|Promise<boolean>, default deny.
 * Safe UI wrappers close over their native context; no credential enters the UI.
 * createServer is a host-only injection seam for isolated lifecycle tests.
 */
export function createSecureLanHost({
  certificateStore,
  getIdentities,
  authorizeHost,
  host = '0.0.0.0',
  port,
  requestHandler,
  onUpgrade,
  onError,
  createServer = createSecureLanServer,
} = {}) {
  if (!certificateStore || ['inspect', 'provision', 'loadTlsMaterial', 'exportPublicTrust', 'remove']
    .some(method => typeof certificateStore[method] !== 'function')
    || typeof getIdentities !== 'function' || typeof requestHandler !== 'function'
    || typeof createServer !== 'function'
    || (port !== undefined && (!Number.isInteger(port) || port < 0 || port > 65535))) {
    throw failure('INVALID_HOST_CONFIGURATION');
  }
  let enabled = false;
  let explicitlyDisabled = false;
  let disposed = false;
  let listener = null;
  let material = null;
  let activeMaterial = null;
  let last = publicStatus({ status: 'needs-setup' });
  let pipeline = Promise.resolve();
  let closing;
  const stopping = new Set();
  const starting = new Set();
  const enqueue = operation => {
    const result = pipeline.then(operation);
    pipeline = result.catch(() => {});
    return result;
  };
  const report = code => {
    try { Promise.resolve(onError?.(Object.freeze({ code }))).catch(() => {}); } catch { /* safe callback */ }
  };
  // A diagnostic code for an operation failure: the fallback, plus a system
  // error code only when it is on this fixed list. Never a message, path or
  // certificate detail.
  const causeCode = (error, fallback) => (
    DIAGNOSTIC_SYSTEM_CODES.has(error?.code) ? `${fallback}:${error.code}` : fallback
  );
  const assertOpen = () => { if (disposed) throw failure('HOST_CLOSED'); };
  async function authorize(context, operation) {
    assertOpen();
    let accepted = false;
    try { accepted = typeof authorizeHost === 'function' && await authorizeHost(context, operation) === true; }
    catch { /* fail closed, without exposing credentials or callback messages */ }
    assertOpen();
    if (!accepted) throw failure('HOST_FORBIDDEN');
  }
  const identities = async () => normalizeIdentities(await getIdentities());
  const snapshot = status => {
    last = publicStatus({ enabled: enabled && !disposed, status, origins: listener?.origins, material });
    return last;
  };
  async function stopListener() {
    const previous = listener;
    listener = null;
    activeMaterial = null;
    if (previous) {
      const pending = Promise.resolve().then(() => previous.close());
      stopping.add(pending);
      try { await pending; } finally { stopping.delete(pending); }
    }
  }
  async function inspect() {
    const wanted = await identities();
    const result = await certificateStore.inspect({ identities: wanted });
    material = result;
    return { result, wanted };
  }
  const materialSignature = result => JSON.stringify([
    result.state, result.identities, result.port, result.certificateFingerprint, result.validUntil,
  ]);
  async function readStatus() {
    if (disposed) return snapshot('disabled');
    try {
      const { result } = await inspect();
      if (disposed) return snapshot('disabled');
      if (!enabled) {
        if (explicitlyDisabled) return snapshot('disabled');
        if (result.state === 'missing') return snapshot('needs-setup');
        return snapshot(STATES.has(result.state) ? result.state : 'disabled');
      }
      if (result.state !== 'valid') {
        await stopListener();
        return snapshot(result.state === 'missing' ? 'needs-setup' : STATES.has(result.state) ? result.state : 'failed');
      }
      const listenerStatus = listener?.status?.status;
      if (listenerStatus === 'failed' || listenerStatus === 'certificate-expired') {
        await stopListener();
        return snapshot(listenerStatus);
      }
      // A network change or external material change invalidates our advertisement.
      // No privileged renewal happens during a status read.
      if (listener && materialSignature(result) !== activeMaterial) {
        await stopListener();
        return snapshot('needs-setup');
      }
      if (listenerStatus === 'ready') return snapshot('ready');
      return snapshot(STATES.has(last.status) ? last.status : 'needs-setup');
    } catch {
      await stopListener();
      report('STATUS_FAILED');
      return snapshot(disposed ? 'disabled' : 'failed');
    }
  }
  async function startExisting() {
    const { result, wanted } = await inspect();
    assertOpen();
    if (result.state !== 'valid') return snapshot(result.state === 'missing' ? 'needs-setup' : STATES.has(result.state) ? result.state : 'failed');
    const tlsMaterial = await certificateStore.loadTlsMaterial({ identities: wanted });
    assertOpen();
    let next;
    let startup;
    try {
      startup = Promise.resolve().then(() => {
        assertOpen();
        return createServer({
          tlsMaterial, host, port: port ?? result.port ?? 4178, requestHandler, onUpgrade,
          onError: error => report(LISTENER_CODES.has(error?.code) ? error.code : 'LISTENER_FAILED'),
        });
      });
      starting.add(startup);
      next = await startup;
      if (disposed) { await next.close(); return snapshot('disabled'); }
      listener = next;
      // Ephemeral ports are allowed for developer tests, but never persist 0 as a
      // working player address. The store's idempotent provision retains the root.
      if (next.port !== result.port) {
        material = await certificateStore.provision({ identities: wanted, port: next.port });
      }
      if (disposed) { await stopListener(); return snapshot('disabled'); }
      activeMaterial = materialSignature(material);
      return snapshot('ready');
    } catch (error) {
      if (next && next !== listener) await next.close();
      await stopListener();
      throw error;
    } finally {
      starting.delete(startup);
      // Node's SecureContext owns a copy after createServer; retain no private-key
      // references in this host facade or any public status object.
      tlsMaterial.key?.fill(0);
    }
  }
  const methods = {
    getStatus: () => enqueue(readStatus),
    start(context) {
      return enqueue(async () => {
        await authorize(context, 'start');
        enabled = true;
        explicitlyDisabled = false;
        try { await stopListener(); return await startExisting(); }
        catch (error) { report(causeCode(error, 'START_FAILED')); return snapshot(disposed ? 'disabled' : STATES.has(error?.status) ? error.status : 'failed'); }
      });
    },
    provision(context, options = {}) {
      return enqueue(async () => {
        await authorize(context, 'provision');
        exactOptions(options, ['replaceRoot']);
        if (options.replaceRoot !== undefined && typeof options.replaceRoot !== 'boolean') throw failure('INVALID_OPTIONS');
        enabled = true;
        explicitlyDisabled = false;
        try {
          await stopListener();
          const wanted = await identities();
          assertOpen();
          material = await certificateStore.provision({
            identities: wanted, port: port || material?.port || 4178,
            renewLeaf: true, replaceRoot: options.replaceRoot === true,
          });
          assertOpen();
          return await startExisting();
        } catch (error) {
          await stopListener();
          snapshot(disposed ? 'disabled' : STATES.has(error?.status) ? error.status : 'failed');
          report(causeCode(error, 'PROVISION_FAILED'));
          throw failure(disposed ? 'HOST_CLOSED' : 'PROVISION_FAILED');
        }
      });
    },
    exportPublicTrust(context, options = {}) {
      return enqueue(async () => {
        await authorize(context, 'exportPublicTrust');
        exactOptions(options, ['format']);
        if (options.format !== undefined && !['pem', 'mobileconfig'].includes(options.format)) throw failure('INVALID_OPTIONS');
        try {
          const exported = await certificateStore.exportPublicTrust(options);
          assertOpen();
          // Whitelist fields, even though the owned store already exports only public material.
          return Object.freeze({
            filename: exported.filename, mediaType: exported.mediaType, contents: exported.contents,
            certificateFingerprint: exported.certificateFingerprint, validUntil: exported.validUntil,
          });
        } catch { report('EXPORT_FAILED'); throw failure(disposed ? 'HOST_CLOSED' : 'EXPORT_FAILED'); }
      });
    },
    remove(context, options = {}) {
      return enqueue(async () => {
        await authorize(context, 'remove');
        exactOptions(options, ['mode']);
        const mode = options.mode ?? 'remove';
        if (!['disable', 'remove'].includes(mode)) throw failure('INVALID_OPTIONS');
        enabled = false;
        explicitlyDisabled = true;
        try {
          await stopListener();
          if (mode === 'remove') { await certificateStore.remove(); material = null; }
          return snapshot('disabled');
        } catch { snapshot('failed'); report('REMOVE_FAILED'); throw failure('REMOVE_FAILED'); }
      });
    },
    close() {
      if (closing) return closing;
      disposed = true;
      enabled = false;
      // Close live network resources immediately, without waiting for an
      // unrelated authorization, filesystem or status callback in the queue.
      // Already-starting listener factories are awaited and their late result
      // closed; earlier async work is fenced by assertOpen before any bind.
      const liveStop = stopListener();
      const lateStarts = [...starting].map(pending => pending.then(server => server.close(), () => {}));
      closing = Promise.all([liveStop, ...stopping, ...lateStarts]).then(() => { snapshot('disabled'); });
      return closing;
    },
  };
  return Object.freeze(methods);
}
