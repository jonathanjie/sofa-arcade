import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { makeFixture, makeJourney, SCENES, LEVELS, FRUIT_TYPES, RECIPES, CONNECTED } from '../fixtures/scenarios.mjs';
import { readPublicView, summarizeResults } from '../public-view.mjs';
import { createFixtureServer } from '../fixtures/server.mjs';

test('all diagnostic snapshots satisfy the exact frozen public schema', () => {
  const expectedKeys = ['gameId', 'schemaVersion', 'matchId', 'runEpoch', 'tick', 'phase', 'mode', 'stageIndex', 'levelId', 'timeRemainingTicks', 'countdownTicks', 'ready', 'pauseReason', 'fruits', 'baskets', 'orders', 'gateStates', 'gust', 'players', 'results', 'events'].sort();
  for (const scene of SCENES) {
    const view = makeFixture(scene);
    assert.deepEqual(Object.keys(view).sort(), expectedKeys, scene);
    assert.deepEqual(readPublicView(view), view, `${scene} rejected by the runtime projection reader`);
    assert.ok(view.fruits.length <= 8);
    assert.deepEqual(view, JSON.parse(JSON.stringify(view)));
    assert.ok(!Object.hasOwn(view, 'presence'));
  }
});

test('diagnostic geometry retains exact ownership, world bounds and public shape', () => {
  for (const level of Object.values(LEVELS)) {
    assert.deepEqual(level.bounds, { x: 0, y: 0, width: 1280, height: 720 });
    assert.deepEqual(level.trays.map(tray => tray.id), ['jon', 'lydia']);
    assert.deepEqual(level.baskets.map(basket => basket.fruitType), FRUIT_TYPES);
    assert.deepEqual(level.baskets.map(basket => basket.owner), ['jon', 'jon', 'lydia', 'lydia']);
    for (const item of [...level.baskets, ...level.bumpers, ...level.compost, ...level.gates]) {
      assert.ok(item.x >= 0 && item.x <= 1280);
      assert.ok(item.y >= 0 && item.y <= 720);
    }
    assert.ok(Object.isFrozen(level));
  }
  assert.equal(LEVELS['morning-delivery'].compost.length, 0);
  assert.equal(LEVELS['morning-delivery'].gustSchedule.length, 0);
  assert.equal(LEVELS['moonlight-picnic'].gustSchedule.length, 3);
});

test('recipes demand three of each type and every recipe crosses tray ownership', () => {
  for (const type of FRUIT_TYPES) assert.equal(RECIPES.reduce((sum, r) => sum + r.needs[type], 0), 3);
  for (const recipe of RECIPES) {
    assert.equal(Object.values(recipe.needs).reduce((sum, n) => sum + n, 0), 3);
    assert.ok(recipe.needs.apple + recipe.needs.plum > 0);
    assert.ok(recipe.needs.pear + recipe.needs.starfruit > 0);
  }
});

test('full three-stage transcripts preserve identity, monotonic time and ordinary/perfect results', () => {
  for (const perfect of [true, false]) {
    const frames = makeJourney({ perfect });
    let tick = -1, epoch = -1;
    for (const { name, view } of frames) {
      assert.ok(readPublicView(view), name);
      assert.equal(view.matchId, 'diagnostic-three-stage');
      assert.ok(view.tick >= tick, name); assert.ok(view.runEpoch >= epoch, name);
      tick = view.tick; epoch = view.runEpoch;
    }
    const end = frames.at(-1).view;
    assert.equal(end.phase, 'finished'); assert.equal(end.results.length, 3);
    assert.equal(summarizeResults(end).perfect, perfect);
    assert.equal(summarizeResults(end).orders, perfect ? 12 : 9);
    assert.ok(frames.some(frame => frame.view.gust?.phase === 'forecast'));
    assert.ok(frames.some(frame => frame.view.gateStates.some(gate => gate.closureDeferred)));
  }
});

test('fixtures are independently mutable while geometry and coordinator presence are immutable', () => {
  const view = makeFixture('playing'); view.fruits[0].x = -99; view.baskets.apple.count = 3;
  assert.notEqual(makeFixture('playing').fruits[0].x, -99);
  assert.equal(makeFixture('playing').baskets.apple.count, 1);
  assert.ok(Object.isFrozen(CONNECTED.presence.jon));
});

test('fixture server exposes no engine, transport, parent files or mutations', async () => {
  const server = createFixtureServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${origin}/tv/fixtures/scenarios.mjs`);
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /javascript/);
    for (const path of ['/games/gravity-orchard/engine.mjs', '/server/rooms.mjs', '/tv/../../AGENTS.md', '/tv/node_modules/playwright/package.json', '/.git/config', '/%00']) {
      assert.equal((await fetch(`${origin}${path}`)).status, 404, path);
    }
    assert.equal((await fetch(`${origin}/tv/fixtures/scenarios.mjs`, { method: 'POST' })).status, 405);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
