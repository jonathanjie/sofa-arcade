/** Development-only, loopback-only fixture. Never part of the runtime inventory. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
export const FILES = new Set([
  'index.mjs', 'motion.mjs', 'tuning.mjs', 'icons.mjs', 'phone.css',
  'fixture/index.html', 'fixture/app.mjs', 'fixture/fixture.css',
  'fixture/views.mjs', 'fixture/environment.mjs',
]);
const types = { '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html' };

export async function startFixture({ port = 0 } = {}) {
  const server = createServer(async (request, response) => {
    // This server intentionally does not expose parent folders, private source,
    // development dependencies, logs, or arbitrary file paths.
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    let path;
    try {
      path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname).replace(/^\/+/, '');
    } catch {
      response.writeHead(400).end();
      return;
    }
    if (!path || path === 'fixture/' || path === 'fixture') path = 'fixture/index.html';
    if (!FILES.has(path)) {
      response.writeHead(404).end('Not in the GO3 fixture allowlist');
      return;
    }
    try {
      const body = await readFile(new URL(path, root));
      const extension = path.slice(path.lastIndexOf('.'));
      response.writeHead(200, {
        'Content-Type': `${types[extension] || 'application/octet-stream'}; charset=utf-8`,
        'Content-Length': body.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      response.writeHead(500).end('Fixture file unavailable');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    close: () => new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flag = process.argv.find(value => value.startsWith('--port='));
  const port = Number(flag?.slice('--port='.length) || process.env.GO3_FIXTURE_PORT || 4185);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid fixture port');
  const fixture = await startFixture({ port });
  process.stdout.write(`Gravity Orchard phone fixture: ${fixture.url}\nSynthetic sensors and public snapshots only; no game server or physical-device claim.\n`);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, async () => { await fixture.close(); process.exit(0); });
  }
}
