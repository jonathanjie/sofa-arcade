/**
 * Development-only GO6 fixture. One deterministic toy authority is injected into
 * HTTP and HTTPS/WSS. No production room, database, native API or trust operation
 * is created. All private material is ephemeral and outside the checkout.
 */
import { createServer } from 'node:http';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { createCertificateStore, normalizeIdentities } from './certificates/index.mjs';
import { createSecureLanServer } from './index.mjs';
import { createRequestPolicy } from './request-policy.mjs';
import { SECURE_LAN_FIXTURE_ASSETS } from '../../desktop/secure-lan/fixtures/assets.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const UPGRADE_PATH = '/api/realtime/gravity-orchard';
const SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'Permissions-Policy': 'accelerometer=(self), gyroscope=(self), magnetometer=()',
});

function json(response, status, value, head = false) {
  response.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8' });
  response.end(head ? undefined : JSON.stringify(value));
}

async function body(request) {
  let bytes = 0;
  const parts = [];
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 1024) throw new Error('Invalid fixture payload.');
    parts.push(chunk);
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}

/**
 * CLI/test harness only. Default is loopback. Explicit --identity and --host
 * options support a manual diagnostic on an isolated LAN without installing
 * trust automatically. The fixture has no real host mutation route.
 */
export async function startSecureLanFixture({
  host = '127.0.0.1', httpPort = 0, httpsPort = 0,
  identities = ['127.0.0.1', 'localhost'],
} = {}) {
  identities = normalizeIdentities(identities);
  const parent = await realpath(tmpdir());
  const directory = await mkdtemp(path.join(parent, 'sofa-go6-fixture-'));
  const store = createCertificateStore({ appDataDir: directory });
  const sockets = new Set();
  const websocket = new WebSocketServer({ noServer: true, maxPayload: 1024, perMessageDeflate: false });
  let https;
  let http;
  let policy;
  let closing;
  let count = 0;
  const publicTrust = new Map();
  const assets = new Map(SECURE_LAN_FIXTURE_ASSETS.map(asset => [asset.route, asset]));
  // A single authority function is shared across both protocols. It is solely a
  // fixture counter, never a second production simulation/store implementation.
  function authority(command) {
    if (command !== undefined) {
      if (!command || typeof command !== 'object' || Array.isArray(command)
          || Object.keys(command).length !== 1 || command.type !== 'increment') throw new Error('Invalid fixture command.');
      count += 1;
    }
    return { fixture: true, authority: 'one-injected-authority', count };
  }
  websocket.on('connection', socket => {
    socket.on('error', () => {});
    socket.on('message', (data, binary) => {
      try {
        if (binary) throw new Error('Text only.');
        const value = authority(JSON.parse(data.toString('utf8')));
        socket.send(JSON.stringify(value));
      } catch { socket.close(1008, 'Invalid fixture command'); }
    });
  });
  const onUpgrade = (request, socket, head) => {
    if (!policy?.validateUpgrade(request)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    websocket.handleUpgrade(request, socket, head, ws => websocket.emit('connection', ws, request));
  };
  const requestHandler = async (request, response) => {
    try {
      const checked = policy?.validateRequest(request);
      if (!checked) return json(response, 503, { error: 'Fixture is starting.' });
      if (!checked.ok) return json(response, checked.status, { code: checked.code });
      const url = checked.url;
      // Compare the literal path, before WHATWG dot-segment normalization. No
      // catch-all static root, decoded path join, private files or native bridge.
      const literal = request.url.split('?')[0];
      if (literal !== url.pathname) return json(response, 404, { code: 'not_found' });
      if (literal === '/fixture/authority') {
        if (request.method === 'POST') return json(response, 200, authority(await body(request)));
        if (['GET', 'HEAD'].includes(request.method)) return json(response, 200, authority(), request.method === 'HEAD');
        return json(response, 405, { code: 'method_not_allowed' });
      }
      if (!['GET', 'HEAD'].includes(request.method)) return json(response, 404, { code: 'not_found' });
      if (literal === '/fixture/status') return json(response, 200, https.status, request.method === 'HEAD');
      if (literal === '/fixture/public-trust') {
        const format = url.searchParams.get('format');
        if (url.searchParams.size !== 1 || !publicTrust.has(format)) return json(response, 400, { code: 'invalid_format' });
        // Explicitly enabled DEVELOPMENT root-download route. Cached public
        // bytes only; the request cannot call the private certificate store.
        return json(response, 200, publicTrust.get(format), request.method === 'HEAD');
      }
      const asset = assets.get(literal);
      if (!asset) return json(response, 404, { code: 'not_found' });
      const filename = path.resolve(ROOT, asset.file);
      if (!filename.startsWith(path.join(ROOT, 'desktop/secure-lan') + path.sep)
          || await realpath(filename) !== filename) return json(response, 404, { code: 'not_found' });
      const contents = await readFile(filename);
      response.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': asset.type });
      response.end(request.method === 'HEAD' ? undefined : contents);
    } catch {
      if (!response.headersSent && !response.destroyed) json(response, 400, { code: 'fixture_request_rejected' });
      else response.destroy();
    }
  };
  async function close() {
    if (closing) return closing;
    closing = (async () => {
      for (const socket of websocket.clients) socket.terminate();
      const stopHttp = http ? new Promise(resolve => {
        http.close(() => resolve());
        http.closeAllConnections();
        for (const socket of sockets) socket.destroy();
      }) : Promise.resolve();
      await Promise.allSettled([stopHttp, https?.close()]);
      websocket.close();
      // This exact fresh mkdtemp directory is exclusively owned by this harness.
      await rm(directory, { recursive: true, force: true });
    })();
    return closing;
  }
  try {
    await store.provision({ identities, port: httpsPort || 4178 });
    const material = await store.loadTlsMaterial({ identities });
    http = createServer(requestHandler);
    http.requestTimeout = 5000;
    http.headersTimeout = 5000;
    http.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
    http.on('upgrade', onUpgrade);
    await new Promise((resolve, reject) => {
      http.once('error', reject);
      http.listen(httpPort, host, () => { http.off('error', reject); resolve(); });
    });
    https = await createSecureLanServer({ tlsMaterial: material, host, port: httpsPort, requestHandler, onUpgrade });
    material.key.fill(0);
    const httpAddress = http.address();
    const httpOrigins = https.origins.map(raw => {
      const value = new URL(raw); value.protocol = 'http:'; value.port = String(httpAddress.port); return value.origin;
    });
    policy = createRequestPolicy({ httpOrigins, httpsOrigins: https.origins, upgradePath: UPGRADE_PATH });
    for (const format of ['pem', 'mobileconfig']) publicTrust.set(format, await store.exportPublicTrust({ format }));
    return Object.freeze({
      httpOrigin: httpOrigins[0], httpOrigins: Object.freeze(httpOrigins),
      httpsOrigins: https.origins, get status() { return https.status; },
      // Public root only, for an explicitly verifying TEST client. No private
      // TLS material or private filesystem path appears on the fixture facade.
      publicCa: Buffer.from(publicTrust.get('pem').contents),
      close,
    });
  } catch {
    await close();
    throw new Error('The isolated secure LAN fixture could not start.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const options = {};
  const suppliedIdentities = [];
  let fixture;
  try {
    for (const arg of process.argv.slice(2)) {
      const [key, value, extra] = arg.split('=');
      if (!value || extra !== undefined) throw new Error();
      if (key === '--host') options.host = value;
      else if (key === '--http-port' || key === '--https-port') {
        if (!/^\d{1,5}$/.test(value) || Number(value) > 65535) throw new Error();
        options[key === '--http-port' ? 'httpPort' : 'httpsPort'] = Number(value);
      } else if (key === '--identity') suppliedIdentities.push(value);
      else throw new Error();
    }
    if (suppliedIdentities.length) options.identities = suppliedIdentities;
    fixture = await startSecureLanFixture(options);
    process.stdout.write(`${JSON.stringify({
      fixture: true, setup: `${fixture.httpOrigin}/secure-lan/setup`,
      diagnostics: fixture.httpsOrigins.map(value => `${value}/secure-lan/diagnostic`),
      certificateFingerprint: fixture.status.certificateFingerprint,
      note: 'Setup UI uses simulated callbacks. HTTPS requires explicit trust; trust stores were not changed. Private test material is removed on exit.',
    })}\n`);
    const stop = () => { void fixture.close().then(() => { process.exitCode = 0; }, () => { process.exitCode = 1; }); };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  } catch {
    await fixture?.close();
    process.stderr.write('The secure LAN fixture could not start. Check the local address and port settings.\n');
    process.exitCode = 1;
  }
}
