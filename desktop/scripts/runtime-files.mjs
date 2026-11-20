import { readFile, lstat, realpath, mkdir, copyFile, chmod, rm, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

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
      const imports = [...text.matchAll(/\b(?:import|export)\s+(?:[^;\n]*?\s+from\s*)?['"]([^'"]+)['"]/g), ...text.matchAll(/\bimport\(['"]([^'"]+)['"]\)/g)];
      for (const match of imports) {
        const specifier = match[1].split('?')[0];
        if (specifier.startsWith('.')) {
          const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(entry.path), specifier));
          if (!filenames.has(resolved)) throw new Error(`Missing runtime import ${specifier} from ${entry.path}`);
        } else if (!specifier.startsWith('/') && !specifier.startsWith('node:')) throw new Error(`Runtime has an unbundled dependency: ${specifier}`);
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
