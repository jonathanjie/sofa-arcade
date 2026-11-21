/** Desktop-only lifecycle around the shared LAN host. No game/server forks. */
export const PROTOCOL_VERSION = 1;
export const MAX_RECORD_BYTES = 4096;
export const MAX_SECURE_RECORD_BYTES = 16384;
export const MAX_COMMAND_BYTES = 256;

/** Safe public status only; private certificate/store fields fail closed. */
export function validateSecureControllerStatus(value) {
  const allowed = ['enabled', 'status', 'controllerOrigins', 'requiresPhoneTrust', 'certificateFingerprint', 'validUntil'];
  if (!value || Object.keys(value).some(key => !allowed.includes(key))
      || typeof value.enabled !== 'boolean' || typeof value.requiresPhoneTrust !== 'boolean'
      || !['disabled', 'needs-setup', 'ready', 'certificate-expired', 'address-mismatch', 'failed'].includes(value.status)
      || !Array.isArray(value.controllerOrigins) || value.controllerOrigins.length > 16) throw new Error('Invalid secure readiness.');
  const controllerOrigins = value.controllerOrigins.map(raw => {
    const url = new URL(raw);
    const ip = url.hostname.split('.').map(Number);
    const local = url.hostname === 'localhost' || (ip.length === 4 && ip.every(part => Number.isInteger(part) && part >= 0 && part <= 255)
      && (ip[0] === 10 || ip[0] === 127 || (ip[0] === 172 && ip[1] >= 16 && ip[1] <= 31) || (ip[0] === 192 && ip[1] === 168) || (ip[0] === 169 && ip[1] === 254)));
    if (!local || url.protocol !== 'https:' || !url.port || raw !== url.origin || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Invalid secure controller address.');
    return raw;
  });
  if (new Set(controllerOrigins).size !== controllerOrigins.length || (value.status !== 'ready' && controllerOrigins.length)
      || (value.status === 'ready' && (!value.enabled || !controllerOrigins.length || !value.requiresPhoneTrust))) throw new Error('Invalid secure readiness.');
  const result = { enabled: value.enabled, status: value.status, controllerOrigins, requiresPhoneTrust: value.requiresPhoneTrust };
  if (value.certificateFingerprint !== undefined) {
    if (!/^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value.certificateFingerprint)) throw new Error('Invalid secure fingerprint.');
    result.certificateFingerprint = value.certificateFingerprint;
  }
  if (value.validUntil !== undefined) {
    if (typeof value.validUntil !== 'string' || !Number.isFinite(Date.parse(value.validUntil)) || new Date(value.validUntil).toISOString() !== value.validUntil) throw new Error('Invalid secure validity.');
    result.validUntil = value.validUntil;
  }
  if (value.status === 'ready' && (!result.certificateFingerprint || !result.validUntil)) throw new Error('Incomplete secure readiness.');
  return result;
}

export function networkFingerprint(interfaces) {
  return [...new Set(Object.values(interfaces).flat().filter(item => item && item.family === 'IPv4' && !item.internal).map(item => item.address))].sort().join(',');
}

export function refreshReason({ previousNetwork, network, previousTick, now, wakeGapMs = 15_000 }) {
  if (network !== previousNetwork) return 'network_change';
  if (now - previousTick > wakeGapMs || now < previousTick) return 'resume';
  return null;
}

export function hostRecord(host, type = 'ready', reason) {
  const origin = `http://127.0.0.1:${host.port}`;
  if (!Number.isInteger(host.port) || host.port < 1 || host.port > 65535 || host.origin !== origin) throw new Error('Invalid host readiness.');
  const controllerUrls = host.urls.slice(0, 32).map(raw => {
    const url = new URL(raw);
    if (url.protocol !== 'http:' || Number(url.port) !== host.port || !/^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Invalid controller address.');
    return url.href;
  });
  const value = { type, protocolVersion: PROTOCOL_VERSION, port: host.port, hostUrl: `${origin}/`, controllerUrls };
  if (host.secureControllerStatus) value.secureControllerStatus = validateSecureControllerStatus(host.secureControllerStatus);
  if (reason) value.reason = reason;
  if (Buffer.byteLength(JSON.stringify(value)) + 1 > MAX_RECORD_BYTES) throw new Error('Oversized readiness.');
  return value;
}

/** Serializes refresh/stop so there can never be two owned listeners. */
export function createHostLifecycle({ start, options, emit }) {
  let host;
  let stopRequested = false;
  let pending = Promise.resolve();
  const queue = operation => {
    const result = pending.then(operation);
    pending = result.catch(() => {});
    return result;
  };
  return {
    start() {
      return queue(async () => {
        if (stopRequested) return;
        host = await start(options);
        if (stopRequested) { await host.close(); host = null; return; }
        emit(hostRecord(host));
      });
    },
    refresh(reason = 'requested') {
      return queue(async () => {
        if (stopRequested || !host) return;
        const port = host.port;
        await host.close();
        host = null;
        if (stopRequested) return;
        // The shared server snapshots LAN addresses and its strict Host allowlist
        // at startup. Recreate only our own listener on exactly the same port.
        host = await start({ ...options, port });
        if (stopRequested) { await host.close(); host = null; return; }
        emit(hostRecord(host, 'refreshed', reason));
      });
    },
    stop() {
      stopRequested = true;
      return queue(async () => { if (host) { const current = host; host = null; await current.close(); } });
    },
    secureCommand(operation, options) {
      return queue(async () => {
        if (stopRequested || !host || typeof host.secureCommand !== 'function') throw new Error('Secure host unavailable.');
        return host.secureCommand(operation, options);
      });
    },
  };
}

/** Keep the listener owned until native has destroyed the old credentialed view. */
export function createRefreshGate({ emit, refresh }) {
  let pendingReason = null;
  let busy = false;
  return {
    request(reason) {
      if (!['network_change', 'resume'].includes(reason)) throw new Error('Invalid refresh reason.');
      if (pendingReason || busy) return false;
      pendingReason = reason;
      emit({ type: 'refresh-request', protocolVersion: PROTOCOL_VERSION, reason });
      return true;
    },
    async acknowledge() {
      if (busy) return;
      busy = true;
      const reason = pendingReason || 'requested';
      pendingReason = null;
      try { await refresh(reason); } finally { busy = false; }
    },
  };
}
