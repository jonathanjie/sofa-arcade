import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateShape, validateManifest, DEFAULT_MANIFEST } from './validate-manifest.mjs';
import { BUILDINGS, LAWS, imageEntries } from './contract.mjs';

const manifest = JSON.parse(await readFile(DEFAULT_MANIFEST, 'utf8'));
test('inventory matches the actual v0.2 PRD tables, including every exact ID', async () => {
  const prd = await readFile(new URL('../../../docs/games/odd-laws-society.md', import.meta.url), 'utf8');
  const ids = [...prd.matchAll(/^\| `([a-z-]+)` — /gm)].map(match => match[1]);
  assert.deepEqual(ids, [...BUILDINGS, ...LAWS].map(x => x.id));
});
test('every declared image exists, decodes, has accurate dimensions and transparency, and is final', async () => {
  const result = await validateManifest();
  assert.equal(result.placeholders, 0);
  assert.ok(result.entries >= 54);
});
test('validator rejects missing catalog IDs, wrong case, escaping URLs, wrong dimensions and hidden placeholders', () => {
  for (const corrupt of [
    m => { delete m.buildings['tea-stall']; },
    m => { m.buildings['tea-stall'] = {}; },
    m => { m.laws['shop-local'] = { layers: [] }; },
    m => { m.characters.Jon = m.characters.jon; delete m.characters.jon; },
    m => { delete m.characters.lala.states.stamp; },
    m => { m.props.coin.src = '../characters.png'; },
    m => { m.props.coin.src = 'https://example.com/coin.png'; },
    m => { m.props.coin.width = 0; },
    m => { m.props.coin.status = 'placeholder'; },
    m => { m.props.coin.alt = ''; },
    m => { m.props.coin.anchors = { center: [1.2, .5] }; },
  ]) {
    const bad = structuredClone(manifest); corrupt(bad);
    assert.throws(() => validateShape(bad));
  }
});
test('optional atlas bounds cannot extend beyond a delivered source', () => {
  const bad = structuredClone(manifest);
  bad.props.coin.frame = { x: bad.props.coin.width - 1, y: 0, width: 20, height: 20 };
  assert.throws(() => validateShape(bad));
});
test('optional layers alongside a flat state cannot evade reference validation', () => {
  const layered = structuredClone(manifest);
  layered.characters.jon.states.idle.layers = [{ ...manifest.props.coin }];
  assert.equal(imageEntries(layered).length, imageEntries(manifest).length + 1);
  assert.doesNotThrow(() => validateShape(layered));
  layered.characters.jon.states.idle.layers[0].src = '../not-shipped.png';
  assert.throws(() => validateShape(layered));
});
