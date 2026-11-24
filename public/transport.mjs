/** LAN capability is injected only by the local host, never guessed from an IP. */
export function readTransportConfig({ document: doc = globalThis.document, origin = globalThis.location?.origin || '' } = {}) {
  const mode = doc?.querySelector('meta[name="sofa-transport"]')?.getAttribute('content') === 'lan' ? 'lan' : 'cloud';
  let joinOrigin = origin;
  if (mode === 'lan') {
    try {
      const candidate = new URL(doc?.querySelector('meta[name="sofa-join-origin"]')?.getAttribute('content'));
      if (['http:', 'https:'].includes(candidate.protocol) && !candidate.username && !candidate.password) joinOrigin = candidate.origin;
    } catch {}
  }
  const orchard = mode === 'lan' && ['candidate', 'enabled'].includes(doc?.querySelector('meta[name="sofa-gravity-orchard"]')?.getAttribute('content'));
  return Object.freeze({ mode, joinOrigin, realtime: mode === 'lan', ...(orchard ? {gravityOrchard: true} : {}) });
}

/** Keep native listener identities intact; phones receive only usable LAN links. */
function phoneControllerOrigins(status, preferredOrigin) {
  if (status?.status !== 'ready' || status.enabled === false || !Array.isArray(status.controllerOrigins)) return [];
  let preferredHostname = '';
  try { preferredHostname = new URL(preferredOrigin).hostname; } catch {}
  const candidates = status.controllerOrigins.flatMap(value => {
    try {
      if (typeof value !== 'string' || value.length > 300) return [];
      const url = new URL(value), host = url.hostname.toLowerCase();
      if (url.protocol !== 'https:' || value !== url.origin || url.username || url.password ||
          url.search || url.hash || url.pathname !== '/') return [];
      const ip = host.split('.').map(Number);
      const localV4 = /^\d+\.\d+\.\d+\.\d+$/.test(host) && ip.every(part => Number.isInteger(part) && part >= 0 && part <= 255)
        && (ip[0] === 10 || (ip[0] === 172 && ip[1] >= 16 && ip[1] <= 31) || (ip[0] === 192 && ip[1] === 168) || (ip[0] === 169 && ip[1] === 254));
      const localName = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+local$/.test(host);
      const localV6 = /^\[(?:f[cd][0-9a-f]{2}|fe[89ab][0-9a-f]):[0-9a-f:]+\]$/.test(host);
      if (!localV4 && !localName && !localV6) return [];
      return [url];
    } catch { return []; }
  });
  candidates.sort((a, b) => Number(b.hostname === preferredHostname) - Number(a.hostname === preferredHostname));
  return [...new Set(candidates.map(url => url.origin))];
}

/** A phone QR must never point at the Mac's own loopback listener. */
export function trustedPhoneOrigin(status, preferredOrigin) {
  return phoneControllerOrigins(status, preferredOrigin)[0] || null;
}

/** Presentation only: do not replace native authority/status with this projection. */
export function phoneSetupStatus(status, preferredOrigin) {
  const controllerOrigins = phoneControllerOrigins(status, preferredOrigin);
  return { ...status, controllerOrigins,
    status: status?.status === 'ready' && !controllerOrigins.length ? 'failed' : status?.status };
}

/** Handles arbitrary UTF-8/text chunk boundaries in a server-sent event stream. */
export function createEventDecoder(onEvent) {
  let buffer = '';
  return chunk => {
    buffer = (buffer + chunk).replaceAll('\r\n', '\n');
    if (buffer.length > 1024 * 1024) throw new Error('Live update exceeded its size limit.');
    let end;
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      let type = 'message';
      const data = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) type = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (data.length) onEvent(type, JSON.parse(data.join('\n')));
    }
  };
}

/**
 * Authenticated fetch/SSE with automatic reconnect. The bearer stays in the
 * Authorization header, never in the address or QR. Returns an idempotent stop.
 */
export function subscribeRoom({ code, token, onRoom, onConnection = () => {}, onStatus = () => {}, fetcher = globalThis.fetch, retryMs = 500, idleTimeoutMs = 30_000 }) {
  if (!/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/.test(code) || !/^[A-Za-z0-9_-]{24,128}$/.test(token || '')) {
    throw new Error('A joined room is required for live updates.');
  }
  let stopped = false;
  let controller = null;
  let activeReader = null;
  let retryTimer = null;
  let idleTimer = null;
  let failures = 0;
  let attempted = false;
  // Preserve Sofa Kingdoms' string callback; new views receive the frozen
  // contract's object shape, including passive stream loss and terminal auth.
  const status = (legacy, value) => {
    if (stopped) return;
    onConnection(legacy);
    onStatus(value);
  };
  const watch = () => {
    clearTimeout(idleTimer);
    if (idleTimeoutMs > 0) idleTimer = setTimeout(() => {
      controller?.abort();
      void activeReader?.cancel().catch(() => {});
    }, idleTimeoutMs);
  };

  async function connect() {
    if (stopped) return;
    controller = new AbortController();
    status('connecting', { state: attempted ? 'reconnecting' : 'connecting' });
    attempted = true;
    watch();
    let terminal = false;
    try {
      const response = await fetcher(`/api/rooms/${encodeURIComponent(code)}/events`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
        cache: 'no-store', signal: controller.signal,
      });
      if (stopped) { await response.body?.cancel().catch(() => {}); return; }
      terminal = [401, 403, 404, 410].includes(response.status);
      if (!response.ok || !response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('Live updates are unavailable.');
      const reader = response.body.getReader();
      activeReader = reader;
      const decoder = new TextDecoder();
      const decode = createEventDecoder((type, value) => {
        if (type === 'error') {
          terminal = [401, 403, 404, 410].includes(value.status);
          throw new Error('The live room session ended.');
        }
        if (type === 'room' && value?.code === code && Number.isSafeInteger(value.revision) && value.revision >= 0) {
          failures = 0;
          watch();
          status('connected', { state: 'connected' });
          if (!stopped) onRoom(value);
        }
      });
      try {
        while (!stopped) {
          const { value, done } = await reader.read();
          if (done) break;
          decode(decoder.decode(value, { stream: true }));
        }
      } finally { await reader.cancel().catch(() => {}); if (activeReader === reader) activeReader = null; }
    } catch { /* Polling can remain available while the stream reconnects. */ }
    finally {
      clearTimeout(idleTimer);
      if (!stopped) {
        status('offline', terminal
          ? { state: 'error', message: 'This room session ended. Rejoin from the game page.' }
          : { state: 'offline', message: 'Live updates disconnected. Reconnecting…' });
        if (!terminal && !stopped) {
          const delay = Math.min(5000, retryMs * 2 ** Math.min(failures++, 4));
          retryTimer = setTimeout(connect, delay);
        }
      }
    }
  }
  void connect();
  return () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(retryTimer);
    clearTimeout(idleTimer);
    controller?.abort();
    void activeReader?.cancel().catch(() => {});
  };
}
