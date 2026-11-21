import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FRUIT_IDS, FRUIT_TYPES, PHASES, RULES, SAFE_INPUT, STAGES } from '../catalog.mjs';
import { LEVELS, getLevel } from '../geometry.mjs';
import { bridgeWeights, forceAt, isPublicView, recipePreview, summarizeResults, validatePublicView } from '../public.mjs';

const inside = (p, rectangle) => p.x >= rectangle.x && p.x <= rectangle.x + rectangle.width && p.y >= rectangle.y && p.y <= rectangle.y + rectangle.height;
const deepFrozen = value => !value || typeof value !== 'object' || (Object.isFrozen(value) && Object.values(value).every(deepFrozen));

test('catalog and authored geometry are deeply immutable and contain all contracted stages', () => {
  assert.deepEqual(Object.keys(LEVELS), STAGES.map(stage => stage.id));
  assert.deepEqual(FRUIT_IDS, ['apple', 'plum', 'pear', 'starfruit']);
  assert.equal(FRUIT_TYPES.apple.owner, 'jon');
  assert.equal(FRUIT_TYPES.plum.owner, 'jon');
  assert.equal(FRUIT_TYPES.pear.owner, 'lydia');
  assert.equal(FRUIT_TYPES.starfruit.owner, 'lydia');
  assert.ok(deepFrozen(LEVELS) && deepFrozen(FRUIT_TYPES) && deepFrozen(RULES) && deepFrozen(STAGES));
  assert.throws(() => { LEVELS['morning-delivery'].baskets[0].x = 0; }, TypeError);
  assert.throws(() => getLevel('constructor'), RangeError);
  assert.throws(() => getLevel('unknown'), RangeError);
  for (const level of Object.values(LEVELS)) {
    assert.equal(getLevel(level.id), level);
    assert.deepEqual(level.bounds, { x: 0, y: 0, width: 1280, height: 720 });
    assert.deepEqual(level.trays.map(tray => tray.id), ['jon', 'lydia']);
    assert.deepEqual(level.baskets.map(basket => basket.id), FRUIT_IDS);
    const ids = level.bumpers.concat(level.compost, level.gates).map(item => item.id);
    assert.equal(ids.length, new Set(ids).size);
    for (const basket of level.baskets) {
      assert.equal(basket.fruitType, basket.id);
      assert.equal(basket.owner, FRUIT_TYPES[basket.id].owner);
      assert.ok(inside(basket, level.trays.find(tray => tray.id === basket.owner).bounds));
      assert.ok(basket.radius > RULES.tuning.radius);
    }
    const walkable = point => level.trays.some(tray => inside(point, tray.bounds)) || inside(point, level.bridge);
    for (const point of Object.values(level.spawnPoints)) {
      for (let direction = 0; direction < 8; direction++) {
        const angle = direction * Math.PI / 4;
        assert.ok(walkable({ x: point.x + Math.cos(angle) * RULES.tuning.radius, y: point.y + Math.sin(angle) * RULES.tuning.radius }));
      }
      for (const bumper of level.bumpers) {
        if (bumper.kind === 'circle') assert.ok(Math.hypot(point.x - bumper.x, point.y - bumper.y) > bumper.radius + RULES.tuning.radius);
        else assert.ok(!inside(point, { x: bumper.x - 14, y: bumper.y - 14, width: bumper.width + 28, height: bumper.height + 28 }));
      }
      assert.ok(level.compost.every(hole => !inside(point, hole)));
    }
    const left = level.trays[0].bounds;
    const right = level.trays[1].bounds;
    assert.ok(level.bridge.x < left.x + left.width);
    assert.ok(level.bridge.x + level.bridge.width > right.x);
    assert.ok(level.bridge.height > RULES.tuning.radius * 6);
  }
});

test('stage features preserve tutorial, safe routing, gate timing and gust forecasts', () => {
  assert.equal(LEVELS['morning-delivery'].compost.length, 0);
  assert.equal(LEVELS['morning-delivery'].gustSchedule.length, 0);
  const switchback = LEVELS['switchback-grove'];
  assert.equal(switchback.gates.length, 1);
  assert.deepEqual(switchback.gates[0].schedule, { periodTicks: 540, openTicks: 360, forecastTicks: 120 });
  assert.equal(switchback.bumpers.filter(bumper => bumper.kind === 'rect').length, 2);
  assert.equal(switchback.compost.length, 2);
  // Longer lower passage remains more than one diameter wide and clear of holes.
  for (const bumper of switchback.bumpers) assert.ok(bumper.y + bumper.height + RULES.tuning.radius * 2 < 500);
  assert.ok(switchback.compost.every(hole => hole.y + hole.height < 250));
  const gusts = LEVELS['moonlight-picnic'].gustSchedule;
  assert.deepEqual(gusts.map(gust => gust.startTick), [1350, 2700, 4050]);
  assert.deepEqual(gusts.map(gust => gust.startTick - gust.forecastTick), [180, 180, 180]);
  assert.ok(gusts.every(gust => gust.durationTicks === 90 && Math.abs(gust.x) + Math.abs(gust.y) === 1));
});

test('frozen rates, bounds and tuning are one public versioned record', () => {
  assert.equal(RULES.tickRate, 60);
  assert.equal(RULES.maxActiveFruit, 8);
  assert.equal(RULES.stageDurationTicks, 5400);
  assert.equal(RULES.countdownTicks, 180);
  assert.equal(RULES.spawnIntervalTicks, 210);
  assert.equal(RULES.rounding, 10000);
  assert.equal(RULES.tuning.speedCap, 220);
  assert.equal(RULES.tuning.substeps, 3);
  assert.equal(RULES.tuning.collisionIterations, 4);
  assert.equal(RULES.tuning.brakeGustScale, 0.15);
  assert.ok(RULES.tuningVersion.length > 0);
});

test('public bridge forces blend continuously in both axes and Brake reduces gust response', () => {
  const level = getLevel('morning-delivery');
  const controls = { jon: { x: 1, y: 0, brake: false }, lydia: { x: 0, y: 1, brake: false } };
  assert.deepEqual(bridgeWeights(level, 40), { jon: 1, lydia: 0 });
  assert.deepEqual(bridgeWeights(level, 1240), { jon: 0, lydia: 1 });
  assert.deepEqual(bridgeWeights(level, 640), { jon: 0.5, lydia: 0.5 });
  const center = forceAt({ x: 640, y: 360 }, { level, controls });
  assert.equal(center.x, RULES.tuning.acceleration / 2);
  assert.equal(center.y, RULES.tuning.acceleration / 2);
  let previous = 0;
  for (let x = level.bridge.x; x <= level.bridge.x + level.bridge.width; x++) {
    const weights = bridgeWeights(level, x);
    assert.equal(weights.jon + weights.lydia, 1);
    assert.ok(weights.lydia >= previous);
    assert.ok(weights.lydia - previous < 0.008);
    previous = weights.lydia;
  }
  for (const x of [level.bridge.x, level.bridge.x + level.bridge.width]) {
    const before = forceAt({ x: x - 0.001 }, { level, controls });
    const after = forceAt({ x: x + 0.001 }, { level, controls });
    assert.ok(Math.abs(after.x - before.x) < 0.0001);
    assert.ok(Math.abs(after.y - before.y) < 0.0001);
  }
  const braked = forceAt({ x: 430 }, { level, controls: { jon: SAFE_INPUT, lydia: SAFE_INPUT }, gust: { x: 1, y: 0 } });
  assert.ok(Math.abs(braked.x - RULES.tuning.gustAcceleration * RULES.tuning.brakeGustScale) < 1e-10);
  assert.equal(braked.damping, RULES.tuning.brakeDamping);
  assert.equal(braked.brakeWeight, 1);
});

test('public browser closure cannot import authority, IO, or private fixtures', async () => {
  const allowed = new Set(['./catalog.mjs', './geometry.mjs', './public.mjs']);
  for (const filename of ['catalog.mjs', 'geometry.mjs', 'public.mjs']) {
    const source = await readFile(new URL(`../${filename}`, import.meta.url), 'utf8');
    const imports = [...source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)].map(match => match[1]);
    for (const dependency of imports) assert.ok(allowed.has(dependency), `${filename} imported ${dependency}`);
    assert.doesNotMatch(source, /\b(?:Math\.random|Date\.now|process\.|window\.|document\.|node:|import\s*\()/);
  }
});

test('all generated projected fixtures validate and are detached from authority', async () => {
  const { PROJECTED_FIXTURES, getProjectedFixture } = await import('../fixtures/projected/index.mjs');
  const values = Object.values(PROJECTED_FIXTURES);
  assert.deepEqual(new Set(values.map(view => view.phase)), new Set(PHASES));
  assert.deepEqual(new Set(values.map(view => view.stageIndex)), new Set([0, 1, 2]));
  for (const [name, view] of Object.entries(PROJECTED_FIXTURES)) {
    assert.deepEqual(validatePublicView(view), { valid: true, errors: [] }, name);
    assert.ok(deepFrozen(view));
    const copy = getProjectedFixture(name);
    assert.deepEqual(copy, view);
    copy.matchId = 'consumer-owned-copy';
    assert.notEqual(copy.matchId, view.matchId);
  }
  const bothTrays = PROJECTED_FIXTURES['playing-both-trays'];
  assert.ok(bothTrays.fruits.some(fruit => fruit.x < 560));
  assert.ok(bothTrays.fruits.some(fruit => fruit.x > 720));
  assert.ok(values.some(view => view.gust?.phase === 'forecast'));
  assert.ok(values.some(view => view.gust?.phase === 'active'));
  assert.ok(values.some(view => view.gateStates.some(gate => gate.state === 'forecast')));
  assert.ok(values.some(view => view.gateStates.some(gate => gate.state === 'closed')));
  assert.throws(() => getProjectedFixture('unknown'), RangeError);
});

test('public validation rejects malformed snapshots, duplicate events and authority dumps without mutation', async () => {
  const { getProjectedFixture } = await import('../fixtures/projected/index.mjs');
  const view = getProjectedFixture('playing-both-trays');
  const before = JSON.stringify(view);
  assert.ok(isPublicView(view));
  assert.equal(JSON.stringify(view), before);
  for (const corrupt of [
    value => { value.tick = Infinity; },
    value => { value.fruits[0].vx = 221; },
    value => { value.fruits.push({ ...value.fruits[0] }); },
    value => { value.baskets.apple.count = 4; },
    value => { value.orders.completedIds.push('forged-reward'); },
    value => { value.players.jon.input = { x: 1, y: 1, brake: false }; },
    value => { value.events.push({ ...value.events[0] }); },
    value => { value.seed = 'future-supply-secret'; },
    value => { value.events[0].data = { token: 'do-not-project' }; },
    value => { value.gust = { id: 'forged', phase: 'forecast', x: 1, y: 1, ticksRemaining: 180 }; },
    value => { value.levelId = 'wrong-stage'; },
  ]) {
    const candidate = structuredClone(view);
    corrupt(candidate);
    assert.equal(isPublicView(candidate), false);
  }
  for (const candidate of [null, 1, [], {}, { players: null }, { gust: 'invalid' }]) assert.equal(isPublicView(candidate), false);
  const cyclic = getProjectedFixture('waiting');
  cyclic.loop = cyclic;
  assert.equal(isPublicView(cyclic), false);
  let getterCalls = 0;
  const accessor = getProjectedFixture('waiting');
  Object.defineProperty(accessor, 'tick', { enumerable: true, get() { getterCalls++; throw new Error('must not execute'); } });
  assert.equal(isPublicView(accessor), false);
  assert.equal(getterCalls, 0);
  const symbol = getProjectedFixture('waiting');
  symbol[Symbol('authority')] = 1;
  assert.equal(isPublicView(symbol), false);
});

test('display helpers preserve recipe order, copy values and reserve Perfect Picnic for campaign completion', async () => {
  const { getProjectedFixture } = await import('../fixtures/projected/index.mjs');
  const view = getProjectedFixture('playing-both-trays');
  const previews = recipePreview(view);
  assert.equal(previews.length, 3);
  previews[0].needs.apple = 99;
  assert.notEqual(view.orders.recipes[0].needs.apple, 99);
  const perfect = { mode: 'campaign', phase: 'finished', results: [0, 1, 2].map(stageIndex => ({ stageIndex, ordersCompleted: 4, stars: 3, composted: 0 })) };
  assert.deepEqual(summarizeResults(perfect), { ordersCompleted: 12, ordersTotal: 12, stars: 9, starsTotal: 9, composted: 0, perfectPicnic: true, practice: false });
  assert.equal(summarizeResults({ ...perfect, mode: 'practice' }).perfectPicnic, false);
  assert.equal(summarizeResults({ ...perfect, phase: 'interlude' }).perfectPicnic, false);
  assert.equal(summarizeResults({ ...perfect, results: perfect.results.slice(1) }).perfectPicnic, false);
});
