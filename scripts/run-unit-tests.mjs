/**
 * Runs every Node unit test under the source folders, so a new *.test.mjs file
 * runs in `npm test` without anyone editing a file list.
 *
 * Tests that need a real browser are listed in BROWSER_TESTS. They run in the
 * browser CI jobs (`npm run test:browser`) after Playwright installs Chromium.
 * Tests that need a component's own nested `npm ci` are listed in
 * NESTED_INSTALL_TESTS; that component's workflow installs and runs them.
 *
 * The installed gate lets Node resolve every dependency. Only --standalone
 * filters tests that depend on missing packages.
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
  // Reads server/secure-lan/node_modules, installed by the GO6 workflow.
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
  function visit(folder) {
    for (const entry of readdirSync(path.join(root, folder), { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const relative = folder + '/' + entry.name;
      if (entry.isDirectory()) visit(relative);
      else if (entry.isFile() && entry.name.endsWith('.test.mjs')
        && !BROWSER_TESTS.has(relative) && !NESTED_INSTALL_TESTS.has(relative)) files.push(relative);
    }
  }
  for (const folder of SOURCE_FOLDERS) visit(folder);
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

const standalone = process.argv[2] === '--standalone';
const exhaustive = process.argv[2] === '--exhaustive';
const proofFiles = {
  'gravity-orchard': unit => unit.startsWith('games/gravity-orchard/tests/'),
  'odd-laws-society': unit => unit === 'games/odd-laws-society/tests/simulation.test.mjs',
};
const game = process.argv[3];
if ((process.argv[2] && !standalone && !exhaustive) || (game && (!exhaustive || !Object.hasOwn(proofFiles, game)))) {
  throw new Error('Usage: run-unit-tests.mjs [--standalone | --exhaustive [game]]');
}
const selected = game ? [proofFiles[game]] : Object.values(proofFiles);
const runnable = [];
for (const file of unitTestFiles()) {
  if (exhaustive && !selected.some(matches => matches(file))) continue;
  const missing = standalone && missingPackage(path.join(root, file));
  if (missing) console.log(`Standalone excludes ${file} (needs ${missing})`);
  else runnable.push(file);
}
console.log(`Separate browser suite: ${[...BROWSER_TESTS].join(', ')}`);
console.log(`Separate nested install suite: ${[...NESTED_INSTALL_TESTS].join(', ')}`);
if (!runnable.length) throw new Error('No unit tests selected');
console.log(`Running ${runnable.length} test files`);
const result = spawnSync(process.execPath, ['--test', ...runnable], {
  cwd: root, stdio: 'inherit',
  env: exhaustive ? { ...process.env, SOFA_EXHAUSTIVE: '1' } : process.env,
});
process.exitCode = result.status ?? 1;
