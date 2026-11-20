import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile, symlink, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readManifest, validateManifest, stageRuntime, verifyRuntime, repoRoot, desktopRoot, listFiles, sha256 } from '../scripts/runtime-files.mjs';
import { nativeTarget, verifyNode, checkedDownload } from '../scripts/prepare.mjs';
import { createHostLifecycle, createRefreshGate, hostRecord, networkFingerprint, refreshReason } from '../host/lifecycle.mjs';

async function temporary(t) { const folder = await mkdtemp(path.join(tmpdir(), 'sofa-desktop-runtime-')); t.after(() => rm(folder, { recursive: true, force: true })); return folder; }

test('exact repo-shaped allowlist stages all source bytes and permissions without development files', async t => {
  const folder = await temporary(t); const destination = path.join(folder, 'runtime');
  const manifest = await readManifest();
  const inventory = await stageRuntime({ destination });
  assert.equal(inventory.length, manifest.files.length);
  assert.deepEqual(await verifyRuntime({ destination }), { files: manifest.files.length });
  assert.deepEqual(await listFiles(destination), manifest.files.map(entry => entry.path).sort());
  assert.ok(manifest.files.some(entry => entry.path === 'drizzle/0000_green_thunderbolts.sql'));
  assert.ok(manifest.files.some(entry => entry.path === 'public/assets/qrcode-LICENSE.txt'));
  await writeFile(path.join(destination, 'secret.sqlite'), 'not allowed');
  await assert.rejects(verifyRuntime({ destination }), /allowlist/);
  await rm(path.join(destination, 'secret.sqlite'));
  await writeFile(path.join(destination, 'ui/app.js'), 'stale');
  await assert.rejects(verifyRuntime({ destination }), /stale or modified/);
});

test('manifest rejects traversal, wildcards, secret/checkout state, duplicates, and unsuitable modes', async () => {
  const manifest = await readManifest();
  for (const unsafe of ['../secret', '/etc/passwd', 'ui/*.js', 'ui/../secret', '.git/config', '.env', 'a//b', 'ui/credentials.json', 'rooms.sqlite', 'node_modules/a.js', 'ui/app.test.mjs', 'assets\\secret']) {
    assert.throws(() => validateManifest({ schemaVersion: 1, files: [...manifest.files, { path: unsafe }] }), /Unsafe/, unsafe);
  }
  assert.throws(() => validateManifest({ ...manifest, extra: true }), /schema/);
  assert.throws(() => validateManifest({ ...manifest, files: [...manifest.files, manifest.files[0]] }), /Duplicate/);
  assert.throws(() => validateManifest({ ...manifest, files: manifest.files.map((entry, index) => index ? entry : { ...entry, mode: 0o777 }) }), /mode/);
  assert.throws(() => validateManifest({ ...manifest, files: manifest.files.filter(entry => !entry.path.endsWith('.sql')) }), /migrations/);
});

test('staging rejects missing imports and symlink sources before replacing a good stage', async t => {
  const folder = await temporary(t); const root = path.join(folder, 'repo'); const destination = path.join(folder, 'runtime');
  const manifest = await readManifest();
  await mkdir(path.join(root, 'desktop'), { recursive: true });
  await writeFile(path.join(root, 'desktop/runtime-manifest.json'), JSON.stringify(manifest));
  for (const entry of manifest.files) { await mkdir(path.dirname(path.join(root, entry.path)), { recursive: true }); await writeFile(path.join(root, entry.path), ''); }
  await writeFile(path.join(root, 'server/rooms.mjs'), "import './forgotten.mjs';\n");
  await assert.rejects(stageRuntime({ root, destination }), /Missing runtime import/);
  await writeFile(path.join(root, 'server/rooms.mjs'), '');
  await stageRuntime({ root, destination });
  await rm(path.join(root, 'game/engine.mjs'));
  await symlink(path.join(repoRoot, 'game/engine.mjs'), path.join(root, 'game/engine.mjs'));
  await assert.rejects(stageRuntime({ root, destination }), /symlinks/);
  assert.equal(await readFile(path.join(destination, 'server/rooms.mjs'), 'utf8'), '');
});

test('pinned bundled Node executes ESM and built-in SQLite with an empty executable search path', async () => {
  const target = nativeTarget();
  const pin = JSON.parse(await readFile(path.join(desktopRoot, 'node-runtime.json'), 'utf8'));
  const binary = path.join(desktopRoot, 'src-tauri/binaries', `node-${target}`);
  const provenance = JSON.parse(await readFile(path.join(desktopRoot, 'stage/licenses/NODE-PROVENANCE.json'), 'utf8'));
  const capabilities = await verifyNode(binary, { version: pin.version, ...pin.targets[target] });
  assert.equal(capabilities.version, '24.22.3');
  assert.equal(provenance.binarySha256, sha256(await readFile(binary)));
  assert.equal(provenance.archiveSha256, pin.targets[target].sha256);
  assert.match(await readFile(path.join(desktopRoot, 'stage/licenses/NODE-LICENSE.txt'), 'utf8'), /Permission is hereby granted/);
});

test('refresh keeps the chosen port, serializes listeners, and a stop during startup closes only the owned host', async () => {
  const events = []; const calls = []; let active = 0;
  const start = async options => {
    calls.push(options.port); active++; assert.equal(active, 1);
    return { port: options.port || 8123, origin: `http://127.0.0.1:${options.port || 8123}`, urls: [], async close() { active--; } };
  };
  const lifecycle = createHostLifecycle({ start, options: { port: 0 }, emit: event => events.push(event) });
  await lifecycle.start();
  await Promise.all([lifecycle.refresh('network_change'), lifecycle.refresh('resume')]);
  assert.deepEqual(calls, [0, 8123, 8123]);
  assert.deepEqual(events.map(value => value.type), ['ready', 'refreshed', 'refreshed']);
  await lifecycle.stop(); await lifecycle.refresh(); assert.equal(active, 0);
  let release;
  const waiting = new Promise(resolve => { release = resolve; }); let closed = 0;
  const delayed = createHostLifecycle({ start: async () => { await waiting; return { async close() { closed++; } }; }, options: { port: 4177 }, emit: () => assert.fail('No readiness after a stop.') });
  const starting = delayed.start(); await Promise.resolve(); const stopping = delayed.stop(); release();
  await Promise.all([starting, stopping]); assert.equal(closed, 1);
});

test('network and wake detection are deterministic and readiness records reject unsafe hosts', () => {
  const network = networkFingerprint({ lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }], wifi: [{ family: 'IPv4', internal: false, address: '192.168.1.2' }, { family: 'IPv6', internal: false, address: '::2' }] });
  assert.equal(network, '192.168.1.2');
  assert.equal(refreshReason({ previousNetwork: network, network, previousTick: 100, now: 200 }), null);
  assert.equal(refreshReason({ previousNetwork: '', network, previousTick: 100, now: 200 }), 'network_change');
  assert.equal(refreshReason({ previousNetwork: network, network, previousTick: 100, now: 20_000 }), 'resume');
  assert.equal(refreshReason({ previousNetwork: network, network, previousTick: 500, now: 100 }), 'resume');
  assert.throws(() => hostRecord({ port: 4177, origin: 'http://malicious.example:4177', urls: [] }), /readiness/);
  assert.throws(() => hostRecord({ port: 4177, origin: 'http://127.0.0.1:4177', urls: ['http://user:password@192.168.1.2:4177/'] }), /address/);
  const record = hostRecord({ port: 4177, origin: 'http://127.0.0.1:4177', urls: Array.from({ length: 50 }, (_, index) => `http://192.168.1.${index + 1}:4177/`) });
  assert.equal(record.controllerUrls.length, 32); assert.ok(Buffer.byteLength(JSON.stringify(record)) < 4096);
});


test('network/wake refresh holds its listener until native acknowledges that the credentialed webview was destroyed', async () => {
  let listenerOpen = true;
  const records = [];
  const refreshed = [];
  const gate = createRefreshGate({ emit: value => records.push(value), refresh: async reason => { listenerOpen = false; refreshed.push(reason); } });
  assert.equal(gate.request('network_change'), true);
  assert.equal(gate.request('resume'), false);
  assert.equal(listenerOpen, true);
  assert.deepEqual(records, [{ type: 'refresh-request', protocolVersion: 1, reason: 'network_change' }]);
  assert.deepEqual(refreshed, []);
  await gate.acknowledge();
  assert.equal(listenerOpen, false);
  assert.deepEqual(refreshed, ['network_change']);
  await gate.acknowledge();
  assert.deepEqual(refreshed, ['network_change', 'requested']);
  assert.throws(() => gate.request('untrusted'), /Invalid/);
});

test('cached runtime bytes are verified before extraction and unapproved download origins are refused', async t => {
  const folder = await temporary(t);
  const file = path.join(folder, 'archive.tar.gz');
  const bytes = Buffer.from('verified archive test bytes');
  await writeFile(file, bytes);
  await assert.rejects(checkedDownload('https://nodejs.org/dist/v24.22.3/test.tar.gz', file, '0'.repeat(64)), /checksum mismatch/);
  assert.deepEqual(await checkedDownload('https://nodejs.org/dist/v24.22.3/test.tar.gz', file, sha256(bytes)), bytes);
  await assert.rejects(checkedDownload('http://nodejs.org/dist/v24.22.3/test.tar.gz', file, sha256(bytes)), /official/);
  await assert.rejects(checkedDownload('https://example.com/archive.tar.gz', file, sha256(bytes)), /official/);
});
