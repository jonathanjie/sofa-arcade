import test from 'node:test';
import assert from 'node:assert/strict';
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
