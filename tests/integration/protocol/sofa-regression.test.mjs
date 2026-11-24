import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { legalActions, scoreFor } from '../../../game/engine.mjs';
import { legacySofaState } from '../fixtures/legacy-sofa.mjs';
import { captureSource, writeLatencyEvidence } from './evidence.mjs';
import { startFixtureServer, openRoom, connectThree, closeStreams, request, command, submit,
  expectRevision, assertNoCredentials, latencySummary, listen } from './harness.mjs';

test('Sofa Kingdoms completes through three authenticated HTTP/SSE clients, retries the winning command, and rematches', async t => {
  const sourceBefore = process.env.SOFA_EVIDENCE_DIR ? captureSource() : null;
  const host = await startFixtureServer();
  const streams = {};
  t.after(async () => { await closeStreams(streams); await host.close(); });
  const live = await openRoom(host);
  Object.assign(streams, await connectThree(host, live));
  let room = live.room;
  assert.equal(room.state.version, 3);
  const openingPlayer = room.state.firstPlayer;
  const second = openingPlayer === 'jon' ? 'lydia' : 'jon';
  assert.equal(room.state.players[second].openingBonus, 1, 'v3 opening allowance survives integration');
  const timing = { host: [], jon: [], lydia: [] };
  let requests = 0;
  let winningPayload;
  let winningActor;
  while (room.phase === 'playing') {
    assert.ok(requests < 100, 'ten-round Sofa game must terminate');
    const playerId = room.state.activePlayer;
    const legal = legalActions(room.state, playerId);
    const action = requests < 8
      ? legal.find(item => item.type === 'bank') || legal.find(item => item.type === 'collect') || legal.find(item => item.type === 'move')
      : { type: 'end' };
    const payload = command(room, action);
    const applied = await submit(host, live, playerId, payload);
    assert.equal(applied.status, 200, applied.text);
    assert.equal(applied.value.revision, room.revision + 1);
    const pushed = await expectRevision(streams, applied.value.revision);
    for (const [viewer, event] of Object.entries(pushed)) {
      assert.deepEqual(event.value.state, applied.value.state, `${viewer} receives the public Sofa state`);
      assertNoCredentials(event.raw, live);
      timing[viewer].push(event.receivedAt - applied.startedAt);
    }
    assertNoCredentials(applied.text, live);
    if (requests === 0) {
      const duplicate = await submit(host, live, playerId, payload);
      assert.equal(duplicate.status, 200);
      assert.equal(duplicate.value.revision, applied.value.revision);
      const changed = await submit(host, live, playerId, { ...payload, action: { type: 'end' } });
      assert.equal(changed.status, 409);
      assert.equal(changed.value.code, 'action_id_reused');
    }
    room = applied.value;
    winningPayload = payload; winningActor = playerId; requests++;
  }
  assert.equal(room.state.round, 10);
  const expectedWinner = scoreFor(room.state.players.jon) === scoreFor(room.state.players.lydia) ? 'tie'
    : scoreFor(room.state.players.jon) > scoreFor(room.state.players.lydia) ? 'jon' : 'lydia';
  assert.equal(room.state.winner, expectedWinner);
  // Simulates a lost final response: retry the identical ID/body after finished, not a new command.
  const duplicateWin = await submit(host, live, winningActor, winningPayload);
  assert.equal(duplicateWin.status, 200);
  assert.equal(duplicateWin.value.revision, room.revision);
  const rematched = await request(host, `/api/rooms/${live.code}/rematch`, { token: live.tokens.host, body: {} });
  assert.equal(rematched.status, 200);
  assert.equal(rematched.value.state.round, 1);
  assert.equal(rematched.value.state.version, 3);
  assert.notEqual(rematched.value.state.seed, room.state.seed);
  await expectRevision(streams, rematched.value.revision);
  const oldRetry = await submit(host, live, winningActor, winningPayload);
  assert.equal(oldRetry.status, 200);
  assert.equal(oldRetry.value.revision, rematched.value.revision);
  assert.deepEqual(oldRetry.value.state, rematched.value.state);
  const evidence = await writeLatencyEvidence({ name: 'sofa-kingdoms-regression', gameId: 'sofa-kingdoms', samples: timing, sourceBefore });
  t.diagnostic(JSON.stringify({ method: 'same-process Node HTTP on 127.0.0.1; POST start to each parsed SSE revision; 60-second heartbeat rules out polling for this run; no Wi-Fi or casting measurement', node: process.version, platform: process.platform, arch: process.arch, evidence, clients: Object.fromEntries(Object.entries(timing).map(([key, values]) => [key, latencySummary(values)])) }));
});

test('real SQLite restart restores both seats and authoritative state; a refreshed phone opens a new stream', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'sofa-ws6-persistence-'));
  const databasePath = path.join(directory, 'rooms.sqlite');
  let host = await startFixtureServer({ databasePath });
  let streams = {};
  t.after(async () => { await closeStreams(streams); await host.close(); await rm(directory, { recursive: true, force: true }); });
  const live = await openRoom(host);
  streams = await connectThree(host, live);
  const actor = live.room.state.activePlayer;
  const result = await submit(host, live, actor, command(live.room, { type: 'end' }));
  assert.equal(result.status, 200);
  await expectRevision(streams, result.value.revision);
  await closeStreams(streams); streams = {};
  const originalPort = host.port;
  await host.close();
  host = await startFixtureServer({ databasePath, port: originalPort });
  assert.equal(host.port, originalPort, 'same origin permits browsers to retain local credentials');
  for (const viewer of ['host', 'jon', 'lydia']) {
    const restored = await request(host, `/api/rooms/${live.code}`, { token: live.tokens[viewer] });
    assert.equal(restored.status, 200);
    assert.equal(restored.value.revision, result.value.revision);
    assert.deepEqual(restored.value.state, result.value.state);
    assertNoCredentials(restored.text, live);
  }
  streams.jon = await listen(host, live.code, live.tokens.jon);
  const refreshed = await streams.jon.waitFor(event => event.type === 'room');
  assert.deepEqual(refreshed.value.state, result.value.state);
  await streams.jon.close();
  streams.jon = await listen(host, live.code, live.tokens.jon);
  assert.equal((await streams.jon.waitFor(event => event.type === 'room')).value.revision, result.value.revision);
});

for (const version of [1, 2]) {
  test(`persisted Sofa v${version} room completes under its historical rules and rematches into v3`, async t => {
    const directory = await mkdtemp(path.join(tmpdir(), `sofa-ws6-v${version}-`));
    const databasePath = path.join(directory, 'rooms.sqlite');
    let host = await startFixtureServer({ databasePath });
    const streams = {};
    t.after(async () => { await closeStreams(streams); await host.close(); await rm(directory, { recursive: true, force: true }); });
    const live = await openRoom(host);
    const port = host.port;
    await host.close();
    // A controlled historical fixture is written only to this test's temporary DB, with the server stopped.
    const database = new DatabaseSync(databasePath);
    try {
      const stored = database.prepare('SELECT data FROM sofa_rooms WHERE code = ?').get(live.code);
      const data = JSON.parse(stored.data);
      data.state = legacySofaState(version);
      if (version === 1) delete data.gameId; // predates collection metadata
      database.prepare('UPDATE sofa_rooms SET data = ? WHERE code = ?').run(JSON.stringify(data), live.code);
    } finally { database.close(); }
    host = await startFixtureServer({ databasePath, port });
    const read = await request(host, `/api/rooms/${live.code}`, { token: live.tokens.host });
    assert.equal(read.status, 200);
    assert.equal(read.value.gameId, 'sofa-kingdoms');
    assert.equal(read.value.state.version, version);
    live.room = read.value;
    Object.assign(streams, await connectThree(host, live));
    const banked = await submit(host, live, 'jon', command(live.room, { type: 'bank' }));
    assert.equal(banked.status, 200);
    assert.equal(banked.value.state.players.jon.banked, 5);
    assert.equal(banked.value.state.players.jon.bonusPoints, version === 1 ? undefined : 2);
    assert.equal(banked.value.state.players.jon.lures, version === 1 ? 1 : 2);
    let room = banked.value;
    while (room.phase === 'playing') {
      const next = await submit(host, live, room.state.activePlayer, command(room, { type: 'end' }));
      assert.equal(next.status, 200);
      room = next.value;
      await expectRevision(streams, room.revision);
    }
    assert.equal(room.state.version, version);
    assert.equal(room.state.winner, version === 1 ? 'lydia' : 'jon');
    assert.ok(!Object.hasOwn(room.state, 'firstPlayer'), 'do not inject new-match initiative into old saved states');
    const rematch = await request(host, `/api/rooms/${live.code}/rematch`, { token: live.tokens.host, body: {} });
    assert.equal(rematch.status, 200);
    assert.equal(rematch.value.state.version, 3);
    assert.ok(['jon', 'lydia'].includes(rematch.value.state.firstPlayer));
    await expectRevision(streams, rematch.value.revision);
  });
}
