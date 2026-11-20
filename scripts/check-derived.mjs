/** Regeneration must prove that the committed deliverables were already current. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const result = spawnSync('git', [
  'status', '--porcelain=v1', '--untracked-files=all', '--', 'public', 'app/route.ts',
], { cwd: root, encoding: 'utf8' });
if (result.error || result.status !== 0) {
  throw result.error || new Error('Could not verify generated delivery files against Git.');
}
if (result.stdout.trim()) {
  console.error('Committed browser/portable deliverables are stale. Regenerate and commit the listed files before acceptance.');
  console.error(result.stdout.trim());
  process.exitCode = 1;
} else {
  console.log('Committed browser modules, root HTML and portable archive reproduce without changes.');
}
