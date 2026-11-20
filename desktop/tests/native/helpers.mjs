/** Shared native test support. Never serializes room credentials or SQLite files. */
import assert from 'node:assert/strict';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createConnection } from 'node:net';

export const runFile = promisify(execFile);
export const desktopDir = fileURLToPath(new URL('../../', import.meta.url));
export const repoDir = path.dirname(desktopDir);
export const identifier = 'com.sofaarcade.desktop';
export const dataDir = path.join(homedir(), 'Library', 'Application Support', identifier);
export const safePath = '/usr/bin:/bin:/usr/sbin:/sbin';
export const evidenceDir = path.resolve(process.env.SOFA_EVIDENCE_DIR || path.join(desktopDir, 'evidence'));
export const statusPath = path.join(dataDir, 'host-status.json');
export const binaryFor = app => path.join(app, 'Contents', 'MacOS', 'sofa-arcade');

export function argument(name, fallback) {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
}

export async function exists(filename) {
  try { await access(filename); return true; } catch { return false; }
}

export async function requireFreshProfile() {
  assert.equal(process.platform, 'darwin', 'These are native macOS tests; Linux/browser runs do not qualify.');
  assert.equal(await exists(dataDir), false,
    'Native tests require a fresh macOS user profile. Existing Sofa Arcade data is preserved; use a disposable test user.');
  await mkdir(evidenceDir, { recursive: true });
}

export async function saveEvidence(name, value) {
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(path.join(evidenceDir, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
}

export async function poll(check, { timeout = 15000, message = 'Native state did not become ready' } = {}) {
  const end = Date.now() + timeout;
  let lastError;
  while (Date.now() < end) {
    try { const result = await check(); if (result) return result; } catch (error) { lastError = error; }
    await delay(100);
  }
  throw new Error(`${message}${lastError ? ` (${lastError.code || lastError.name})` : ''}`);
}

export async function hostStatus(predicate = () => true, options) {
  return poll(async () => {
    const info = JSON.parse(await readFile(statusPath, 'utf8'));
    return predicate(info) ? info : false;
  }, options);
}

export async function portOpen(port) {
  return new Promise(resolve => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(500);
    const finish = value => { socket.destroy(); resolve(value); };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

export async function waitPortClosed(port) {
  return poll(async () => !(await portOpen(port)), { timeout: 12000, message: 'Owned LAN listener remained open after app exit' });
}

export async function waitProcessExit(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return;
  return poll(async () => {
    try { await runFile('/bin/ps', ['-p', String(pid), '-o', 'pid=']); return false; }
    catch { return true; }
  }, { timeout: 15000, message: 'Native test process did not exit; preserve its data profile' });
}

export async function request(origin, route, { token, body, headers = {} } = {}) {
  const method = body === undefined ? 'GET' : 'POST';
  const response = await fetch(origin + route, {
    method,
    headers: { ...(body === undefined ? {} : { Origin: origin, 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(5000),
  });
  const value = await response.json();
  assert.ok(response.ok, `Local ${method} ${route.split('/').at(-1)} failed (${response.status}, ${value.code || 'no code'})`);
  return { status: response.status, body: value };
}

export async function joinBoth(origin, code) {
  const tokens = {};
  for (const playerId of ['jon', 'lydia']) {
    const joined = await request(origin, `/api/rooms/${code}/join`, { body: { playerId, clientId: crypto.randomUUID() } });
    assert.equal(joined.status, 200);
    tokens[playerId] = joined.body.playerToken;
    assert.equal(typeof tokens[playerId], 'string');
  }
  return tokens;
}

export async function listen(origin, code, token) {
  const abort = new AbortController();
  const response = await fetch(`${origin}/api/rooms/${code}/events`, {
    headers: { Authorization: `Bearer ${token}` }, signal: abort.signal,
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const rooms = [];
  let pending = '';
  let stopped = false;
  const pumping = (async () => {
    try {
      while (!stopped) {
        const { done, value } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        let i;
        while ((i = pending.indexOf('\n\n')) !== -1) {
          const event = pending.slice(0, i); pending = pending.slice(i + 2);
          if (event.startsWith('event: room\n')) rooms.push(JSON.parse(event.slice('event: room\ndata: '.length)));
        }
      }
    } catch (error) { if (!stopped) throw error; }
  })();
  // Keep errors observable without an unhandled rejection while the test acts.
  let streamError;
  pumping.catch(error => { streamError = error; });
  return {
    rooms,
    async revision(value) {
      return poll(() => {
        if (streamError) throw streamError;
        return rooms.find(room => room.revision === value);
      }, { timeout: 2500, message: 'No immediate SSE update within 2.5 seconds (server heartbeat is 10 seconds)' });
    },
    async close() {
      stopped = true; abort.abort(); await reader.cancel().catch(() => {}); await pumping;
    },
  };
}

export async function verifyAssets(origin) {
  const source = JSON.parse(await readFile(path.join(desktopDir, 'runtime-manifest.json'), 'utf8'));
  let checked = 0;
  for (const entry of source.files) {
    if (!entry.path.startsWith('public/assets/')) continue;
    const route = '/' + entry.path.slice('public/'.length);
    const response = await fetch(origin + route, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200, `Packaged asset failed: ${route}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    assert.ok(buffer.length > 0, `Packaged asset empty: ${route}`);
    checked++;
  }
  assert.ok(checked >= 4, 'Expected artwork, QR code source, and its license in bundle');
  return checked;
}
