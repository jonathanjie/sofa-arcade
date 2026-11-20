import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionStatus, createCollectionGame } from '../../ui/collection-game.mjs';
import { loadOddLaws } from '../../ui/collection-load.mjs';

const snapshot = (revision = 1, changes = {}) => ({
  code: 'ABC234', gameId: 'odd-laws-society', revision, phase: 'playing',
  state: { matchId: 'first-match', phaseId: 'session-1-council', council: { ownCommitment: null } },
  ...changes,
});

function harness(viewer = { role: 'player', playerId: 'jon' }) {
  const calls = [];
  const received = [];
  const statuses = [];
  let mounted;
  let options;
  const rules = Object.freeze({ buildings: [], laws: [], guilds: [] });
  const assets = Object.freeze({ manifest: {}, manifestUrl: 'http://127.0.0.1:4177/assets/odd-laws-society/manifest.json' });
  const handle = createCollectionGame({
    root: {}, viewer, code: 'ABC234', token: viewer.role === 'player' ? 'test-seat-only' : null,
    initialRoom: snapshot(), rules, assets, preferences: { reducedMotion: true },
    sound: { unlock() { calls.push('unlock'); }, setScene(value) { calls.push(['scene', value]); }, effect(value) { calls.push(['effect', value]); } },
    createRoomClient(value) {
      options = value;
      value.onStatus({ state: 'connected' });
      return {
        submit(action) { calls.push(['submit', action]); return Promise.resolve(snapshot(2)); },
        receive(room) { calls.push(['receive', room.revision]); value.onRoom(room); },
        dispose() { calls.push('client-dispose'); },
      };
    },
    mount(root, injected) {
      mounted = injected;
      calls.push('mount');
      return { update(room) { calls.push(['update', room.revision]); }, setConnection(value) { calls.push(['connection', value.state]); }, dispose() { calls.push('view-dispose'); } };
    },
    onRoom(room) { received.push(room); }, onStatus(value) { statuses.push(value); },
    onExit() { calls.push('exit'); }, onHelp() { calls.push('help'); },
  });
  return { handle, calls, received, statuses, mounted, options, rules, assets };
}

test('the shared bridge injects only public helpers, assets and the authenticated seat; unlock precedes dispatch', async () => {
  const h = harness();
  assert.deepEqual(h.mounted.viewer, { role: 'player', playerId: 'jon' });
  assert.equal(Object.isFrozen(h.mounted.viewer), true);
  assert.equal(h.options.playerId, 'jon');
  assert.equal(h.options.token, 'test-seat-only');
  assert.equal(h.mounted.rules, h.rules);
  assert.equal(h.mounted.assets, h.assets);
  assert.equal(h.mounted.preferences.reducedMotion, true);
  const command = { type: 'commitCouncil', matchId: 'first-match', phaseId: 'session-1-council', choiceId: 'keep', bid: 1 };
  const promise = h.mounted.dispatch(command);
  assert.deepEqual(h.calls.slice(-2), ['unlock', ['submit', command]]);
  assert.equal((await promise).revision, 2);
  h.handle.dispose();
});

test('passive stream failure reaches the mounted view even when no command is pending', () => {
  const h = harness();
  h.handle.setConnection('offline');
  assert.deepEqual(h.calls.at(-1), ['connection', 'offline']);
  assert.deepEqual(h.statuses.at(-1), { state: 'offline' });
  h.handle.setConnection({ state: 'reconnecting', message: 'Rejoining the room.' });
  assert.deepEqual(h.statuses.at(-1), { state: 'reconnecting', message: 'Rejoining the room.' });
  h.handle.setConnection('connected');
  assert.deepEqual(h.calls.at(-1), ['connection', 'connected']);
  h.handle.dispose();
});

test('old snapshots and another room cannot overwrite the current projected game', () => {
  const h = harness();
  h.handle.receive(snapshot(4));
  assert.equal(h.received.length, 1);
  h.handle.receive(snapshot(2));
  h.handle.receive(snapshot(5, { code: 'OTHER2' }));
  h.handle.receive(snapshot(5, { gameId: 'sofa-kingdoms' }));
  assert.equal(h.received.length, 1);
  h.handle.receive(snapshot(5, { state: { matchId: 'rematch', phaseId: 'session-1-council' } }));
  assert.equal(h.received.at(-1).state.matchId, 'rematch');
  h.handle.dispose();
});

test('TV is read-only and does not construct a voting client from its host credential', async () => {
  const h = harness({ role: 'host' });
  assert.equal(h.options, undefined);
  await assert.rejects(h.mounted.dispatch({ type: 'work' }), /joined phone/);
  h.handle.receive(snapshot(2));
  assert.equal(h.received.at(-1).revision, 2);
  h.handle.dispose();
});

test('navigation cancels both owners exactly once and ignores late callbacks', async () => {
  const h = harness();
  h.handle.dispose();
  h.handle.dispose();
  assert.equal(h.calls.filter(value => value === 'client-dispose').length, 1);
  assert.equal(h.calls.filter(value => value === 'view-dispose').length, 1);
  const before = h.calls.length;
  h.options.onRoom(snapshot(9));
  h.options.onStatus({ state: 'error' });
  h.handle.receive(snapshot(10));
  h.handle.setConnection('offline');
  h.mounted.sound.setScene('celebrate');
  h.mounted.sound.effect('win');
  h.mounted.onExit();
  h.mounted.onHelp();
  await assert.rejects(h.mounted.dispatch({ type: 'work' }), /closed/);
  assert.equal(h.calls.length, before);
  assert.deepEqual(h.received, []);
});

test('a failed mount releases its command client', () => {
  let closed = 0;
  assert.throws(() => createCollectionGame({
    root: {}, mount() { throw new Error('asset failure'); },
    viewer: { role: 'player', playerId: 'jon' }, token: 'seat', code: 'ABC234',
    initialRoom: snapshot(), createRoomClient() { return { dispose() { closed++; } }; },
  }), /asset failure/);
  assert.equal(closed, 1);
  assert.deepEqual(connectionStatus('unknown'), { state: 'reconnecting' });
});

test('an eager command client cannot reenter the shell before mount completes', () => {
  const order = [];
  const handle = createCollectionGame({
    root: {}, code: 'ABC234', token: 'seat', viewer: { role: 'player', playerId: 'jon' },
    initialRoom: snapshot(),
    createRoomClient(options) {
      options.onRoom(snapshot(2));
      return { dispose() {} };
    },
    mount() {
      order.push('mount');
      return { update(room) { order.push(room.revision); }, setConnection() {}, dispose() {} };
    },
    onRoom() { order.push('shell'); },
  });
  assert.deepEqual(order, ['mount', 2]);
  handle.dispose();
});

test('lazy collection loading resolves media from its manifest and never imports private authority', async () => {
  const imports = [];
  const requests = [];
  const modules = {
    '/games/odd-laws-society/index.mjs': { mount() {} },
    '/games/odd-laws-society/catalog.mjs': { BUILDINGS: [], LAWS: [], GUILDS: [] },
    '/games/odd-laws-society/preview.mjs': { buildQuote() {}, streetOutcome() {}, civicAward() {} },
    '/room-client.mjs': { createRoomClient() {} },
    '/media/odd-laws-society/score.mjs': { SCORE: { title: 'score' }, eventsForBar() {} },
    '/media/odd-laws-society/effects.mjs': { eventsForEffect() {} },
  };
  const result = await loadOddLaws({
    origin: 'http://127.0.0.1:4177',
    importer(path) { imports.push(path); assert.ok(modules[path], `Unexpected browser import: ${path}`); return modules[path]; },
    fetcher(url) { requests.push(url); return { ok: true, async json() { return { schemaVersion: 1, gameId: 'odd-laws-society', buildings: {} }; } }; },
  });
  assert.equal(result.assets.manifestUrl, 'http://127.0.0.1:4177/assets/odd-laws-society/manifest.json');
  assert.deepEqual(requests, [result.assets.manifestUrl]);
  assert.equal(result.rules.buildQuote, modules['/games/odd-laws-society/preview.mjs'].buildQuote);
  assert.equal(imports.some(path => /engine|private|fixture/.test(path)), false);
});

test('missing or invalid artwork uses code-native view fallbacks and optional effects do not block controls', async () => {
  const fixtureModule = {
    mount() {}, createRoomClient() {}, BUILDINGS: [], LAWS: [], GUILDS: [],
    buildQuote() {}, streetOutcome() {}, civicAward() {},
    SCORE: { title: 'score' }, eventsForBar() {},
  };
  const importer = path => {
    if (path.endsWith('/effects.mjs')) throw new Error('optional effect module absent');
    return fixtureModule;
  };
  for (const fetcher of [
    async () => { throw new Error('offline asset request'); },
    async () => ({ ok: false }),
    async () => ({ ok: true, async json() { throw new Error('invalid JSON'); } }),
    async () => ({ ok: true, async json() { return { schemaVersion: 42, gameId: 'wrong-game' }; } }),
  ]) {
    const result = await loadOddLaws({ origin: 'http://127.0.0.1:4177', importer, fetcher });
    assert.equal(result.mount, fixtureModule.mount);
    assert.equal(result.mediaAvailable, false);
    assert.deepEqual(result.assets.manifest.buildings, {});
    assert.equal(result.assets.manifest.gameId, 'odd-laws-society');
    assert.equal(result.score.eventsForEffect, undefined);
  }
});
