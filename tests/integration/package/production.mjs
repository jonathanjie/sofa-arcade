/** Run after npm run build; never generate or repair the output being checked. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSET_FILES, BROWSER_FILES, checkedRuntimePath } from '../../../scripts/runtime-files.mjs';

const defaultRoot = fileURLToPath(new URL('../../../', import.meta.url));
const forbidden = /(^|\/)(?:server|desktop|drizzle|\.git|\.sofa-lan|\.env[^/]*|node_modules|fixtures?|harness|tests?|__tests__|evidence|audio-evidence|sources|fragments)(?:\/|$)|\.(?:sqlite|sqlite3|db)(?:-wal|-shm)?$|\.test\.[cm]?js$|\.pem$/i;
const authority = /^games\/(?:registry\.mjs|[^/]+\/(?:engine|projection)\.mjs)$/;
const frameworkMetadata = new Set(['.assetsignore', '.vite/manifest.json', '_headers', 'vinext-client-entry-manifest.json']);
const frameworkChunk = /^_next\/static\/(?:chunks|css)\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+[-.][A-Za-z0-9_-]{6,}\.(?:js|css)$/;
const frameworkManifest = /^_next\/static\/[A-Za-z0-9_-]+\/_(?:build|ssg)Manifest\.js$/;
const isFramework = name => frameworkMetadata.has(name) || frameworkChunk.test(name) || frameworkManifest.test(name);

async function inventory(directory, relative = '') {
  const files = [];
  for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
    const name = path.posix.join(relative, entry.name);
    assert.ok(!forbidden.test(name) && !authority.test(name), `Forbidden production browser path: ${name}`);
    if (entry.isDirectory()) files.push(...await inventory(directory, name));
    else {
      assert.equal(entry.isFile(), true, `Production browser output must use regular files: ${name}`);
      files.push(name);
    }
  }
  return files.sort();
}

/** output is injectable only for isolated artifact-boundary negative tests. */
export async function verifyProductionDelivery({ root = defaultRoot, output = path.join(root, 'dist/client') } = {}) {
  root = await realpath(root);
  output = path.resolve(output);
  assert.equal(await realpath(output), output, 'Production browser output must not be a symlinked directory');
  const expected = new Map();
  for (const { url, source } of BROWSER_FILES) {
    assert.ok(url.startsWith('/') && !url.startsWith('//') && !/[?#]/.test(url), 'Expected a local browser delivery URL');
    expected.set(url.slice(1), source);
  }
  for (const source of [...ASSET_FILES, 'public/downloads/sofa-arcade-local.zip']) {
    assert.ok(source.startsWith('public/'), `Expected a public asset source: ${source}`);
    expected.set(source.slice('public/'.length), source);
  }

  const files = await inventory(output);
  const present = new Set(files);
  for (const [name, source] of expected) {
    assert.ok(present.has(name), `Missing production browser delivery file: ${name}`);
    const authored = await readFile(await checkedRuntimePath(root, source));
    const delivered = await readFile(path.join(output, name));
    assert.ok(delivered.equals(authored), `Production browser bytes differ from their declared source: ${name}`);
    if (!source.startsWith('public/')) {
      const derived = await readFile(await checkedRuntimePath(root, 'public/' + name));
      assert.ok(derived.equals(authored), `Committed browser copy differs from its authored source: ${name}`);
    }
  }

  const tracked = execFileSync('git', ['ls-files', '-z', '--', 'public'], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).split('\0').filter(Boolean).map(name => name.slice('public/'.length));
  const excludedSources = new Set(tracked.filter(name => !expected.has(name)));
  for (const name of files) {
    assert.ok(!excludedSources.has(name), `Authored public source outside the delivery allowlist reached production: ${name}`);
    assert.ok(expected.has(name) || isFramework(name), `Undeclared production browser file: ${name}`);
  }
  return {
    passed: true,
    declaredPublicFiles: expected.size,
    generatedFrameworkFiles: files.filter(name => !expected.has(name)).length,
    excludedTrackedPublicSources: excludedSources.size,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await verifyProductionDelivery(), null, 2));
}
