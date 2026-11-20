import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, chmod } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkComponentLock } from './component-lock.mjs';

async function repository(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'sofa-component-lock-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = async (filename, contents) => {
    await mkdir(path.dirname(path.join(root, filename)), { recursive: true });
    await writeFile(path.join(root, filename), contents);
  };
  const commit = message => {
    git('add', '--all');
    git('-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  git('init', '--quiet', '--initial-branch=fixture');
  git('config', 'user.name', 'WS6 acceptance fixture');
  git('config', 'user.email', 'ws6-fixture@example.invalid');
  git('config', 'core.fileMode', 'true');
  const components = [];
  for (let index = 1; index <= 5; index++) {
    const id = `WS${index}`;
    const protectedPath = `components/ws${index}`;
    const report = `docs/workstreams/ws${index}.md`;
    await write(`${protectedPath}/module.mjs`, `export const component = '${id}';\n`);
    await write(`${protectedPath}/.gitignore`, 'ignored-output/\n');
    await write(report, `# ${id}\n\nA tested fixture handoff.\n`);
    components.push({ id, branch: `feature/ws${index}`, report, pr: index, head: null,
      status: 'included', protectedPaths: [protectedPath], postHandoffCorrections: [] });
  }
  const base = commit('Create the five isolated component fixtures');
  for (const component of components) component.head = base;
  const lock = { schemaVersion: 1, repository: 'jonathanjie/sofa-arcade', integrationBranch: 'feature/local-integration',
    base: { ref: 'main', sha: base }, components };
  const save = async (message = 'Record the component checkpoint') => {
    await write('tests/integration/components.json', JSON.stringify(lock, null, 2) + '\n');
    commit(message);
  };
  await save();
  return { root, git, write, commit, base, lock, save,
    check: (options = {}) => checkComponentLock({ root, ...options }) };
}

test('a committed exact component matrix passes and a missing handoff stays explicitly incomplete', async t => {
  const repo = await repository(t);
  const verified = await repo.check({ complete: true });
  assert.deepEqual(verified.errors, []);
  assert.equal(verified.complete, true);
  assert.equal(verified.base, repo.base);
  assert.equal(verified.head, repo.git('rev-parse', 'HEAD'));
  Object.assign(repo.lock.components[4], { status: 'awaiting-handoff', head: null, pr: null });
  await repo.save();
  const preparation = await repo.check();
  assert.deepEqual(preparation.errors, []);
  assert.equal(preparation.complete, false);
  assert.equal(preparation.waiting.length, 1);
  const release = await repo.check({ complete: true });
  assert.equal(release.complete, false);
  assert.ok(release.errors.some(value => value.startsWith('WS5:')));
});

test('both the recorded base and each included head must actually be ancestors', async t => {
  const repo = await repository(t);
  const unrelated = repo.git('commit-tree', repo.git('rev-parse', 'HEAD^{tree}'), '-m', 'An unrelated fixture history');
  repo.lock.base.sha = unrelated;
  await repo.save();
  assert.ok((await repo.check()).errors.some(value => value.includes('base SHA') && value.includes('not an ancestor')));
  repo.lock.base.sha = repo.base;
  repo.lock.components[1].head = unrelated;
  await repo.save();
  assert.ok((await repo.check()).errors.some(value => value.startsWith('WS2:') && value.includes('not an ancestor')));
});

test('owner reports are protected even when callers omit them from protectedPaths', async t => {
  const repo = await repository(t);
  const report = repo.lock.components[0].report;
  await repo.write(report, '# Rewritten owner handoff\n');
  repo.commit('Alter a component report without a correction');
  assert.ok((await repo.check()).errors.includes(`WS1: unrecorded post-handoff change: ${report}`));

  const missingAtHandoff = 'docs/workstreams/introduced-after-handoff.md';
  await repo.write(missingAtHandoff, '# Not part of the owner head\n');
  repo.lock.components[1].report = missingAtHandoff;
  await repo.save();
  assert.ok((await repo.check()).errors.some(value => value.startsWith('WS2:') && value.includes('report must be a regular committed file')));
});

test('a correction pins one exact changed file, its bytes and its executable mode', async t => {
  const repo = await repository(t);
  const filename = 'components/ws2/module.mjs';
  await repo.write(filename, "export const component = 'WS2';\n// Reviewed serving entry.\n");
  repo.commit('Apply the reviewed isolated integration correction');
  const correction = { path: filename, blob: repo.git('rev-parse', `HEAD:${filename}`), mode: '100644',
    reason: 'Add one reviewed fixture serving entry.', verification: 'The isolated fixture check passed.' };
  repo.lock.components[1].postHandoffCorrections = [correction];
  await repo.save();
  assert.deepEqual((await repo.check({ complete: true })).errors, []);

  await chmod(path.join(repo.root, filename), 0o755);
  repo.commit('Unexpectedly change the corrected file mode');
  assert.equal(repo.git('rev-parse', `HEAD:${filename}`), correction.blob, 'The mode probe does not change content');
  assert.ok((await repo.check()).errors.includes(`WS2: correction blob/mode no longer matches the candidate: ${filename}`));
  correction.mode = '100755';
  await repo.save('Explicitly review and pin the executable mode');
  assert.deepEqual((await repo.check()).errors, []);

  await repo.write(filename, "export const component = 'WS2';\n// An unreviewed second change.\n");
  repo.commit('Alter content behind an existing path exemption');
  assert.ok((await repo.check()).errors.includes(`WS2: correction blob/mode no longer matches the candidate: ${filename}`));
  correction.path = 'components/ws2/*.mjs';
  await repo.save('Attempt a correction wildcard');
  assert.ok((await repo.check()).errors.some(value => value.startsWith('WS2:') && value.includes('exact file path')));
  correction.path = filename;
  delete correction.blob;
  await repo.save('Attempt an unpinned correction');
  assert.ok((await repo.check()).errors.some(value => value.startsWith('WS2:') && value.includes('blob SHA')));
});

test('local checks reject staged, unstaged and untracked protected changes while allowing ignored build output', async t => {
  const repo = await repository(t);
  await repo.write('components/ws3/ignored-output/result.json', '{}\n');
  assert.deepEqual((await repo.check()).errors, [], 'Ignored owner test output is not component source');

  const staged = 'components/ws1/module.mjs';
  await repo.write(staged, '// Staged uncommitted authority.\n');
  repo.git('add', '--', staged);
  const unstaged = repo.lock.components[2].report;
  await repo.write(unstaged, '# Uncommitted report\n');
  const untracked = 'components/ws4/unreviewed.mjs';
  await repo.write(untracked, '// Untracked component source.\n');
  const result = await repo.check();
  for (const filename of [staged, unstaged, untracked]) {
    assert.ok(result.errors.some(value => value.includes(`protected working tree differs from the candidate commit: ${filename}`)));
  }
});

test('malformed checkpoint structure fails as an actionable result rather than crashing', async t => {
  const repo = await repository(t);
  await repo.write('tests/integration/components.json', 'null\n');
  assert.equal((await repo.check()).complete, false);
  assert.ok((await repo.check()).errors.some(value => value.includes('must be an object')));
  await repo.write('tests/integration/components.json', JSON.stringify({ ...repo.lock, components: {} }));
  assert.ok((await repo.check()).errors.some(value => value.includes('WS1–WS5 exactly once')));
});
