import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = file => readFile(path.join(root, file), 'utf8');
const inventory = JSON.parse(await read('server/secure-lan/runtime-files.json'));
const browser = JSON.parse(await read(inventory.browserInventory));

function imports(source) {
  return [...source.matchAll(/(?:from\s*|import\s*(?:\(\s*)?)["']([^"']+)["']/g)].map(match => match[1]);
}

test('GO6 runtime file inventories close every local import and separate native/private source from phone diagnostics', async () => {
  const hostFiles = new Set(inventory.hostRuntimeFiles);
  const browserFiles = new Set([...browser.hostViewFiles, ...browser.publicDiagnosticFiles]);
  const packages = new Set(inventory.runtimeDependencies.map(item => item.name));
  const hostPath = /^(?:server\/secure-lan\/|server\/reject-upgrade\.mjs$)/;
  for (const [files, hostOnly] of [[hostFiles, true], [browserFiles, false]]) {
    for (const file of files) {
      assert.match(file, hostOnly ? hostPath : /^desktop\/secure-lan\//);
      assert.doesNotMatch(file, /(?:fixture|tests|evidence|node_modules|\.pem|\.key|\.sqlite)/);
      const absolute = path.join(root, file);
      assert.equal(await realpath(absolute), absolute);
      assert.ok((await stat(absolute)).isFile());
      const source = await read(file);
      assert.doesNotMatch(source, /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\r\n]+[A-Za-z0-9+/=]{20}/);
      if (!file.endsWith('.mjs')) continue;
      for (const dependency of imports(source)) {
        if (dependency.startsWith('.')) {
          const resolved = path.relative(root, path.resolve(path.dirname(absolute), dependency));
          assert.ok(files.has(resolved), `${file} imports unlisted ${resolved}`);
        } else if (dependency.startsWith('node:')) {
          assert.ok(hostOnly, 'browser module imported a privileged Node builtin');
        } else assert.ok(hostOnly && packages.has(dependency), `${file} imported unlisted runtime package ${dependency}`);
      }
    }
  }
  assert.deepEqual(browser.runtimeDependencies, []);
  assert.deepEqual(inventory.externalRuntimeTools, []);
  assert.equal(browser.publicDiagnosticFiles.some(file => file.endsWith('/index.mjs')), false, 'phone route list excludes host setup entrypoint');
  const html = await read('desktop/secure-lan/diagnostic.html');
  for (const [, url] of html.matchAll(/(?:src|href)="(\/[^"?#]+)"/g)) {
    if (url !== '/') assert.ok(browser.publicDiagnosticRoutes.includes(url), `unlisted diagnostic route ${url}`);
  }
});

test('all production package versions, licenses and integrity hashes exactly match nested lockfile', async () => {
  const lock = JSON.parse(await read('server/secure-lan/package-lock.json'));
  const manifest = JSON.parse(await read('server/secure-lan/package.json'));
  const packages = Object.entries(lock.packages).filter(([name, value]) => name && !value.dev).map(([name, value]) => ({
    name: name.replace(/^node_modules\//, ''), version: value.version, license: value.license, integrity: value.integrity,
  }));
  assert.deepEqual(inventory.runtimeDependencies, packages);
  for (const item of packages) {
    assert.match(item.version, /^\d+\.\d+\.\d+/);
    assert.match(item.integrity, /^sha512-/);
    assert.ok(item.license);
    const installed = JSON.parse(await read(`server/secure-lan/node_modules/${item.name}/package.json`));
    assert.equal(installed.version, item.version);
  }
  assert.deepEqual(manifest.dependencies, { '@peculiar/x509': '3.1.0', 'reflect-metadata': '0.2.2' });
  assert.equal(packages.some(item => item.name === 'ws' || item.name === 'playwright'), false);
  assert.equal(inventory.desktopNode, JSON.parse(await read('desktop/node-runtime.json')).version);
});
