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
  return Object.freeze({ mode, joinOrigin, realtime: mode === 'lan' });
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
export function subscribeRoom({ code, token, onRoom, onConnection = () => {}, fetcher = globalThis.fetch, retryMs = 500 }) {
  if (!/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/.test(code) || !/^[A-Za-z0-9_-]{24,128}$/.test(token || '')) {
    throw new Error('A joined room is required for live updates.');
  }
  let stopped = false;
  let controller = null;
  let retryTimer = null;
  let failures = 0;
  const status = value => { if (!stopped) onConnection(value); };

  async function connect() {
    if (stopped) return;
    controller = new AbortController();
    status('connecting');
    let terminal = false;
    try {
      const response = await fetcher(`/api/rooms/${encodeURIComponent(code)}/events`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
        cache: 'no-store', signal: controller.signal,
      });
      terminal = [401, 403, 404, 410].includes(response.status);
      if (!response.ok || !response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('Live updates are unavailable.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const decode = createEventDecoder((type, value) => {
        if (type === 'error') {
          terminal = [401, 403, 404, 410].includes(value.status);
          throw new Error('The live room session ended.');
        }
        if (type === 'room' && value?.code === code && Number.isSafeInteger(value.revision)) {
          failures = 0;
          status('connected');
          if (!stopped) onRoom(value);
        }
      });
      try {
        while (!stopped) {
          const { value, done } = await reader.read();
          if (done) break;
          decode(decoder.decode(value, { stream: true }));
        }
      } finally { await reader.cancel().catch(() => {}); }
    } catch { /* Polling can remain available while the stream reconnects. */ }
    finally {
      if (!stopped) {
        status('offline');
        if (!terminal) {
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
    controller?.abort();
  };
}
