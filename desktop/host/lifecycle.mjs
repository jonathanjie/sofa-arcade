/** Desktop-only lifecycle around the shared LAN host. No game/server forks. */
export const PROTOCOL_VERSION = 1;
export const MAX_RECORD_BYTES = 4096;
export const MAX_COMMAND_BYTES = 256;

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
