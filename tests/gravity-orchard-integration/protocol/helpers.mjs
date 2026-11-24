import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setImmediate as turn, setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { startLanServer } from '../../../server/lan.mjs';

export const NEUTRAL = Object.freeze({ x: 0, y: 0, brake: true });
export async function flush() { for (let i = 0; i < 4; i++) await turn(); }
export async function until(predicate, message = 'Timed out waiting for the live host.') {
  const end = performance.now() + 4000;
  while (!predicate()) { if (performance.now() >= end) throw new Error(message); await delay(4); }
  return predicate();
}

/** Accelerates elapsed host time only; actual GO1, sockets, auth and SQLite run unchanged. */
export function manualClock() {
  let time = 0, serial = 0;
  const timers = new Map();
  return {
    now: () => time,
    setTimeout(fn, milliseconds) { const id = ++serial; timers.set(id, { at: time + milliseconds, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    async advance(milliseconds) {
      const end = time + milliseconds;
      let iterations = 0;
      for (;;) {
        const next = [...timers].filter(([, item]) => item.at <= end + 1e-7).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) break;
        if (++iterations > 100_000) throw new Error('The test scheduler did not progress.');
        const [id, timer] = next; time = Math.min(end, timer.at); timers.delete(id); timer.fn(); await flush();
      }
      time = end; await flush();
    },
    async jump(milliseconds) {
      time += milliseconds;
      const due = [...timers].filter(([, item]) => item.at <= time);
      for (const [id, item] of due) if (timers.delete(id)) { item.fn(); await flush(); }
      await flush();
    },
    timerCount: () => timers.size,
  };
}

export async function api(host, route, { body, token, method = body === undefined ? 'GET' : 'POST', headers = {} } = {}) {
  const response = await fetch(host.origin + route, {
    method, headers: { Origin: host.origin, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, value: await response.json() };
}

export async function createRoom(host, options = { mode: 'campaign' }) {
  const created = await api(host, '/api/rooms', { body: { gameId: 'gravity-orchard', options } });
  assert.equal(created.status, 201, JSON.stringify(created.value));
  const { code, hostToken } = created.value;
  const tokens = { host: hostToken };
  const clientIds = {};
  for (const playerId of ['jon', 'lydia']) {
    clientIds[playerId] = crypto.randomUUID();
    const joined = await api(host, `/api/rooms/${code}/join`, { body: { playerId, clientId: clientIds[playerId] } });
    assert.equal(joined.status, 200); tokens[playerId] = joined.value.playerToken;
  }
  const started = await api(host, `/api/rooms/${code}/start`, { body: {}, token: hostToken });
  assert.equal(started.status, 200, JSON.stringify(started.value));
  return { code, tokens, clientIds, started: started.value };
}

export async function connectPeer(host, room, seat, { origin = host.origin, ca, token = room.tokens[seat] } = {}) {
  const ws = new WebSocket(origin.replace(/^http/, 'ws') + '/api/realtime/gravity-orchard', { origin, ...(ca ? { ca } : {}) });
  const messages = [];
  ws.on('message', raw => messages.push(JSON.parse(raw.toString())));
  ws.on('error', () => {});
  await once(ws, 'open');
  ws.send(JSON.stringify({ type: 'auth', protocol: 1, roomCode: room.code, token }));
  await until(() => messages.some(message => message.type === 'welcome') || ws.readyState === WebSocket.CLOSED);
  const welcome = messages.find(message => message.type === 'welcome');
  if (!welcome) return { ws, messages, welcome: null };
  let seq = 0;
  const peer = {
    ws, messages, welcome,
    get snapshot() {
      return messages.findLast(message => message.type === 'snapshot') || welcome.snapshot;
    },
    send(message) { ws.send(JSON.stringify(message)); },
    input(input = NEUTRAL, overrides = {}) {
      const view = peer.snapshot.view;
      const frame = { type: 'input', protocol: 1, matchId: view.matchId, runEpoch: view.runEpoch,
        controllerEpoch: welcome.controllerEpoch, seq: seq++, observedTick: view.tick, ...input, ...overrides };
      peer.send(frame); return frame;
    },
    async command(kind, payload, id = crypto.randomUUID()) {
      const view = peer.snapshot.view;
      const frame = { type: 'command', protocol: 1, id, matchId: view.matchId, runEpoch: view.runEpoch, kind, payload };
      peer.send(frame);
      const result = await until(() => messages.findLast(message => message.type === 'command-result' && message.id === id));
      await flush(); return { frame, result };
    },
  };
  return peer;
}

export async function harness(t, options = {}) {
  const clock = options.realtimeClock || manualClock();
  const host = await startLanServer({ host: '127.0.0.1', port: 0, databasePath: ':memory:', enableGravityOrchard: true, realtimeClock: clock, ...options });
  const peers = [];
  t.after(async () => { for (const peer of peers) peer.ws.terminate(); await flush(); await host.close(); });
  const room = await createRoom(host, options.gameOptions || { mode: 'campaign' });
  const connect = async (seat, opts) => { const peer = await connectPeer(host, room, seat, opts); peers.push(peer); return peer; };
  const jon = await connect('jon'), lydia = await connect('lydia'), tv = await connect('host');
  const players = { jon, lydia };
  async function ready() {
    jon.input(); lydia.input(); await flush();
    assert.equal((await jon.command('ready', { value: true })).result.accepted, true);
    assert.equal((await lydia.command('ready', { value: true })).result.accepted, true);
    await flush();
  }
  async function pump(milliseconds, input = NEUTRAL) {
    for (let elapsed = 0; elapsed < milliseconds; elapsed += 50) {
      for (const peer of Object.values(players)) peer.input(input);
      await flush(); await clock.advance(Math.min(50, milliseconds - elapsed));
    }
  }
  return { host, room, clock, peers, connect, jon, lydia, tv, players, ready, pump };
}
