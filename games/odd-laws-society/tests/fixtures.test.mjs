import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PROJECTED_FIXTURES, FIXTURE_NAMES, getProjectedFixture } from '../fixtures/projected/index.mjs';
import { projectedFixtures } from './fixture-source.mjs';
import { generateFixtures } from './generate-fixtures.mjs';

test('canonical TV/Jon/Lydia fixtures regenerate from legal traces without drift', async () => {
  assert.deepEqual(PROJECTED_FIXTURES, projectedFixtures());
  await generateFixtures({ check: true });
  assert.deepEqual(FIXTURE_NAMES, ['council-unsubmitted', 'council-jon-locked', 'council-lydia-locked', 'council-revealed', 'ordinary-turn', 'late-full-city', 'finished-tie']);
  for (const name of FIXTURE_NAMES) for (const role of ['tv', 'jon', 'lydia']) {
    const view = getProjectedFixture(name, role);
    assert.deepEqual(view, PROJECTED_FIXTURES[name][role]);
    view.players.jon.coins = 999;
    assert.notEqual(PROJECTED_FIXTURES[name][role].players.jon.coins, 999);
    assert.ok(!JSON.stringify(PROJECTED_FIXTURES[name][role]).includes('"commitments"'));
    assert.ok(!JSON.stringify(PROJECTED_FIXTURES[name][role]).includes('"budgets"'));
  }
  assert.deepEqual(PROJECTED_FIXTURES['finished-tie'].tv.result, { winner: 'tie', scores: { jon: 50, lydia: 50 } });
  assert.equal(PROJECTED_FIXTURES['late-full-city'].tv.players.jon.city.filter(Boolean).length, 9);
});

test('browser-safe preview/catalog/error/fixture dependency closure excludes authority and private test data', async () => {
  const base = fileURLToPath(new URL('../', import.meta.url));
  const allowed = new Set(['catalog.mjs', 'preview.mjs', 'errors.mjs', 'rules.mjs', 'fixtures/projected/index.mjs']);
  const seen = new Set();
  async function inspect(relative) {
    if (seen.has(relative)) return;
    seen.add(relative);
    assert.ok(allowed.has(relative), `Unexpected browser dependency: ${relative}`);
    const filename = resolve(base, relative);
    const source = await readFile(filename, 'utf8');
    assert.ok(!/\b(?:fetch|eval)\s*\(|new\s+Function|\bprocess\./.test(source), `Unexpected side effect in ${relative}`);
    const imports = source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g);
    for (const [, specifier] of imports) {
      assert.ok(specifier.startsWith('./') || specifier.startsWith('../'), `Nonlocal browser import: ${specifier}`);
      const next = resolve(dirname(filename), specifier).slice(base.length);
      await inspect(next);
    }
  }
  await inspect('preview.mjs');
  await inspect('fixtures/projected/index.mjs');
  assert.ok(!seen.has('engine.mjs') && !seen.has('projection.mjs'));
});
