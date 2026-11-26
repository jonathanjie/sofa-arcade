import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { createPartyRealtime } from '../../../server/realtime/party/index.mjs';
import { WebSocketServer } from '../../../server/runtime/gravity-orchard-dependencies.mjs';
import { PARTY_LIMITS } from '../../../server/realtime/party/protocol.mjs';
import { launchPartyHarness } from '../../party/harness.mjs';

test('replacement resets sequence, fences the old socket and keeps received input private', { timeout: 5000 }, async t => {
  const harness = await launchPartyHarness(t, { gameId: 'tap-race' });
  const host = await harness.create();
  const tv = await harness.connect(host);
  const first = await harness.connect(await harness.join(host.code, 0, '🐭'.repeat(12)));
  const other = await harness.connect(await harness.join(host.code, 1, 'Private Guest'.slice(0, 12)));
  first.send({ type: 'ready', value: true });
  other.send({ type: 'ready', value: true });
  await harness.until(() => tv.view.players.every(player => player.ready), { ticks: 12 });
  tv.send({ type: 'start', round: 0 });
  await harness.until(() => first.view.phase === 'playing', { ticks: 80 });
  await assert.rejects(harness.connect({ code: host.code, token: 'Z'.repeat(43) }), /4403/);
  first.send({ type: 'input', round: first.view.round, seq: 12, input: { kind: 'tap' } });
  await harness.until(() => first.view.state.distance === 1, { ticks: 10 });

  const replacement = await harness.connect(first.credential);
  assert.equal(await first.disconnected, 4409);
  assert.equal(replacement.packets[0].type, 'welcome');
  assert.equal(replacement.view.self.id, first.playerId);
  replacement.input({ kind: 'tap' });
  await harness.until(() => replacement.view.state.distance === 2, { ticks: 10 });
  assert.deepEqual(other.view.state, { distance: 0, target: 40 });
  assert.equal(Object.hasOwn(replacement.view, 'players'), false);
  assert.ok(!JSON.stringify(replacement.view).includes(other.view.self.name));
  assert.ok(replacement.packets.every(packet => packet.bytes <= PARTY_LIMITS.phoneSnapshotBytes + 4));

  tv.send({ type: 'kick', playerId: replacement.playerId });
  assert.equal(await replacement.disconnected, 4403);
  await assert.rejects(harness.connect(first.credential), /4403/);
});

test('a blocked phone closes without delaying another phone or the TV', { timeout: 5000 }, async t => {
  let lastServerSocket;
  const upgrade = WebSocketServer.prototype.handleUpgrade;
  t.mock.method(WebSocketServer.prototype, 'handleUpgrade', function (request, socket, head, accept) {
    return upgrade.call(this, request, socket, head, ws => {
      lastServerSocket = ws;
      accept(ws);
    });
  });
  const harness = await launchPartyHarness(t, { gameId: 'tap-race' });
  const room = await harness.create();
  const tv = await harness.connect(room);
  const healthy = await harness.connect(await harness.join(room.code, 0));
  const slow = await harness.connect(await harness.join(room.code, 1));
  Object.defineProperty(lastServerSocket, 'bufferedAmount', { value: PARTY_LIMITS.sendBufferBytes - 1 });
  await harness.until(() => healthy.packets.some(packet => packet.type === 'snapshot'), { ticks: 10 });
  await harness.until(() => tv.view.players.some(player => player.id === slow.playerId && !player.connected), { ticks: 10 });
  assert.equal(await slow.disconnected, 1011);
  healthy.send({ type: 'ready', value: true });
  await harness.until(() => tv.view.players.find(player => player.id === healthy.playerId).ready, { ticks: 10 });
});

test('a silent phone loses its connection, then its held credential', { timeout: 5000 }, async t => {
  const harness = await launchPartyHarness(t, { gameId: 'tap-race' });
  const room = await harness.create();
  const credential = await harness.join(room.code, 0);
  const phone = await harness.connect(credential, { autoPong: false });
  await harness.advance(10_000);
  assert.equal(await phone.disconnected, 4000);
  await harness.advance(30_000);
  await assert.rejects(harness.connect(credential), /4403/);
});

test('harness play budget covers long game durations on the simulated clock', async t => {
  const { partyPlayTicks } = await import('../../party/harness.mjs');
  const fixture = await launchPartyHarness(t, { gameId: 'tap-race' });
  const start = fixture.clock.now();
  await fixture.until(() => fixture.clock.now() >= start + 108_000, {
    ticks: partyPlayTicks?.({ durationMs: 114_000 }),
  });
  assert.equal(fixture.clock.now(), 108_000);
  assert.equal(partyPlayTicks({}), 500);
});

test('only authenticated phones can request a bounded clock sample', { timeout: 5000 }, async t => {
  const fixture = await launchPartyHarness(t, { gameId: 'tap-race' });
  const room = await fixture.create();
  const tv = await fixture.connect(room);
  const phone = await fixture.connect(await fixture.join(room.code, 0));
  await fixture.advance(50);
  tv.send({ type: 'clock-ping', id: 1 });
  phone.send({ type: 'clock-ping', id: 1, timestamp: 123 });
  phone.send({ type: 'clock-ping', id: -1 });
  for (let id = 1; id <= 4; id++) phone.send({ type: 'clock-ping', id });
  await fixture.until(() => phone.packets.filter(packet => packet.type === 'clock-pong').length === 3, { ticks: 10 });
  await fixture.advance(50);
  assert.deepEqual(phone.packets.filter(packet => packet.type === 'clock-pong').map(packet => packet.clock), [
    { type: 'clock-pong', id: 1, serverAt: 50 },
    { type: 'clock-pong', id: 2, serverAt: 50 },
    { type: 'clock-pong', id: 3, serverAt: 50 },
  ]);
  assert.ok(!tv.packets.some(packet => packet.type === 'clock-pong'));
});

test('the host socket selects an available mode and receives invalid_mode for an unknown one', { timeout: 5000 }, async t => {
  const realtime = createPartyRealtime({ validateUpgrade: () => true, admitSocket: () => true });
  const server = createServer();
  server.on('upgrade', realtime.handleUpgrade);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    realtime.close();
    return new Promise(resolve => server.close(resolve));
  });
  const host = realtime.rooms.create({ gameId: 'tap-race', requestId: 'host'.repeat(8) });
  const room = realtime.rooms.find(host.code);
  room.game = { ...room.game, modes: [{ id: 'relay', label: 'Relay' }] };
  const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/api/realtime/party`);
  t.after(() => socket.terminate());
  await once(socket, 'open');
  const send = message => socket.send(JSON.stringify(message));
  const receive = async () => JSON.parse((await once(socket, 'message'))[0]);
  send({ type: 'auth', protocol: 1, ...host });
  assert.equal((await receive()).type, 'welcome');
  send({ type: 'mode', round: 0, mode: 'relay' });
  let packet;
  do { packet = await receive(); } while (packet.type === 'snapshot' && packet.view.mode === null);
  assert.equal(packet.view.mode, 'relay');
  send({ type: 'mode', round: 0, mode: 'missing' });
  do { packet = await receive(); } while (packet.type === 'snapshot');
  assert.deepEqual(packet, { type: 'error', code: 'invalid_mode', message: 'Choose an available mode.' });
});
