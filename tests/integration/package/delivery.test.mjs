import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, access, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readZip, extractZip } from './zip.mjs';
import { BROWSER_FILES, runtimeFiles } from '../../../scripts/runtime-files.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const prefix = 'sofa-arcade-local/';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const forbidden = /(^|\/)(?:\.git|\.sofa-lan|\.env[^/]*|node_modules|fixtures|harness|tests?|__tests__|evidence|audio-evidence|sources|fragments)(?:\/|$)|\.(?:sqlite|sqlite3|db)(?:-wal|-shm)?$|\.test\.[cm]?js$|\.pem$/i;

test('portable packager is reproducible and ignores adjacent private/development files', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'sofa-package-determinism-'));
  try {
    const files = [...new Set([...(await runtimeFiles(root)), 'scripts/package-lan.mjs', 'scripts/runtime-files.mjs'])];
    for (const name of files) {
      await mkdir(path.dirname(path.join(temp, name)), { recursive: true });
      await copyFile(path.join(root, name), path.join(temp, name));
    }
    const canary = 'SOFA_ACCEPTANCE_FAKE_SECRET_MUST_NEVER_BE_PACKAGED';
    for (const name of [
      '.env.test', '.sofa-lan/rooms.sqlite', '.git/config',
      'games/odd-laws-society/fixtures/private.json', 'ui/never-ship.test.mjs',
      'ui/games/odd-laws-society/harness/private-state.json',
      'public/assets/odd-laws-society/sources/private-generation.json',
      'public/assets/odd-laws-society/evidence/private-review.json',
      'ui/media/odd-laws-society/audio-evidence/private-review.mp3',
      'ui/media/odd-laws-society/fragments/private-artwork.json',
    ]) {
      await mkdir(path.dirname(path.join(temp, name)), { recursive: true });
      await writeFile(path.join(temp, name), canary);
    }
    const build = () => execFileSync(process.execPath, ['scripts/package-lan.mjs'], { cwd: temp, stdio: 'pipe' });
    build();
    const first = await readFile(path.join(temp, 'public/downloads/sofa-arcade-local.zip'));
    build();
    const second = await readFile(path.join(temp, 'public/downloads/sofa-arcade-local.zip'));
    assert.equal(digest(first), digest(second), 'Identical inputs create identical archive bytes');
    for (const [name, entry] of readZip(first)) {
      assert.ok(!forbidden.test(name), `No adjacent private entry ${name}`);
      assert.ok(!entry.data.includes(Buffer.from(canary)), `No secret canary in ${name}`);
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('portable ZIP is an exact source snapshot with a verifiable manifest and executable launcher', async () => {
  const entries = readZip(await readFile(path.join(root, 'public/downloads/sofa-arcade-local.zip')));
  const files = [...entries.keys()].filter(name => !name.endsWith('/')).map(name => {
    assert.ok(name.startsWith(prefix));
    return name.slice(prefix.length);
  }).sort();
  const expected = (await runtimeFiles(root)).concat('README.txt', 'artifact-manifest.json').sort();
  assert.deepEqual(files, expected, 'No undeclared or missing runtime members');
  const manifest = JSON.parse(entries.get(prefix + 'artifact-manifest.json').data);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.artifact, 'sofa-arcade-local');
  assert.deepEqual(manifest.files.map(file => file.path).sort(), files.filter(file => file !== 'artifact-manifest.json'));
  for (const name of files) {
    assert.ok(!forbidden.test(name), `No private/development input ${name}`);
    const entry = entries.get(prefix + name);
    const mode = name === 'start-sofa.command' ? 0o755 : 0o644;
    assert.equal(entry.mode & 0o777, mode, `File mode ${name}`);
    if (!['README.txt', 'artifact-manifest.json'].includes(name)) {
      assert.ok(entry.data.equals(await readFile(path.join(root, name))), `ZIP must be regenerated after editing ${name}`);
    }
    if (name !== 'artifact-manifest.json') {
      const recorded = manifest.files.find(file => file.path === name);
      assert.equal(recorded.bytes, entry.data.length, `Manifest size ${name}`);
      assert.equal(recorded.mode, mode.toString(8), `Manifest mode ${name}`);
      assert.equal(recorded.sha256, digest(entry.data), `Manifest digest ${name}`);
    }
  }
});

test('generated production browser modules and root HTML match authored sources', async () => {
  for (const { url, source } of BROWSER_FILES) {
    assert.ok(!forbidden.test(url), `Browser path must not expose test/fixture state: ${url}`);
    assert.ok(!source.startsWith('server/') && !source.startsWith('desktop/'));
    if (source.startsWith('games/odd-laws-society/')) {
      assert.ok(['catalog.mjs', 'preview.mjs', 'errors.mjs'].includes(source.slice('games/odd-laws-society/'.length)), `Only reviewed public engine helpers belong in browser delivery: ${source}`);
    }
    const generated = path.join(root, 'public', url.slice(1));
    assert.ok((await readFile(generated)).equals(await readFile(path.join(root, source))), `Run prepare-game after editing ${source}`);
  }
  const route = await readFile(path.join(root, 'app/route.ts'), 'utf8');
  const encoded = /^const html = (.+);$/m.exec(route)?.[1];
  assert.ok(encoded, 'Generated route embeds HTML');
  assert.equal(JSON.parse(encoded), await readFile(path.join(root, 'ui/index.html'), 'utf8'));
});

function references(text, kind) {
  const matches = [];
  const add = (specifier, module = false) => matches.push({ specifier, module });
  if (kind === 'html') {
    for (const match of text.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)) add(match[1]);
  }
  if (kind === 'js') {
    for (const match of text.matchAll(/\b(?:import|export)\s+(?:[^;\n]*?\s+from\s*)?["']([^"']+)["']/g)) add(match[1], true);
    for (const match of text.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) add(match[1], true);
    for (const match of text.matchAll(/\bnew\s+URL\s*\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g)) add(match[1]);
    // Asset strings inserted at render time are as important as static imports.
    for (const match of text.matchAll(/["'`](\/(?:assets|media|games)\/[A-Za-z0-9_./?=-]+\.(?:png|jpg|jpeg|webp|svg|json|mjs|js|css)(?:\?[^"'`\s]*)?)["'`]/g)) add(match[1]);
  }
  if (kind === 'css') {
    for (const match of text.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) add(match[1]);
    for (const match of text.matchAll(/@import\s+["']([^"']+)["']/g)) add(match[1]);
  }
  if (kind === 'json') {
    // Follow the fetched manifest itself rather than trusting runtimeFiles() to
    // have named its image closure. This also checks ordinary webmanifest icons.
    const visit = value => {
      if (!value || typeof value !== 'object') return;
      if (typeof value.src === 'string') add(value.src);
      for (const item of Object.values(value)) visit(item);
    };
    visit(JSON.parse(text));
  }
  return matches.filter(({ specifier }) => !specifier.startsWith('data:') && !specifier.startsWith('#'));
}

test('isolated ZIP runs its host and serves the complete local browser graph without exposing authority', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'sofa-package-acceptance-'));
  let server;
  try {
    const entries = readZip(await readFile(path.join(root, 'public/downloads/sofa-arcade-local.zip')));
    await extractZip(entries, temp);
    const extracted = path.join(temp, prefix);
    const { startLanServer } = await import(pathToFileURL(path.join(extracted, 'server/lan.mjs')).href);
    server = await startLanServer({ root: extracted, databasePath: ':memory:', host: '127.0.0.1', port: 0 });
    const pending = ['/'];
    const visited = new Set();
    // Check both reachable graph and intentional lazy entry points.
    pending.push(...BROWSER_FILES.map(file => file.url));
    while (pending.length) {
      const next = new URL(pending.shift(), server.origin);
      assert.equal(next.origin, server.origin, 'No browser dependency may require internet');
      const key = next.pathname + next.search;
      if (visited.has(key)) continue;
      visited.add(key);
      assert.ok(visited.size < 500, 'Bounded local runtime graph');
      const response = await fetch(next);
      assert.equal(response.status, 200, `Missing local runtime resource ${key}`);
      const type = response.headers.get('content-type');
      const kind = type?.includes('javascript') ? 'js' : type?.includes('text/css') ? 'css' : type?.includes('text/html') ? 'html' : type?.includes('json') ? 'json' : null;
      if (!kind) { await response.arrayBuffer(); continue; }
      for (const { specifier, module } of references(await response.text(), kind)) {
        if (module && !/^(?:\.\.?\/|\/|https?:\/\/)/.test(specifier)) throw new Error(`Browser source imports unsupported nonlocal module ${specifier}`);
        pending.push(new URL(specifier, next).href);
      }
    }
    assert.ok(visited.has('/'), 'Rendered document entry crawled');
    for (const pathname of [
      '/server/rooms.mjs', '/server/lan.mjs', '/games/registry.mjs',
      '/games/odd-laws-society/engine.mjs', '/games/odd-laws-society/projection.mjs', '/games/odd-laws-society/fixtures/private.json',
      '/games/odd-laws-society/harness/private-state.json',
      '/assets/odd-laws-society/sources/characters/generation-prompts.json',
      '/assets/odd-laws-society/sources/buildings/generation-log.json',
      '/media/odd-laws-society/audio-evidence/lala-calls-the-house-play.mp3',
      '/media/odd-laws-society/runtime-files.json', '/media/odd-laws-society/contract.mjs',
      '/media/odd-laws-society/gallery.mjs', '/media/odd-laws-society/score.test.mjs',
      '/tests/integration/fixtures/secrets.json', '/desktop/runtime-manifest.json',
      '/.sofa-lan/rooms.sqlite', '/.env', '/.git/config',
      '/assets/../.env', '/assets/%2e%2e/%2e%2e/server/rooms.mjs',
    ]) {
      const response = await fetch(server.origin + pathname);
      assert.equal(response.status, 404, `Private path must be denied: ${pathname}`);
      await response.arrayBuffer();
    }
    const created = await fetch(server.origin + '/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gameId: 'sofa-kingdoms' }) });
    assert.equal(created.status, 201, 'Extracted host can create real persisted rooms');
    const room = await created.json();
    assert.equal(room.gameId, 'sofa-kingdoms');
    assert.ok(room.hostToken);
  } finally {
    await server?.close();
    await rm(temp, { recursive: true, force: true });
  }
});

test('desktop staging manifest stays explicit and contains the combined runtime when handed off', async t => {
  const filename = path.join(root, 'desktop/runtime-manifest.json');
  try { await access(filename); } catch { return t.skip('WS5 desktop has not provided a tested handoff. Native readiness is blocked.'); }
  const manifest = JSON.parse(await readFile(filename, 'utf8'));
  assert.equal(manifest.schemaVersion, 1);
  assert.ok(Array.isArray(manifest.files));
  const paths = manifest.files.map(entry => entry.path);
  assert.equal(new Set(paths).size, paths.length);
  for (const file of paths) {
    assert.ok(typeof file === 'string' && file && !path.posix.isAbsolute(file) && !file.includes('\\') && !file.split('/').some(part => ['.', '..', ''].includes(part)));
    assert.ok(!forbidden.test(file), `No private/development staged file: ${file}`);
    assert.ok(!/[?*]/.test(file), `No globs in desktop staging: ${file}`);
    await access(path.join(root, file));
  }
  for (const file of await runtimeFiles(root)) {
    if (['start-sofa.command', 'scripts/lan-server.mjs', 'docs/LAN.md'].includes(file)) continue;
    assert.ok(paths.includes(file), `Desktop must stage final combined runtime input ${file}`);
  }
});
