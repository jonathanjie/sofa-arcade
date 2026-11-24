import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

async function runnerFixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'sofa-unit-runner-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const folder of ['scripts', 'game', 'games', 'server', 'ui']) {
    await mkdir(path.join(root, folder));
  }
  const runner = 'scripts/run-unit-tests.mjs';
  await copyFile(new URL('../../' + runner, import.meta.url), path.join(root, runner));
  return {
    async write(filename, source) {
      const target = path.join(root, filename);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, source);
    },
    run(...flags) {
      // This is a fresh CLI invocation, outside the parent node:test session.
      const env = { ...process.env };
      delete env.NODE_TEST_CONTEXT;
      const result = spawnSync(process.execPath, [runner, ...flags], {
        cwd: root, env, encoding: 'utf8', timeout: 60_000,
      });
      if (result.error) throw result.error;
      assert.equal(result.signal, null);
      return { status: result.status, output: result.stdout + result.stderr };
    },
  };
}

test('strict unit discovery requires dependencies and standalone reports transitive exclusions', async t => {
  const fixture = await runnerFixture(t);
  await fixture.write('game/core.test.mjs', "import test from 'node:test'; test('core fixture executed', () => {});");
  await fixture.write('server/dependent.test.mjs', "import './adapter.mjs';");
  await fixture.write('server/adapter.mjs', "import 'sofa-missing-fixture-dependency';");
  for (const excluded of [
    'server/room-browser.test.mjs',
    'server/realtime/gravity-orchard/tests/fixture-browser.test.mjs',
    'server/secure-lan/tests/inventory.test.mjs',
    'games/nested/node_modules/example/vendor.test.mjs',
  ]) {
    await fixture.write(excluded, "throw new Error('excluded fixture executed');");
  }
  const strict = fixture.run();
  assert.equal(strict.status, 1, strict.output);
  assert.match(strict.output, /sofa-missing-fixture-dependency/);
  const standalone = fixture.run('--standalone');
  assert.equal(standalone.status, 0, standalone.output);
  assert.match(standalone.output, /server\/dependent\.test\.mjs/);
  assert.match(standalone.output, /sofa-missing-fixture-dependency/);
  assert.match(standalone.output, /core fixture executed/);
  assert.doesNotMatch(strict.output + standalone.output, /excluded fixture executed/);
});

test('zero selected files fail without falling through to Node default discovery', async t => {
  const fixture = await runnerFixture(t);
  await fixture.write('outside.test.mjs', "throw new Error('unrelated suite executed');");
  for (const flags of [[], ['--standalone']]) {
    const result = fixture.run(...flags);
    assert.equal(result.status, 1, result.output);
    assert.doesNotMatch(result.output, /unrelated suite executed/);
  }
});
