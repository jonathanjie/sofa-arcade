import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createRealtimeCoordinator, readCoordinatorDiagnostics } from '../index.mjs';
import { simulation as defaultSimulation } from './simulation.mjs';
import { createStrictUpgradePolicy } from './upgrade-policy.mjs';

export const FIXTURE_ROOM = 'GO2FIX';
const ROOT = new URL('../../../../', import.meta.url);
const BROWSER_ROOT = new URL('ui/realtime/gravity-orchard/', ROOT);
const STATIC = new Map([
  ['/', ['fixture/index.html', 'text/html; charset=utf-8']],
  ['/fixture/index.html', ['fixture/index.html', 'text/html; charset=utf-8']],
  ['/fixture/app.mjs', ['fixture/app.mjs', 'text/javascript; charset=utf-8']],
  ['/fixture/styles.css', ['fixture/styles.css', 'text/css; charset=utf-8']],
  ['/realtime/index.mjs', ['index.mjs', 'text/javascript; charset=utf-8']],
  ['/realtime/lib/protocol.mjs', ['lib/protocol.mjs', 'text/javascript; charset=utf-8']],
]);
const VIEWERS = Object.freeze({
  host: Object.freeze({ role: 'host', playerId: null }),
  jon: Object.freeze({ role: 'player', playerId: 'jon' }),
  lydia: Object.freeze({ role: 'player', playerId: 'lydia' }),
});

const reply = (response, status, value) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(value));
};

async function readJSON(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 4096) throw new Error('fixture-body-large');
    chunks.push(chunk);
  }
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('fixture-body-invalid');
  return body;
}

/**
 * Standalone, loopback-only fixture. Its role picker is fake test authority and
 * must never be mounted in production. Tokens are random, in memory, no-store,
 * and issued only by same-origin POST; no URL, logs or diagnostics contain them.
 */
export async function createFixtureServer({
  port = 0,
  simulation = defaultSimulation,
  roomCode = FIXTURE_ROOM,
  scheduler = { now: () => performance.now(), setTimeout, clearTimeout },
} = {}) {
  const sessions = new Map();
  const checkpoints = new Map();
  const lifecycle = [];
  const nativeSockets = new Set();
  let clockOffset = 0;
  let writes = 0;
  let origin;
  let policy = () => false;
  let closed = false;
  const clock = { ...scheduler, now: () => scheduler.now() + clockOffset };
  const authorize = async ({ roomCode: requestedRoom, bearer }) => {
    const session = sessions.get(bearer);
    if (requestedRoom !== roomCode || !session || session.expiresAt <= performance.now()) return null;
    return { ...session.viewer };
  };
  const coordinator = createRealtimeCoordinator({
    authorize,
    validateUpgrade: (request) => policy(request),
    loadCheckpoint: async (code) => checkpoints.has(code) ? structuredClone(checkpoints.get(code)) : null,
    saveCheckpoint: async (code, checkpoint) => {
      checkpoints.set(code, structuredClone(checkpoint));
      writes += 1;
    },
    simulation, clock,
    onLifecycle: ({ roomCode: code, kind, view }) => {
      lifecycle.push({ roomCode: code, kind, phase: view.phase, tick: view.tick, runEpoch: view.runEpoch });
      if (lifecycle.length > 24) lifecycle.shift();
    },
  });

  const safeDiagnostics = () => ({
    fixture: true,
    writes,
    lifecycle: lifecycle.map((item) => ({ ...item })),
    transport: readCoordinatorDiagnostics(coordinator, roomCode),
  });

  const server = createServer(async (request, response) => {
    try {
      if (request.headers.host !== new URL(origin).host) return reply(response, 403, { code: 'fixture-host-denied' });
      const url = new URL(request.url, origin);
      if (url.origin !== origin) return reply(response, 403, { code: 'fixture-origin-denied' });
      const sameOrigin = request.headers.origin === origin;
      if (request.method === 'POST' && url.pathname === '/fixture/session' && !url.search) {
        if (!sameOrigin || request.headers['content-type'] !== 'application/json') return reply(response, 403, { code: 'fixture-origin-denied' });
        const body = await readJSON(request);
        if (Object.keys(body).length !== 1 || !Object.hasOwn(VIEWERS, body.viewer)) return reply(response, 400, { code: 'fixture-viewer-invalid' });
        while (sessions.size >= 32) sessions.delete(sessions.keys().next().value);
        const token = randomBytes(24).toString('base64url');
        sessions.set(token, { viewer: VIEWERS[body.viewer], expiresAt: performance.now() + 30 * 60_000 });
        return reply(response, 200, { roomCode, token, viewer: VIEWERS[body.viewer] });
      }
      if (request.method === 'GET' && url.pathname === '/fixture/health' && !url.search) {
        return reply(response, 200, { fixture: true, transportOnly: true, roomCode });
      }
      if (url.pathname === '/fixture/diagnostics' || url.pathname === '/fixture/control') {
        const authorization = request.headers.authorization;
        const bearer = typeof authorization === 'string' && authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
        const viewer = await authorize({ roomCode, bearer });
        if (!viewer || viewer.role !== 'host') return reply(response, 403, { code: 'fixture-host-only' });
        if (url.search) return reply(response, 400, { code: 'fixture-query-denied' });
        if (request.method === 'GET' && url.pathname === '/fixture/diagnostics') return reply(response, 200, safeDiagnostics());
        if (request.method !== 'POST' || url.pathname !== '/fixture/control' || !sameOrigin
          || request.headers['content-type'] !== 'application/json') return reply(response, 403, { code: 'fixture-origin-denied' });
        const body = await readJSON(request);
        if (Object.keys(body).length !== 1 || body.kind !== 'host-stall') return reply(response, 400, { code: 'fixture-control-invalid' });
        clockOffset += 1000;
        return reply(response, 200, { accepted: true, kind: 'host-stall' });
      }
      if (request.method === 'GET' && STATIC.has(url.pathname)) {
        if (url.search && !(url.pathname === '/' && [...url.searchParams.keys()].every((key) => key === 'viewer'))) {
          return reply(response, 400, { code: 'fixture-query-denied' });
        }
        const [path, contentType] = STATIC.get(url.pathname);
        const body = await readFile(new URL(path, BROWSER_ROOT));
        response.writeHead(200, {
          'Content-Type': contentType, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'self'; connect-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        });
        response.end(body);
        return;
      }
      reply(response, 404, { code: 'fixture-route-missing' });
    } catch {
      // Deliberately no body/token/request/error dumps on fixture failures.
      if (!response.headersSent) reply(response, 400, { code: 'fixture-request-failed' });
      else response.end();
    }
  });
  server.on('connection', (socket) => { nativeSockets.add(socket); socket.on('close', () => nativeSockets.delete(socket)); });
  server.on('upgrade', coordinator.handleUpgrade);
  await new Promise((resolveReady, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolveReady(); });
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  policy = createStrictUpgradePolicy({ origins: [origin] });
  try {
    await coordinator.startRoom({ roomCode, matchId: 'fixture-run-1', seed: 'fixture-orchard', options: { mode: 'practice' } });
  } catch (error) {
    await coordinator.close();
    for (const socket of nativeSockets) socket.destroy();
    await new Promise((done) => server.close(done));
    throw error;
  }
  return Object.freeze({
    origin, roomCode, coordinator,
    diagnostics: safeDiagnostics,
    async close() {
      if (closed) return;
      closed = true;
      await coordinator.close();
      server.off('upgrade', coordinator.handleUpgrade);
      for (const socket of nativeSockets) socket.destroy();
      await new Promise((done) => server.close(done));
      sessions.clear(); checkpoints.clear(); lifecycle.length = 0;
    },
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.GO2_FIXTURE_PORT ?? 4182);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new TypeError('fixture-port-invalid');
  const fixture = await createFixtureServer({ port });
  process.stdout.write(`Gravity Orchard transport fixture: ${fixture.origin}\n`);
  process.stdout.write('Loopback touch fixture only; phone sensors, LAN Wi-Fi and Tauri are not validated here.\n');
  let closing = false;
  const close = async () => { if (closing) return; closing = true; await fixture.close(); process.exitCode = 0; };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}
