import { isIP } from 'node:net';
import { certificateError } from './errors.mjs';

export const MAX_IDENTITIES = 16;

/** Only literal LAN/loopback addresses and explicit local DNS names are certifiable. */
export function normalizeIdentity(value) {
  if (typeof value !== 'string' || !value || value.length > 253 || value.trim() !== value ||
      /[\s\u0000-\u001f\u007f/\\@?#%\[\]]/.test(value)) {
    throw certificateError('INVALID_IDENTITIES');
  }
  const family = isIP(value);
  if (family === 4) {
    const [a, b] = value.split('.').map(Number);
    if (a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) || (a === 169 && b === 254)) return value;
    throw certificateError('INVALID_IDENTITIES');
  }
  if (family === 6) {
    const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1).toLowerCase();
    const first = Number.parseInt(canonical.split(':')[0] || '0', 16);
    if (canonical === '::1' || (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80) {
      return canonical;
    }
    throw certificateError('INVALID_IDENTITIES');
  }
  const dns = value.toLowerCase();
  if (dns === 'localhost') return dns;
  if (!dns.endsWith('.local')) throw certificateError('INVALID_IDENTITIES');
  const labels = dns.split('.');
  if (labels.length < 2 || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw certificateError('INVALID_IDENTITIES');
  }
  return dns;
}

export function normalizeIdentities(identities) {
  if (!Array.isArray(identities) || identities.length === 0 || identities.length > MAX_IDENTITIES) {
    throw certificateError('INVALID_IDENTITIES');
  }
  return Object.freeze([...new Set(identities.map(normalizeIdentity))].sort());
}

export function validatePort(port) {
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw certificateError('INVALID_CONFIGURATION');
  }
  return port;
}
