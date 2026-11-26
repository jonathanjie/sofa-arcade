import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, copyFile, rm, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { startFixture } from '../fixture/server.mjs';

const phone = fileURLToPath(new URL('../', import.meta.url));
const repository = path.resolve(phone, '../../../..');
const inventory = JSON.parse(await readFile(new URL('../runtime-files.json', import.meta.url), 'utf8'));

test('the explicit runtime inventory imports in isolation without fixture, engine, transport or package dependencies', async () => {
  assert.equal(inventory.schemaVersion, 1);
  assert.equal(inventory.gameId, 'gravity-orchard');
  assert.deepEqual(inventory.productionDependencies, []);
  const isolated = await mkdtemp(path.join(tmpdir(), 'go3-runtime-'));
  try {
    const urls = new Set();
    for (const entry of inventory.browserFiles) {
      assert.match(entry.url, /^\/games\/gravity-orchard\/phone\/[a-z-]+\.(mjs|css)$/);
      assert.equal(entry.source, `ui${entry.url}`);
      assert.ok(!urls.has(entry.url), 'every public URL appears exactly once');
      urls.add(entry.url);
      const source = path.join(repository, entry.source);
      assert.ok((await lstat(source)).isFile(), 'runtime inputs are regular authored files');
      const destination = path.join(isolated, entry.url);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(source, destination);
    }
    const phoneModule = await import(pathToFileURL(path.join(isolated, 'games/gravity-orchard/phone/index.mjs')));
    assert.equal(typeof phoneModule.mountPhone, 'function');
    assert.equal(typeof phoneModule.createMotionController, 'function');
    // No DOM, WebSocket, game engine, or framework exists in the isolated closure.
    const values = [];
    const status = [];
    const controller = phoneModule.createMotionController({
      emitInput: value => values.push(value), onStatus: value => status.push(value),
      environment: { isSecureContext: false },
    });
    for (const method of ['requestPermissionFromGesture', 'calibrate', 'setMode', 'setTouchVector', 'setBrake', 'pause', 'resume', 'dispose']) {
      assert.equal(typeof controller[method], 'function', `contract method ${method} exists`);
    }
    assert.equal(status.at(-1).state, 'insecure');
    controller.setMode('touch');
    assert.equal(controller.resume(), true);
    controller.setTouchVector(1, 1);
    controller.setBrake(true);
    assert.deepEqual(Object.keys(values.at(-1)).sort(), ['brake', 'x', 'y']);
    assert.ok(values.at(-1).x > 0 && values.at(-1).y > 0);
    assert.ok(Math.hypot(values.at(-1).x, values.at(-1).y) <= 1.0001);
    assert.equal(values.at(-1).brake, true);
    controller.dispose();
    assert.deepEqual(values.at(-1), { x: 0, y: 0, brake: true });
    const count = values.length;
    controller.resume();
    controller.setTouchVector(-1, 0);
    controller.setBrake(false);
    assert.equal(values.length, count);
    // The stylesheet URL is relative to the runtime entrypoint and must be shipped.
    assert.ok(urls.has('/games/gravity-orchard/phone/phone.css'));
  } finally {
    await rm(isolated, { recursive: true, force: true });
  }
});

test('the loopback fixture serves only its explicit component files and denies private or dependency paths', async () => {
  const fixture = await startFixture();
  try {
    const index = await fetch(fixture.url);
    assert.equal(index.status, 200);
    assert.match(await index.text(), /Sensor readings and host snapshots are synthetic/);
    for (const pathname of ['motion.mjs', 'phone.css', 'fixture/environment.mjs']) {
      const response = await fetch(new URL(pathname, fixture.url));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    }
    for (const pathname of ['runtime-files.json', 'package.json', 'tests/motion.test.mjs', 'node_modules/playwright/package.json', 'server/rooms.mjs', 'games/gravity-orchard/engine.mjs', '.git/config', '%2e%2e%2f%2e%2e%2fserver/rooms.mjs']) {
      assert.equal((await fetch(new URL(pathname, fixture.url))).status, 404, pathname);
    }
    assert.equal((await fetch(fixture.url, { method: 'POST' })).status, 405);
    const head = await fetch(new URL('phone.css', fixture.url), { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  } finally {
    await fixture.close();
  }
});
