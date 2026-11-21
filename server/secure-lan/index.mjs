/**
 * Optional local TLS listener. GO7 must inject the SAME application handler and
 * realtime coordinator as HTTP. This module has no database, room, auth or OS
 * trust operations. Host/Origin validation belongs in those shared handlers;
 * request-policy.mjs demonstrates the exact scheme-aware policy.
 */
import { createServer } from 'node:https';
import { isIP } from 'node:net';
import os from 'node:os';
import { validateTlsMaterial, normalizeIdentities } from './certificates/index.mjs';

const CLOSE_GRACE_MS = 250;
const CLOSE_DEADLINE_MS = 1000;
const CODES = Object.freeze({
  configuration_invalid: 'The secure listener configuration is invalid.',
  material_invalid: 'The secure certificate material is invalid.',
  certificate_expired: 'The secure certificate needs renewal.',
  address_mismatch: 'The certificate does not cover the current local address.',
  port_in_use: 'The secure port is already in use. Choose another port.',
  bind_failed: 'The secure listener could not start. Touch play remains available.',
  listener_failed: 'The secure listener stopped. Touch play remains available.',
  close_failed: 'The secure listener could not finish closing.',
});

/** Safe coded error: never retains the original OpenSSL/filesystem error. */
export class SecureLanListenerError extends Error {
  constructor(code, status = 'failed') {
    super(CODES[code] || CODES.material_invalid);
    this.name = 'SecureLanListenerError';
    this.code = Object.hasOwn(CODES, code) ? code : 'material_invalid';
    this.status = status === 'certificate-expired' || status === 'address-mismatch' ? status : 'failed';
  }
}

function safeError(error) {
  if (error instanceof SecureLanListenerError) return error;
  if (error?.status === 'certificate-expired') return new SecureLanListenerError('certificate_expired', 'certificate-expired');
  if (error?.status === 'address-mismatch') return new SecureLanListenerError('address_mismatch', 'address-mismatch');
  return new SecureLanListenerError('material_invalid');
}

function bindAddress(host) {
  if (host === '0.0.0.0' || host === '::') return host;
  if (typeof host !== 'string' || !isIP(host)) throw new SecureLanListenerError('configuration_invalid');
  try { return normalizeIdentities([host])[0]; } catch { throw new SecureLanListenerError('configuration_invalid'); }
}

function reachableIdentities(identities, address) {
  if (address === '::') return identities;
  if (address === '0.0.0.0') return identities.filter(identity => isIP(identity) !== 6);
  return identities.filter(identity => identity === address
    || (identity === 'localhost' && ['127.0.0.1', '::1'].includes(address)));
}

function asOrigin(identity, port) {
  return new URL(`https://${isIP(identity) === 6 ? `[${identity}]` : identity}:${port}`).origin;
}

function validateWildcardAddresses(identities, host) {
  if (host !== '0.0.0.0' && host !== '::') return;
  const assigned = new Set();
  let interfaces;
  try { interfaces = os.networkInterfaces(); } catch { throw new SecureLanListenerError('bind_failed'); }
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (isIP(entry.address) === 4) assigned.add(entry.address);
      else if (isIP(entry.address) === 6) assigned.add(new URL(`http://[${entry.address}]/`).hostname.slice(1, -1));
    }
  }
  for (const identity of identities) {
    if (isIP(identity) && !assigned.has(identity)) throw new SecureLanListenerError('address_mismatch', 'address-mismatch');
  }
  // A .local alias is an explicit host configuration assertion. TLS admission
  // cannot prove that either phone can resolve mDNS; prefer assigned IPs for
  // join links and retain real phone resolution as a separate device check.
}

function failedResponse(response) {
  if (response.destroyed || response.writableEnded) return;
  if (response.headersSent) { response.destroy(); return; }
  response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Connection: 'close' });
  response.end('{"error":"The local host could not serve this request.","code":"request_failed"}');
}

function rejectUpgrade(socket, status = 404) {
  if (socket.destroyed) return;
  socket.end(`HTTP/1.1 ${status} ${status === 404 ? 'Not Found' : 'Service Unavailable'}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  // A malicious peer may keep the writable half of a rejected upgrade open.
  const timer = setTimeout(() => socket.destroy(), CLOSE_GRACE_MS);
  timer.unref();
  socket.once('close', () => clearTimeout(timer));
}

/**
 * @param {{tlsMaterial: {key: Buffer,cert: Buffer,ca: Buffer,identities: string[]},
 *   host?: string,port?: number,requestHandler: Function,onUpgrade?: Function,onError?: Function}} options
 * @returns {Promise<{port:number,origins:readonly string[],status:object,close:Function}>}
 *
 * onError receives only {code}, never raw request, key material or native errors.
 * onUpgrade receives the unmodified request/socket/head. The injected coordinator
 * must synchronously validate route/Host/Origin before upgrading and authenticate
 * the first message afterwards. A missing callback rejects all upgrades.
 */
export async function createSecureLanServer({ tlsMaterial, host = '0.0.0.0', port = 4178, requestHandler, onUpgrade, onError } = {}) {
  if (typeof requestHandler !== 'function' || (onUpgrade !== undefined && typeof onUpgrade !== 'function')
    || (onError !== undefined && typeof onError !== 'function') || !Number.isInteger(port) || port < 0 || port > 65535) {
    throw new SecureLanListenerError('configuration_invalid');
  }
  host = bindAddress(host);
  let material;
  try { material = validateTlsMaterial(tlsMaterial); } catch (error) { throw safeError(error); }
  const identities = reachableIdentities(material.identities, host);
  if (!identities.length) throw new SecureLanListenerError('address_mismatch', 'address-mismatch');
  validateWildcardAddresses(identities, host);

  function notify(code) {
    if (!onError) return;
    try { Promise.resolve(onError(Object.freeze({ code }))).catch(() => {}); } catch { /* Consumer errors never leak or crash TLS. */ }
  }
  let server;
  try {
    server = createServer({
      key: tlsMaterial.key, cert: tlsMaterial.cert,
      minVersion: 'TLSv1.2', handshakeTimeout: 5000, maxHeaderSize: 16 * 1024,
      // This is server authentication. Browser controllers retain ordinary room
      // bearer authentication; do not request/require client certificates.
      requestCert: false,
    });
  } catch { throw new SecureLanListenerError('material_invalid'); }

  const sockets = new Set();
  let closing;
  let expiryTimer;
  let closed = false;
  let currentStatus;
  let actualPort = 0;
  let origins = Object.freeze([]);
  const track = socket => {
    if (closed) { socket.destroy(); return; }
    if (sockets.has(socket)) return;
    sockets.add(socket);
    // An injected upgrade handler may reject before installing its own socket
    // listeners. An abrupt peer reset must not become an unhandled error.
    socket.on('error', () => {});
    socket.once('close', () => sockets.delete(socket));
  };
  server.on('connection', track); // Also covers peers stalled before TLS handshake.
  server.on('secureConnection', socket => {
    track(socket);
    socket.disableRenegotiation();
  });
  server.on('request', (request, response) => {
    if (closed) { response.writeHead(503, { Connection: 'close' }); response.end(); return; }
    try {
      Promise.resolve(requestHandler(request, response)).catch(() => { notify('request_failed'); failedResponse(response); });
    } catch { notify('request_failed'); failedResponse(response); }
  });
  server.on('upgrade', (request, socket, head) => {
    track(socket);
    if (closed || !onUpgrade) { rejectUpgrade(socket, closed ? 503 : 404); return; }
    try {
      Promise.resolve(onUpgrade(request, socket, head)).catch(() => { notify('upgrade_failed'); socket.destroy(); });
    } catch { notify('upgrade_failed'); socket.destroy(); }
  });
  server.on('tlsClientError', (_error, socket) => { notify('tls_client_rejected'); socket.destroy(); });
  server.on('clientError', (_error, socket) => { notify('request_rejected'); socket.destroy(); });
  server.requestTimeout = 15_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 100;
  server.maxConnections = 64;

  function close() {
    if (closing) return closing;
    closed = true;
    clearTimeout(expiryTimer);
    currentStatus = Object.freeze({ enabled: false, status: 'disabled', controllerOrigins: Object.freeze([]), requiresPhoneTrust: true });
    closing = new Promise((resolve, reject) => {
      let settled = false;
      let graceTimer;
      let deadlineTimer;
      const finish = error => {
        if (settled) return;
        settled = true;
        clearTimeout(graceTimer);
        clearTimeout(deadlineTimer);
        if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') {
          notify('close_failed'); reject(new SecureLanListenerError('close_failed'));
        } else resolve();
      };
      const destroyAll = () => {
        server.closeAllConnections();
        for (const socket of sockets) socket.destroy();
      };
      graceTimer = setTimeout(destroyAll, CLOSE_GRACE_MS);
      graceTimer.unref();
      deadlineTimer = setTimeout(() => { destroyAll(); finish(new SecureLanListenerError('close_failed')); }, CLOSE_DEADLINE_MS);
      deadlineTimer.unref();
      // Stop accepting before forcing connections closed; otherwise a late
      // connection can escape a destroy pass. HTTP closeAllConnections alone
      // deliberately excludes sockets upgraded to WebSocket.
      try { server.close(finish); server.closeIdleConnections(); } catch (error) { destroyAll(); finish(error); }
    });
    return closing;
  }

  try {
    await new Promise((resolve, reject) => {
      const rejectStart = error => { server.off('listening', acceptStart); reject(error); };
      const acceptStart = () => { server.off('error', rejectStart); resolve(); };
      server.once('error', rejectStart);
      server.once('listening', acceptStart);
      server.listen({ port, host, ipv6Only: host === '::' ? false : undefined });
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new SecureLanListenerError('bind_failed');
    actualPort = address.port;
    origins = Object.freeze(reachableIdentities(identities, address.address).map(identity => asOrigin(identity, actualPort)));
    if (!origins.length) throw new SecureLanListenerError('address_mismatch', 'address-mismatch');
    currentStatus = Object.freeze({
      enabled: true, status: 'ready', controllerOrigins: origins,
      certificateFingerprint: material.certificateFingerprint,
      validUntil: material.validUntil, requiresPhoneTrust: true,
    });
  } catch (error) {
    await close().catch(() => {});
    if (error instanceof SecureLanListenerError) throw error;
    throw new SecureLanListenerError(error?.code === 'EADDRINUSE' ? 'port_in_use' : 'bind_failed');
  }
  server.on('error', () => {
    notify('listener_failed');
    void close().catch(() => {});
    currentStatus = Object.freeze({ enabled: true, status: 'failed', controllerOrigins: Object.freeze([]), requiresPhoneTrust: true });
  });
  // TLS clients enforce dates themselves; the host must also stop advertising
  // ready after expiry. Recheck long deadlines in short chunks (Node timers
  // cannot represent the entire 90-day leaf lifetime in one timeout).
  function checkExpiry() {
    if (closed) return;
    const remaining = Date.parse(material.validUntil) - Date.now();
    if (remaining <= 0) {
      notify('certificate_expired');
      void close().catch(() => {});
      currentStatus = Object.freeze({
        enabled: true, status: 'certificate-expired', controllerOrigins: Object.freeze([]),
        certificateFingerprint: material.certificateFingerprint, validUntil: material.validUntil, requiresPhoneTrust: true,
      });
      return;
    }
    expiryTimer = setTimeout(checkExpiry, Math.min(remaining, 60_000));
    expiryTimer.unref();
  }
  checkExpiry();
  return Object.freeze({ port: actualPort, origins, get status() { return currentStatus; }, close });
}
