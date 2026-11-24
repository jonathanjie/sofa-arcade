/**
 * Discover eligible *.test.mjs files in game, games, server and ui so new
 * unit tests need no registration.
 *
 * Several CI jobs run npm test without installing root dependencies. Keep
 * that regression check working by reporting and skipping tests whose static
 * import graph needs an unavailable npm package, such as ws.
 *
 * Run BROWSER_TESTS with npm run test:browser after installing Chromium.
 * Run NESTED_INSTALL_TESTS in the owning component after its npm ci because
 * those tests read that component's installed dependencies. Installing root
 * packages leaves both suites separate.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const SOURCE_FOLDERS = ['game', 'games', 'server', 'ui'];
export const BROWSER_TESTS = new Set([
  'server/room-browser.test.mjs',
  'server/realtime/gravity-orchard/tests/fixture-browser.test.mjs',
]);
export const NESTED_INSTALL_TESTS = new Set([
  // Reads the secure-LAN component’s own installed dependency inventory.
  'server/secure-lan/tests/inventory.test.mjs',
]);

const BUILTINS = new Set(builtinModules);
// Top-level static imports only: Node must resolve these before a test file can
// start. A line-anchored match ignores look-alike text inside strings and
// bundled code; dynamic import() calls are left to fail or be guarded at runtime.
const IMPORT_PATTERNS = [
  /^\s*(?:import|export)\s[^'"]*?\bfrom\s*['"]([^'"]+)['"]/gm,
  /^\s*import\s*['"]([^'"]+)['"]/gm,
];

function unitTestFiles() {
  const files = [];
  for (const folder of SOURCE_FOLDERS) {
    for (const entry of readdirSync(path.join(root, folder), { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.test.mjs')) continue;
      const relative = path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/');
      if (relative.split('/').includes('node_modules') || BROWSER_TESTS.has(relative) || NESTED_INSTALL_TESTS.has(relative)) continue;
      files.push(relative);
    }
  }
  return files.sort();
}

/** The package name of a bare specifier: `ws`, `@peculiar/x509`, `pkg/sub` → `pkg`. */
function packageName(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** Whether Node could find this package from `fromFile`, by walking up node_modules folders. */
function packageInstalled(name, fromFile) {
  let directory = path.dirname(fromFile);
  while (true) {
    if (existsSync(path.join(directory, 'node_modules', name, 'package.json'))) return true;
    const parent = path.dirname(directory);
    if (parent === directory) return false;
    directory = parent;
  }
}

/** The first missing npm package anywhere in this file's local import graph, or null. */
function missingPackage(file, visited = new Set()) {
  if (visited.has(file)) return null;
  visited.add(file);
  let source;
  try { source = readFileSync(file, 'utf8'); } catch { return null; }
  const specifiers = IMPORT_PATTERNS.flatMap(pattern => [...source.matchAll(pattern)].map(match => match[1]));
  for (const specifier of specifiers) {
    if (specifier.startsWith('node:') || BUILTINS.has(specifier)) continue;
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
      const target = path.resolve(path.dirname(file), specifier);
      if (/\.m?js$/.test(target)) {
        const missing = missingPackage(target, visited);
        if (missing) return missing;
      }
      continue;
    }
    const name = packageName(specifier);
    if (!packageInstalled(name, file)) return name;
  }
  return null;
}

const runnable = [];
const skipped = [];
for (const file of unitTestFiles()) {
  const missing = missingPackage(path.join(root, file));
  if (missing) skipped.push({ file, missing });
  else runnable.push(file);
}
if (skipped.length) {
  console.log(`Skipping ${skipped.length} test file(s) whose packages are not installed (run \`npm ci\` to include them):`);
  for (const { file, missing } of skipped) console.log(`  ${file} (needs ${missing})`);
}
const result = spawnSync(process.execPath, ['--test', ...runnable], { cwd: root, stdio: 'inherit' });
process.exitCode = result.status ?? 1;
