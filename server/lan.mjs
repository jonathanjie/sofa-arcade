/** Local, dependency-free host. The same authoritative room API runs on the Mac. */
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { networkInterfaces } from 'node:os';
import { readFile, readdir, mkdir, realpath, chmod } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi, MAX_BODY_BYTES } from './rooms.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const ROOM_CODE = '[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}';
const SOURCES = new Map([
  ['/app.js', 'ui/app.js'], ['/styles.css', 'ui/styles.css'],
  ['/audio.js', 'ui/audio.js'], ['/score.mjs', 'ui/score.mjs'],
  ['/motion.js', 'ui/motion.js'], ['/motion.css', 'ui/motion.css'],
  ['/board-view.mjs', 'ui/board-view.mjs'], ['/board-view.css', 'ui/board-view.css'],
  ['/action-queue.mjs', 'ui/action-queue.mjs'],
  ['/transport.mjs', 'ui/transport.mjs'], ['/engine.mjs', 'game/engine.mjs'],
  ['/games/catalog.mjs', 'games/catalog.mjs'],
]);
const TYPES = {
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};

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

async function openDatabase(filename, root) {
  if (filename !== ':memory:') await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const sqlite = new DatabaseSync(filename);
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
} = {}) {
  root = await realpath(root);
  const { sqlite, DB } = await openDatabase(databasePath, root);
  const addresses = localAddresses();
  const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]', ...addresses]);
  const streams = new Map();
  let actualPort = port;
  let closed = false;

  const roomRead = (code, authorization, origin) => handleApi(new Request(`${origin}/api/rooms/${code}`, {
    headers: { Authorization: authorization },
  }), { DB });

  function removeClient(client) {
    if (client.closed) return;
    client.closed = true;
    clearInterval(client.keepAlive);
    const clients = streams.get(client.code);
    clients?.delete(client);
    if (!clients?.size) streams.delete(client.code);
  }

  function event(client, type, value) {
    if (!client.closed && !client.response.destroyed) client.response.write(`event: ${type}\ndata: ${JSON.stringify(value)}\n\n`);
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
    if (!initial.ok) return respondWeb(response, initial);
    const value = await initial.json();
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
  }

  async function staticFile(request, response, url) {
    if (!['GET', 'HEAD'].includes(request.method)) return respondJson(response, 405, { error: 'Use GET to open the game.' });
    let filename;
    if (url.pathname === '/') {
      const currentHost = url.hostname;
      const joinHost = ['localhost', '127.0.0.1', '[::1]'].includes(currentHost) ? (addresses[0] || currentHost) : currentHost;
      const joinOrigin = `http://${joinHost}:${actualPort}`;
      const meta = `<meta name="sofa-transport" content="lan"><meta name="sofa-join-origin" content="${escapeAttribute(joinOrigin)}">`;
      const html = (await readFile(path.join(root, 'ui/index.html'), 'utf8')).replace('</head>', meta + '</head>');
      response.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : html);
      return;
    }
    if (SOURCES.has(url.pathname)) filename = path.join(root, SOURCES.get(url.pathname));
    else if (url.pathname.startsWith('/assets/') || ['/favicon.svg', '/manifest.webmanifest'].includes(url.pathname)) {
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

  const server = createServer(async (request, response) => {
    try {
      const authority = new URL(`http://${request.headers.host || ''}`);
      if (!allowedHosts.has(authority.hostname) || Number(authority.port || 80) !== actualPort) return respondJson(response, 421, { error: 'Open the local address printed by the game host.' });
      const origin = authority.origin;
      const url = new URL(request.url, origin);
      if (url.origin !== origin) return respondJson(response, 400, { error: 'Invalid request address.' });
      const suppliedOrigin = request.headers.origin;
      if (suppliedOrigin && suppliedOrigin !== origin) return respondJson(response, 403, { error: 'Open the controller from this local game host.', code: 'origin_rejected' });
      const stream = new RegExp(`^/api/rooms/(${ROOM_CODE})/events$`).exec(url.pathname);
      if (stream) {
        if (request.method !== 'GET') return respondJson(response, 405, { error: 'Use GET for live updates.' });
        return await subscribe(request, response, stream[1], origin);
      }
      if (url.pathname.startsWith('/api/')) {
        const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await bodyBytes(request);
        const webRequest = new Request(url, { method: request.method, headers: request.headers, ...(body ? { body } : {}) });
        const result = await handleApi(webRequest, { DB });
        const changedRoom = request.method === 'POST' && result.ok
          ? new RegExp(`^/api/rooms/(${ROOM_CODE})/(join|start|rematch|action)$`).exec(url.pathname)?.[1] : null;
        await respondWeb(response, result);
        if (changedRoom) for (const client of streams.get(changedRoom) || []) void push(client);
        return;
      }
      await staticFile(request, response, url);
    } catch (error) {
      if (!response.headersSent && !response.destroyed) respondJson(response, error.status || 500, { error: error.status === 413 ? error.message : 'The local host could not serve this request.' });
      else if (!response.destroyed) response.end();
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 15_000;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => { server.off('error', reject); resolve(); });
    });
    actualPort = server.address().port;
  } catch (error) { sqlite.close(); throw error; }

  return {
    port: actualPort,
    origin: `http://127.0.0.1:${actualPort}`,
    urls: addresses.map(address => `http://${address}:${actualPort}/`),
    databasePath,
    async close() {
      if (closed) return;
      closed = true;
      for (const clients of streams.values()) for (const client of [...clients]) { removeClient(client); client.response.end(); }
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      sqlite.close();
    },
  };
}
