// Independent protocol probes: no production game, room DB, or private UI imports.
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { setImmediate as turn } from 'node:timers/promises';
import WebSocket from 'ws';
import { createRealtimeCoordinator } from '../index.mjs';

export const PATH = '/api/realtime/gravity-orchard';
export const ROOM = 'ABC234';
export const OTHER_ROOM = 'DEF567';
export const NEUTRAL = Object.freeze({ x: 0, y: 0, brake: true });
const ids = ['jon', 'lydia'];
const levels = ['morning-delivery', 'switchback-grove', 'moonlight-picnic'];
export const clone = value => structuredClone(value);

export async function drain(turns = 5) {
  for (let i = 0; i < turns; i++) await turn();
}

export class ManualClock {
  time = 0;
  nextId = 1;
  tasks = new Map();
  now = () => this.time;
  setTimeout = (callback, delay) => {
    const id = this.nextId++;
    this.tasks.set(id, { at: this.time + Math.max(0, delay), callback });
    return id;
  };
  clearTimeout = id => { this.tasks.delete(id); };
  async advance(ms) {
    const end = this.time + ms;
    let iterations = 0;
    for (;;) {
      const next = [...this.tasks].sort((a, b) => a[1].at - b[1].at || a[0] - b[0])
        .find(([, task]) => task.at <= end);
      if (!next) break;
      if (++iterations > 100_000) throw new Error('Test scheduler failed to make progress.');
      this.time = next[1].at;
      this.tasks.delete(next[0]);
      next[1].callback();
      await turn();
    }
    this.time = end;
    await drain();
  }
  async jump(ms) {
    this.time += ms;
    const due = [...this.tasks].filter(([, task]) => task.at <= this.time);
    for (const [id, task] of due) {
      if (this.tasks.delete(id)) task.callback();
    }
    await drain();
  }
}

/** Deliberately simple independent engine. Stage length is a test fixture setting. */
export function probeSimulation({ stageTicks = 5400 } = {}) {
  const stats = { create: 0, step: 0, apply: 0, pause: 0, restore: 0, normalize: 0 };
  const boundary = (before, phase, reason = null) => {
    const state = clone(before);
    state.phase = phase;
    state.pauseReason = reason;
    state.runEpoch++;
    state.ready = { jon: false, lydia: false };
    state.players = Object.fromEntries(ids.map(id => [id, { input: { ...NEUTRAL } }]));
    return state;
  };
  const simulation = {
    createRun({ seed, matchId, options = { mode: 'campaign' } }) {
      stats.create++;
      return {
        gameId: 'gravity-orchard', schemaVersion: 1, matchId, seed,
        runEpoch: 0, tick: 0, phase: 'waiting', mode: options.mode,
        stageIndex: 0, levelId: levels[0], timeRemainingTicks: options.mode === 'practice' ? null : stageTicks,
        countdownTicks: 0, ready: { jon: false, lydia: false }, pauseReason: null,
        fruits: [
          { id: `${matchId}:jon`, type: 'apple', x: 200, y: 300, vx: 0, vy: 0, radius: 18 },
          { id: `${matchId}:lydia`, type: 'pear', x: 1000, y: 300, vx: 0, vy: 0, radius: 18 },
        ],
        baskets: Object.fromEntries(['apple', 'plum', 'pear', 'starfruit'].map(id => [id, { count: 0, capacity: 3 }])),
        orders: { recipes: [], activeIndex: 0, completedIds: [] }, gateStates: [], gust: null,
        players: Object.fromEntries(ids.map(id => [id, { input: { ...NEUTRAL } }])),
        results: [], events: [], privateCanary: 'PRIVATE_PROBE_STATE_MUST_NOT_ESCAPE',
      };
    },
    normalizeInput(raw) {
      stats.normalize++;
      if (!raw || Object.keys(raw).sort().join(',') !== 'brake,x,y'
        || ![raw.x, raw.y].every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1)
        || typeof raw.brake !== 'boolean') return null;
      const magnitude = Math.max(1, Math.hypot(raw.x, raw.y));
      return { x: Math.round(raw.x / magnitude * 1e4) / 1e4, y: Math.round(raw.y / magnitude * 1e4) / 1e4, brake: raw.brake };
    },
    step(before, input) {
      stats.step++;
      if (!['countdown', 'playing'].includes(before.phase)) return before;
      let state = clone(before);
      state.tick++;
      for (const id of ids) state.players[id].input = clone(input[id]);
      if (state.phase === 'countdown') {
        state.countdownTicks--;
        if (state.countdownTicks <= 0) state.phase = 'playing';
        return state;
      }
      for (let i = 0; i < ids.length; i++) {
        const value = input[ids[i]];
        state.fruits[i].vx = value.brake ? 0 : value.x * 60;
        state.fruits[i].vy = value.brake ? 0 : value.y * 60;
        state.fruits[i].x += state.fruits[i].vx / 60;
        state.fruits[i].y += state.fruits[i].vy / 60;
      }
      if (state.mode !== 'practice' && --state.timeRemainingTicks === 0) {
        state.results.push({ stageIndex: state.stageIndex, ordersCompleted: 0, composted: 0, stars: 0, elapsedTicks: stageTicks });
        state = boundary(state, state.stageIndex === 2 ? 'finished' : 'interlude');
      }
      return state;
    },
    applyCommand(before, actor, command) {
      stats.apply++;
      if (command.kind === 'ready' && actor.role === 'player' && ids.includes(actor.playerId)
        && ['waiting', 'paused', 'interlude'].includes(before.phase)) {
        let state = clone(before);
        state.ready[actor.playerId] = command.payload.value;
        if (state.ready.jon && state.ready.lydia) {
          if (state.phase === 'interlude') {
            state.stageIndex++;
            state.levelId = levels[state.stageIndex];
            state.timeRemainingTicks = stageTicks;
          }
          state = boundary(state, 'countdown');
          state.countdownTicks = 180;
        }
        return { accepted: true, state };
      }
      if (command.kind === 'pause' && ['host', 'player'].includes(actor.role)
        && ['countdown', 'playing'].includes(before.phase)) {
        return { accepted: true, state: boundary(before, 'paused', command.payload.reason) };
      }
      if (command.kind === 'retry-stage' && actor.role === 'host' && ['interlude', 'finished'].includes(before.phase)) {
        const state = boundary(before, 'waiting');
        state.results.pop();
        state.timeRemainingTicks = stageTicks;
        return { accepted: true, state };
      }
      return { accepted: false, state: before, code: 'invalid_command' };
    },
    pauseForSystem(state, reason) {
      stats.pause++;
      if (!['network', 'host-stall', 'recovery'].includes(reason)) throw new Error('Invalid system pause.');
      if (reason !== 'recovery' && !['playing', 'countdown'].includes(state.phase)) return state;
      return boundary(state, 'paused', reason);
    },
    project(state) {
      const { seed, privateCanary, ...view } = clone(state);
      return view;
    },
    serializeCheckpoint(state) { return { schemaVersion: 1, fixture: 'independent-probe', state: clone(state) }; },
    restoreCheckpoint(checkpoint) {
      stats.restore++;
      if (checkpoint?.schemaVersion !== 1 || checkpoint.fixture !== 'independent-probe'
        || !Number.isSafeInteger(checkpoint.state?.runEpoch) || checkpoint.state.runEpoch < 0)
        throw new Error('Unsupported private probe checkpoint.');
      return boundary(checkpoint.state, 'paused', 'recovery');
    },
  };
  return { simulation, stats };
}

export function strictPolicy(request) {
  const scheme = request.socket.encrypted === true ? 'https' : 'http';
  const expected = `127.0.0.1:${request.socket.localPort}`;
  const hostCount = request.rawHeaders.filter((v, i) => i % 2 === 0 && v.toLowerCase() === 'host').length;
  const originCount = request.rawHeaders.filter((v, i) => i % 2 === 0 && v.toLowerCase() === 'origin').length;
  return request.method === 'GET' && request.url === PATH && hostCount === 1 && originCount === 1
    && request.headers.host === expected && request.headers.origin === `${scheme}://${expected}`;
}

export async function harness({ clock = new ManualClock(), authorize, validateUpgrade = strictPolicy,
  saveCheckpoint, loadCheckpoint, onLifecycle, simulation: providedSimulation, tls } = {}) {
  const engine = probeSimulation();
  const grants = new Map();
  const saved = new Map();
  const saves = [];
  const lifecycle = [];
  const coordinator = createRealtimeCoordinator({
    authorize: authorize || (async ({ roomCode, bearer }) => clone(grants.get(`${roomCode}:${bearer}`) || null)),
    validateUpgrade, clock, simulation: providedSimulation || engine.simulation,
    loadCheckpoint: loadCheckpoint || (async room => clone(saved.get(room) || null)),
    saveCheckpoint: saveCheckpoint || (async (room, checkpoint) => {
      saves.push({ room, checkpoint: clone(checkpoint), at: clock.now() }); saved.set(room, clone(checkpoint));
    }),
    onLifecycle: event => { lifecycle.push(clone(event)); return onLifecycle?.(event); },
  });
  const listener = (_, response) => { response.writeHead(404); response.end(); };
  const server = tls ? createHttpsServer(tls, listener) : createServer(listener);
  server.on('upgrade', coordinator.handleUpgrade);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  const origin = `${tls ? 'https' : 'http'}://127.0.0.1:${port}`;
  const url = `${tls ? 'wss' : 'ws'}://127.0.0.1:${port}${PATH}`;
  const sockets = new Set();
  function token(room, role, playerId = null) {
    const value = randomBytes(32).toString('base64url');
    grants.set(`${room}:${value}`, { role, playerId });
    return value;
  }
  async function connect({ room = ROOM, role = 'player', playerId = 'jon', bearer,
    auth = true, headers = { Origin: origin }, wsOptions = {} } = {}) {
    const value = bearer ?? token(room, role, playerId);
    const ws = new WebSocket(url, { headers, ...(tls ? { ca: tls.cert } : {}), ...wsOptions });
    sockets.add(ws);
    const received = [];
    ws.on('message', data => { try { received.push(JSON.parse(data.toString())); } catch {} });
    ws.on('error', () => {});
    await once(ws, 'open');
    if (auth) ws.send(JSON.stringify({ type: 'auth', protocol: 1, roomCode: room, token: value }));
    await drain(10);
    return { ws, received, bearer: value, latest: () => [...received].reverse().find(m => m.type === 'snapshot')
      || received.find(m => m.type === 'welcome')?.snapshot,
    welcome: () => received.find(m => m.type === 'welcome') };
  }
  async function close() {
    for (const socket of sockets) socket.terminate();
    await coordinator.close();
    await new Promise(resolve => server.close(resolve));
    await drain();
  }
  return { coordinator, clock, engine, server, origin, url, grants, saved, saves, lifecycle, token, connect, close };
}

export function input(client, overrides = {}) {
  const snapshot = client.latest();
  return { type: 'input', protocol: 1, matchId: snapshot.view.matchId, runEpoch: snapshot.view.runEpoch,
    controllerEpoch: client.welcome().controllerEpoch, seq: 0, observedTick: snapshot.view.tick,
    x: 0, y: 0, brake: true, ...overrides };
}
export function command(client, id, kind, payload, overrides = {}) {
  const view = client.latest().view;
  return { type: 'command', protocol: 1, id, kind, payload, matchId: view.matchId, runEpoch: view.runEpoch, ...overrides };
}
export async function send(client, message) {
  client.ws.send(typeof message === 'string' ? message : JSON.stringify(message));
  await drain(10);
}
export async function until(check, description = 'condition', attempts = 100) {
  for (let i = 0; i < attempts; i++) { if (check()) return; await drain(); }
  throw new Error(`Timed out waiting for ${description}.`);
}

export async function start(h, room = ROOM) {
  return h.coordinator.startRoom({ roomCode: room, matchId: `match-${room}`, seed: 'repeatable-test-seed', options: { mode: 'campaign' } });
}

export async function readyPair(h, jon, lydia, prefix = 'ready') {
  await send(jon, input(jon));
  await send(lydia, input(lydia));
  await send(jon, command(jon, `${prefix}-jon`, 'ready', { value: true }));
  await send(lydia, command(lydia, `${prefix}-lydia`, 'ready', { value: true }));
  await drain(10);
}
