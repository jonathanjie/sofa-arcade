import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { imageEntries } from './contract.mjs';

const mediaRoot = new URL('./', import.meta.url);
const assetRoot = new URL('../../../public/assets/odd-laws-society/', mediaRoot);
const types = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8', md: 'text/plain; charset=utf-8', svg: 'image/svg+xml', webp: 'image/webp', png: 'image/png', mp3: 'audio/mpeg' };

/** Development-only, loopback-only, explicit-file preview. No framework install. */
export async function startPreview({ port = 0 } = {}) {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', assetRoot), 'utf8'));
  const routes = new Map([['/', new URL('gallery.html', mediaRoot)], ['/assets/manifest.json', new URL('manifest.json', assetRoot)]]);
  for (const path of ['gallery.html','gallery.css','gallery.mjs','contract.mjs','score.mjs','effects.mjs','COMPOSITION.md',
    'audio-evidence/lala-calls-the-house-play.mp3','audio-evidence/lala-calls-the-house-council.mp3','audio-evidence/civic-effects.mp3','audio-evidence/render-report.json']) routes.set(`/${path}`, new URL(path, mediaRoot));
  for (const [, entry] of imageEntries(manifest)) routes.set(`/assets/${entry.src}`, new URL(entry.src, assetRoot));
  const server = createServer(async (request, response) => {
    try {
      if (!['GET','HEAD'].includes(request.method)) {response.writeHead(405, {Allow:'GET, HEAD'});response.end();return;}
      const url = new URL(request.url, 'http://127.0.0.1');
      const target = routes.get(url.pathname);
      if (!target) {response.writeHead(404);response.end('Not in the media preview allowlist.');return;}
      const details = await stat(target), size = details.size;
      const ext = target.pathname.split('.').at(-1);
      const headers = { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control':'no-store',
        'X-Content-Type-Options':'nosniff', 'Accept-Ranges':'bytes',
        'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'" };
      let start = 0, end = size - 1, status = 200;
      if (request.headers.range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
        if (!match || (!match[1] && !match[2])) {response.writeHead(416, {'Content-Range':`bytes */${size}`});response.end();return;}
        if (!match[1]) start = Math.max(0, size - Number(match[2]));
        else {start = Number(match[1]);if (match[2]) end = Math.min(end, Number(match[2]));}
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
          response.writeHead(416, {'Content-Range':`bytes */${size}`});response.end();return;
        }
        status = 206;headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
      }
      headers['Content-Length'] = end - start + 1;
      response.writeHead(status, headers);
      if (request.method === 'HEAD') response.end();
      else { const stream = createReadStream(target, {start,end});stream.on('error', () => response.destroy());stream.pipe(response); }
    } catch { if (!response.headersSent) response.writeHead(404);response.end('Media file unavailable.'); }
  });
  await new Promise((resolve, reject) => {server.once('error', reject);server.listen(port,'127.0.0.1',resolve);});
  return { origin:`http://127.0.0.1:${server.address().port}`, close:() => new Promise((resolve,reject) => server.close(error => error ? reject(error) : resolve())) };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.argv[2] || 4188);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Expected a valid local port.');
  const preview = await startPreview({port});
  console.log(`Odd Laws media review: ${preview.origin}`);
  for (const signal of ['SIGINT','SIGTERM']) process.once(signal, async () => {await preview.close();process.exit(0);});
}
