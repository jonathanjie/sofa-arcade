/** Freeze the exact reviewed combination; never resolve moving branch tips here. */
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const expected = ['WS1', 'WS2', 'WS3', 'WS4', 'WS5'];
const sha = /^[0-9a-f]{40}$/;

export async function checkComponentLock({ complete = false } = {}) {
  const lock = JSON.parse(await readFile(new URL('./components.json', import.meta.url), 'utf8'));
  const errors = [];
  const waiting = [];
  if (lock.schemaVersion !== 1 || lock.repository !== 'jonathanjie/sofa-arcade' || !sha.test(lock.base?.sha)) {
    errors.push('Invalid integration base/repository checkpoint.');
  }
  if (JSON.stringify(lock.components?.map(component => component.id)) !== JSON.stringify(expected)) {
    errors.push('The checkpoint must contain WS1–WS5 exactly once, in merge order.');
  }
  for (const component of lock.components || []) {
    if (component.status === 'awaiting-handoff') {
      waiting.push(`${component.id}: ${component.branch} has no tested included handoff`);
      continue;
    }
    if (component.status !== 'included' || !sha.test(component.head) || !Number.isInteger(component.pr) || component.pr < 1) {
      errors.push(`${component.id}: record an included immutable SHA and PR number.`);
      continue;
    }
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', component.head, 'HEAD'], { cwd: root, stdio: 'pipe' });
      const corrections = new Set((component.postHandoffCorrections || []).map(item => {
        if (!item.path || !item.reason || !item.verification) errors.push(`${component.id}: incomplete correction record.`);
        return item.path;
      }));
      const changed = execFileSync('git', ['diff', '--name-only', component.head, 'HEAD', '--', ...component.protectedPaths], {
        cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      }).trim().split('\n').filter(Boolean);
      for (const file of changed) {
        if (!corrections.has(file)) errors.push(`${component.id}: unrecorded post-handoff change: ${file}`);
      }
      await readFile(new URL(`../../${component.report}`, import.meta.url), 'utf8');
    } catch (error) {
      errors.push(`${component.id}: included head/report unavailable or head is not an ancestor of this candidate.`);
    }
  }
  if (complete) errors.push(...waiting);
  return { schemaVersion: 1, complete: errors.length === 0 && waiting.length === 0, base: lock.base.sha, errors, waiting };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await checkComponentLock({ complete: process.argv.includes('--require-complete') });
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.errors.length ? 1 : 0;
}
