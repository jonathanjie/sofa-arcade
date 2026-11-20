/** Loopback-only diagnostic fixture server. Never serves authority or secrets. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const componentRoot = new URL('../../', import.meta.url);
const files = new Set([
  'tv/index.mjs', 'tv/styles.mjs', 'tv/timeline.mjs', 'tv/public-view.mjs', 'tv/effects.mjs', 'tv/scene.mjs', 'tv/scene-style.mjs',
  'tv/fixtures/index.html', 'tv/fixtures/app.mjs', 'tv/fixtures/scenarios.mjs',
  'tutorial/index.mjs', 'tutorial/styles.mjs', 'tutorial/lessons.mjs', 'tutorial/graphics.mjs',
]);
const MIME = { '.mjs': 'text/javascript; charset=utf-8', '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

export function createFixtureServer() {
  return createServer(async (request, response) => {
    let path;
    try { path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname).replace(/^\/+/, ''); }
    catch { response.writeHead(400); response.end('Invalid path'); return; }
    if (!path) { response.writeHead(302, { location: '/tv/fixtures/' }); response.end(); return; }
    if (path === 'tv/fixtures/' || path === 'tv/fixtures') path = 'tv/fixtures/index.html';
    if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405); response.end(); return; }
    if (!files.has(path)) { response.writeHead(404); response.end('Not in the public fixture allowlist'); return; }
    try {
      const data = await readFile(new URL(path, componentRoot));
      const extension = path.slice(path.lastIndexOf('.'));
      response.writeHead(200, { 'Content-Type': MIME[extension] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : data);
    } catch { response.writeHead(404); response.end('Fixture module unavailable'); }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createFixtureServer();
  const port = Number(process.env.GO4_FIXTURE_PORT || 4194);
  server.listen(port, '127.0.0.1', () => process.stdout.write(`Gravity Orchard GO4 diagnostic fixture: http://127.0.0.1:${server.address().port}/tv/fixtures/\n`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => process.exit(0)));
}
