import test from 'node:test';
import assert from 'node:assert/strict';
import { createPartyRooms } from './rooms.mjs';
import { getPartyGame } from '../../games/party/registry.mjs';
import { advancePartyClock } from '../realtime/party/round.mjs';

function fixture(gameId = 'tap-race', resolveGame) {
  let time = 0;
  const rooms = createPartyRooms({ resolveGame, now: () => time, seed: () => 'test-seed' });
  const host = rooms.create({ gameId, requestId: 'host'.repeat(8) });
  const room = rooms.find(host.code);
  function join(look, name = 'Runner') {
    return rooms.join(room, { look, name, requestId: String(look).repeat(32) });
  }
  return { rooms, host, room, join, at: value => { time = value; } };
}

test('only the host can select a game mode between rounds', () => {
  const base = getPartyGame('tap-race');
  const modes = [{ id: 'solo', label: 'Solo', hint: 'Race alone.' }, { id: 'team', label: 'Team' }];
  let matchMode;
  const game = {
    ...base, id: 'mode-fixture', defaultMode: 'solo', modes: modes.map(mode => ({ ...mode, private: true })),
    createRound(players, seed, number, match) {
      matchMode = match.mode;
      return base.createRound(players, seed, number, match);
    },
  };
  const { rooms, room, join, at } = fixture(game.id, id => id === game.id ? game : getPartyGame(id));
  const command = message => rooms.command(room, room.host, { round: room.round, ...message });
  const choose = mode => command({ type: 'mode', mode });
  assert.equal(room.mode, 'solo');
  assert.deepEqual(rooms.project(room, room.host).modes, modes);
  const [phone] = [0, 1].map(look => {
    const seat = rooms.authorize(room, join(look).token);
    rooms.attach(seat, {});
    rooms.command(room, seat, { type: 'ready', value: true });
    return seat;
  });
  const phoneView = () => rooms.project(room, phone);
  const before = JSON.stringify(phoneView());
  assert.ok(!Object.hasOwn(phoneView(), 'mode') && !Object.hasOwn(phoneView(), 'modes'));
  assert.throws(() => rooms.command(room, phone, { type: 'mode', mode: 'team', round: 0 }), { status: 403, code: 'forbidden' });
  assert.throws(() => choose('missing'), { status: 400, code: 'invalid_mode' });
  for (const fields of [{ mode: 1 }, { extra: 1 }, { round: -1 }]) {
    assert.throws(() => command({ type: 'mode', mode: 'team', ...fields }), { code: 'invalid_command' });
  }
  assert.throws(() => command({ type: 'mode', mode: 'team', round: 1 }), { status: 409, code: 'round_changed' });
  choose('team');
  assert.equal(rooms.project(room, room.host).mode, 'team');
  assert.equal(JSON.stringify(phoneView()), before);
  command({ type: 'start' });
  assert.equal(matchMode, 'team');
  assert.throws(() => choose('solo'), { status: 409, code: 'round_changed' });
  for (let time = 500; time <= 3000 + game.durationMs; time += 500) {
    at(time);
    rooms.tick(time);
    if (time === 3000) assert.throws(() => choose('solo'), { status: 409, code: 'round_changed' });
  }
  assert.equal(room.phase, 'results');
  choose('solo');
  assert.equal(room.mode, 'solo');
  assert.equal(room.notice, null);
  command({ type: 'select', gameId: base.id });
  assert.equal(room.mode, null);
  assert.deepEqual(rooms.project(room, room.host).modes, []);
  assert.throws(() => choose('team'), { code: 'invalid_mode' });
  command({ type: 'select', gameId: game.id });
  assert.equal(room.mode, game.defaultMode);
});

test('room retries preserve credentials, name filtering and exclusive looks', () => {
  const { rooms, host, room, join } = fixture();
  assert.equal(room.mode, null);
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

test('a short host stall preserves Tug of Yarn beat deadlines and input receipt times', () => {
  const { rooms, room, join, at } = fixture('tug-of-yarn');
  const seats = [0, 1].map(look => {
    const seat = rooms.authorize(room, join(look).token);
    rooms.attach(seat, { lastSeq: -1 });
    rooms.command(room, seat, { type: 'ready', value: true });
    return seat;
  });
  rooms.command(room, room.host, { type: 'start', round: 0 });
  for (let time = 50; time <= 3850; time += 50) {
    at(time);
    rooms.tick(time);
  }

  const [mint, honey] = seats.sort((left, right) => room.activeRound.state.teams[left.id] - room.activeRound.state.teams[right.id]);
  const submit = (seat, arrival) => {
    at(arrival);
    return rooms.acceptInput(room, seat, {
      type: 'input', round: 1, seq: 0, input: { kind: 'tap', at: 1100 },
    }, seat.connection);
  };
  assert.ok(submit(mint, 4300));
  assert.ok(submit(honey, 4520));
  at(4550);
  rooms.tick(4550);
  const { scene } = rooms.project(room, room.host);
  assert.equal(scene.t, 1550);
  assert.equal(scene.beat, 0);
  assert.deepEqual(scene.pull, [1, 0]);
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
  for (let seq = 0; seq < 4; seq++) assert.equal(enqueue(seq), true);
  assert.equal(enqueue(3), false);
  assert.equal(enqueue(7), false);
  at(3050);
  rooms.tick(3050);
  assert.equal(enqueue(7), true);
  assert.equal(rooms.project(room, first).state.distance, 4);
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

test('an explicit host end releases seats, credentials, and the room slot', () => {
  const { rooms, host, room, join } = fixture();
  const tv = rooms.authorize(room, host.token);
  const phone = rooms.authorize(room, join(0).token);
  const closed = [];
  rooms.attach(tv, { terminate: code => closed.push(code) });
  rooms.attach(phone, { terminate: code => closed.push(code) });
  assert.throws(() => rooms.command(room, phone, { type: 'end' }), { code: 'forbidden' });
  assert.throws(() => rooms.command(room, tv, { type: 'end', extra: true }), { code: 'invalid_command' });
  rooms.command(room, tv, { type: 'end' });
  assert.deepEqual(closed, [4403, 4403]);
  assert.equal(room.seats.size, 0);
  assert.equal(rooms.find(host.code), undefined);
  assert.equal(rooms.authorize(room, host.token), null);
});

test('idle rooms release the create receipt and seat holds', () => {
  const { rooms, host, room, join, at } = fixture();
  const credential = join(0);
  at(1_800_000);
  rooms.tick(1_800_000);
  assert.equal(rooms.find(host.code), undefined);
  assert.equal(room.seats.size, 0);
  assert.equal(rooms.authorize(room, credential.token), null);
  assert.equal(rooms.authorize(room, host.token), null);
  const next = rooms.create({ gameId: 'tap-race', requestId: 'host'.repeat(8) });
  assert.notEqual(next.token, host.token);
});

test('one network peer cannot occupy the party room or seat capacity', () => {
  const { rooms, room } = fixture();
  const peer = '192.0.2.1';
  const create = (id, address) => rooms.create({ gameId: 'tap-race', requestId: id.repeat(32) }, address);
  const first = create('a', peer);
  create('b', peer);
  assert.deepEqual(create('a', peer), first);
  assert.throws(() => create('c', peer), { code: 'party_peer_capacity' });
  assert.ok(create('d', '192.0.2.2'));

  const join = (look, requestId, address = peer) => rooms.join(room, { look, name: 'Mouse', requestId: requestId.repeat(32) }, address);
  const seat = join(0, 'a');
  assert.deepEqual(join(0, 'a'), seat);
  join(1, 'b');
  assert.throws(() => join(2, 'c'), { code: 'party_peer_capacity' });
  assert.ok(join(2, 'd', '192.0.2.2'));
});

test('accepted input survives an ordinary disconnect before the next tick', () => {
  const { rooms, host, room, join, at } = fixture();
  const tv = rooms.authorize(room, host.token);
  const phone = rooms.authorize(room, join(0).token);
  const connection = { lastSeq: -1 };
  rooms.attach(phone, connection);
  const other = rooms.authorize(room, join(1).token);
  rooms.attach(other, {});
  for (const seat of [phone, other]) rooms.command(room, seat, { type: 'ready', value: true });
  rooms.command(room, tv, { type: 'start', round: 0 });
  for (let time = 50; time <= 3000; time += 50) {
    at(time);
    rooms.tick(time);
  }
  assert.ok(rooms.acceptInput(room, phone, { type: 'input', round: 1, seq: 0, input: { kind: 'tap' } }, connection));
  rooms.detach(phone, connection, room);
  at(3050);
  rooms.tick(3050);
  assert.equal(rooms.project(room, phone).state.distance, 1);
});

test('a short gap across the countdown applies only ticks after the start', () => {
  const { rooms, host, room, join, at } = fixture();
  for (const look of [0, 1]) {
    const seat = rooms.authorize(room, join(look).token);
    rooms.attach(seat, {});
    rooms.command(room, seat, { type: 'ready', value: true });
  }
  rooms.command(room, rooms.authorize(room, host.token), { type: 'start', round: 0 });
  for (const time of [900, 1800, 2700, 3175]) {
    at(time);
    rooms.tick(time);
  }
  assert.equal(room.phase, 'playing');
  assert.equal(room.activeRound.state.elapsedMs, 150);
  assert.equal(room.activeRound.remainder, 25);
});

function readyRoundFixture() {
  const { rooms, room, join, at } = fixture();
  const calls = [];
  const departures = [];
  room.game = {
    ...room.game,
    durationMs: 45_000,
    createRound(players, seed, gameRound, match) {
      calls.push({ gameRound, match, seed });
      return { players };
    },
    step(state, inputs, dt, context) {
      departures.push(...context?.departures ?? []);
      return { ...state, inputs };
    },
    isRoundOver: () => false,
    scores: state => state.players.map(({ id }, index) => ({ playerId: id, score: 2 - index })),
  };
  const seats = [0, 1, 2].map(look => {
    const seat = rooms.authorize(room, join(look).token);
    rooms.attach(seat, { lastSeq: -1 });
    rooms.command(room, seat, { type: 'ready', value: true });
    return seat;
  });
  let now = 0;
  function advanceTo(end) {
    for (; now < end;) {
      now = Math.min(now + 50, end);
      at(now);
      rooms.tick(now);
    }
  }
  return { rooms, room, seats, calls, departures, advanceTo };
}

test('createRound receives a game round, start time and previous results', () => {
  const { rooms, room, calls, advanceTo } = readyRoundFixture();
  rooms.command(room, room.host, { type: 'start', round: 0 });
  assert.deepEqual(calls[0], {
    gameRound: 1, seed: 'test-seed',
    match: { roomRound: 1, gameId: 'tap-race', mode: null, startsAt: 3000, previousResults: [] },
  });
  advanceTo(48_000);
  rooms.command(room, room.host, { type: 'start', round: 1 });
  assert.deepEqual(calls[1], {
    gameRound: 2, seed: 'test-seed',
    match: { roomRound: 2, gameId: 'tap-race', mode: null, startsAt: 51_000, previousResults: [
      { playerId: 'p1', score: 2, place: 1 },
      { playerId: 'p2', score: 1, place: 2 },
      { playerId: 'p3', score: 0, place: 3 },
    ] },
  });
  advanceTo(96_000);
  const game = room.game;
  rooms.command(room, room.host, { type: 'select', gameId: 'tap-race', round: 2 });
  room.game = game;
  rooms.command(room, room.host, { type: 'start', round: 2 });
  assert.deepEqual(calls[2].match.previousResults, []);
  assert.equal(calls[2].gameRound, 1);
  assert.equal(calls[2].match.roomRound, 3);
});

test('the next game step reports each kicked or expired round seat once', () => {
  const { rooms, room, seats: [kicked, expired, held], departures, advanceTo } = readyRoundFixture();
  rooms.command(room, room.host, { type: 'start', round: 0 });
  rooms.detach(expired, expired.connection, room);
  advanceTo(3000);
  assert.ok(rooms.acceptInput(room, kicked, { type: 'input', round: 1, seq: 0, input: { kind: 'tap' } }, kicked.connection));
  rooms.command(room, room.host, { type: 'kick', playerId: kicked.id });
  rooms.command(room, room.host, { type: 'kick', playerId: kicked.id });
  advanceTo(3050);
  assert.deepEqual(room.activeRound.state.inputs, []);
  assert.deepEqual(departures, [{ playerId: kicked.id, reason: 'kicked' }]);
  rooms.detach(held, held.connection, room);
  advanceTo(29_999);
  assert.equal(departures.length, 1);
  advanceTo(30_000);
  assert.deepEqual(departures, [
    { playerId: kicked.id, reason: 'kicked' },
    { playerId: expired.id, reason: 'expired' },
  ]);
  rooms.attach(held, {});
  advanceTo(31_000);
  assert.equal(departures.length, 2);
  assert.equal(room.activeRound.roster.length, 3);
});
