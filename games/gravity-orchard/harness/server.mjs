/** Loopback-only development renderer. Never include this server in delivery. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const FILES = new Set([
  'catalog.mjs', 'geometry.mjs', 'public.mjs', 'engine.mjs', 'physics.mjs', 'supply.mjs',
  'harness/index.html', 'harness/style.css', 'harness/app.mjs', 'validation/pilot.mjs',
]);
export async function startHarness({ port = 0 } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new TypeError('Invalid diagnostic port.');
  const server = createServer(async (request, response) => {
    const host = request.headers.host;
    if (!host || !/^(?:127\.0\.0\.1|localhost):\d+$/.test(host)) { response.writeHead(403).end('Loopback diagnostics only.'); return; }
    if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, `http://${host}`).pathname); }
    catch { response.writeHead(400).end(); return; }
    if (pathname === '/') { response.writeHead(302, { Location: '/harness/' }).end(); return; }
    const relative = pathname === '/harness/' ? 'harness/index.html' : pathname.slice(1);
    if (!FILES.has(relative)) { response.writeHead(404).end('Not a diagnostic runtime file.'); return; }
    try {
      const body = await readFile(resolve(root, relative));
      response.writeHead(200, {
        'Content-Type': relative.endsWith('.html') ? 'text/html; charset=utf-8' : relative.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch { response.writeHead(500).end('Diagnostic file unavailable.'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { server, url: `http://127.0.0.1:${server.address().port}/harness/`, close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv.find(arg => arg.startsWith('--port='))?.slice('--port='.length) || 4181);
  const harness = await startHarness({ port });
  console.log(`Gravity Orchard diagnostic lab: ${harness.url}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await harness.close(); process.exit(0); });
}
