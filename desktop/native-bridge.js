/** Injected by the owned native main window. Never served to phone browsers. */
(() => {
  if (window !== window.top || location.protocol !== 'http:' || location.hostname !== '127.0.0.1') return;
  const pending = new Map();
  const fail = code => Object.assign(new Error('Trusted local access is unavailable. Retry from this Mac.'), { code });
  // The native host runs one setup command at a time and rejects a command
  // that arrives while another is in progress. Send commands one after another
  // here, so a quick click during the setup screen's first status check waits
  // for that check instead of failing.
  const MAX_QUEUED = 4;
  let queued = 0;
  let previous = Promise.resolve();
  let pageClosed = false;
  const request = (operation, options) => {
    if (queued >= MAX_QUEUED) return Promise.reject(fail('BUSY'));
    queued++;
    const result = previous.then(() => send(operation, options));
    previous = result.catch(() => {});
    return result.finally(() => { queued--; });
  };
  const send = (operation, options) => new Promise((resolve, reject) => {
    if (pageClosed) { reject(fail('CANCELLED')); return; }
    const id = crypto.randomUUID();
    const timer = setTimeout(() => { pending.delete(id); reject(fail('TIMEOUT')); }, 20000);
    pending.set(id, { resolve, reject, timer });
    const query = new URLSearchParams({ id, operation, ...Object.fromEntries(Object.entries(options).map(([key, value]) => [key, String(value)])) });
    // Native consumes this bounded command locally and cancels navigation.
    // The URL contains no bearer, room token, certificate or filesystem path.
    location.href = 'https://sofa-native.invalid/secure?' + query;
  });
  Object.defineProperty(window, '__sofaSecureResult', { value: result => {
    const waiting = pending.get(result?.id);
    if (!waiting) return;
    clearTimeout(waiting.timer); pending.delete(result.id);
    if (!result.ok) waiting.reject(fail(result.code || 'SECURE_OPERATION_FAILED'));
    else waiting.resolve(result.publicTrust || result.status);
  }, writable: false, configurable: false });
  Object.defineProperty(window, 'sofaDesktopSecureLan', { value: Object.freeze({
    getStatus: () => request('getStatus', {}),
    provision: ({ replaceRoot = false } = {}) => request('provision', { replaceRoot }),
    exportPublicTrust: ({ format = 'pem' } = {}) => request('exportPublicTrust', { format }),
    remove: ({ mode = 'remove' } = {}) => request('remove', { mode }),
  }), writable: false, configurable: false });
  addEventListener('pagehide', () => {
    pageClosed = true;
    for (const waiting of pending.values()) { clearTimeout(waiting.timer); waiting.reject(fail('CANCELLED')); }
    pending.clear();
  }, { once: true });
})();
