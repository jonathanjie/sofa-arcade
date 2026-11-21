import { readFile, lstat, realpath, mkdir, copyFile, chmod, rm, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isBuiltin } from 'node:module';
import { parse } from 'acorn';

// The native parent validates a fixed staged resource root. Preserve its one
// deliberate runtime-root import and require that exact named module to ship.
const boundedDynamicImports = new Map([
  ['desktop/host/entry.mjs', new Map([
    ["import(pathToFileURL(path.join(options.root, 'server/lan.mjs')).href)", '../../server/lan.mjs'],
  ])],
  ['ui/collection-load.mjs', new Map([
    ['import(path)', ['/games/odd-laws-society/index.mjs', '/games/odd-laws-society/tutorial.mjs',
      '/games/odd-laws-society/catalog.mjs', '/games/odd-laws-society/preview.mjs',
      '/room-client.mjs', '/media/odd-laws-society/score.mjs', '/media/odd-laws-society/effects.mjs']],
  ])],
]);

/** Parse actual imports; diagnostic strings/comments must not invent dependencies. */
export function runtimeModuleSpecifiers(text, filename = 'runtime.mjs') {
  const syntax = parse(text, {ecmaVersion: 'latest', sourceType: 'module'});
  const specifiers = [];
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(node.type) && node.source) specifiers.push(node.source.value);
    if (node.type === 'ImportExpression') {
      const specifier = node.source.type === 'Literal' ? node.source.value
        : boundedDynamicImports.get(filename)?.get(text.slice(node.start, node.end));
      if (typeof specifier !== 'string' && !Array.isArray(specifier)) throw new Error(`Unbounded dynamic runtime import in ${filename}`);
      specifiers.push(...(Array.isArray(specifier) ? specifier : [specifier]));
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(syntax);
  return specifiers;
}

export const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
export const desktopRoot = path.join(repoRoot, 'desktop');
export const sha256 = contents => createHash('sha256').update(contents).digest('hex');
const forbidden = /(^|\/)(?:\.[^/]+|node_modules|target|dist|test-results|artifacts|__tests__)(\/|$)|\.(?:sqlite(?:3)?|db|log|zip|tgz|map)(?:-|$)|(?:^|\/)(?:credentials|secrets)(?:\.|\/|$)|\.test\.[cm]?js$/i;

export function validateManifest(value) {
  if (!value || value.schemaVersion !== 1 || Object.keys(value).sort().join(',') !== 'files,schemaVersion' || !Array.isArray(value.files) || !value.files.length) throw new Error('Invalid runtime manifest schema.');
  const seen = new Set();
  for (const entry of value.files) {
    if (!entry || Object.keys(entry).some(key => !['path', 'mode'].includes(key)) || typeof entry.path !== 'string' || !/^[A-Za-z0-9_][A-Za-z0-9_./-]*$/.test(entry.path) || entry.path.split('/').some(part => !part || ['.', '..'].includes(part)) || forbidden.test(entry.path)) throw new Error(`Unsafe runtime manifest entry: ${entry?.path}`);
    if (seen.has(entry.path)) throw new Error(`Duplicate runtime entry: ${entry.path}`);
    seen.add(entry.path);
    if (entry.mode !== undefined && ![0o644, 0o755].includes(entry.mode)) throw new Error(`Unsupported runtime mode: ${entry.path}`);
  }
  for (const required of ['server/lan.mjs', 'server/rooms.mjs', 'game/engine.mjs', 'games/catalog.mjs', 'games/registry.mjs', 'ui/index.html', 'ui/app.js', 'desktop/host/entry.mjs', 'public/assets/qrcode-LICENSE.txt']) if (!seen.has(required)) throw new Error(`Missing required runtime file: ${required}`);
  if (!value.files.some(item => /^drizzle\/[^/]+\.sql$/.test(item.path))) throw new Error('Runtime manifest needs explicit SQL migrations.');
  return value;
}

export async function readManifest(root = repoRoot) {
  return validateManifest(JSON.parse(await readFile(path.join(root, 'desktop/runtime-manifest.json'), 'utf8')));
}

export async function sourceFile(root, relative) {
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw new Error(`Runtime symlinks are forbidden: ${relative}`);
  }
  const stats = await lstat(current);
  if (!stats.isFile()) throw new Error(`Runtime entry is not a regular file: ${relative}`);
  return { filename: current, mode: stats.mode & 0o777 };
}

export async function listFiles(folder, prefix = '') {
  const values = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) values.push(...await listFiles(path.join(folder, entry.name), relative + '/'));
    else if (entry.isFile()) values.push(relative);
    else throw new Error(`Staged runtime contains a non-regular entry: ${relative}`);
  }
  return values.sort();
}

export async function stageRuntime({ root = repoRoot, destination = path.join(desktopRoot, 'stage/runtime') } = {}) {
  root = await realpath(root);
  const manifest = await readManifest(root);
  const migrations = (await readdir(path.join(root, 'drizzle'))).filter(name => name.endsWith('.sql')).map(name => 'drizzle/' + name).sort();
  const listedMigrations = manifest.files.filter(entry => /^drizzle\/[^/]+\.sql$/.test(entry.path)).map(entry => entry.path).sort();
  if (JSON.stringify(migrations) !== JSON.stringify(listedMigrations)) throw new Error('Every SQL migration must be explicitly listed in the runtime manifest.');
  // Validate every source and import before replacing a previous good stage.
  const sources = [];
  const filenames = new Set(manifest.files.map(entry => entry.path));
  for (const entry of manifest.files) {
    const source = await sourceFile(root, entry.path);
    const contents = await readFile(source.filename);
    if (/\.m?js$/.test(entry.path)) {
      const text = contents.toString('utf8');
      for (const imported of runtimeModuleSpecifiers(text, entry.path)) {
        const specifier = imported.split('?')[0];
        if (specifier.startsWith('.')) {
          const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(entry.path), specifier));
          if (!filenames.has(resolved)) throw new Error(`Missing runtime import ${specifier} from ${entry.path}`);
        } else if (!specifier.startsWith('/') && !isBuiltin(specifier)) throw new Error(`Runtime has an unbundled dependency: ${specifier}`);
      }
    }
    sources.push({ ...entry, ...source, mode: entry.mode ?? source.mode, contents });
  }
  const temporary = destination + '.pending';
  await rm(temporary, { recursive: true, force: true });
  await mkdir(temporary, { recursive: true });
  try {
    const inventory = [];
    for (const entry of sources) {
      const output = path.join(temporary, entry.path);
      await mkdir(path.dirname(output), { recursive: true });
      await copyFile(entry.filename, output);
      await chmod(output, entry.mode);
      inventory.push({ path: entry.path, mode: entry.mode, bytes: entry.contents.length, sha256: sha256(entry.contents) });
    }
    await rm(destination, { recursive: true, force: true });
    const { rename } = await import('node:fs/promises');
    await rename(temporary, destination);
    await writeFile(path.join(path.dirname(destination), 'runtime-inventory.json'), JSON.stringify({ schemaVersion: 1, files: inventory }, null, 2) + '\n');
    return inventory;
  } catch (error) { await rm(temporary, { recursive: true, force: true }); throw error; }
}

export async function verifyRuntime({ root = repoRoot, destination = path.join(desktopRoot, 'stage/runtime') } = {}) {
  const manifest = await readManifest(root);
  const actual = await listFiles(destination);
  const expected = manifest.files.map(entry => entry.path).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Staged runtime differs from the explicit allowlist.');
  for (const entry of manifest.files) {
    const source = await sourceFile(root, entry.path);
    const staged = await sourceFile(destination, entry.path);
    if (sha256(await readFile(source.filename)) !== sha256(await readFile(staged.filename))) throw new Error(`Staged runtime is stale or modified: ${entry.path}`);
    if (staged.mode !== (entry.mode ?? source.mode)) throw new Error(`Staged mode differs: ${entry.path}`);
  }
  return { files: expected.length };
}
