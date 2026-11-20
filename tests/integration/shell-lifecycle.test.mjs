import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionStatus, createCollectionGame } from '../../ui/collection-game.mjs';
import { loadOddLaws } from '../../ui/collection-load.mjs';
import { createTutorialBridge } from '../../ui/collection-tutorial.mjs';

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

test('identical connected heartbeats do not rerender the component or clear its motion', () => {
  const h = harness();
  const before = h.calls.length;
  for (let index = 0; index < 20; index++) h.handle.setConnection({ state: 'connected' });
  assert.equal(h.calls.length, before);
  h.handle.setConnection({ state: 'offline', message: 'Waiting for the host.' });
  const afterDisconnect = h.calls.length;
  h.handle.setConnection({ state: 'offline', message: 'Waiting for the host.' });
  assert.equal(h.calls.length, afterDisconnect);
  h.handle.dispose();
});

test('uncertain commands recover once through the same client and ignore late work after navigation', async () => {
  let options, dispatch, finishRecovery;
  let reconnects = 0;
  const statuses = [];
  const handle = createCollectionGame({
    root: {}, viewer: { role: 'player', playerId: 'jon' }, code: 'ABC234', token: 'seat', initialRoom: snapshot(),
    createRoomClient(value) {
      options = value;
      return {
        submit() { return Promise.reject(Object.assign(new Error('Pending acknowledgment.'), { code: 'unconfirmed_action' })); },
        reconnect() {
          reconnects++;
          options.onStatus({ state: 'connected' });
          return new Promise(resolve => { finishRecovery = resolve; });
        },
        dispose() {},
      };
    },
    mount(_root, injected) {
      dispatch = injected.dispatch;
      return { update() {}, setConnection(status) { statuses.push(status); }, dispose() {} };
    },
  });
  options.onStatus({ state: 'offline' });
  handle.setConnection({ state: 'connected' });
  await Promise.resolve();
  assert.equal(reconnects, 0, 'ordinary client retries retain ownership until they exhaust');
  await assert.rejects(dispatch({ type: 'work' }), { code: 'unconfirmed_action' });
  options.onStatus({ state: 'connected' });
  assert.equal(statuses.at(-1).state, 'offline', 'a delivered snapshot does not confirm the retained request');
  assert.equal(handle.setConnection({ state: 'connected' }).state, 'reconnecting', 'the shell receives the effective connection state');
  handle.setConnection({ state: 'connected' });
  await Promise.resolve();
  assert.equal(reconnects, 1);
  assert.equal(statuses.at(-1).state, 'reconnecting', 'client callbacks cannot advertise an early recovery');
  handle.setConnection('offline');
  assert.equal(handle.setConnection('connected').state, 'reconnecting', 'a second transport recovery keeps the held request pending');
  assert.equal(reconnects, 1);
  handle.dispose();
  const before = statuses.length;
  finishRecovery(snapshot(2));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(statuses.length, before, 'navigation silences late recovery completion');
});

test('recovery failures remain explicit; transient loss can retry and an expired session stays blocked', async () => {
  for (const terminal of [false, true]) {
    let dispatch, reconnects = 0;
    const statuses = [];
    const handle = createCollectionGame({
      root: {}, viewer: { role: 'player', playerId: 'jon' }, code: 'ABC234', token: 'seat', initialRoom: snapshot(),
      createRoomClient() {
        return {
          submit() { return Promise.reject(Object.assign(new Error(), { code: 'unconfirmed_action' })); },
          reconnect() {
            reconnects++;
            if (reconnects === 1) return Promise.reject(Object.assign(new Error('Untrusted transport text.'), terminal
              ? { code: 'invalid_token', status: 401 } : { code: 'unavailable' }));
            return Promise.resolve(snapshot(2));
          },
          dispose() {},
        };
      },
      mount(_root, injected) {
        dispatch = injected.dispatch;
        return { update() {}, setConnection(status) { statuses.push(status); }, dispose() {} };
      },
    });
    await assert.rejects(dispatch({ type: 'work' }));
    handle.setConnection('connected');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(statuses.at(-1).state, terminal ? 'error' : 'offline');
    assert.ok(!statuses.at(-1).message.includes('Untrusted'));
    handle.setConnection('connected');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(reconnects, terminal ? 1 : 2);
    assert.equal(statuses.at(-1).state, terminal ? 'error' : 'connected');
    handle.dispose();
  }
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
    '/games/odd-laws-society/tutorial.mjs': { createTutorial() {} },
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
  assert.equal(result.createTutorial, modules['/games/odd-laws-society/tutorial.mjs'].createTutorial);
  assert.equal(imports.some(path => /engine|private|fixture/.test(path)), false);
});

test('missing or invalid artwork uses code-native view fallbacks and optional effects do not block controls', async () => {
  const fixtureModule = {
    mount() {}, createTutorial() {}, createRoomClient() {}, BUILDINGS: [], LAWS: [], GUILDS: [],
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

test('standalone guided practice delegates lessons and progress without exposing a room or dispatcher', () => {
  const rules = Object.freeze({ buildings: [], laws: [], guilds: [] });
  const assets = Object.freeze({ manifest: {}, manifestUrl: 'http://localhost/assets/manifest.json' });
  const calls = [], renders = [], contexts = [];
  let changed;
  const state = { open: false, step: 4, done: false };
  const bridge = createTutorialBridge({
    rules, assets, sound: { unlock() { calls.push('unlock'); return Promise.resolve(true); } },
    createTutorial({ onChange }) {
      changed = onChange;
      return {
        getState() { return { ...state }; },
        open({ replay }) { calls.push(['open', replay]); state.open = true; if (replay) state.step = 0; onChange(); },
        close() { state.open = false; onChange(); },
        render(ctx) { contexts.push(ctx); return `lesson ${state.step}`; },
        handleAction(action, target, ctx) { calls.push(['action', action, target]); contexts.push(ctx); state.step++; onChange(); return true; },
        dispose() { calls.push('dispose'); },
      };
    },
    onRender(markup, progress) { renders.push({ markup, step: progress.step }); },
    onClose() { calls.push('closed'); },
  });
  bridge.open();
  assert.deepEqual(renders.at(-1), { markup: 'lesson 4', step: 4 }, 'opening resumes the component-owned saved lesson');
  assert.equal(bridge.action('build', { dataset: {} }), false, 'real match commands cannot enter the practice bridge');
  const target = { dataset: { plot: '2' } };
  assert.equal(bridge.action('tutorial-plot', target), true);
  assert.deepEqual(calls.slice(-2), ['unlock', ['action', 'tutorial-plot', target]], 'gesture unlock happens before lesson action');
  assert.ok(contexts.every(ctx => ctx.rules === rules && ctx.media === assets));
  assert.ok(contexts.every(ctx => !('room' in ctx) && !('dispatch' in ctx) && !('viewer' in ctx)));
  bridge.close(); bridge.close();
  assert.equal(calls.filter(value => value === 'closed').length, 1);
  bridge.open({ replay: true });
  assert.deepEqual(renders.at(-1), { markup: 'lesson 0', step: 0 });
  bridge.dispose(); bridge.dispose();
  const count = calls.length, renderCount = renders.length;
  state.open = true; changed(); bridge.open(); bridge.action('tutorial-next', target);
  assert.equal(calls.length, count);
  assert.equal(renders.length, renderCount);
  assert.equal(calls.filter(value => value === 'dispose').length, 1);
});
