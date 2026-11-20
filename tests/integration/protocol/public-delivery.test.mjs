import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stagePublicDelivery } from '../../../scripts/vite/collection-public.mjs';
import { ASSET_FILES, BROWSER_FILES } from '../../../scripts/runtime-files.mjs';
import { startLanServer } from '../../../server/lan.mjs';
import { request } from './harness.mjs';

const checkout = fileURLToPath(new URL('../../../', import.meta.url));
const declared = [...new Set([
  ...BROWSER_FILES.map(({ url }) => 'public' + url),
  ...ASSET_FILES,
  'public/downloads/sofa-arcade-local.zip',
])].sort();

async function write(root, relative, contents) {
  const filename = path.join(root, relative);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, contents);
}

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'sofa-public-boundary-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const relative of declared) await write(root, relative, `Declared bytes: ${relative}\n`);
  return root;
}

async function inventory(root, relative = '') {
  const files = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const name = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await inventory(root, name));
    else {
      assert.equal(entry.isFile(), true, `Staged output must contain regular files: ${name}`);
      files.push(name);
    }
  }
  return files.sort();
}

test('public delivery stages exact declared bytes while preserving unserved sources and excluding orphan private files', async t => {
  const root = await fixture(t);
  const canaries = [
    'public/assets/odd-laws-society/sources/generation-prompts.json',
    'public/assets/odd-laws-society/sources/contact-sheet.png',
    'public/assets/room-private.sqlite',
    'public/games/odd-laws-society/engine.mjs',
    'public/games/odd-laws-society/projection.mjs',
    'public/tests/integration/fixtures/private.json',
    'public/server/rooms.mjs',
    'public/orphan-module.mjs',
  ];
  for (const relative of canaries) await write(root, relative, 'Unserved development-only canary.\n');
  await write(root, '.sites-runtime/other-tool/keep.txt', 'Unrelated tool output.\n');
  const output = await stagePublicDelivery(root);
  assert.equal(output, path.join(root, '.sites-runtime', 'sofa-public'));
  assert.deepEqual(await inventory(output), declared.map(relative => relative.slice('public/'.length)).sort());
  for (const relative of declared) {
    assert.deepEqual(await readFile(path.join(output, relative.slice('public/'.length))), await readFile(path.join(root, relative)));
  }
  for (const relative of canaries) assert.equal(await readFile(path.join(root, relative), 'utf8'), 'Unserved development-only canary.\n');

  await write(output, 'games/odd-laws-society/engine.mjs', 'A stale staged authority copy.\n');
  assert.equal(await stagePublicDelivery(root), output);
  assert.deepEqual(await inventory(output), declared.map(relative => relative.slice('public/'.length)).sort(),
    'Regeneration removes stale delivery files without copying adjacent source files');
  assert.equal(await readFile(path.join(root, '.sites-runtime/other-tool/keep.txt'), 'utf8'), 'Unrelated tool output.\n');
});

test('public delivery fails closed on missing or symlinked declared inputs before replacing previous output', async t => {
  const root = await fixture(t);
  const output = await stagePublicDelivery(root);
  await write(output, 'last-successful.txt', 'Previous successful output.\n');
  const input = declared[0];
  await unlink(path.join(root, input));
  await assert.rejects(stagePublicDelivery(root), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(output, 'last-successful.txt'), 'utf8'), 'Previous successful output.\n');
  await write(root, 'private-source.mjs', 'Private authority canary.\n');
  await symlink(path.join(root, 'private-source.mjs'), path.join(root, input));
  await assert.rejects(stagePublicDelivery(root), /regular file inside the checkout/);
  assert.equal(await readFile(path.join(output, 'last-successful.txt'), 'utf8'), 'Previous successful output.\n');
});

test('public delivery cannot erase another directory through a symlinked staging parent', async t => {
  const root = await fixture(t);
  const elsewhere = await mkdtemp(path.join(tmpdir(), 'sofa-public-unrelated-'));
  t.after(() => rm(elsewhere, { recursive: true, force: true }));
  await write(elsewhere, 'sofa-public/keep.txt', 'Must survive a rejected staging operation.\n');
  await symlink(elsewhere, path.join(root, '.sites-runtime'));
  await assert.rejects(stagePublicDelivery(root), /staging must remain inside the checkout/);
  assert.equal(await readFile(path.join(elsewhere, 'sofa-public/keep.txt'), 'utf8'), 'Must survive a rejected staging operation.\n');
});

test('checkout LAN serves declared Odd Laws media but denies actual media sources and authority modules', async t => {
  const denied = [
    '/assets/odd-laws-society/sources/characters/generation-prompts.json',
    '/assets/odd-laws-society/sources/buildings/inspect.cjs',
  ];
  // These files really exist in the component checkout. A missing-file 404
  // cannot stand in for proof that the serving boundary excludes sources.
  for (const url of denied) await readFile(path.join(checkout, 'public' + url));
  const host = await startLanServer({ root: checkout, databasePath: ':memory:', host: '127.0.0.1', port: 0 });
  t.after(() => host.close());
  const manifest = await request(host, '/assets/odd-laws-society/manifest.json');
  assert.equal(manifest.status, 200);
  assert.equal(manifest.value.gameId, 'odd-laws-society');
  for (const url of [...denied, '/games/odd-laws-society/engine.mjs', '/games/odd-laws-society/projection.mjs', '/games/registry.mjs']) {
    const response = await request(host, url);
    assert.equal(response.status, 404, `Checkout LAN must not serve ${url}`);
    assert.deepEqual(response.value, { error: 'File not found.' });
  }
});
