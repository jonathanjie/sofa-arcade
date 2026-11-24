import test from 'node:test';
import assert from 'node:assert/strict';
import { ManualClock } from './protocol-support.mjs';
import WebSocket from 'ws';
import { createFixtureServer } from '../fixture/server.mjs';
import { createMockSimulation } from '../fixture/simulation.mjs';
import { createRealtimeClient } from '../../../../ui/realtime/gravity-orchard/index.mjs';

test('real browser-client seam interoperates with fixture authority for two simultaneous seats, ACKs, pause and rematch', { timeout: 120_000 }, async (t) => {
  const clock = new ManualClock();
  const fixture = await createFixtureServer({ clock, simulation: createMockSimulation({ countdownTicks: 2 }) });
  const clients = [];
  t.after(async () => { clients.forEach((peer) => peer.client.dispose()); await fixture.close(); });
  // Use real sockets, but advance the scheduler and client input pumps together.
  // OS descheduling must not simulate a host stall or make a player's input stale.
  t.mock.timers.enable({ apis: ['setTimeout'] });
  async function until(check, message) {
    for (let step = 0; step < 100; step++) {
      if (check()) return;
      t.mock.timers.tick(10);
      await clock.advance(10);
    }
    const states = clients.map(({ snapshot, status }) => ({
      phase: snapshot?.view.phase, tick: snapshot?.view.tick,
      pause: snapshot?.view.pauseReason, status: status?.state,
    }));
    assert.fail(message + ' ' + JSON.stringify(states));
  }
  class OriginSocket extends WebSocket {
    constructor(url) { super(url, { origin: fixture.origin }); }
  }
  async function connect(viewer) {
    const response = await fetch(`${fixture.origin}/fixture/session`, {
      method: 'POST', headers: { Origin: fixture.origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ viewer }),
    });
    const credential = await response.json();
    const peer = { client: null, snapshot: null, status: null };
    const connected = Promise.withResolvers();
    peer.client = createRealtimeClient({
      url: fixture.origin.replace('http:', 'ws:') + '/api/realtime/gravity-orchard',
      roomCode: fixture.roomCode, token: credential.token, now: clock.now, WebSocketImpl: OriginSocket,
      onSnapshot: (snapshot) => { peer.snapshot = snapshot; }, onStatus: (status) => {
        peer.status = status;
        if (status.state === 'connected') connected.resolve();
      },
    });
    clients.push(peer);
    peer.client.connect();
    await connected.promise;
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
