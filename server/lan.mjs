/** Local, dependency-free host. The same authoritative room API runs on the Mac. */
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { networkInterfaces } from 'node:os';
import { performance } from 'node:perf_hooks';
import { readFile, readdir, mkdir, realpath, chmod, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_BODY_BYTES } from './rooms.mjs';
import { getGame } from '../games/catalog.mjs';
import { createGravityOrchardHost } from './gravity-orchard-host.mjs';
import { GRAVITY_BROWSER_FILES, GRAVITY_ASSET_FILES } from './gravity-orchard-delivery.mjs';
import { createRequestPolicy } from './runtime/gravity-orchard-dependencies.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const ROOM_CODE = '[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}';
const SOURCES = new Map([
  ...GRAVITY_BROWSER_FILES.map(({ url, source }) => [url, source]),
  ['/app.js', 'ui/app.js'], ['/styles.css', 'ui/styles.css'],
  ['/audio.js', 'ui/audio.js'], ['/score.mjs', 'ui/score.mjs'],
  ['/motion.js', 'ui/motion.js'], ['/motion.css', 'ui/motion.css'],
  ['/board-view.mjs', 'ui/board-view.mjs'], ['/board-view.css', 'ui/board-view.css'],
  ['/action-queue.mjs', 'ui/action-queue.mjs'],
  ['/room-client.mjs', 'ui/room-client.mjs'],
  ['/collection-game.mjs', 'ui/collection-game.mjs'],
  ['/collection-load.mjs', 'ui/collection-load.mjs'],
  ['/collection-tutorial.mjs', 'ui/collection-tutorial.mjs'],
  ['/transport.mjs', 'ui/transport.mjs'], ['/engine.mjs', 'game/engine.mjs'],
  ['/games/catalog.mjs', 'games/catalog.mjs'],
  ['/games/odd-laws-society/catalog.mjs', 'games/odd-laws-society/catalog.mjs'],
  ['/games/odd-laws-society/preview.mjs', 'games/odd-laws-society/preview.mjs'],
  ['/games/odd-laws-society/rules.mjs', 'games/odd-laws-society/rules.mjs'],
  ['/games/odd-laws-society/errors.mjs', 'games/odd-laws-society/errors.mjs'],
  ...['score.mjs', 'effects.mjs'].map(file => [`/media/sofa-menu/${file}`, `ui/media/sofa-menu/${file}`]),
  ...['score.mjs', 'effects.mjs'].map(file => [`/media/odd-laws-society/${file}`, `ui/media/odd-laws-society/${file}`]),
  ...[
    'index.mjs', 'shared.mjs', 'graphics.mjs', 'motion.mjs', 'drawers.mjs',
    'tv.mjs', 'phone.mjs', 'tutorial.mjs', 'view.css', 'tv.css', 'phone.css', 'tutorial.css',
  ].map(file => [`/games/odd-laws-society/${file}`, `ui/games/odd-laws-society/${file}`]),
]);
// Only declared delivery assets are public; authoring sources remain in the checkout.
const ASSETS = new Set([
  ...GRAVITY_ASSET_FILES.map(file => file.replace(/^public/, '')),
  '/assets/sofa-room.png',
  '/assets/odd-laws-cover.webp',
  '/assets/characters.png',
  '/assets/qrcode.js',
  '/assets/qrcode-LICENSE.txt',
  '/favicon.svg',
  '/manifest.webmanifest',
  '/assets/odd-laws-society/buildings/button-workshop.webp',
  '/assets/odd-laws-society/buildings/clockwork-studio.webp',
  '/assets/odd-laws-society/buildings/community-garden.webp',
  '/assets/odd-laws-society/buildings/concert-pavilion.webp',
  '/assets/odd-laws-society/buildings/corner-shop.webp',
  '/assets/odd-laws-society/buildings/debate-hall.webp',
  '/assets/odd-laws-society/buildings/grand-bazaar.webp',
  '/assets/odd-laws-society/buildings/grand-clock.webp',
  '/assets/odd-laws-society/buildings/high-court.webp',
  '/assets/odd-laws-society/buildings/lala-monument.webp',
  '/assets/odd-laws-society/buildings/night-market.webp',
  '/assets/odd-laws-society/buildings/observatory.webp',
  '/assets/odd-laws-society/buildings/opera-house.webp',
  '/assets/odd-laws-society/buildings/petition-kiosk.webp',
  '/assets/odd-laws-society/buildings/pocket-theatre.webp',
  '/assets/odd-laws-society/buildings/public-library.webp',
  '/assets/odd-laws-society/buildings/quilt-bridge.webp',
  '/assets/odd-laws-society/buildings/tea-stall.webp',
  '/assets/odd-laws-society/characters/jon-acting.webp',
  '/assets/odd-laws-society/characters/jon-celebrate.webp',
  '/assets/odd-laws-society/characters/jon-disappointed.webp',
  '/assets/odd-laws-society/characters/jon-idle.webp',
  '/assets/odd-laws-society/characters/jon-thinking.webp',
  '/assets/odd-laws-society/characters/lala-celebrate.webp',
  '/assets/odd-laws-society/characters/lala-idle.webp',
  '/assets/odd-laws-society/characters/lala-stamp.webp',
  '/assets/odd-laws-society/characters/lala-thinking.webp',
  '/assets/odd-laws-society/characters/lydia-acting.webp',
  '/assets/odd-laws-society/characters/lydia-celebrate.webp',
  '/assets/odd-laws-society/characters/lydia-disappointed.webp',
  '/assets/odd-laws-society/characters/lydia-idle.webp',
  '/assets/odd-laws-society/characters/lydia-thinking.webp',
  '/assets/odd-laws-society/guilds/civic.svg',
  '/assets/odd-laws-society/guilds/commerce.svg',
  '/assets/odd-laws-society/guilds/craft.svg',
  '/assets/odd-laws-society/guilds/culture.svg',
  '/assets/odd-laws-society/laws/diversity-parade.svg',
  '/assets/odd-laws-society/laws/everything-is-art.svg',
  '/assets/odd-laws-society/laws/fashionable-streets.svg',
  '/assets/odd-laws-society/laws/honest-wages.svg',
  '/assets/odd-laws-society/laws/industrial-pride.svg',
  '/assets/odd-laws-society/laws/mandatory-applause.svg',
  '/assets/odd-laws-society/laws/open-tender.svg',
  '/assets/odd-laws-society/laws/public-grants.svg',
  '/assets/odd-laws-society/laws/public-service-day.svg',
  '/assets/odd-laws-society/laws/shop-local.svg',
  '/assets/odd-laws-society/laws/small-shop-supremacy.svg',
  '/assets/odd-laws-society/laws/workshop-week.svg',
  '/assets/odd-laws-society/manifest.json',
  '/assets/odd-laws-society/props/coin.svg',
  '/assets/odd-laws-society/props/envelope-open.svg',
  '/assets/odd-laws-society/props/envelope-sealed.svg',
  '/assets/odd-laws-society/props/influence.svg',
  '/assets/odd-laws-society/props/stamp.svg',
  '/assets/odd-laws-society/props/street-glow.svg',
  '/assets/odd-laws-society/LICENSE-NOTES.md',
]);
const TYPES = {
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};

/** Explicit, trusted startup entries only; never supplied through an HTTP API. */
async function browserSources(root, entries) {
  if (!Array.isArray(entries) || entries.length > 128) throw new TypeError('browserModules must be an explicit file list.');
  const sources = new Map(SOURCES);
  const safeSegments = value => typeof value === 'string' && /^[A-Za-z0-9_./-]+$/.test(value)
    && value.split('/').every(part => part && !part.startsWith('.')
      && !/(?:^|[._-])(?:tests?|spec|fixtures?|private)(?:[._-]|$)/i.test(part));
  for (const entry of entries) {
    const source = entry?.source;
    const url = entry?.url;
    const publicHelper = typeof source === 'string' && /^games\/[a-z0-9-]+\/(?:catalog|preview)\.mjs$/.test(source);
    const publicUi = typeof source === 'string' && /^ui\/(?:games|media)\/[a-z0-9-]+\/.+\.(?:m?js|css)$/.test(source);
    const publicUrl = typeof url === 'string' && /^\/(?:games|media|ui\/games|ui\/media)\/.+\.(?:m?js|css)$/.test(url);
    if (!safeSegments(source) || (!publicHelper && !publicUi) || !publicUrl
      || !safeSegments(url.slice(1)) || sources.has(url)) throw new TypeError('Unsafe or duplicate browser module entry.');
    const expected = path.join(root, source);
    let canonical;
    try { canonical = await realpath(expected); } catch { throw new TypeError('Browser module entry must name an existing file.'); }
    // A harmless-looking UI alias must not expose private code via a symlink,
    // even when the target happens to be elsewhere inside the same checkout.
    if (canonical !== expected || !(await stat(canonical)).isFile()) throw new TypeError('Browser module entries must be regular source files.');
    sources.set(url, source);
  }
  return sources;
}

function localAddresses() {
  let interfaces;
  try { interfaces = networkInterfaces(); } catch { return []; }
  const values = Object.values(interfaces).flat().filter(Boolean);
  const addresses = values.filter(item => item.family === 'IPv4' && !item.internal)
    .map(item => item.address);
  const privateAddress = ip => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
  return [...new Set(addresses)].sort((a, b) => Number(privateAddress(b)) - Number(privateAddress(a)));
}

function escapeAttribute(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

/** Optional host-only observations: never include SQL, bindings, results or paths. */
function observeSqlite(database, onRuntimeTiming) {
  if (!onRuntimeTiming) return database;
  const measure = (operation, action) => {
    const atMs = performance.now();
    try { return action(); }
    finally {
      try { onRuntimeTiming({ operation, atMs, durationMs: performance.now() - atMs }); }
      catch { /* Diagnostics cannot alter the database result or exception. */ }
    }
  };
  const statement = value => new Proxy(value, { get(target, key) {
    const method = Reflect.get(target, key, target);
    if (typeof method !== 'function') return method;
    if (['get', 'all', 'run'].includes(key)) return (...args) => measure(`sqlite.${key}`, () => Reflect.apply(method, target, args));
    return method.bind(target);
  } });
  return new Proxy(database, { get(target, key) {
    const method = Reflect.get(target, key, target);
    if (typeof method !== 'function') return method;
    if (key === 'prepare') return (...args) => statement(measure('sqlite.prepare', () => Reflect.apply(method, target, args)));
    if (key === 'exec') return (...args) => {
      const command = typeof args[0] === 'string' ? args[0].trim().toUpperCase() : '';
      const operation = command === 'BEGIN' || command === 'BEGIN IMMEDIATE' ? 'sqlite.begin'
        : command === 'COMMIT' ? 'sqlite.commit' : command === 'ROLLBACK' ? 'sqlite.rollback' : 'sqlite.exec';
      return measure(operation, () => Reflect.apply(method, target, args));
    };
    return method.bind(target);
  } });
}

/** Preserve handles, cancellation, receiver and clock values while observing callbacks. */
function observeRealtimeClock(clock, onRuntimeTiming) {
  if (!onRuntimeTiming) return clock;
  const source = clock === undefined ? {
    now: () => performance.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: handle => clearTimeout(handle),
  } : clock;
  // Let the coordinator retain its existing validation/error for an invalid clock.
  if (['now', 'setTimeout', 'clearTimeout'].some(key => typeof source?.[key] !== 'function')) return clock;
  return {
    now: () => source.now(),
    setTimeout(fn, delayMs) {
      const dueAt = source.now() + delayMs;
      return source.setTimeout(function (...args) {
        const atMs = performance.now(), lateByMs = Math.max(0, source.now() - dueAt);
        try { return Reflect.apply(fn, this, args); }
        finally {
          try { onRuntimeTiming({ operation: 'realtime.timer', atMs, durationMs: performance.now() - atMs, delayMs, lateByMs }); }
          catch { /* Diagnostics cannot alter scheduling or callback failures. */ }
        }
      }, delayMs);
    },
    clearTimeout: handle => source.clearTimeout(handle),
  };
}

async function openDatabase(filename, root, onRuntimeTiming) {
  if (filename !== ':memory:') await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const sqlite = observeSqlite(new DatabaseSync(filename), onRuntimeTiming);
  try {
    sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    sqlite.exec('CREATE TABLE IF NOT EXISTS sofa_lan_migrations (name TEXT PRIMARY KEY NOT NULL)');
    const migrations = (await readdir(path.join(root, 'drizzle'))).filter(name => name.endsWith('.sql')).sort();
    for (const name of migrations) {
      if (sqlite.prepare('SELECT name FROM sofa_lan_migrations WHERE name = ?').get(name)) continue;
      const sql = await readFile(path.join(root, 'drizzle', name), 'utf8');
      sqlite.exec('BEGIN');
      try {
        sqlite.exec(sql);
        sqlite.prepare('INSERT INTO sofa_lan_migrations (name) VALUES (?)').run(name);
        sqlite.exec('COMMIT');
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    }
    if (filename !== ':memory:') await chmod(filename, 0o600);
    const DB = { prepare(sql) {
      const statement = sqlite.prepare(sql);
      const bound = args => ({
        bind(...values) { return bound(values); },
        async first() { return statement.get(...args) || null; },
        async run() { return { success: true, meta: { changes: Number(statement.run(...args).changes) } }; },
      });
      return bound([]);
    } };
    return { sqlite, DB };
  } catch (error) { sqlite.close(); throw error; }
}

function respondJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

async function respondWeb(response, result) {
  response.writeHead(result.status, Object.fromEntries(result.headers));
  response.end(Buffer.from(await result.arrayBuffer()));
}

async function bodyBytes(request) {
  const declared = Number(request.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    request.resume();
    throw Object.assign(new Error('That request is too large.'), { status: 413 });
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    const clean = () => { request.off('data', data); request.off('end', end); request.off('error', error); };
    const error = value => { clean(); reject(value); };
    const end = () => { clean(); resolve(Buffer.concat(chunks)); };
    const data = chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        clean(); request.resume();
        reject(Object.assign(new Error('That request is too large.'), { status: 413 }));
      } else chunks.push(chunk);
    };
    request.on('data', data); request.once('end', end); request.once('error', error);
  });
}

/** Starts one LAN host; returned close() shuts down streams and its database. */
export async function startLanServer({
  root = PROJECT_ROOT,
  databasePath = path.join(root, '.sofa-lan', 'rooms.sqlite'),
  host = '0.0.0.0',
  port = 4177,
  heartbeatMs = 10_000,
  roomApi,
  browserModules = [],
  enableGravityOrchard = getGame('gravity-orchard')?.status === 'playable',
  realtimeClock,
  realtimeSeed,
  onRuntimeTiming,
} = {}) {
  if (roomApi !== undefined && typeof roomApi !== 'function') throw new TypeError('roomApi must be an authoritative request handler.');
  if (realtimeSeed !== undefined && (typeof realtimeSeed !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(realtimeSeed))) throw new TypeError('Invalid realtime seed.');
  if (typeof enableGravityOrchard !== 'boolean') throw new TypeError('enableGravityOrchard must be boolean.');
  if (!Number.isFinite(heartbeatMs) || heartbeatMs < 1) throw new TypeError('heartbeatMs must be positive.');
  if (onRuntimeTiming !== undefined && typeof onRuntimeTiming !== 'function') throw new TypeError('onRuntimeTiming must be a function.');
  root = await realpath(root);
  const sources = await browserSources(root, browserModules);
  const { sqlite, DB } = await openDatabase(databasePath, root, onRuntimeTiming);
  const addresses = localAddresses();
  const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]', ...addresses]);
  const streams = new Map();
  let actualPort = port;
  let closed = false;
  let closing = null;
  const pendingApi = new Set();
  let requestPolicy;
  let secureStatus = Object.freeze({ enabled: false, status: 'disabled', controllerOrigins: [], requiresPhoneTrust: false });
  function makePolicy(httpsOrigins) {
    const tlsPolicy = createRequestPolicy({ httpsOrigins });
    function validateRequest(request) {
      if (request.socket.encrypted === true) return tlsPolicy.validateRequest(request);
      const header = name => {
        const values = [];
        for (let i = 0; i < request.rawHeaders.length; i += 2) if (request.rawHeaders[i].toLowerCase() === name) values.push(request.rawHeaders[i + 1]);
        return values;
      };
      const hosts = header('host');
      let authority;
      try { authority = new URL(`http://${hosts[0]}`); } catch {}
      if (hosts.length !== 1 || hosts[0] !== request.headers.host || !authority || authority.username || authority.password
        || authority.pathname !== '/' || authority.search || authority.hash
        || (hosts[0].toLowerCase() !== authority.host && !(actualPort === 80 && hosts[0].toLowerCase() === `${authority.hostname}:80`))
        || !allowedHosts.has(authority.hostname) || Number(authority.port || 80) !== actualPort) {
        return { ok: false, status: 421, code: 'host_rejected' };
      }
      const origins = header('origin');
      if (origins.length > 1 || (origins.length === 1 && (origins[0] !== authority.origin || request.headers.origin !== origins[0]))) {
        return { ok: false, status: 403, code: 'origin_rejected' };
      }
      if (typeof request.url !== 'string' || request.url.length > 8192 || !request.url.startsWith('/')
        || request.url.startsWith('//') || /[\\#\u0000-\u0020\u007f]/.test(request.url)) return { ok: false, status: 400, code: 'address_rejected' };
      let url;
      try { url = new URL(request.url, authority.origin); } catch { return { ok: false, status: 400, code: 'address_rejected' }; }
      if (url.origin !== authority.origin) return { ok: false, status: 400, code: 'address_rejected' };
      return { ok: true, origin: authority.origin, scheme: 'http', url };
    }
    return {
      validateRequest,
      validateUpgrade(request) {
        if (request.socket.encrypted === true) return tlsPolicy.validateUpgrade(request);
        const result = validateRequest(request);
        const count = name => request.rawHeaders.filter((value, i) => i % 2 === 0 && value.toLowerCase() === name).length;
        return result.ok && request.method === 'GET' && request.url === '/api/realtime/gravity-orchard'
          && count('origin') === 1 && request.headers.origin === result.origin
          && count('upgrade') === 1 && request.headers.upgrade?.toLowerCase() === 'websocket'
          && count('connection') === 1 && request.headers.connection?.split(',').some(value => value.trim().toLowerCase() === 'upgrade');
      },
    };
  }
  const refreshPolicy = () => { requestPolicy = makePolicy(secureStatus.controllerOrigins); };
  function setSecureControllerStatus(status) {
    const statuses = ['disabled', 'needs-setup', 'ready', 'certificate-expired', 'address-mismatch', 'failed'];
    if (!status || typeof status.enabled !== 'boolean' || !statuses.includes(status.status)
      || typeof status.requiresPhoneTrust !== 'boolean' || !Array.isArray(status.controllerOrigins)
      || status.controllerOrigins.length > 32 || (status.status !== 'ready' && status.controllerOrigins.length)
      || (status.status === 'ready' && (!status.enabled || !status.requiresPhoneTrust))) throw new TypeError('Invalid secure status.');
    const next = { enabled: status.enabled, status: status.status, requiresPhoneTrust: status.requiresPhoneTrust,
      controllerOrigins: [...status.controllerOrigins] };
    if (status.certificateFingerprint !== undefined) {
      if (!/^(?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/.test(status.certificateFingerprint)) throw new TypeError('Invalid secure fingerprint.');
      next.certificateFingerprint = status.certificateFingerprint;
    }
    if (status.validUntil !== undefined) {
      if (typeof status.validUntil !== 'string' || !Number.isFinite(Date.parse(status.validUntil))) throw new TypeError('Invalid secure validity.');
      next.validUntil = status.validUntil;
    }
    // The actual native-owned listener provides origins; the policy validates
    // exact local identity, scheme and port before replacing the previous set.
    const policy = makePolicy(next.controllerOrigins);
    secureStatus = Object.freeze(next);
    requestPolicy = policy;
    return structuredClone(secureStatus);
  }
  const orchard = createGravityOrchardHost({ sqlite, DB, enabled: enableGravityOrchard,
    clock: observeRealtimeClock(realtimeClock, onRuntimeTiming), seed: realtimeSeed, onRuntimeTiming,
    validateUpgrade: request => !closed && requestPolicy?.validateUpgrade(request) === true,
    onLifecycle: ({ roomCode }) => {
      if (!closed) for (const client of streams.get(roomCode) || []) void push(client);
    },
  });
  const effectiveRoomApi = roomApi || orchard.authority;

  // The exact same injected authority handles HTTP and every subscriber's GET.
  // Neither this adapter nor a broadcast cache ever sees a full engine state.
  const callApi = request => {
    const pending = Promise.resolve().then(() => effectiveRoomApi(request, { DB }));
    pendingApi.add(pending);
    pending.finally(() => pendingApi.delete(pending)).catch(() => {});
    return pending;
  };
  const roomRead = (code, authorization, origin) => callApi(new Request(`${origin}/api/rooms/${code}`, {
    headers: { Authorization: authorization },
  }));

  function removeClient(client) {
    if (client.closed) return;
    client.closed = true;
    clearInterval(client.keepAlive);
    const clients = streams.get(client.code);
    clients?.delete(client);
    if (!clients?.size) streams.delete(client.code);
  }

  function event(client, type, value) {
    if (client.closed || client.response.destroyed) return;
    // A slow/abandoned phone must not accumulate an unbounded private buffer.
    if (client.response.writableLength > 1024 * 1024) {
      removeClient(client);
      client.response.destroy();
      return;
    }
    client.response.write(`event: ${type}\ndata: ${JSON.stringify(value)}\n\n`);
  }

  async function push(client) {
    if (closed || client.closed) return;
    if (client.pending) { client.again = true; return; }
    client.pending = true;
    try {
      // Recheck the credential on every pushed snapshot. Never broadcast a join
      // response, which contains the newly issued private controller token.
      const result = await roomRead(client.code, client.authorization, client.origin);
      const value = await result.json();
      if (!result.ok) {
        event(client, 'error', { ...value, status: result.status });
        removeClient(client);
        client.response.end();
      } else event(client, 'room', value);
    } catch {
      removeClient(client);
      client.response.end();
    } finally {
      client.pending = false;
      if (client.again && !client.closed) { client.again = false; void push(client); }
    }
  }

  async function subscribe(request, response, code, origin) {
    const authorization = request.headers.authorization || '';
    if (!/^Bearer [A-Za-z0-9_-]{24,128}$/.test(authorization)) {
      return respondJson(response, 401, { error: 'Join the room before receiving live updates.', code: 'session_required' });
    }
    const initial = await roomRead(code, authorization, origin);
    if (closed || response.destroyed) { response.end(); return; }
    if (!initial.ok) return respondWeb(response, initial);
    const value = await initial.json();
    if (closed || response.destroyed) { response.end(); return; }
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, private',
      Connection: 'keep-alive', 'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff',
    });
    response.flushHeaders();
    const client = { code, authorization, origin, response, closed: false, pending: false, again: false, keepAlive: null };
    if (!streams.has(code)) streams.set(code, new Set());
    streams.get(code).add(client);
    response.on('close', () => removeClient(client));
    event(client, 'room', value);
    client.keepAlive = setInterval(() => { void push(client); }, heartbeatMs);
    client.keepAlive.unref();
    // Catch a mutation between the initial authorized read and registration.
    void push(client);
  }

  async function staticFile(request, response, url) {
    if (!['GET', 'HEAD'].includes(request.method)) return respondJson(response, 405, { error: 'Use GET to open the game.' });
    let filename;
    if (url.pathname === '/') {
      const currentHost = url.hostname;
      const joinHost = ['localhost', '127.0.0.1', '[::1]'].includes(currentHost) ? (addresses[0] || currentHost) : currentHost;
      const joinOrigin = url.protocol === 'https:' ? url.origin : `http://${joinHost}:${actualPort}`;
      const meta = `<meta name="sofa-transport" content="lan"><meta name="sofa-join-origin" content="${escapeAttribute(joinOrigin)}">`
        + (enableGravityOrchard ? '<meta name="sofa-gravity-orchard" content="candidate">' : '');
      const html = (await readFile(path.join(root, 'ui/index.html'), 'utf8')).replace('</head>', meta + '</head>');
      response.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : html);
      return;
    }
    if (sources.has(url.pathname)) {
      filename = path.join(root, sources.get(url.pathname));
      // Recheck configured aliases when served, not only at startup.
      try { if (await realpath(filename) !== filename) return respondJson(response, 404, { error: 'File not found.' }); }
      catch { return respondJson(response, 404, { error: 'File not found.' }); }
    }
    else if (ASSETS.has(url.pathname)) {
      let decoded;
      try { decoded = decodeURIComponent(url.pathname); } catch { return respondJson(response, 404, { error: 'File not found.' }); }
      if (decoded.split('/').some(part => part === '..' || part.startsWith('.')) || decoded.includes('\\')) return respondJson(response, 404, { error: 'File not found.' });
      const publicRoot = await realpath(path.join(root, 'public'));
      const candidate = path.resolve(publicRoot, '.' + decoded);
      try { filename = await realpath(candidate); } catch { return respondJson(response, 404, { error: 'File not found.' }); }
      if (!filename.startsWith(publicRoot + path.sep)) return respondJson(response, 404, { error: 'File not found.' });
    } else return respondJson(response, 404, { error: 'File not found.' });
    try {
      const contents = await readFile(filename);
      response.writeHead(200, { 'Content-Type': TYPES[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : contents);
    } catch (error) {
      if (['ENOENT', 'EISDIR', 'EACCES'].includes(error.code)) return respondJson(response, 404, { error: 'File not found.' });
      throw error;
    }
  }

  const requestHandler = async (request, response) => {
    try {
      if (closed) return respondJson(response, 503, { error: 'The local host is closing.' });
      const policy = requestPolicy.validateRequest(request);
      if (!policy.ok) return respondJson(response, policy.status, { error: 'Open the controller from this local game host.', code: policy.code });
      const { origin, url } = policy;
      const stream = new RegExp(`^/api/rooms/(${ROOM_CODE})/events$`, 'i').exec(url.pathname);
      if (stream) {
        if (request.method !== 'GET') return respondJson(response, 405, { error: 'Use GET for live updates.' });
        return await subscribe(request, response, stream[1].toUpperCase(), origin);
      }
      if (url.pathname.startsWith('/api/')) {
        const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await bodyBytes(request);
        const webRequest = new Request(url, { method: request.method, headers: request.headers, ...(body ? { body } : {}) });
        const result = await callApi(webRequest);
        const changedRoom = request.method === 'POST' && result.ok
          ? new RegExp(`^/api/rooms/(${ROOM_CODE})/(join|start|rematch|action)$`, 'i').exec(url.pathname)?.[1]?.toUpperCase() : null;
        try { await respondWeb(response, result); }
        finally {
          if (changedRoom) for (const client of streams.get(changedRoom) || []) void push(client);
        }
        return;
      }
      await staticFile(request, response, url);
    } catch (error) {
      if (!response.headersSent && !response.destroyed) respondJson(response, error.status || 500, { error: error.status === 413 ? error.message : 'The local host could not serve this request.' });
      else if (!response.destroyed) response.end();
    }
  };
  const server = createServer(requestHandler);
  const handleUpgrade = (request, socket, head) => orchard.handleUpgrade(request, socket, head);
  server.on('upgrade', handleUpgrade);
  server.requestTimeout = 15_000;
  server.headersTimeout = 15_000;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => { server.off('error', reject); resolve(); });
    });
    actualPort = server.address().port;
    refreshPolicy();
    await orchard.restoreExisting();
  } catch (error) {
    await orchard.close();
    if (server.listening) await new Promise(resolve => server.close(resolve));
    sqlite.close(); throw error;
  }

  const api = {
    port: actualPort,
    origin: `http://127.0.0.1:${actualPort}`,
    urls: addresses.map(address => `http://${address}:${actualPort}/`),
    databasePath,
    close() {
      if (closing) return closing;
      closed = true;
      for (const clients of streams.values()) for (const client of [...clients]) { removeClient(client); client.response.end(); }
      closing = (async () => {
        await Promise.allSettled([...pendingApi]);
        await orchard.close();
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        sqlite.close();
      })();
      return closing;
    },
  };
  // Capabilities are explicit non-serializable host seams, separate from the
  // historical public readiness shape (port/origin/urls/databasePath/close).
  Object.defineProperties(api, Object.fromEntries(Object.entries({
    requestHandler, handleUpgrade, setSecureControllerStatus,
    getSecureControllerStatus: () => structuredClone(secureStatus),
    pauseAllForSystem: reason => orchard.pauseAllForSystem(reason),
    realtimeDiagnostics: code => orchard.diagnostics(code),
  }).map(([name, value]) => [name, { value }])));
  return api;
}
