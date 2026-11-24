import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import WebSocket from 'ws';
import { createFixtureServer } from '../fixture/server.mjs';
import { createMockSimulation } from '../fixture/simulation.mjs';
import { fakeClock } from './unit-support/harness.mjs';
import { createRealtimeClient } from '../../../../ui/realtime/gravity-orchard/index.mjs';

test('real browser-client seam interoperates with fixture authority for two simultaneous seats, ACKs, pause and rematch', { timeout: 15_000 }, async (t) => {
  // Keep real sockets while giving the client pump and host one clock.
  // Runner delays must not turn into transport stalls or stale samples.
  const scheduler = fakeClock();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fixture = await createFixtureServer({ scheduler, simulation: createMockSimulation({ countdownTicks: 2 }) });
  async function until(check, message) {
    const deadline = performance.now() + 5000;
    while (!check()) {
      if (performance.now() > deadline) assert.fail(message);
      t.mock.timers.tick(10);
      await scheduler.advance(10);
    }
  }
  const clients = [];
  t.after(async () => { clients.forEach((peer) => peer.client.dispose()); await fixture.close(); });
  class OriginSocket extends WebSocket {
    constructor(url) { super(url, { origin: fixture.origin }); }
  }
  async function connect(viewer) {
    const response = await fetch(`${fixture.origin}/fixture/session`, {
      method: 'POST', headers: { Origin: fixture.origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ viewer }),
    });
    const credential = await response.json();
    const peer = { client: null, snapshot: null, status: null };
    peer.client = createRealtimeClient({
      url: fixture.origin.replace('http:', 'ws:') + '/api/realtime/gravity-orchard',
      roomCode: fixture.roomCode, token: credential.token, now: scheduler.now, WebSocketImpl: OriginSocket,
      onSnapshot: (snapshot) => { peer.snapshot = snapshot; }, onStatus: (status) => { peer.status = status; },
    });
    clients.push(peer);
    peer.client.connect();
    await until(() => peer.status?.state === 'connected', `${viewer} must authenticate`);
    assert.equal(JSON.stringify(peer.client.getStats()).includes(credential.token), false);
    return peer;
  }
  const host = await connect('host');
  const jon = await connect('jon');
  const lydia = await connect('lydia');
  const command = (peer, id, kind, payload) => peer.client.sendCommand({ id, kind, payload });
  assert.equal((await command(jon, 'jon-ready', 'ready', { value: true })).accepted, true);
  assert.equal((await command(lydia, 'lydia-ready', 'ready', { value: true })).accepted, true);
  await until(() => clients.every((peer) => peer.snapshot?.view.phase === 'playing'), 'all recipients must observe playing');
  jon.client.setInput({ x: 1, y: 0, brake: false });
  await until(() => host.snapshot.view.fruits[0].x > 283, 'Jon input must move his marker');
  assert.equal(host.snapshot.view.fruits[1].y, 360);
  lydia.client.setInput({ x: 0, y: -1, brake: false });
  await until(() => {
    const inputs = host.snapshot.view.players;
    return inputs.jon.input.x === 1 && !inputs.jon.input.brake && inputs.lydia.input.y === -1 && !inputs.lydia.input.brake;
  }, 'both authenticated seats must be applied simultaneously');
  await until(() => Number.isFinite(jon.client.getStats().ackRttEwmaMs) && Number.isFinite(lydia.client.getStats().ackRttEwmaMs), 'real applied ACK round trips must be measured');
  const oldMatch = host.snapshot.view.matchId;
  assert.equal((await command(host, 'shared-pause', 'pause', { reason: 'requested' })).accepted, true);
  await until(() => clients.every((peer) => peer.snapshot.view.phase === 'paused'), 'shared pause reaches every recipient');
  assert.deepEqual(host.snapshot.view.players.jon.input, { x: 0, y: 0, brake: true });
  assert.equal((await command(host, 'same-seed-rematch', 'rematch', { seedMode: 'same' })).accepted, true);
  await until(() => clients.every((peer) => peer.snapshot.view.phase === 'waiting' && peer.snapshot.view.matchId !== oldMatch), 'new match reaches all clients without stale overwrites');
  for (const peer of clients) assert.equal(peer.client.getStats().invalidMessages, 0);
});
