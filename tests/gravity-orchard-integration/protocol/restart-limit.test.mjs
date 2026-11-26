import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { startLanServer } from '../../../server/lan.mjs';
import { api, createRoom, manualClock } from './helpers.mjs';

test('restart restores the 32 newest eligible Orchard rooms and quarantines older or damaged rows', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'go7-restore-limit-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const databasePath = path.join(directory, 'rooms.sqlite');
  const start = () => startLanServer({ databasePath, host: '127.0.0.1', port: 0,
    enableGravityOrchard: true, realtimeClock: manualClock() });

  // Seed two historical rooms first. Hide them from the second boot with
  // recent expiration dates so the live coordinator can admit 32 more rooms.
  const oldHost = await start();
  let oldest, expired;
  try {
    oldest = await createRoom(oldHost);
    expired = await createRoom(oldHost);
  } finally { await oldHost.close(); }
  const db = new DatabaseSync(databasePath);
  t.after(() => db.close());
  const expires = db.prepare('UPDATE sofa_rooms SET expires_at = ? WHERE code = ?');
  const originalExpiry = db.prepare('SELECT expires_at FROM sofa_rooms WHERE code = ?').get(oldest.code).expires_at;
  expires.run(Date.now() - 1, oldest.code);
  expires.run(Date.now() - 1, expired.code);

  const seed = await start();
  const recent = [];
  let sofa, damaged;
  try {
    for (let i = 0; i < 32; i++) recent.push(await createRoom(seed));
    sofa = await api(seed, '/api/rooms', { body: {} });
    damaged = await api(seed, '/api/rooms', { body: {} });
    assert.equal(sofa.status, 201);
    assert.equal(damaged.status, 201);
  } finally { await seed.close(); }
  expires.run(originalExpiry, oldest.code);
  const updateTime = db.prepare('UPDATE sofa_rooms SET updated_at = ? WHERE code = ?');
  const now = Date.now();
  for (const [index, room] of [oldest, ...recent].entries()) updateTime.run(now - 100 + index, room.code);
  db.prepare('UPDATE sofa_rooms SET data = ?, updated_at = ? WHERE code = ?').run('invalid JSON', now, damaged.value.code);
  const rows = code => ({
    room: db.prepare('SELECT * FROM sofa_rooms WHERE code = ?').get(code),
    checkpoint: db.prepare('SELECT * FROM sofa_gravity_checkpoints WHERE code = ?').get(code),
  });
  const previous = new Map([oldest, ...recent].map(room => [room.code, rows(room.code)]));
  const reopened = await start();
  t.after(() => reopened.close());
  for (const room of recent) {
    const read = await api(reopened, `/api/rooms/${room.code}`, { token: room.tokens.host });
    assert.equal(read.status, 200, room.code);
    assert.equal(read.value.state.matchId, room.started.state.matchId);
    assert.equal(read.value.state.phase, 'paused');
    assert.equal(read.value.state.pauseReason, 'recovery');
    const before = previous.get(room.code);
    assert.equal(read.value.state.runEpoch, JSON.parse(before.checkpoint.checkpoint).runEpoch + 1);
    assert.equal(read.value.revision, before.room.revision + 1);
  }
  const overflow = await api(reopened, `/api/rooms/${oldest.code}`, { token: oldest.tokens.host });
  assert.equal(overflow.status, 503);
  assert.equal(overflow.value.code, 'realtime_unavailable');
  assert.deepEqual(rows(oldest.code), previous.get(oldest.code));
  const gone = await api(reopened, `/api/rooms/${expired.code}`, { token: expired.tokens.host });
  assert.equal(gone.status, 410);
  assert.equal(gone.value.code, 'room_expired');
  const normal = await api(reopened, `/api/rooms/${sofa.value.code}`, { token: sofa.value.hostToken });
  assert.equal(normal.status, 200);
  assert.equal(normal.value.gameId, 'sofa-kingdoms');
});
