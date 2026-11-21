/**
 * Runs every Node unit test under the source folders, so a new *.test.mjs file
 * runs in `npm test` without anyone editing a file list.
 *
 * Tests that need a real browser are listed in BROWSER_TESTS. They run in the
 * browser CI jobs (`npm run test:browser`) after Playwright installs Chromium.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const SOURCE_FOLDERS = ['game', 'games', 'server', 'ui'];
export const BROWSER_TESTS = new Set(['server/room-browser.test.mjs']);

function unitTestFiles() {
  const files = [];
  for (const folder of SOURCE_FOLDERS) {
    for (const entry of readdirSync(path.join(root, folder), { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.test.mjs')) continue;
      const relative = path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/');
      if (relative.split('/').includes('node_modules') || BROWSER_TESTS.has(relative)) continue;
      files.push(relative);
    }
  }
  return files.sort();
}

const files = unitTestFiles();
const result = spawnSync(process.execPath, ['--test', ...files], { cwd: root, stdio: 'inherit' });
process.exitCode = result.status ?? 1;
