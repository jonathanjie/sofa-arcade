import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createMockSimulation, simulation } from '../fixture/simulation.mjs';
import { createFixtureServer } from '../fixture/server.mjs';
import { createStrictUpgradePolicy } from '../fixture/upgrade-policy.mjs';

const host = { role: 'host', playerId: null };
const player = (playerId) => ({ role: 'player', playerId });
const safe = { x: 0, y: 0, brake: true };
const ready = { kind: 'ready', payload: { value: true } };

test('fixture simulation matches the pure seam, separates tray input, and replays deterministically', () => {
  const sim = createMockSimulation({ countdownTicks: 2, stageTicks: 12 });
  const run = () => {
    let state = sim.createRun({ seed: 'fixture-seed', matchId: 'fixture-test' });
    const original = structuredClone(state);
    assert.equal(sim.step(state, { jon: safe, lydia: safe }), state, 'waiting never advances');
    state = sim.applyCommand(state, player('jon'), ready).state;
    assert.deepEqual(original.ready, { jon: false, lydia: false }, 'commands do not mutate their input');
    state = sim.applyCommand(state, player('lydia'), ready).state;
    assert.equal(state.runEpoch, original.runEpoch + 1);
    assert.equal(state.phase, 'countdown');
    state = sim.step(state, { jon: safe, lydia: safe });
    state = sim.step(state, { jon: safe, lydia: safe });
    assert.equal(state.elapsedTicks, 0, 'countdown is not active stage time');
    state = sim.step(state, { jon: { x: 1, y: 0, brake: false }, lydia: safe });
    assert.equal(state.fruits[0].x, 283);
    assert.equal(state.fruits[1].x, 1000, 'Jon cannot move the other marker');
    state = sim.step(state, { jon: safe, lydia: { x: 0, y: -1, brake: false } });
    assert.equal(state.fruits[0].x, 283, 'Brake holds the marker');
    assert.equal(state.fruits[1].y, 357);
    return state;
  };
  assert.deepEqual(run(), run());
  assert.deepEqual(sim.normalizeInput({ x: 1, y: 1, brake: false }), { x: 0.7071, y: 0.7071, brake: false });
  for (const bad of [{ x: NaN, y: 0, brake: false }, { x: Infinity, y: 0, brake: false },
    { x: 1.01, y: 0, brake: true }, { x: 0, y: 0, brake: 1 }, { x: 0, y: 0, brake: true, playerId: 'lydia' }]) {
    assert.equal(sim.normalizeInput(bad), null);
  }
});

test('fixture schema restores paused with a fresh epoch and rejects unsupported/corrupt checkpoints', () => {
  const state = simulation.createRun({ seed: 'private-fixture-seed', matchId: 'fixture-checkpoint' });
  const checkpoint = simulation.serializeCheckpoint(state);
  const restored = simulation.restoreCheckpoint(checkpoint);
  assert.equal(restored.phase, 'paused');
  assert.equal(restored.pauseReason, 'recovery');
  assert.equal(restored.runEpoch, state.runEpoch + 1);
  assert.deepEqual(restored.players.jon.input, safe);
  assert.deepEqual(restored.ready, { jon: false, lydia: false });
  assert.equal(state.phase, 'waiting', 'restore does not mutate the stored value');
  const view = simulation.project(restored, host);
  for (const key of ['seed', 'fixtureSchema', 'elapsedTicks', 'eventSequence']) assert.ok(!Object.hasOwn(view, key));
  view.players.jon.input.x = 1;
  assert.equal(restored.players.jon.input.x, 0, 'projection is not a mutable authority reference');
  assert.throws(() => simulation.restoreCheckpoint({ ...checkpoint, schemaVersion: 0 }), /unsupported/);
  assert.throws(() => simulation.restoreCheckpoint({ ...checkpoint, schemaVersion: 2 }), /unsupported/);
  for (const patch of [{ phase: 'not-a-phase' }, { runEpoch: -1 }, { tick: NaN }, { fruits: [] }, { eventSequence: Infinity }]) {
    assert.throws(() => simulation.restoreCheckpoint({ ...checkpoint, state: { ...checkpoint.state, ...patch } }), /invalid/);
  }
});

test('mock lifecycle completes three distinct stages, supports retry, and never advances a pause', () => {
  const sim = createMockSimulation({ countdownTicks: 1, stageTicks: 1 });
  let state = sim.createRun({ seed: 'stages', matchId: 'fixture-stages' });
  const advance = () => {
    state = sim.applyCommand(state, player('jon'), ready).state;
    state = sim.applyCommand(state, player('lydia'), ready).state;
    state = sim.step(state, { jon: safe, lydia: safe });
    state = sim.step(state, { jon: safe, lydia: safe });
  };
  advance();
  assert.equal(state.phase, 'interlude');
  assert.equal(state.results.length, 1);
  const epoch = state.runEpoch;
  state = sim.applyCommand(state, host, { kind: 'retry-stage', payload: {} }).state;
  assert.equal(state.phase, 'waiting');
  assert.equal(state.runEpoch, epoch + 1);
  assert.equal(state.results.length, 0);
  advance(); advance(); advance();
  assert.equal(state.phase, 'finished');
  assert.deepEqual(state.results.map((result) => result.stageIndex), [0, 1, 2]);
  const paused = sim.pauseForSystem(state, 'recovery');
  assert.equal(sim.step(paused, { jon: { x: 1, y: 0, brake: false }, lydia: safe }), paused);
  assert.throws(() => sim.pauseForSystem(state, 'client-forged-system'), /invalid/);
  assert.equal(sim.applyCommand(state, { role: 'player', playerId: 'forged' }, ready).accepted, false);
});

test('strict fixture upgrade policy uses original exact route/Host/Origin and actual encryption', () => {
  const origins = ['http://127.0.0.1:4182', 'https://127.0.0.1:4183'];
  const policy = createStrictUpgradePolicy({ origins });
  const request = (origin, encrypted = false) => ({ method: 'GET', url: '/api/realtime/gravity-orchard', headers: { origin, host: new URL(origin).host }, rawHeaders: ['Host', new URL(origin).host, 'Origin', origin], socket: { encrypted } });
  assert.equal(policy(request(origins[0])), true);
  assert.equal(policy(request(origins[1], true)), true);
  assert.equal(policy(request(origins[1], false)), false);
  assert.equal(policy(request(origins[0], true)), false);
  const spoofed = request(origins[1], false);
  spoofed.headers['x-forwarded-proto'] = 'https';
  spoofed.headers['x-forwarded-host'] = '127.0.0.1:4183';
  assert.equal(policy(spoofed), false);
  for (const change of [
    { url: '/api/realtime/gravity-orchard?token=not-an-actual-token' }, { url: '/api/realtime/gravity-orchard/' },
    { method: 'POST' }, { headers: { origin: 'http://unknown.invalid', host: '127.0.0.1:4182' } },
    { headers: { host: '127.0.0.1:4182' } }, { headers: { origin: 'null', host: '127.0.0.1:4182' } },
    { headers: { origin: origins[0], host: 'other.invalid' } },
    { rawHeaders: ['Host', '127.0.0.1:4182', 'Host', 'other.invalid', 'Origin', origins[0]] },
    { rawHeaders: ['Host', '127.0.0.1:4182', 'Origin', origins[0], 'Origin', origins[0]] },
    { rawHeaders: undefined },
  ]) assert.equal(policy({ ...request(origins[0]), ...change }), false);
  assert.throws(() => createStrictUpgradePolicy({ origins: ['http://127.0.0.1:4182/path'] }), /invalid/);
});

test('standalone fixture serves an exact public allowlist and ephemeral POST sessions; diagnostics redact credentials', async (t) => {
  const fixture = await createFixtureServer();
  t.after(() => fixture.close());
  const headers = { Origin: fixture.origin, 'Content-Type': 'application/json' };
  const session = async (viewer, extraHeaders = headers) => fetch(`${fixture.origin}/fixture/session`, {
    method: 'POST', headers: extraHeaders, body: JSON.stringify({ viewer }),
  });
  assert.equal((await fetch(`${fixture.origin}/`)).status, 200);
  assert.equal((await fetch(`${fixture.origin}/realtime/index.mjs`)).status, 200);
  assert.equal((await fetch(`${fixture.origin}/realtime/lib/protocol.mjs`)).status, 200);
  for (const path of ['/server/rooms.mjs', '/server/realtime/gravity-orchard/fixture/simulation.mjs', '/fixture/server.mjs', '/fixture/session', '/package.json']) {
    assert.equal((await fetch(fixture.origin + path)).status, 404);
  }
  assert.equal((await session('host', { 'Content-Type': 'application/json' })).status, 403);
  assert.equal((await session('host', { Origin: 'https://unrelated.invalid', 'Content-Type': 'application/json' })).status, 403);
  const issued = await session('host');
  assert.equal(issued.headers.get('cache-control'), 'no-store');
  const credential = await issued.json();
  assert.equal(typeof credential.token, 'string');
  const second = await (await session('host')).json();
  assert.notEqual(credential.token, second.token, 'tokens are generated at runtime per context');
  assert.equal((await fetch(`${fixture.origin}/fixture/diagnostics`)).status, 403);
  const ws = new WebSocket(fixture.origin.replace('http:', 'ws:') + '/api/realtime/gravity-orchard', { origin: fixture.origin });
  t.after(() => ws.terminate());
  await once(ws, 'open');
  const received = once(ws, 'message');
  ws.send(JSON.stringify({ type: 'auth', protocol: 1, roomCode: fixture.roomCode, token: credential.token }));
  const [data] = await received;
  const welcome = JSON.parse(data);
  assert.deepEqual(welcome.viewer, host);
  assert.equal(welcome.snapshot.view.gameId, 'gravity-orchard');
  const diagnosticResponse = await fetch(`${fixture.origin}/fixture/diagnostics`, { headers: { Authorization: `Bearer ${credential.token}` } });
  assert.equal(diagnosticResponse.status, 200);
  const diagnostics = await diagnosticResponse.text();
  assert.ok(!diagnostics.includes(credential.token));
  assert.ok(!diagnostics.includes(second.token));
  assert.ok(!/"(?:token|bearer|controllerEpoch)"/.test(diagnostics));
  assert.equal((await fetch(`${fixture.origin}/?unexpected=1`)).status, 400);
});
