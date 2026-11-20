/** Explicit fixture policy; production GO7 must derive its own advertised origins. */
export function createStrictUpgradePolicy({ origins }) {
  if (!Array.isArray(origins) || origins.length === 0) throw new TypeError('fixture-origins-required');
  const allowed = new Map(origins.map((value) => {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value
      || url.username || url.password) throw new TypeError('fixture-origin-invalid');
    return [value, { host: url.host, encrypted: url.protocol === 'https:' }];
  }));
  return (request) => {
    if (request.method !== 'GET' || request.url !== '/api/realtime/gravity-orchard') return false;
    const origin = request.headers?.origin;
    const host = request.headers?.host;
    if (typeof origin !== 'string' || typeof host !== 'string') return false;
    if (!Array.isArray(request.rawHeaders) || request.rawHeaders.length % 2 !== 0) return false;
    const values = { host: [], origin: [] };
    for (let index = 0; index < request.rawHeaders.length; index += 2) {
      const name = request.rawHeaders[index];
      if (typeof name !== 'string') return false;
      const key = name.toLowerCase();
      if (Object.hasOwn(values, key)) values[key].push(request.rawHeaders[index + 1]);
    }
    // Node's normalized headers can discard/join duplicates. Reject ambiguity
    // in the original request rather than trusting only that normalized view.
    if (values.host.length !== 1 || values.origin.length !== 1
      || values.host[0] !== host || values.origin[0] !== origin) return false;
    const expected = allowed.get(origin);
    // Do not infer the listener from X-Forwarded-Proto/Host or rewrite the request.
    return Boolean(expected && host === expected.host && Boolean(request.socket?.encrypted) === expected.encrypted);
  };
}
