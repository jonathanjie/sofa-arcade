/**
 * A server-only composition example for GO7. Config comes from trusted host
 * startup, never request headers. It does not authenticate rooms or host actions.
 * Forwarded/X-Forwarded-* headers are deliberately neither consulted nor changed.
 */
import { normalizeIdentities } from './certificates/index.mjs';

const REJECT = Object.freeze({
  host: Object.freeze({ ok: false, status: 421, code: 'host_rejected' }),
  origin: Object.freeze({ ok: false, status: 403, code: 'origin_rejected' }),
  address: Object.freeze({ ok: false, status: 400, code: 'address_rejected' }),
});

function configuredOrigins(values, scheme) {
  if (!Array.isArray(values) || values.length > 32) throw new TypeError('Invalid local origin configuration.');
  const result = new Set();
  for (const value of values) {
    let url;
    try { url = new URL(value); } catch { throw new TypeError('Invalid local origin configuration.'); }
    if (typeof value !== 'string' || url.protocol !== `${scheme}:` || value !== url.origin
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash
      || !Number.isInteger(Number(url.port || (scheme === 'https' ? 443 : 80)))
      || Number(url.port || (scheme === 'https' ? 443 : 80)) < 1) {
      throw new TypeError('Invalid local origin configuration.');
    }
    // URL represents IPv6 hostnames in brackets; SAN identities do not.
    normalizeIdentities([url.hostname.replace(/^\[|\]$/g, '')]);
    result.add(value);
  }
  return result;
}

function header(request, name) {
  if (!Array.isArray(request?.rawHeaders) || request.rawHeaders.length % 2) return { invalid: true };
  let count = 0;
  let value;
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (typeof request.rawHeaders[index] !== 'string' || typeof request.rawHeaders[index + 1] !== 'string') return { invalid: true };
    if (request.rawHeaders[index].toLowerCase() === name) {
      count += 1;
      value = request.rawHeaders[index + 1];
    }
  }
  if (count > 1 || (count === 1 && request.headers?.[name] !== value)
    || (count === 0 && request.headers?.[name] !== undefined)) return { invalid: true };
  return { count, value };
}

/**
 * HTTP and HTTPS origin sets must come from the actual listeners' bound ports.
 * validateRequest permits Origin-less GET/HEAD navigation; state-changing verbs
 * require an exact same-origin Origin. validateUpgrade always requires Origin.
 */
export function createRequestPolicy({ httpOrigins = [], httpsOrigins = [], upgradePath = '/api/realtime/gravity-orchard' } = {}) {
  const origins = { http: configuredOrigins(httpOrigins, 'http'), https: configuredOrigins(httpsOrigins, 'https') };
  if (typeof upgradePath !== 'string' || !/^\/[a-zA-Z0-9/_-]+$/.test(upgradePath) || upgradePath.startsWith('//')) {
    throw new TypeError('Invalid local upgrade route configuration.');
  }

  function validateRequest(request) {
    const suppliedHost = header(request, 'host');
    if (suppliedHost.invalid || suppliedHost.count !== 1 || !suppliedHost.value || suppliedHost.value.length > 300) return REJECT.host;
    const scheme = request?.socket?.encrypted === true ? 'https' : 'http';
    let authority;
    try { authority = new URL(`${scheme}://${suppliedHost.value}`); } catch { return REJECT.host; }
    const defaultPort = scheme === 'https' ? 443 : 80;
    const rawHost = suppliedHost.value.toLowerCase();
    const canonicalHost = authority.host;
    if (authority.username || authority.password || authority.pathname !== '/' || authority.search || authority.hash
      || (rawHost !== canonicalHost && !(authority.port === '' && rawHost === `${authority.hostname}:${defaultPort}`))
      || !origins[scheme].has(authority.origin)) return REJECT.host;

    const suppliedOrigin = header(request, 'origin');
    if (suppliedOrigin.invalid || (suppliedOrigin.count === 1 && suppliedOrigin.value !== authority.origin)
      || (suppliedOrigin.count === 0 && !['GET', 'HEAD'].includes(request.method))) return REJECT.origin;
    if (typeof request.url !== 'string' || request.url.length > 8192 || !request.url.startsWith('/')
      || request.url.startsWith('//') || /[\\#\u0000-\u0020\u007f]/.test(request.url)) return REJECT.address;
    let url;
    try { url = new URL(request.url, authority.origin); } catch { return REJECT.address; }
    if (url.origin !== authority.origin || url.username || url.password || url.hash) return REJECT.address;
    return Object.freeze({ ok: true, origin: authority.origin, scheme, url });
  }

  function validateUpgrade(request) {
    const result = validateRequest(request);
    if (!result.ok || request.method !== 'GET' || request.url !== upgradePath) return false;
    const origin = header(request, 'origin');
    const upgrade = header(request, 'upgrade');
    const connection = header(request, 'connection');
    return origin.count === 1 && !origin.invalid && origin.value === result.origin
      && !upgrade.invalid && upgrade.count === 1 && upgrade.value.toLowerCase() === 'websocket'
      && !connection.invalid && connection.count === 1
      && connection.value.split(',').some(value => value.trim().toLowerCase() === 'upgrade');
  }
  return Object.freeze({ validateRequest, validateUpgrade });
}
