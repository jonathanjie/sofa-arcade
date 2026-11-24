import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const browser = process.argv.includes('--browser');
function suites(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? suites(path) : entry.name.endsWith('.test.mjs') ? [path] : [];
  });
}
const files = [
  ...suites(fileURLToPath(new URL('./', import.meta.url))),
  ...suites(fileURLToPath(new URL('../../../../ui/realtime/gravity-orchard/tests/', import.meta.url))),
].filter(file => file.includes('fixture-browser.test.mjs') === browser).sort();
if (!files.length) throw new Error(`No GO2 ${browser ? 'browser' : 'protocol/client'} suites were discovered.`);
console.log(`GO2 ${browser ? 'browser' : 'protocol/client'}: ${files.length} suites; ${process.version} ${process.platform}/${process.arch}`);
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], {
  cwd: root, stdio: 'inherit',
  env: process.argv.includes('--exhaustive') ? { ...process.env, SOFA_EXHAUSTIVE: '1' } : process.env,
});
if (result.error) throw result.error;
if (result.signal) process.kill(process.pid, result.signal);
process.exitCode = result.status ?? 1;
