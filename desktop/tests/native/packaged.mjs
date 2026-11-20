/** Actual macOS production .app acceptance. No WebDriver, browser surrogate, or Node on PATH. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { mkdir, readFile, rm, rename, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { legalActions } from '../../../game/engine.mjs';
import {
  argument, binaryFor, dataDir, desktopDir, evidenceDir, exists, hostStatus,
  identifier, joinBoth, listen, poll, portOpen, repoDir, request,
  requireFreshProfile, runFile, safePath, saveEvidence, verifyAssets, waitPortClosed,
} from './helpers.mjs';

const app = path.resolve(argument('--app', process.env.SOFA_APP_PATH || ''));
assert.ok(app.endsWith('.app'), 'Pass --app /absolute/path/Sofa Arcade.app');
const binary = binaryFor(app);
const node = path.join(app, 'Contents', 'MacOS', 'node');
const runtime = path.join(app, 'Contents', 'Resources', 'runtime');
const children = new Set();
const ownedHostPids = new Set();
const sockets = new Set();
const summary = { schemaVersion: 1, kind: 'native-production-macos', commit: process.env.SOFA_TEST_COMMIT || null, checks: [], limitations: [
  'CI uses simulated phone HTTP/SSE clients, not physical phones or Jon’s Wi-Fi.',
  'The bundle runs with Node removed from PATH; the runner’s internet connection is not disconnected.',
  'TV casting, device audio, physical sleep/wake, Developer ID signing, notarization, and Gatekeeper distribution remain separate gates.',
] };
let profileOwned = false;
let control;
let stream;
let sentinel;
const check = (name, detail = true) => { summary.checks.push({ name, passed: true, detail }); console.log(`PASS ${name}`); };

async function freePort() {
  const server = createTcpServer();
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
const driverPort = await freePort();
const nativeEnvironment = { ...process.env, PATH: safePath,
  // An inherited Node injector must never alter our absolute bundled executable.
  NODE_OPTIONS: '--import=/sofa-test-missing-injection.mjs', NODE_PATH: '/sofa-test-invalid-modules',
  TAURI_WEBDRIVER_PORT: String(driverPort), WDIO_EMBEDDED_SERVER: 'true',
};

function launch() {
  const child = spawn(binary, [], { cwd: path.dirname(app), env: nativeEnvironment, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  child.once('error', () => {});
  child.once('exit', () => children.delete(child));
  // Bounded and deliberately not published: third-party native logs could contain
  // environment paths. Assertions/evidence only record safe named results.
  let captured = '';
  for (const pipe of [child.stdout, child.stderr]) pipe.on('data', chunk => {
    if (captured.length < 16384) captured += chunk.toString().slice(0, 16384 - captured.length);
  });
  return child;
}
async function ready(child) {
  const status = await hostStatus(info => info.state === 'ready' && info.parentPid === child.pid,
    { timeout: 30000, message: 'The production .app did not announce its owned listening host' });
  ownedHostPids.add(status.childPid);
  return status;
}
async function waitExit(child, timeout = 15000) {
  await poll(() => child.exitCode !== null || child.signalCode !== null,
    { timeout, message: 'The native application did not exit' });
}
async function quit(child, port) {
  await runFile(control, ['quit', String(child.pid)], { timeout: 5000 });
  await waitExit(child);
  if (port) await waitPortClosed(port);
}
async function ownedChild(pid, parentPid) {
  const { stdout } = await runFile('/bin/ps', ['-p', String(pid), '-o', 'ppid='], { timeout: 3000 });
  assert.equal(Number(stdout.trim()), parentPid, 'Refuse to signal a child not owned by this launched native app');
}
async function capture(child, name) {
  try {
    const { stdout } = await runFile(control, ['window', String(child.pid)], { timeout: 5000 });
    const windowId = stdout.trim();
    assert.match(windowId, /^\d+$/);
    await runFile('/usr/sbin/screencapture', ['-x', '-l', windowId, path.join(evidenceDir, name)], { timeout: 10000 });
    return true;
  } catch {
    // Native WebDriver has a separately mandatory screenshot gate. Do not
    // fabricate a screenshot when the runner denies system screen recording.
    return false;
  }
}

try {
  await requireFreshProfile();
  profileOwned = true;
  const pathLookup = await runFile('/bin/sh', ['-c', 'command -v node || true'], { env: { PATH: safePath } });
  assert.equal(pathLookup.stdout.trim(), '', 'Native acceptance PATH unexpectedly contains a separately installed Node');
  assert.equal(await exists(binary), true, 'Production bundle executable missing');
  assert.equal(await exists(node), true, 'Bundled Node executable missing');
  const expectedArch = process.arch === 'arm64' ? 'arm64' : 'x86_64';
  assert.ok(['arm64', 'x64'].includes(process.arch), 'Unsupported native test machine architecture');
  const nativeArch = (await runFile('/usr/bin/uname', ['-m'])).stdout.trim();
  assert.equal(nativeArch, expectedArch, 'Node test process architecture must match the native macOS runner');
  for (const filename of [binary, node]) {
    const arch = (await runFile('/usr/bin/lipo', ['-archs', filename])).stdout.trim().split(/\s+/);
    assert.deepEqual(arch, [expectedArch], 'Bundle executable architecture does not match this native runner');
    assert.ok((await stat(filename)).mode & 0o111, 'Bundle executable lost its executable mode');
  }
  const plist = JSON.parse((await runFile('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(app, 'Contents', 'Info.plist')])).stdout);
  assert.equal(plist.CFBundleIdentifier, identifier);
  summary.architecture = { platform: process.platform, runner: nativeArch, node: process.arch,
    target: process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin' };
  summary.bundleExecutableSha256 = createHash('sha256').update(await readFile(binary)).digest('hex');
  check('native runner and both executable architectures match', summary.architecture);
  summary.signing = 'Ad-hoc local build; no Developer ID or notarization claimed';

  const probe = await runFile(node, ['--input-type=module', '-e',
    'import { DatabaseSync } from "node:sqlite"; const db=new DatabaseSync(":memory:"); console.log(JSON.stringify({version:process.version,arch:process.arch,sqlite:db.prepare("select 42 as value").get().value,esm:import.meta.url.startsWith("file:")})); db.close();'],
    { env: { PATH: safePath }, timeout: 10000 });
  const capability = JSON.parse(probe.stdout.trim());
  assert.equal(capability.arch, process.arch); assert.equal(capability.sqlite, 42); assert.equal(capability.esm, true);
  check('signed/staged bundled Node executes ESM and node:sqlite without Node on PATH', capability);

  const manifest = JSON.parse(await readFile(path.join(desktopDir, 'runtime-manifest.json'), 'utf8'));
  for (const entry of manifest.files) {
    const expected = await readFile(path.join(repoDir, entry.path));
    const actual = await readFile(path.join(runtime, entry.path));
    assert.equal(createHash('sha256').update(actual).digest('hex'), createHash('sha256').update(expected).digest('hex'), `Staged runtime differs: ${entry.path}`);
  }
  const license = await readFile(path.join(app, 'Contents', 'Resources', 'licenses', 'NODE-LICENSE.txt'), 'utf8');
  assert.match(license, /Node|Copyright/);
  const executableBytes = await readFile(binary);
  for (const marker of ['TAURI_WEBDRIVER_PORT', 'WDIO_EMBEDDED_SERVER', 'tauri_plugin_wdio_webdriver']) {
    assert.equal(executableBytes.includes(Buffer.from(marker)), false, 'A production executable contains the native test driver');
  }
  check('runtime manifest files and Node license present; no test-driver markers', { files: manifest.files.length });

  control = path.join(evidenceDir, 'native-control');
  await runFile('/usr/bin/swiftc', [path.join(desktopDir, 'tests/native/mac-control.swift'), '-o', control], { timeout: 60000 });
  let child = launch();
  let status = await ready(child);
  const origin = `http://127.0.0.1:${status.port}`;
  assert.equal(await portOpen(driverPort), false, 'Production build activated an embedded test driver');
  await ownedChild(status.childPid, child.pid);
  const html = await (await fetch(origin + '/', { signal: AbortSignal.timeout(5000) })).text();
  assert.match(html, /sofa-transport/); assert.match(html, /Sofa Arcade/);
  check('production .app launched a ready owned LAN host without Node on PATH and ignored inherited Node injectors');
  check('all packaged media assets load over the bundled host', { count: await verifyAssets(origin) });
  await delay(1200);
  summary.productionCollectionScreenshot = await capture(child, 'production-collection.png');

  const created = await request(origin, '/api/rooms', { body: { gameId: 'sofa-kingdoms' } });
  assert.equal(created.status, 201);
  const { code, hostToken } = created.body;
  const tokens = await joinBoth(origin, code);
  const started = (await request(origin, `/api/rooms/${code}/start`, { token: hostToken, body: {} })).body;
  stream = await listen(origin, code, hostToken);
  await stream.revision(started.revision);
  const actor = started.state.activePlayer;
  const action = legalActions(started.state, actor).find(item => item.type === 'move');
  assert.ok(action);
  const before = Date.now();
  const applied = (await request(origin, `/api/rooms/${code}/action`, { token: tokens[actor],
    body: { revision: started.revision, actionId: crypto.randomUUID(), action } })).body;
  const pushed = await stream.revision(applied.revision);
  assert.deepEqual(pushed.state.players[actor], applied.state.players[actor]);
  const elapsedMs = Date.now() - before;
  assert.ok(elapsedMs < 2500, 'SSE update arrived too late to distinguish it from the 10-second heartbeat');
  const serialized = JSON.stringify(stream.rooms);
  for (const secret of [hostToken, tokens.jon, tokens.lydia, 'tokenHash', 'hostHash']) assert.equal(serialized.includes(secret), false);
  await stream.close(); stream = undefined;
  check('native packaged host created room, joined both seats, and pushed authoritative action immediately', { elapsedMs });

  const duplicate = launch();
  await waitExit(duplicate);
  assert.equal(duplicate.exitCode, 0, 'Duplicate native launch should exit cleanly');
  const stillOwned = await hostStatus(info => info.parentPid === child.pid && info.state === 'ready');
  assert.equal(stillOwned.childPid, status.childPid);
  check('duplicate launch left the original app and owned host intact');

  await ownedChild(status.childPid, child.pid);
  process.kill(status.childPid, 'SIGKILL');
  const recovered = await hostStatus(info => info.parentPid === child.pid && info.state === 'ready' && info.childPid !== status.childPid && info.generation > status.generation,
    { timeout: 15000, message: 'Owned host crash did not recover' });
  ownedHostPids.add(recovered.childPid);
  assert.equal(recovered.port, status.port);
  assert.equal((await request(origin, `/api/rooms/${code}`, { token: hostToken })).body.revision, applied.revision);
  check('owned child crash recovered on the saved origin with committed SQLite state');
  status = recovered;
  await quit(child, status.port);
  const saved = JSON.parse(await readFile(path.join(dataDir, 'config.json'), 'utf8'));
  assert.equal(saved.port, status.port);
  assert.equal((await stat(path.join(dataDir, 'rooms.sqlite'))).mode & 0o777, 0o600);
  check('native Quit closed child/listener and retained private writable app-data SQLite');

  child = launch(); status = await ready(child);
  assert.equal(`http://127.0.0.1:${status.port}`, origin);
  const restored = (await request(origin, `/api/rooms/${code}`, { token: hostToken })).body;
  assert.equal(restored.revision, applied.revision);
  assert.deepEqual(restored.state.players, applied.state.players);
  check('production app relaunch retained its port, room state, and authentication');
  // Abrupt parent death must also close its only owned sidecar via stdin EOF.
  const abruptChildPid = status.childPid;
  child.kill('SIGKILL'); await waitExit(child); await waitPortClosed(status.port);
  await poll(async () => {
    try { await runFile('/bin/ps', ['-p', String(abruptChildPid), '-o', 'pid=']); return false; } catch { return true; }
  }, { message: 'Owned child survived abrupt parent termination' });
  check('abrupt native parent exit closed the owned child through its lifetime pipe');

  let sentinelConnections = 0;
  sentinel = createServer((_req, response) => { response.end('unrelated-test-sentinel'); });
  sentinel.on('connection', socket => { sentinelConnections++; sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  sentinel.listen(status.port, '0.0.0.0'); await once(sentinel, 'listening');
  child = launch();
  const conflict = await hostStatus(info => info.parentPid === child.pid && info.state === 'error',
    { timeout: 15000, message: 'Occupied saved port was not reported as a native error' });
  assert.equal(conflict.errorCode, 'port_in_use');
  assert.equal(conflict.port, status.port); assert.equal(conflict.childPid, undefined);
  await delay(300);
  assert.equal(sentinelConnections, 0, 'The app connected to an unrelated process on its saved port');
  await quit(child);
  assert.equal(sentinel.listening, true);
  await new Promise(resolve => sentinel.close(resolve)); sentinel = undefined;
  check('occupied port produced an actionable error without connecting to or killing the unrelated listener');

  const database = path.join(dataDir, 'rooms.sqlite');
  const backup = path.join(dataDir, 'rooms.sqlite.test-backup');
  await rename(database, backup); await mkdir(database);
  try {
    child = launch();
    const failure = await hostStatus(info => info.parentPid === child.pid && info.state === 'error',
      { timeout: 15000, message: 'Database startup failure was not shown by the native app' });
    assert.equal(failure.childPid, undefined);
    assert.equal(await portOpen(status.port), false);
    await quit(child);
  } finally {
    await rm(database, { recursive: true, force: true }); await rename(backup, database);
  }
  child = launch(); status = await ready(child);
  assert.equal((await request(origin, `/api/rooms/${code}`, { token: hostToken })).body.revision, applied.revision);
  await quit(child, status.port);
  check('failed database startup stayed closed and preserved the recoverable room');
  summary.passed = true;
} catch (error) {
  summary.passed = false;
  summary.failure = { name: error.name, message: error.message };
  try {
    const status = JSON.parse(await readFile(path.join(dataDir, 'host-status.json'), 'utf8'));
    summary.lastStatus = { state: status.state, errorCode: status.errorCode, generation: status.generation,
      port: status.port, parentPid: status.parentPid, childPid: status.childPid };
  } catch { /* A pre-start failure has no status file. */ }
  console.error(`FAIL ${error.message}`);
  process.exitCode = 1;
} finally {
  if (stream) await stream.close().catch(() => {});
  const remaining = [...children];
  for (const child of remaining) { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }
  for (const socket of sockets) socket.destroy();
  if (sentinel) await new Promise(resolve => sentinel.close(resolve));
  let cleanupVerified = true;
  for (const child of remaining) {
    try { await waitExit(child); } catch { cleanupVerified = false; }
  }
  for (const pid of ownedHostPids) {
    try {
      await poll(async () => {
        try { await runFile('/bin/ps', ['-p', String(pid), '-o', 'pid=']); return false; } catch { return true; }
      }, { timeout: 15000, message: 'Owned host has not exited; preserve its SQLite profile' });
    } catch { cleanupVerified = false; }
  }
  if (profileOwned && cleanupVerified) await rm(dataDir, { recursive: true, force: true });
  summary.cleanupVerified = cleanupVerified;
  if (!cleanupVerified) { summary.passed = false; process.exitCode = 1; }
  if (control) await rm(control, { force: true });
  await saveEvidence('native-production.json', summary);
}
