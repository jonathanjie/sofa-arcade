import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresentationTimeline } from '../timeline.mjs';
import { readPublicView, summarizeResults, clockLabel } from '../public-view.mjs';
import { createEventCursor, effectName, sceneName } from '../effects.mjs';
import { makeFixture } from '../fixtures/scenarios.mjs';

function setup() {
  let now = 1000;
  const timeline = createPresentationTimeline({ now: () => now });
  return { timeline, advance: ms => now += ms, view: makeFixture('playing', { matchId: 'test-match' }) };
}

test('interpolation is bounded between received positions; newest recipes and time remain authoritative', () => {
  const { timeline, advance, view } = setup(); view.tick = 100; view.fruits[0].x = 100;
  assert.equal(timeline.push(view).accepted, true);
  advance(50); const next = structuredClone(view); next.tick = 103; next.fruits[0].x = 110; next.timeRemainingTicks = 4857; next.baskets.apple.count = 2;
  timeline.push(next);
  assert.equal(timeline.sample().fruits[0].x, 100);
  advance(50);
  const sample = timeline.sample();
  assert.equal(sample.fruits[0].x, 105); assert.equal(sample.interpolating, true);
  assert.equal(sample.view.timeRemainingTicks, 4857); assert.equal(sample.view.baskets.apple.count, 2);
  advance(10000);
  assert.equal(timeline.sample().fruits[0].x, 110); assert.equal(timeline.sample().stale, true);
  assert.equal(timeline.sample().view.timeRemainingTicks, 4857);
});

test('capture removal and new spawn membership are never predicted or delayed for interpolation', () => {
  const { timeline, advance, view } = setup(); timeline.push(view); advance(50);
  const next = structuredClone(view); next.tick += 3; next.fruits.shift();
  next.fruits.push({ id: 'new-apple', type: 'apple', x: 330, y: 200, vx: 0, vy: 0, radius: 18 });
  timeline.push(next);
  assert.equal(timeline.sample().fruits.some(fruit => fruit.id === view.fruits[0].id), false);
  assert.equal(timeline.sample().fruits.find(fruit => fruit.id === 'new-apple').x, 330);
});

test('pause, epochs and reconnect freezing snap instead of sweeping fruit across boundaries', () => {
  const { timeline, advance, view } = setup(); timeline.push(view); advance(50);
  const paused = structuredClone(view); paused.phase = 'paused'; paused.pauseReason = 'help'; paused.runEpoch++; paused.fruits[0].x = 600;
  assert.equal(timeline.push(paused).reset, true);
  assert.equal(timeline.sample().fruits[0].x, 600);
  timeline.freeze(); advance(1000);
  assert.equal(timeline.sample().stale, true); assert.equal(timeline.sample().fruits[0].x, 600);
  const resumed = structuredClone(paused); resumed.phase = 'countdown'; resumed.runEpoch++; resumed.countdownTicks = 180; resumed.pauseReason = null;
  assert.equal(timeline.push(resumed).reset, true); assert.equal(timeline.sample().stale, false);
  assert.equal(timeline.sample().interpolating, false);
});

test('old tick/epoch/match snapshots cannot roll back a later view', () => {
  const { timeline, view } = setup(); timeline.push(view);
  const oldTick = structuredClone(view); oldTick.tick--; assert.equal(timeline.push(oldTick).accepted, false);
  const oldEpoch = structuredClone(view); oldEpoch.runEpoch--; oldEpoch.tick++; assert.equal(timeline.push(oldEpoch).accepted, false);
  const later = makeFixture('waiting', { matchId: 'rematch' }); assert.equal(timeline.push(later).accepted, true);
  assert.equal(timeline.push(view).accepted, false); assert.equal(timeline.sample().view.matchId, 'rematch');
});

test('a newer recovery epoch can restore an earlier checkpoint tick and fences all prior-epoch frames', () => {
  const { timeline, view } = setup();
  view.tick = 720; view.runEpoch = 1; timeline.push(view);
  const restored = structuredClone(view);
  Object.assign(restored, { phase: 'paused', pauseReason: 'recovery', runEpoch: 2, tick: 660 });
  restored.fruits[0].x = 180;
  const recovery = timeline.push(restored);
  assert.equal(recovery.accepted, true); assert.equal(recovery.reset, true);
  assert.equal(timeline.sample().view.tick, 660); assert.equal(timeline.sample().fruits[0].x, 180);
  const delayed = structuredClone(view); delayed.tick = 723;
  assert.equal(timeline.push(delayed).accepted, false);
  assert.equal(timeline.sample().view.runEpoch, 2); assert.equal(timeline.sample().view.tick, 660);
});

test('empty recipe arrays are invalid rather than presenting a falsely completed picnic', () => {
  const view = makeFixture('playing');
  view.orders = { recipes: [], activeIndex: 0, completedIds: [] };
  assert.equal(readPublicView(view), null);
});

test('missing, malformed, oversized and nonfinite snapshots leave the last valid state intact', () => {
  const { timeline, view } = setup(); assert.equal(timeline.sample().view, null); timeline.push(view);
  const variants = [null, undefined, {}, { ...view, gameId: 'other' }, { ...view, schemaVersion: 2 }, { ...view, phase: 'bogus' }];
  const nan = structuredClone(view); nan.fruits[0].x = NaN; variants.push(nan);
  const tooMany = structuredClone(view); tooMany.fruits = Array.from({ length: 9 }, (_, i) => ({ ...view.fruits[0], id: String(i) })); variants.push(tooMany);
  const wrongLevel = structuredClone(view); wrongLevel.levelId = 'moonlight-picnic'; variants.push(wrongLevel);
  const bogusCount = structuredClone(view); bogusCount.baskets.apple.count = 4; variants.push(bogusCount);
  for (const variant of variants) assert.equal(timeline.push(variant).accepted, false);
  assert.equal(timeline.sample().view.matchId, view.matchId);
});

test('input snapshots are cloned and detached late callbacks cannot resurrect a disposed timeline', () => {
  const { timeline, view } = setup(); timeline.push(view); const expected = timeline.sample().fruits[0].x;
  view.fruits[0].x = 888; assert.equal(timeline.sample().fruits[0].x, expected);
  timeline.dispose(); assert.equal(timeline.push(view).accepted, false); assert.equal(timeline.sample().view, null);
  timeline.clear(); assert.equal(timeline.push(view).accepted, false);
});

test('same-tick readiness updates are accepted without fabricating movement or a countdown', () => {
  const timeline = createPresentationTimeline({ now: () => 0 }); const view = makeFixture('waiting');
  timeline.push(view); view.ready.lydia = true; timeline.push(view);
  assert.equal(timeline.sample().view.ready.lydia, true); assert.equal(timeline.sample().view.phase, 'waiting');
});

test('repeated history does not replay effects, while new identities and a new match are handled independently', () => {
  const cursor = createEventCursor(); const view = makeFixture('playing');
  view.events = [{ id: 'catch-old', kind: 'catch', tick: view.tick }];
  assert.deepEqual(cursor.consume(view), []);
  view.tick++; view.events.push({ id: 'catch-new', kind: 'catch', tick: view.tick });
  assert.deepEqual(cursor.consume(view).map(event => event.id), ['catch-new']);
  assert.deepEqual(cursor.consume(view), []);
  view.runEpoch++; assert.deepEqual(cursor.consume(view), []);
  view.matchId = 'second-match'; assert.deepEqual(cursor.consume(view), []);
  view.tick++; view.events.push({ id: 'second-order', kind: 'order-complete', tick: view.tick });
  assert.deepEqual(cursor.consume(view).map(event => event.id), ['second-order']);
});

test('silent reconnect history is consumed, and bounded event eviction does not revive old celebrations', () => {
  const cursor = createEventCursor({ limit: 64 }); const view = makeFixture('playing'); cursor.consume(view);
  for (let i = 0; i < 100; i++) { view.tick++; view.events = [{ id: `order-${i}`, kind: 'order-complete', tick: view.tick }]; cursor.consume(view, { silent: i < 50 }); }
  view.events = [{ id: 'order-0', kind: 'order-complete', tick: view.tick - 99 }];
  assert.deepEqual(cursor.consume(view), []);
});

test('public reader strips extra authority fields without mutating source; result/clock labels are exact', () => {
  const view = makeFixture('perfect'); view.privateQueue = ['not-public']; view.players.jon.token = 'not-public';
  const clean = readPublicView(view);
  assert.equal(clean.privateQueue, undefined); assert.equal(clean.players.jon.token, undefined); assert.equal(view.privateQueue.length, 1);
  assert.deepEqual(summarizeResults(clean), { orders: 12, stars: 9, composted: 0, perfect: true });
  assert.equal(clockLabel(makeFixture('practice')), 'Untimed'); assert.equal(clockLabel(makeFixture('waiting')), '1:30');
  assert.equal(summarizeResults(makeFixture('finished')).perfect, false);
  assert.equal(sceneName(makeFixture('gust-active')), 'stage3'); assert.equal(effectName({ kind: 'order-complete' }), 'order'); assert.equal(effectName({ kind: 'unknown' }), null);
});
