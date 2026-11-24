import { createServer } from 'node:http';
import { once } from 'node:events';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createRealtimeCoordinator } from '../../index.mjs';
import { createMockSimulation } from '../../fixture/simulation.mjs';
import { createStrictUpgradePolicy } from '../../fixture/upgrade-policy.mjs';

export async function flush() { for (let index = 0; index < 8; index++) await nextTurn(); }

export function fakeClock() {
  let at = 0, serial = 0;
  const timers = new Map();
  return {
    now: () => at,
    setTimeout(fn, delay) { const id = ++serial; timers.set(id, { at: at + delay, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    count: () => timers.size,
    async advance(ms) {
      const target = at + ms;
      for (;;) {
        const pending = [...timers].filter(([, timer]) => timer.at <= target + 1e-7).sort((a, b) => a[1].at - b[1].at || a[0] - b[0]);
        if (!pending.length) break;
        const [id, timer] = pending[0];
        at = Math.min(target, timer.at);
        timers.delete(id);
        timer.fn();
        await nextTurn();
      }
      at = target; await flush();
    },
    async jump(ms) {
      at += ms;
      const due = [...timers].filter(([, timer]) => timer.at <= at).sort((a, b) => a[1].at - b[1].at || a[0] - b[0]);
      for (const [id, timer] of due) {
        if (!timers.delete(id)) continue;
        timer.fn();
        await nextTurn();
      }
      await flush();
    },
  };
}

export async function harness({ simulation = createMockSimulation({ countdownTicks: 1 }), clock = fakeClock(), store = new Map(), authorize, saveCheckpoint } = {}) {
  const writes = [];
  const actors = { 'unit-host': { role: 'host', playerId: null }, 'unit-jon': { role: 'player', playerId: 'jon' }, 'unit-lydia': { role: 'player', playerId: 'lydia' } };
  let policy = () => false;
  const coordinator = createRealtimeCoordinator({
    simulation, clock,
    authorize: authorize ?? (async ({ roomCode, bearer }) => roomCode === 'UNIT' ? actors[bearer] ?? null : null),
    validateUpgrade: (request) => policy(request),
    loadCheckpoint: async (code) => store.get(code) ?? null,
    saveCheckpoint: async (code, checkpoint) => {
      if (saveCheckpoint) await saveCheckpoint(code, checkpoint);
      writes.push(structuredClone(checkpoint)); store.set(code, structuredClone(checkpoint));
    },
  });
  const server = createServer();
  server.on('upgrade', coordinator.handleUpgrade);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  policy = createStrictUpgradePolicy({ origins: [origin] });
  const clients = [];
  let commandSerial = 0;
  await coordinator.startRoom({ roomCode: 'UNIT', matchId: 'unit-match', seed: 'unit-seed' });
  async function connect(seat) {
    const ws = new WebSocket(origin.replace('http:', 'ws:') + '/api/realtime/gravity-orchard', { origin });
    const messages = [];
    ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
    ws.on('error', () => {});
    await once(ws, 'open');
    ws.send(JSON.stringify({ type: 'auth', protocol: 1, roomCode: 'UNIT', token: `unit-${seat}` }));
    await flush();
    const welcome = messages.find((message) => message.type === 'welcome');
    if (!welcome) throw new Error('Missing unit welcome');
    const client = {
      ws, messages, welcome, seq: 0,
      send(value) { ws.send(JSON.stringify(value)); },
      input(value = { x: 0, y: 0, brake: true }) {
        const view = coordinator.getPublicView('UNIT');
        const message = { type: 'input', protocol: 1, matchId: view.matchId, runEpoch: view.runEpoch,
          controllerEpoch: welcome.controllerEpoch, seq: client.seq++, observedTick: view.tick, ...value };
        client.send(message); return message;
      },
      async command(kind, payload, id = `${seat}-${kind}-${++commandSerial}`) {
        const view = coordinator.getPublicView('UNIT');
        const command = { type: 'command', protocol: 1, id, matchId: view.matchId, runEpoch: view.runEpoch, kind, payload };
        client.send(command); await flush();
        return { command, result: messages.findLast((message) => message.type === 'command-result' && message.id === id) };
      },
    };
    clients.push(client); return client;
  }
  async function players() {
    const jon = await connect('jon'), lydia = await connect('lydia');
    jon.input(); lydia.input(); await flush();
    const first = await jon.command('ready', { value: true });
    const second = await lydia.command('ready', { value: true });
    if (!first.result?.accepted || !second.result?.accepted) throw new Error('Unit ready failed');
    jon.input(); lydia.input(); await flush();
    await clock.advance(1000 / 60);
    return { jon, lydia };
  }
  return { coordinator, clock, store, writes, connect, players, actors,
    async close() {
      await coordinator.close();
      for (const client of clients) client.ws.terminate();
      await new Promise((resolve) => server.close(resolve));
    } };
}
