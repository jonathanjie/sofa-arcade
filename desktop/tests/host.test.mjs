import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import path from 'node:path';
import { launchHost, api, makeRoom, subscribe, stagedRoot } from './host-helpers.mjs';
import { readManifest } from '../scripts/runtime-files.mjs';

async function temporary(t) { const folder = await mkdtemp(path.join(tmpdir(), 'sofa-desktop-host-')); t.after(() => rm(folder, { recursive: true, force: true })); return folder; }

test('staged bundled runtime starts with no Node on PATH, serves all collection assets, plays both seats with immediate SSE, and persists on the same origin', { timeout: 45_000 }, async t => {
  const folder = await temporary(t);
  const database = path.join(folder, 'rooms.sqlite');
  let host = await launchHost({ database });
  t.after(() => host.close());
  const ready = await host.waitFor('ready');
  const origin = ready.hostUrl.slice(0, -1);
  assert.equal(ready.protocolVersion, 1);
  assert.equal(ready.hostUrl, `http://127.0.0.1:${ready.port}/`);
  const home = await fetch(ready.hostUrl);
  const html = await home.text();
  assert.match(html, /Sofa Arcade/);
  assert.match(html, /name="sofa-transport" content="lan"/);
  for (const entry of (await readManifest()).files) {
    let route;
    if (entry.path.startsWith('ui/')) route = '/' + entry.path.slice(3);
    if (entry.path === 'ui/index.html') route = '/';
    if (entry.path.startsWith('public/')) route = '/' + entry.path.slice(7);
    if (entry.path === 'game/engine.mjs') route = '/engine.mjs';
    if (entry.path === 'games/catalog.mjs') route = '/games/catalog.mjs';
    if (route) { const response = await fetch(origin + route); assert.equal(response.status, 200, route); assert.ok((await response.arrayBuffer()).byteLength > 0, route); }
  }
  for (const route of ['/server/rooms.mjs', '/desktop/host/entry.mjs', '/drizzle/0000_green_thunderbolts.sql', '/.git/config', '/node_modules']) assert.equal((await fetch(origin + route)).status, 404, route);
  const live = await makeRoom(origin);
  const streams = await Promise.all([live.hostToken, live.tokens.jon, live.tokens.lydia].map(token => subscribe(origin, live.code, token)));
  t.after(() => Promise.all(streams.map(stream => stream.close())));
  await Promise.all(streams.map(stream => stream.revision(live.room.revision)));
  const { legalActions } = await import(path.join(stagedRoot, 'game/engine.mjs'));
  const playerId = live.room.state.activePlayer;
  const action = legalActions(live.room.state, playerId).find(value => value.type === 'move');
  const before = performance.now();
  const changed = await api(origin, `/api/rooms/${live.code}/action`, { token: live.tokens[playerId], body: { revision: live.room.revision, actionId: crypto.randomUUID(), action } });
  assert.equal(changed.status, 200);
  const snapshots = await Promise.all(streams.map(stream => stream.revision(changed.body.revision)));
  assert.ok(performance.now() - before < 2000, 'Push must arrive before the 10-second heartbeat.');
  for (const snapshot of snapshots) assert.deepEqual(snapshot.state, changed.body.state);
  for (const token of [live.hostToken, ...Object.values(live.tokens)]) assert.ok(!JSON.stringify([...host.records, ...snapshots]).includes(token));
  assert.equal((await api(origin, '/api/rooms', { body: {}, headers: { Origin: 'https://hostile.example' } })).status, 403);
  assert.equal((await stat(database)).mode & 0o777, 0o600);
  await Promise.all(streams.map(stream => stream.close()));
  assert.deepEqual(await host.close(), { code: 0, signal: null });
  host = await launchHost({ database, port: ready.port });
  const relaunched = await host.waitFor('ready');
  assert.equal(relaunched.hostUrl, ready.hostUrl);
  for (const token of [live.hostToken, ...Object.values(live.tokens)]) {
    const restored = await api(origin, `/api/rooms/${live.code}`, { token });
    assert.equal(restored.status, 200); assert.equal(restored.body.revision, changed.body.revision); assert.deepEqual(restored.body.state, changed.body.state);
  }
});

test('controlled refresh recreates only the owned listener, keeps origin and saved rooms, and EOF cleans up', { timeout: 20_000 }, async t => {
  const folder = await temporary(t);
  const database = path.join(folder, 'rooms.sqlite');
  const host = await launchHost({ database }); t.after(() => host.close());
  const ready = await host.waitFor('ready'); const origin = ready.hostUrl.slice(0, -1);
  const live = await makeRoom(origin);
  host.send('refresh');
  const refreshed = await host.waitFor('refreshed');
  assert.equal(refreshed.hostUrl, ready.hostUrl); assert.equal(refreshed.reason, 'requested');
  const room = await api(origin, `/api/rooms/${live.code}`, { token: live.hostToken });
  assert.equal(room.status, 200); assert.deepEqual(room.body.state, live.room.state);
  host.child.stdin.end();
  assert.deepEqual(await host.exited, { code: 0, signal: null });
  await assert.rejects(fetch(ready.hostUrl, { signal: AbortSignal.timeout(1000) }));
  const replacement = createServer(); await new Promise((resolve, reject) => { replacement.once('error', reject); replacement.listen(ready.port, '0.0.0.0', resolve); });
  await new Promise(resolve => replacement.close(resolve));
});

test('occupied saved port fails closed without attaching to or terminating an unrelated listener', { timeout: 15_000 }, async t => {
  const folder = await temporary(t); let connections = 0;
  const unrelated = createServer(socket => { connections++; socket.end('unrelated'); });
  await new Promise(resolve => unrelated.listen(0, '0.0.0.0', resolve)); t.after(() => new Promise(resolve => unrelated.close(resolve)));
  const port = unrelated.address().port;
  const host = await launchHost({ database: path.join(folder, 'rooms.sqlite'), port }); t.after(() => host.close());
  const failed = await host.waitFor('error');
  assert.equal(failed.code, 'port_in_use'); assert.equal(host.records.some(value => value.type === 'ready'), false);
  assert.equal((await host.exited).code, 1); assert.equal(unrelated.listening, true); assert.equal(connections, 0);
});

test('invalid arguments, unwritable database location, and oversized parent commands produce only bounded safe errors', { timeout: 20_000 }, async t => {
  const folder = await temporary(t);
  const invalid = await launchHost({ arguments: ['--root', 'relative', '--database', 'also-relative', '--port', '0'] }); t.after(() => invalid.close());
  assert.equal((await invalid.waitFor('error')).code, 'invalid_arguments'); assert.equal((await invalid.exited).code, 1);
  const obstacle = path.join(folder, 'file'); await writeFile(obstacle, 'not a directory');
  const failure = await launchHost({ database: path.join(obstacle, 'rooms.sqlite') }); t.after(() => failure.close());
  assert.equal((await failure.waitFor('error')).code, 'startup_failed'); assert.equal((await failure.exited).code, 1);
  assert.ok(!JSON.stringify(failure.records).includes(obstacle));
  const host = await launchHost({ database: path.join(folder, 'rooms.sqlite') }); t.after(() => host.close());
  await host.waitFor('ready'); host.child.stdin.write('x'.repeat(500));
  assert.equal((await host.waitFor('error')).code, 'invalid_arguments'); assert.equal((await host.exited).code, 1);
});
