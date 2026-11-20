/** Freeze the exact reviewed combination; never resolve moving branch tips here. */
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const defaultRoot = fileURLToPath(new URL('../../', import.meta.url));
const expected = ['WS1', 'WS2', 'WS3', 'WS4', 'WS5'];
const sha = /^[0-9a-f]{40}$/;
const regularModes = new Set(['100644', '100755']);
const safePath = (value, patterns = false) => typeof value === 'string' && value.length > 0
  && (patterns ? /^[A-Za-z0-9._/*?-]+$/ : /^[A-Za-z0-9._/-]+$/).test(value)
  && !value.startsWith('/') && value.split('/').every(part => part && part !== '.' && part !== '..');
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const filenames = value => value.split('\0').filter(Boolean);

/** The injectable root is only for isolated Git-fixture tests, never an HTTP input. */
export async function checkComponentLock({ complete = false, root = defaultRoot } = {}) {
  const errors = [];
  const waiting = [];
  let lock;
  try { lock = JSON.parse(await readFile(path.join(root, 'tests/integration/components.json'), 'utf8')); }
  catch { return { schemaVersion: 1, complete: false, base: null, head: null, errors: ['The component checkpoint is missing or invalid JSON.'], waiting }; }
  if (!lock || typeof lock !== 'object' || Array.isArray(lock)) {
    return { schemaVersion: 1, complete: false, base: null, head: null, errors: ['The component checkpoint must be an object.'], waiting };
  }
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  let head;
  try { head = git(['rev-parse', '--verify', 'HEAD']).trim(); }
  catch { return { schemaVersion: 1, complete: false, base: lock?.base?.sha || null, head: null, errors: ['The candidate must have a committed Git HEAD.'], waiting }; }
  const treeEntry = (revision, filename) => {
    const entries = filenames(git(['ls-tree', '-z', revision, '--', filename]));
    if (entries.length !== 1) return null;
    const match = /^(\d{6}) (blob|tree|commit) ([0-9a-f]{40})\t(.+)$/.exec(entries[0]);
    return match && match[4] === filename ? { mode: match[1], type: match[2], blob: match[3] } : null;
  };
  if (lock.schemaVersion !== 1 || lock.repository !== 'jonathanjie/sofa-arcade' || !sha.test(lock.base?.sha)) {
    errors.push('Invalid integration base/repository checkpoint.');
  }
  if (sha.test(lock.base?.sha)) {
    try { git(['merge-base', '--is-ancestor', lock.base.sha, head]); }
    catch { errors.push('The recorded base SHA is unavailable or is not an ancestor of the candidate.'); }
  }
  if (!Array.isArray(lock.components) || JSON.stringify(lock.components.map(component => component?.id)) !== JSON.stringify(expected)) {
    errors.push('The checkpoint must contain WS1–WS5 exactly once, in merge order.');
  }
  for (const component of Array.isArray(lock.components) ? lock.components : []) {
    if (!component || typeof component !== 'object') continue;
    if (component.status === 'awaiting-handoff') {
      waiting.push(`${component.id}: ${component.branch} has no tested included handoff`);
      continue;
    }
    if (component.status !== 'included' || !sha.test(component.head) || !Number.isInteger(component.pr) || component.pr < 1) {
      errors.push(`${component.id}: record an included immutable SHA and PR number.`);
      continue;
    }
    if (!Array.isArray(component.protectedPaths) || !component.protectedPaths.length
        || component.protectedPaths.some(value => !safePath(value, true)) || !safePath(component.report)) {
      errors.push(`${component.id}: declare safe protected paths and one exact report path.`);
      continue;
    }
    const protectedPaths = [...new Set([...component.protectedPaths, component.report])];
    try {
      git(['merge-base', '--is-ancestor', component.head, head]);
      for (const revision of [component.head, head]) {
        const report = treeEntry(revision, component.report);
        if (!report || report.type !== 'blob' || !regularModes.has(report.mode)) {
          errors.push(`${component.id}: the owner report must be a regular committed file at the handoff and candidate.`);
          break;
        }
      }
      const corrections = new Map();
      if (!Array.isArray(component.postHandoffCorrections)) {
        errors.push(`${component.id}: post-handoff corrections must be an explicit array.`);
      }
      for (const item of Array.isArray(component.postHandoffCorrections) ? component.postHandoffCorrections : []) {
        if (!item || !safePath(item.path) || !nonempty(item.reason) || !nonempty(item.verification)
            || !sha.test(item.blob) || !regularModes.has(item.mode)) {
          errors.push(`${component.id}: each correction requires an exact file path, reason, verification, blob SHA and regular-file mode.`);
          continue;
        }
        if (corrections.has(item.path)) errors.push(`${component.id}: duplicate correction for ${item.path}.`);
        corrections.set(item.path, item);
      }
      const changed = filenames(git(['diff', '--no-renames', '--name-only', '-z', component.head, head, '--', ...protectedPaths]));
      for (const file of changed) {
        if (!corrections.has(file)) errors.push(`${component.id}: unrecorded post-handoff change: ${file}`);
      }
      for (const [file, correction] of corrections) {
        if (!changed.includes(file)) {
          errors.push(`${component.id}: correction does not name a changed protected file: ${file}`);
          continue;
        }
        const actual = treeEntry(head, file);
        if (!actual || actual.type !== 'blob' || actual.blob !== correction.blob || actual.mode !== correction.mode) {
          errors.push(`${component.id}: correction blob/mode no longer matches the candidate: ${file}`);
        }
      }
      // A local check must not validate HEAD while tests execute different
      // staged, unstaged, or newly added component source beside that commit.
      const dirty = new Set([
        ...filenames(git(['diff', '--no-renames', '--name-only', '-z', head, '--', ...protectedPaths])),
        ...filenames(git(['ls-files', '--others', '--exclude-standard', '-z', '--', ...protectedPaths])),
      ]);
      for (const file of dirty) errors.push(`${component.id}: protected working tree differs from the candidate commit: ${file}`);
    } catch {
      errors.push(`${component.id}: included head or protected source is unavailable, or its head is not an ancestor of this candidate.`);
    }
  }
  try { if (git(['rev-parse', '--verify', 'HEAD']).trim() !== head) errors.push('The candidate HEAD changed during component verification.'); }
  catch { errors.push('The candidate HEAD became unavailable during component verification.'); }
  if (complete) errors.push(...waiting);
  return { schemaVersion: 1, complete: errors.length === 0 && waiting.length === 0, base: lock.base?.sha || null, head, errors, waiting };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await checkComponentLock({ complete: process.argv.includes('--require-complete') });
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.errors.length ? 1 : 0;
}
