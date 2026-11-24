import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { setImmediate as settle } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { getPartyGame } from '../../games/party/registry.mjs';
import { startLanServer } from '../../server/lan.mjs';
import { PARTY_TICK_MS } from '../../server/realtime/party/round.mjs';

export function createManualClock() {
  let time = 0;
  let nextTimer = 0;
  const timers = new Map();
  return {
    now: () => time,
    setTimeout(fn, ms) {
      const id = ++nextTimer;
      timers.set(id, { fn, at: time + ms });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    advance(ms) {
      const end = time + ms;
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.at <= end)
          .sort(([, a], [, b]) => a.at - b.at)[0];
        if (!next) break;
        const [id, { fn, at }] = next;
        time = at;
        timers.delete(id);
        fn();
      }
      time = end;
    },
  };
}

export async function launchPartyHarness(t, { gameId, manual = true, ...hostOptions }) {
  const clock = manual ? createManualClock() : null;
  const host = await startLanServer({
    host: '127.0.0.1', port: 0, databasePath: ':memory:', partyClock: clock ?? undefined,
    partySeed: () => 'party-harness-seed', ...hostOptions,
  });
  const clients = new Set();
  t.after(async () => {
    for (const client of clients) client.terminate();
    await host.close();
  });

  async function post(path, body) {
    const response = await fetch(host.origin + '/api/party/rooms' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: host.origin },
      body: JSON.stringify({ ...body, requestId: randomBytes(24).toString('base64url') }),
    });
    const value = await response.json();
    assert.equal(response.status, 201, value.code);
    return value;
  }

  function connect(credential, options = {}) {
    const url = new URL('/api/realtime/party', host.origin);
    url.protocol = 'ws:';
    const socket = new WebSocket(url, { ...options, origin: host.origin });
    clients.add(socket);
    const packets = [];
    let view;
    let seq = 0;
    let welcomed = false;
    const send = value => socket.send(JSON.stringify(value));
    const welcome = new Promise((resolve, reject) => {
      socket.once('error', reject);
      socket.once('open', () => send({ type: 'auth', protocol: 1, code: credential.code, token: credential.token }));
      socket.on('message', bytes => {
        const packet = JSON.parse(bytes);
        if (!welcomed && packet.type !== 'welcome') {
          reject(new Error(`Expected welcome first, received ${packet.type}`));
          socket.terminate();
          return;
        }
        if (clock) {
          // Server frames are unmasked. Count the WebSocket header and text payload.
          const header = bytes.length < 126 ? 2 : 4;
          packets.push({ at: clock.now(), type: packet.type, bytes: bytes.length + header, phase: packet.view?.phase });
        }
        if (packet.view) view = packet.view;
        if (packet.type !== 'welcome') return;
        welcomed = true;
        resolve({
          credential, playerId: credential.playerId, packets, send,
          get view() { return view; },
          input(input) { send({ type: 'input', round: view.round, seq: seq++, input }); },
          disconnect() { socket.close(); return disconnected; },
          disconnected,
        });
      });
    });
    const disconnected = new Promise(resolve => {
      socket.once('close', code => { clients.delete(socket); resolve(code); });
    });
    return Promise.race([welcome, disconnected.then(code => { throw new Error(`Socket closed before welcome: ${code}`); })]);
  }

  async function advance(ms = PARTY_TICK_MS) {
    assert.ok(clock, 'manual clock is required');
    await settle();
    clock.advance(ms);
    await settle();
    await settle();
  }

  async function until(predicate, { ticks = 500, drive } = {}) {
    for (let tick = 0; tick < ticks; tick++) {
      if (predicate()) return;
      await drive?.(tick);
      await advance();
    }
    assert.ok(predicate(), 'party did not reach expected state within the tick budget');
  }

  return {
    origin: host.origin, clock, connect, advance, until,
    create: () => post('', { gameId }),
    join: (code, look, name = `Runner ${look + 1}`) => post(`/${code}/join`, { look, name }),
  };
}

/** Drives the platform boundaries. Each game supplies a legal input driver for one tick. */
export async function runPartyRounds(t, { gameId, drive, assertResults, playerCount = 16 }) {
  const game = getPartyGame(gameId);
  assert.ok(game && Number.isInteger(playerCount) && playerCount >= game.minPlayers && playerCount <= game.maxPlayers);
  const playTicks = Math.ceil(game.durationMs / PARTY_TICK_MS) + 10;
  const fixture = await launchPartyHarness(t, { gameId });
  const host = await fixture.create();
  let tv = await fixture.connect(host);
  const phones = await Promise.all(Array.from({ length: playerCount }, async (_, look) => {
    const phone = await fixture.connect(await fixture.join(host.code, look));
    phone.send({ type: 'ready', value: true });
    return phone;
  }));
  const ready = () => tv.view.players.filter(player => player.ready && player.connected).length;
  await fixture.until(() => ready() === playerCount, { ticks: 12 });
  const originals = [tv, ...phones];
  const [newTv, ...newPhones] = await Promise.all(originals.map(client => fixture.connect(client.credential)));
  assert.deepEqual(await Promise.all(originals.map(client => client.disconnected)), Array(playerCount + 1).fill(4409));
  tv = newTv;
  phones.splice(0, phones.length, ...newPhones);
  tv.send({ type: 'start', round: 0 });
  await fixture.until(() => phones.every(phone => phone.view.phase === 'playing'), { ticks: 80 });
  assert.equal(tv.view.roster.length, playerCount);

  const original = phones[1];
  await original.disconnect();
  await fixture.until(() => tv.view.players.some(player => player.id === original.playerId && !player.connected), { ticks: 12 });
  phones[1] = await fixture.connect(original.credential);
  assert.equal(phones[1].view.waiting, false);
  assert.equal(phones[1].view.self.id, original.playerId);

  const removed = phones.pop();
  tv.send({ type: 'kick', playerId: removed.playerId });
  assert.equal(await removed.disconnected, 4403);
  const late = await fixture.connect(await fixture.join(host.code, playerCount - 1, 'Late Guest'));
  late.send({ type: 'ready', value: true });
  assert.equal(late.view.waiting, true);
  assert.equal(late.view.state, null);
  assert.equal(tv.view.roster.length, playerCount);

  await fixture.until(() => tv.view.phase === 'results', {
    ticks: playTicks, drive: tick => drive(phones, tick, 1),
  });
  assertResults?.(tv.view, phones, 1);
  await fixture.until(() => ready() === playerCount && late.view.phase === 'results', { ticks: 12 });
  phones.push(late);
  tv.send({ type: 'start', round: 1 });
  await fixture.until(() => late.view.round === 2 && late.view.phase === 'playing', { ticks: 80 });
  assert.equal(late.view.waiting, false);
  assert.equal(tv.view.roster.length, playerCount);
  await fixture.until(() => tv.view.round === 2 && tv.view.phase === 'results', {
    ticks: playTicks, drive: tick => drive(phones, tick, 2),
  });
  assertResults?.(tv.view, phones, 2);
  return { ...fixture, tv, phones };
}
