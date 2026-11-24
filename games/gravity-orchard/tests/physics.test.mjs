import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, deepFreeze } from '../catalog.mjs';
import { getLevel, LEVELS } from '../geometry.mjs';
import { advanceFruit, bounceVelocity, forceAt, isPlacementClear, overlapCircleCircle, overlapCircleRect, terrainColliders } from '../physics.mjs';

const neutral = { x: 0, y: 0, brake: false };
const brake = { x: 0, y: 0, brake: true };
const both = (input) => ({ jon: { ...input }, lydia: { ...input } });
const makeFruit = (fields = {}) => ({ id: 'physics-fruit-1', type: 'apple', x: 320, y: 360,
  vx: 0, vy: 0, radius: RULES.tuning.radius, ...fields });

function emptyLevel(fields = {}) {
  return { id: 'private-physics-fixture', bounds: { x: 0, y: 0, width: 1280, height: 720 },
    trays: [
      { id: 'jon', bounds: { x: 0, y: 0, width: 640, height: 720 } },
      { id: 'lydia', bounds: { x: 640, y: 0, width: 640, height: 720 } },
    ], bridge: { x: 600, y: 300, width: 80, height: 120 },
    bumpers: [], baskets: [], compost: [], gates: [], gustSchedule: [], ...fields };
}

function checkBound(result) {
  assert.ok(result.work.substeps <= RULES.tuning.substeps);
  assert.ok(result.work.iterations <= RULES.tuning.substeps * RULES.tuning.collisionIterations);
  assert.ok(result.work.checks <= result.work.maxChecks,
    `contact checks ${result.work.checks} exceed declared ${result.work.maxChecks}`);
  assert.ok(result.hits.length <= result.work.colliderCount);
  for (const field of ['x', 'y', 'vx', 'vy', 'radius']) assert.ok(Number.isFinite(result.fruit[field]), field);
  assert.ok(Math.hypot(result.fruit.vx, result.fruit.vy) <= RULES.tuning.speedCap);
}

function simulate(fruit, ticks, options) {
  const history = [];
  for (let tick = 0; tick < ticks; tick += 1) {
    const result = advanceFruit(fruit, options);
    checkBound(result);
    history.push(result);
    fruit = result.fruit;
  }
  return { fruit, history };
}

test('each tray applies only its own input, with a continuous smooth bridge blend', () => {
  const level = getLevel('morning-delivery');
  const controls = { jon: { x: 1, y: 0, brake: false }, lydia: { x: -1, y: 0, brake: false } };
  assert.equal(forceAt({ x: level.bridge.x - 20, y: 360 }, { level, controls }).x, 520);
  assert.equal(forceAt({ x: level.bridge.x + level.bridge.width + 20, y: 360 }, { level, controls }).x, -520);
  const middle = forceAt({ x: level.bridge.x + level.bridge.width / 2, y: 360 }, { level, controls });
  assert.deepEqual(middle.weights, { jon: 0.5, lydia: 0.5 });
  assert.equal(middle.x, 0);
  let prior = 520;
  for (let i = 0; i <= 100; i += 1) {
    const force = forceAt({ x: level.bridge.x + level.bridge.width * i / 100, y: 360 }, { level, controls });
    assert.ok(force.x <= prior + 1e-10);
    assert.ok(Math.abs(prior - force.x) < 16);
    prior = force.x;
  }
  const boundary = level.bridge.x;
  assert.ok(Math.abs(forceAt({ x: boundary - 0.0001, y: 360 }, { level, controls }).x -
    forceAt({ x: boundary + 0.0001, y: 360 }, { level, controls }).x) < 0.000001);
});

test('held Brake suppresses ordinary input, blends damping, and meaningfully reduces gust drift', () => {
  const level = emptyLevel();
  const controls = { jon: { x: 1, y: 1, brake: true }, lydia: { x: 1, y: 0, brake: false } };
  const stopped = forceAt({ x: 320, y: 360 }, { level, controls });
  assert.equal(stopped.x, 0); assert.equal(stopped.y, 0); assert.equal(stopped.damping, 12);
  const middle = forceAt({ x: 640, y: 360 }, { level, controls });
  assert.equal(middle.x, 260); assert.equal(middle.brakeWeight, 0.5);
  assert.ok(Math.abs(middle.damping - (1.35 + 12) / 2) < 1e-12);
  const held = simulate(makeFruit({ vx: 200 }), 60, { level, controls: both(brake) });
  const loose = simulate(makeFruit({ vx: 200 }), 60, { level, controls: both(neutral) });
  assert.ok(held.fruit.x - 320 < 18); assert.ok(held.fruit.vx < 0.01);
  assert.ok(loose.fruit.x - 320 > 100);
  const gustHeld = simulate(makeFruit(), 90, { level, controls: both(brake), gust: { x: 1, y: 0 } });
  const gustLoose = simulate(makeFruit(), 90, { level, controls: both(neutral), gust: { x: 1, y: 0 } });
  assert.ok(gustHeld.fruit.x - 320 < 5);
  assert.ok(gustLoose.fruit.x - 320 > 100);
  assert.ok(gustHeld.fruit.x > 320, 'Brake reduces gust; it is not positional immunity');
});

test('the tray/bridge union has no artificial seams and permits both crossing directions', () => {
  const level = getLevel('morning-delivery');
  for (const direction of [-1, 1]) {
    const start = direction > 0 ? 520 : 760;
    const run = simulate(makeFruit({ x: start, vx: 220 * direction }), 80,
      { level, controls: both({ x: direction, y: 0, brake: false }) });
    assert.ok(direction > 0 ? run.fruit.x > 800 : run.fruit.x < 480);
    assert.ok(run.history.every(r => !r.fallback));
    assert.ok(run.history.every(r => !r.hits.some(hit => hit.colliderId.startsWith('boundary:'))));
  }
  assert.equal(terrainColliders(emptyLevel()).length, 4, 'one rectangular union has four exterior edges');
});

test('maximum speed, quantization and immutability survive sustained diagonal input', () => {
  const level = deepFreeze(emptyLevel());
  const controls = deepFreeze(both({ x: 0.7071, y: 0.7071, brake: false }));
  const fruit = deepFreeze(makeFruit({ vx: 1000, vy: 1000 }));
  const before = JSON.stringify({ level, controls, fruit });
  const a = simulate(fruit, 600, { level, controls });
  const b = simulate(fruit, 600, { level, controls });
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify({ level, controls, fruit }), before);
  for (const result of a.history) {
    for (const key of ['x', 'y', 'vx', 'vy']) {
      const integerUnits = result.fruit[key] * RULES.rounding;
      assert.ok(Math.abs(integerUnits - Math.round(integerUnits)) < 1e-7, key);
    }
    assert.equal(result.fruit.id, fruit.id);
    assert.equal(result.fruit.type, fruit.type);
  }
});

test('220-unit/s fruit cannot tunnel through a 0.001-unit thin rectangle', () => {
  for (const orientation of ['vertical', 'horizontal']) {
    const wall = orientation === 'vertical'
      ? { id: 'thin-wall', kind: 'rect', x: 500, y: 100, width: 0.001, height: 520 }
      : { id: 'thin-wall', kind: 'rect', x: 100, y: 400, width: 1080, height: 0.001 };
    const initial = orientation === 'vertical'
      ? makeFruit({ x: 480, y: 360, vx: 220 }) : makeFruit({ x: 500, y: 380, vy: 220 });
    const input = orientation === 'vertical' ? { x: 1, y: 0, brake: false } : { x: 0, y: 1, brake: false };
    const run = simulate(initial, 180, { level: emptyLevel({ bumpers: [wall] }), controls: both(input) });
    assert.ok(run.history.some(r => r.hits.some(h => h.colliderId === 'thin-wall')));
    for (const result of run.history) {
      assert.ok(orientation === 'vertical' ? result.fruit.x <= 486 : result.fruit.y <= 386);
      assert.equal(result.fallback, false);
    }
  }
});

test('outer corners and repeated contacts are finite, bounded and contained', () => {
  const level = emptyLevel();
  const controls = both({ x: -0.7071, y: -0.7071, brake: false });
  const run = simulate(makeFruit({ x: 15, y: 15, vx: -200, vy: -200 }), 1200, { level, controls });
  for (const result of run.history) {
    assert.ok(result.fruit.x >= 14 && result.fruit.y >= 14);
    assert.equal(result.fallback, false);
  }
  assert.ok(run.history.some(r => r.hits.length >= 2));
});

test('bridge concave corners keep the fruit on the floor without artificial ejection', () => {
  const level = getLevel('switchback-grove');
  const bridgeTop = level.bridge.y;
  // Roll diagonally into the inside corner from the bridge. Independent circle
  // perimeter samples verify containment in the union rather than its helpers.
  const run = simulate(makeFruit({ x: 590, y: bridgeTop + 15, vx: -150, vy: -50 }), 80,
    { level, controls: both({ x: -0.7071, y: -0.7071, brake: false }) });
  const floor = [...level.trays.map(t => t.bounds), level.bridge];
  for (const result of run.history) {
    assert.equal(result.fallback, false);
    for (let i = 0; i < 64; i += 1) {
      const angle = i * 2 * Math.PI / 64;
      const x = result.fruit.x + Math.cos(angle) * result.fruit.radius;
      const y = result.fruit.y + Math.sin(angle) * result.fruit.radius;
      assert.ok(floor.some(r => x >= r.x - 0.0001 && x <= r.x + r.width + 0.0001 &&
        y >= r.y - 0.0001 && y <= r.y + r.height + 0.0001), 'fruit perimeter escaped floor union');
    }
  }
});

test('circle and rectangle starting overlaps resolve in a deterministic fixed direction', () => {
  for (const bumper of [
    { id: 'overlap', kind: 'circle', x: 640, y: 360, radius: 26 },
    { id: 'overlap', kind: 'rect', x: 620, y: 340, width: 40, height: 40 },
  ]) {
    const level = emptyLevel({ bumpers: [bumper] });
    const initial = makeFruit({ x: 640, y: 360 });
    const a = advanceFruit(initial, { level, controls: both(brake) });
    const b = advanceFruit(initial, { level, controls: both(brake) });
    assert.deepEqual(a, b); checkBound(a); assert.equal(a.fallback, false);
    assert.ok(a.hits.some(h => h.colliderId === bumper.id));
    assert.equal(bumper.kind === 'circle' ? overlapCircleCircle(a.fruit, bumper) : overlapCircleRect(a.fruit, bumper), false);
    assert.ok(bumper.kind === 'circle' ? a.fruit.x > 680 : a.fruit.x < 606);
  }
});

test('closed gates collide, open gates do not, and tangent fruit blocks closure', () => {
  const level = getLevel('switchback-grove');
  const gate = level.gates[0];
  const controls = both({ x: 1, y: 0, brake: false });
  const fruit = makeFruit({ x: gate.x - 30, y: 360, vx: 220 });
  const closed = simulate(fruit, 60, { level, controls, closedGateIds: [gate.id] });
  assert.ok(closed.history.every(r => r.fruit.x <= gate.x - fruit.radius));
  assert.ok(closed.history.some(r => r.hits.some(h => h.colliderId === gate.id)));
  const open = simulate(fruit, 60, { level, controls });
  assert.ok(open.fruit.x > gate.x + gate.width);
  assert.equal(overlapCircleRect(makeFruit({ x: gate.x - 14, y: 360 }), gate), true);
  assert.equal(overlapCircleRect(makeFruit({ x: gate.x - 14.0001, y: 360 }), gate), false);
  assert.equal(overlapCircleRect(makeFruit({ x: gate.x - 10, y: gate.y - 10 }), gate), false,
    'circle/AABB closure test uses rounded corners, not an expanded square');
});

test('collision ordering ignores source array order, including tied corner contacts', () => {
  const bumpers = [
    { id: 'z-vertical', kind: 'rect', x: 500, y: 200, width: 10, height: 300 },
    { id: 'a-horizontal', kind: 'rect', x: 300, y: 400, width: 210, height: 10 },
  ];
  const first = emptyLevel({ bumpers });
  const second = emptyLevel({ bumpers: [...bumpers].reverse() });
  const controls = both({ x: 0.7071, y: 0.7071, brake: false });
  const initial = makeFruit({ x: 470, y: 370, vx: 150, vy: 150 });
  assert.deepEqual(simulate(initial, 300, { level: first, controls }),
    simulate(initial, 300, { level: second, controls }));
});

test('impossible overlapping private fixture stops after bounded work', () => {
  const level = emptyLevel({ bumpers: [
    { id: 'impossible-a', kind: 'rect', x: -100, y: -100, width: 1480, height: 920 },
    { id: 'impossible-b', kind: 'rect', x: -110, y: -110, width: 1500, height: 940 },
  ] });
  const fruit = makeFruit();
  const result = advanceFruit(fruit, { level, controls: both({ x: 1, y: 0, brake: false }) });
  checkBound(result);
  assert.equal(result.fallback, true);
  assert.equal(result.fruit.vx, 0); assert.equal(result.fruit.vy, 0);
  assert.ok(result.fruit.x >= 14 && result.fruit.x <= 1266);
  assert.ok(result.fruit.y >= 14 && result.fruit.y <= 706);
  assert.deepEqual({ x: result.fruit.x, y: result.fruit.y }, { x: fruit.x, y: fruit.y });
  assert.deepEqual(result, advanceFruit(fruit, { level, controls: both({ x: 1, y: 0, brake: false }) }));
});

test('checkpoint placement helper rejects off-floor and solid overlaps without mutation', () => {
  const level = getLevel('morning-delivery');
  const options = { level };
  assert.equal(isPlacementClear(makeFruit({ x: 430, y: 360 }), options), true);
  assert.equal(isPlacementClear(makeFruit({ x: 640, y: 110 }), options), false);
  assert.equal(isPlacementClear(makeFruit({ x: 300, y: 360 }), options), false);
  assert.equal(isPlacementClear(makeFruit({ x: 51, y: 360 }), options), false);
  assert.equal(isPlacementClear(makeFruit({ x: 54, y: 360 }), options), true);
  const invalid = deepFreeze(makeFruit({ x: 640, y: 110 }));
  const result = advanceFruit(invalid, { level, controls: both(brake) });
  checkBound(result);
  assert.equal(result.fallback, true);
  assert.equal(isPlacementClear(result.fruit, options), true);
});

test('eight fruits on all authored levels stay finite under a reproducible bounded input sweep', () => {
  const directions = [neutral, brake,
    { x: 1, y: 0, brake: false }, { x: -1, y: 0, brake: false },
    { x: 0, y: 1, brake: false }, { x: 0, y: -1, brake: false },
    { x: 0.7071, y: 0.7071, brake: false }, { x: -0.7071, y: -0.7071, brake: false }];
  for (const level of Object.values(LEVELS)) {
    let seed = 0x5eedf00d;
    const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
    let fruits = Array.from({ length: 8 }, (_, i) => makeFruit({
      id: `sweep-${i}`, x: i % 2 ? 850 : 430, y: 310 + Math.floor(i / 2) * 30,
    }));
    let controls;
    // One 540-tick gate period exercises open and closed gates and both gust states.
    const ticks = process.env.SOFA_EXHAUSTIVE === '1' ? 1800 : 540;
    for (let tick = 0; tick < ticks; tick += 1) {
      if (tick % 75 === 0) controls = { jon: directions[random() % directions.length], lydia: directions[random() % directions.length] };
      const gateClosed = tick % 540 >= 360 ? level.gates.filter(g => !fruits.some(f => overlapCircleRect(f, g))).map(g => g.id) : [];
      fruits = fruits.map(fruit => {
        const result = advanceFruit(fruit, { level, controls, closedGateIds: gateClosed,
          gust: tick % 300 > 210 ? { x: 0, y: -1 } : null });
        checkBound(result);
        assert.equal(result.fallback, false);
        assert.ok(result.fruit.x >= 0 && result.fruit.x <= 1280);
        assert.ok(result.fruit.y >= 0 && result.fruit.y <= 720);
        return result.fruit;
      });
    }
    assert.equal(new Set(fruits.map(f => f.id)).size, 8);
  }
});

test('basket bounce removes only the inward velocity and never changes identity or position', () => {
  const fruit = deepFreeze(makeFruit({ x: 100, y: 200, vx: -100, vy: 20 }));
  const bounced = bounceVelocity(fruit, 1, 0);
  assert.equal(bounced.vx, 35); assert.equal(bounced.vy, 20);
  assert.equal(bounced.x, fruit.x); assert.equal(bounced.y, fruit.y);
  assert.equal(bounced.id, fruit.id);
  assert.deepEqual(bounceVelocity(bounced, 1, 0), bounced, 'moving away does not bounce twice');
});

test('nonfinite or nonphysical authority fruit cannot enter physics', () => {
  const options = { level: emptyLevel(), controls: both(brake) };
  for (const fields of [{ x: NaN }, { y: Infinity }, { vx: -Infinity }, { radius: 0 }, { radius: -1 }]) {
    assert.throws(() => advanceFruit(makeFruit(fields), options), TypeError);
  }
});
