import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkComponentLock } from './component-lock.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const strict = process.argv.includes('--require-complete');
const checkpoint = await checkComponentLock({ complete: strict });
for (const message of checkpoint.waiting) console.log(`PENDING COMPONENT: ${message}`);
if (checkpoint.errors.length) {
  for (const message of checkpoint.errors) console.error(message);
  process.exitCode = 1;
} else {
  async function discover(directory) {
    const found = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === 'evidence' || entry.name === 'node_modules') continue;
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) found.push(...await discover(filename));
      else if (entry.isFile() && entry.name.endsWith('.test.mjs')) found.push(filename);
    }
    return found;
  }
  const tests = (await discover(path.join(root, 'tests/integration'))).sort();
  if (!tests.length) throw new Error('No integration tests were found.');
  const child = spawn(process.execPath, ['--test', ...tests], {
    cwd: root,
    env: { ...process.env, ...(strict ? { SOFA_INTEGRATION_REQUIRE_COMPONENTS: '1' } : {}) },
    stdio: 'inherit',
  });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (status, signal) => resolve(signal ? 1 : status));
  });
  process.exitCode = code ?? 1;
}
