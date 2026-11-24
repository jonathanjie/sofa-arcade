import test from 'node:test';
import assert from 'node:assert/strict';
import { createPartyRooms } from './rooms.mjs';
import { advancePartyClock } from '../realtime/party/round.mjs';

function fixture() {
  let time = 0;
  const rooms = createPartyRooms({ now: () => time, seed: () => 'test-seed' });
  const host = rooms.create({ gameId: 'tap-race', requestId: 'host'.repeat(8) });
  const room = rooms.find(host.code);
  function join(look, name = 'Runner') {
    return rooms.join(room, { look, name, requestId: String(look).repeat(32) });
  }
  return { rooms, host, room, join, at: value => { time = value; } };
}

test('room retries preserve credentials, name filtering and exclusive looks', () => {
  const { rooms, host, room, join } = fixture();
  assert.deepEqual(rooms.create({ gameId: 'tap-race', requestId: 'host'.repeat(8) }), host);
  const first = join(0, '   Pip\u0000\u202e!   ');
  assert.deepEqual(join(0, 'Pip!'), first);
  assert.equal(rooms.authorize(room, first.token).name, 'Pip!');
  assert.equal(rooms.authorize(room, 'bad'), null);
  assert.throws(() => rooms.join(room, { look: 0, name: 'Other', requestId: 'other'.repeat(8) }), { code: 'look_taken' });
  assert.throws(() => join(1, '1234567890123'), { code: 'invalid_join' });
  assert.throws(() => join(0, 'Other'), { code: 'retry_mismatch' });
});

test('a replacement keeps its seat, and a disconnected seat expires at thirty seconds', () => {
  const { rooms, room, join, at } = fixture();
  const first = join(0);
  const seat = rooms.authorize(room, first.token);
  const original = {};
  const replacement = {};
  rooms.attach(seat, original);
  rooms.attach(seat, replacement);
  rooms.detach(seat, original);
  at(50_000);
  assert.equal(rooms.authorize(room, first.token), seat);
  rooms.detach(seat, replacement);
  at(79_999);
  assert.equal(rooms.authorize(room, first.token), seat);
  at(80_000);
  assert.equal(rooms.authorize(room, first.token), null);
  assert.deepEqual(rooms.lookup(room).occupiedLooks, []);
});

test('late join queues for the next round and kick revokes the credential', () => {
  const { rooms, host, room, join } = fixture();
  const tv = rooms.authorize(room, host.token);
  assert.throws(() => rooms.command(room, tv, { type: 'start', round: 0 }), { code: 'not_enough_ready' });
  for (const look of [0, 1]) {
    const seat = rooms.authorize(room, join(look).token);
    rooms.attach(seat, {});
    rooms.command(room, seat, { type: 'ready', value: true });
  }
  rooms.command(room, tv, { type: 'start', round: 0 });
  const late = join(2, 'QUEUED');
  const seat = rooms.authorize(room, late.token);
  rooms.attach(seat, {});
  rooms.command(room, seat, { type: 'ready', value: true });
  const phone = rooms.project(room, seat);
  assert.equal(phone.waiting, true);
  assert.equal(phone.state, null);
  assert.equal(rooms.project(room, tv).scene.runners.length, 2);
  assert.throws(() => rooms.command(room, seat, { type: 'kick', playerId: 'p1' }), { code: 'forbidden' });
  rooms.command(room, tv, { type: 'kick', playerId: late.playerId });
  assert.equal(rooms.authorize(room, late.token), null);
  assert.throws(() => join(2, 'QUEUED'), { code: 'seat_lost' });
});

test('phone projection omits other identities, state and private fields', () => {
  const { rooms, host, room, join } = fixture();
  const own = join(0, 'Own');
  const other = join(1, 'OtherSecret');
  const hostView = rooms.project(room, rooms.authorize(room, host.token));
  const phone = rooms.project(room, rooms.authorize(room, own.token));
  const wire = JSON.stringify(phone);
  assert.equal(phone.self.name, 'Own');
  assert.equal(phone.players, undefined);
  assert.ok(hostView.players.some(player => player.name === 'OtherSecret'));
  for (const secret of ['OtherSecret', other.playerId, own.token, other.token, host.token, 'tokenHash']) {
    assert.ok(!wire.includes(secret));
    if (secret.endsWith('Hash') || secret.length > 20) assert.ok(!JSON.stringify(hostView).includes(secret));
  }
});

test('short stalls run at most five ticks and discard the excess whole ticks', () => {
  assert.deepEqual(advancePartyClock(630, 20), { ticks: 5, remainder: 0, interrupted: false });
  assert.deepEqual(advancePartyClock(40, 25), { ticks: 1, remainder: 15, interrupted: false });
  assert.deepEqual(advancePartyClock(1001, 0), { ticks: 0, remainder: 0, interrupted: true });
});

test('input validation rejects spoofed, duplicate, stale and over-budget messages', () => {
  const { rooms, host, room, join, at } = fixture();
  const tv = rooms.authorize(room, host.token);
  const first = rooms.authorize(room, join(0).token);
  const second = rooms.authorize(room, join(1).token);
  const connection = { lastSeq: -1 };
  rooms.attach(first, connection);
  rooms.attach(second, {});
  rooms.command(room, first, { type: 'ready', value: true });
  rooms.command(room, second, { type: 'ready', value: true });
  rooms.command(room, tv, { type: 'start', round: 0 });
  for (let time = 50; time <= 3000; time += 50) {
    at(time);
    rooms.tick(time);
  }
  const enqueue = (seq, changes) => rooms.acceptInput(room, first, {
    type: 'input', round: 1, seq, input: { kind: 'tap' }, ...changes,
  }, connection);
  assert.equal(enqueue(0, { playerId: second.id }), false);
  assert.equal(enqueue(0, { round: 0 }), false);
  assert.equal(enqueue(0, { input: { kind: 'tap', power: 999 } }), false);
  for (let seq = 0; seq < 7; seq++) assert.equal(enqueue(seq), true);
  assert.equal(enqueue(6), false);
  assert.equal(enqueue(7), false);
  at(3050);
  rooms.tick(3050);
  assert.equal(enqueue(7), true);
  assert.equal(rooms.project(room, first).state.distance, 7);
  assert.equal(rooms.project(room, second).state.distance, 0);
  at(3680);
  rooms.tick(3680);
  assert.equal(room.activeRound.state.elapsedMs, 300);
  at(4681);
  rooms.tick(4681);
  assert.equal(rooms.project(room, first).notice, 'host_stall');
  assert.equal(rooms.project(room, first).phase, 'lobby');
});

test('projectors omit private game data during play', () => {
  const { rooms, host, room, join, at } = fixture();
  const tv = rooms.authorize(room, host.token);
  const first = rooms.authorize(room, join(0).token);
  const other = rooms.authorize(room, join(1, 'Other runner').token);
  for (const seat of [first, other]) {
    rooms.attach(seat, { lastSeq: -1 });
    rooms.command(room, seat, { type: 'ready', value: true });
  }
  rooms.command(room, tv, { type: 'start', round: 0 });
  for (let time = 50; time <= 3000; time += 50) {
    at(time);
    rooms.tick(time);
  }
  room.activeRound.state.serverCanary = 'server-only';
  rooms.acceptInput(room, other, { type: 'input', round: 1, seq: 0, input: { kind: 'tap' } }, other.connection);
  at(3050);
  rooms.tick(3050);
  const phone = rooms.project(room, first);
  assert.deepEqual(phone.state, { distance: 0, target: 40 });
  const hostView = rooms.project(room, tv);
  assert.equal(hostView.scene.runners.find(runner => runner.playerId === other.id).distance, 1);
  for (const view of [phone, hostView]) assert.ok(!JSON.stringify(view).includes('server-only'));
  assert.ok(!JSON.stringify(phone).includes(other.id));
});

test('a fenced connection cannot submit input after replacement', () => {
  const { rooms, host, room, join, at } = fixture();
  const tv = rooms.authorize(room, host.token);
  const original = { lastSeq: -1 };
  const first = rooms.authorize(room, join(0).token);
  const other = rooms.authorize(room, join(1).token);
  rooms.attach(first, original);
  rooms.attach(other, { lastSeq: -1 });
  for (const seat of [first, other]) rooms.command(room, seat, { type: 'ready', value: true });
  rooms.command(room, tv, { type: 'start', round: 0 });
  for (let time = 50; time <= 3000; time += 50) {
    at(time);
    rooms.tick(time);
  }
  const replacement = { lastSeq: -1 };
  rooms.attach(first, replacement);
  const input = { type: 'input', round: 1, seq: 0, input: { kind: 'tap' } };
  assert.equal(rooms.acceptInput(room, first, input, original), false);
  assert.equal(rooms.acceptInput(room, first, input, replacement), true);
});
