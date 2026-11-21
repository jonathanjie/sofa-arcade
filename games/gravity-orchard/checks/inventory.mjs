/**
 * Exhaustive inventory arithmetic, deliberately separate from route/playability
 * proof. No engine state, position edits, collisions or delivery shortcuts here.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RULES } from '../catalog.mjs';
import { TYPES, RECIPE_DEFINITIONS, authorStage, makeBag } from '../supply.mjs';

const EXPECTED_TYPES = ['apple', 'plum', 'pear', 'starfruit'];
const OWNER = { apple: 'jon', plum: 'jon', pear: 'lydia', starfruit: 'lydia' };
const zeros = () => ({ apple: 0, plum: 0, pear: 0, starfruit: 0 });
const counts = values => values.reduce((result, type) => { result[type]++; return result; }, zeros());
const sumNeeds = recipes => recipes.reduce((result, recipe) => {
  for (const type of EXPECTED_TYPES) result[type] += recipe.needs[type];
  return result;
}, zeros());
function permutations(values) {
  if (!values.length) return [[]];
  return values.flatMap((value, index) => permutations(values.filter((_, other) => other !== index)).map(tail => [value, ...tail]));
}
function checkBag(entries) {
  assert.equal(entries.length, 4);
  assert.deepEqual(counts(entries.map(entry => entry.type)), { apple: 1, plum: 1, pear: 1, starfruit: 1 });
  assert.equal(entries.filter(entry => entry.spawnOwner === 'jon').length, 2);
  assert.equal(entries.filter(entry => entry.spawnOwner === 'lydia').length, 2);
  assert.equal(entries.filter(entry => OWNER[entry.type] === entry.spawnOwner).length, 2);
  assert.equal(entries.filter(entry => OWNER[entry.type] === 'jon' && entry.spawnOwner === 'lydia').length, 1);
  assert.equal(entries.filter(entry => OWNER[entry.type] === 'lydia' && entry.spawnOwner === 'jon').length, 1);
}
function contentWithoutIdentity(authored) {
  return {
    entries: authored.entries.map(({ id, ...entry }) => entry),
    recipes: authored.recipes.map(({ id, ...recipe }) => recipe),
    gustRotation: authored.gustRotation,
  };
}

export function proveInventory({ seeds = 128 } = {}) {
  if (!Number.isInteger(seeds) || seeds < 1 || seeds > 512) throw new RangeError('Choose 1–512 bounded inventory seeds.');
  assert.deepEqual(TYPES, EXPECTED_TYPES);
  assert.deepEqual(sumNeeds(RECIPE_DEFINITIONS), { apple: 3, plum: 3, pear: 3, starfruit: 3 });
  for (const recipe of RECIPE_DEFINITIONS) assert.equal(Object.values(recipe.needs).reduce((sum, count) => sum + count, 0), 3);
  const orders = permutations(EXPECTED_TYPES);
  assert.equal(orders.length, 24);
  const layouts = new Set();
  const crossingAssignments = new Set();
  for (const crossJon of ['apple', 'plum']) {
    for (const crossLydia of ['pear', 'starfruit']) {
      crossingAssignments.add(`${crossJon}/${crossLydia}`);
      for (const order of orders) {
        const bag = makeBag(crossJon, crossLydia, order);
        assert.deepEqual(bag.map(entry => entry.type), order);
        checkBag(bag);
        layouts.add(JSON.stringify(bag));
      }
    }
  }
  assert.equal(crossingAssignments.size, 4);
  assert.equal(layouts.size, 96);

  // Independent integer buffer reducer: every incoming fruit immediately reaches
  // its matching basket, then the active recipe (and any ready chain) resolves.
  const indexOrders = permutations([0, 1, 2, 3]);
  const recipeOrders = permutations(RECIPE_DEFINITIONS).map(recipes => recipes.map(recipe => EXPECTED_TYPES.map(type => recipe.needs[type])));
  let combinations = 0;
  const peaks = [0, 0, 0, 0];
  let peakTotal = 0;
  for (const recipes of recipeOrders) {
    for (const first of indexOrders) for (const second of indexOrders) for (const third of indexOrders) {
      const buffers = [0, 0, 0, 0];
      let activeIndex = 0;
      let consumed = 0;
      let rewarded = 0;
      for (const bag of [first, second, third]) for (const typeIndex of bag) {
        buffers[typeIndex]++;
        if (buffers[typeIndex] > RULES.basketCapacity) throw new Error('Immediate delivery exceeded a basket capacity.');
        peaks[typeIndex] = Math.max(peaks[typeIndex], buffers[typeIndex]);
        peakTotal = Math.max(peakTotal, buffers[0] + buffers[1] + buffers[2] + buffers[3]);
        while (activeIndex < recipes.length) {
          const recipe = recipes[activeIndex];
          if (recipe.some((need, index) => buffers[index] < need)) break;
          if (rewarded & (1 << activeIndex)) throw new Error('An arithmetic recipe was rewarded twice.');
          rewarded |= 1 << activeIndex;
          for (let index = 0; index < 4; index++) { buffers[index] -= recipe[index]; consumed += recipe[index]; }
          activeIndex++;
        }
      }
      if (activeIndex !== 4 || consumed !== 12 || rewarded !== 15 || buffers.some(value => value !== 0)) {
        throw new Error(`Inventory failed recipe/bag combination ${combinations}.`);
      }
      combinations++;
    }
  }
  assert.equal(combinations, 331776);

  const observedLayouts = new Set();
  const observedRecipes = [new Set(), new Set(), new Set()];
  const gustRotations = new Set();
  const supplyCounts = { apple: 6, plum: 6, pear: 6, starfruit: 6 };
  for (let sample = 0; sample < seeds; sample++) {
    const seed = `inventory-sweep-${sample}`;
    for (let stageIndex = 0; stageIndex < 3; stageIndex++) {
      const args = { seed, matchId: `inventory-${sample}`, stageIndex, attempt: 0 };
      const authored = authorStage(args);
      assert.deepEqual(authorStage(args), authored);
      assert.equal(authored.entries.length, 24);
      assert.equal(new Set(authored.entries.map(entry => entry.id)).size, 24);
      assert.deepEqual(counts(authored.entries.map(entry => entry.type)), supplyCounts);
      assert.deepEqual(sumNeeds(authored.recipes), { apple: 3, plum: 3, pear: 3, starfruit: 3 });
      for (let bagIndex = 0; bagIndex < 6; bagIndex++) {
        const bag = authored.entries.slice(bagIndex * 4, bagIndex * 4 + 4);
        checkBag(bag);
        assert.ok(bag.every((entry, slot) => entry.bag === bagIndex && entry.slot === slot));
        observedLayouts.add(JSON.stringify(bag.map(({ type, spawnOwner }) => ({ type, spawnOwner }))));
      }
      const order = authored.recipes.map(recipe => recipe.recipeType);
      assert.equal(new Set(order).size, 4);
      if (stageIndex === 0) assert.deepEqual(order, RECIPE_DEFINITIONS.map(recipe => recipe.id));
      observedRecipes[stageIndex].add(order.join('/'));
      gustRotations.add(authored.gustRotation);
      const retry = authorStage({ ...args, attempt: 1 });
      const rematch = authorStage({ ...args, matchId: `rematch-${sample}` });
      for (const fresh of [retry, rematch]) {
        assert.deepEqual(contentWithoutIdentity(fresh), contentWithoutIdentity(authored));
        const oldIds = new Set([...authored.entries, ...authored.recipes].map(entry => entry.id));
        assert.ok([...fresh.entries, ...fresh.recipes].every(entry => !oldIds.has(entry.id)));
      }
    }
  }
  const spawnTicks = ordinal => (ordinal - 1) * RULES.spawnIntervalTicks;
  const spawnSeconds = ordinal => spawnTicks(ordinal) / RULES.tickRate;
  assert.equal(spawnSeconds(12), 38.5);
  assert.equal(spawnSeconds(24), 80.5);
  return {
    schemaVersion: 1,
    proof: 'exhaustive-inventory-arithmetic',
    assumption: 'Each of the first twelve entries is delivered immediately and successfully to its matching basket.',
    limitation: 'Inventory consistency alone does not prove route solvability, human balance, or phone/network latency.',
    crossingAssignments: crossingAssignments.size,
    bagOrders: orders.length,
    bagLayouts: layouts.size,
    recipePermutations: recipeOrders.length,
    firstThreeBagOrderPermutations: indexOrders.length ** 3,
    combinations,
    passedCombinations: combinations,
    completedRecipesPerCombination: 4,
    consumedFruitPerCombination: 12,
    maxBufferedPerType: Object.fromEntries(EXPECTED_TYPES.map((type, index) => [type, peaks[index]])),
    maxTotalBuffered: peakTotal,
    supplyPerType: supplyCounts,
    demandPerType: sumNeeds(RECIPE_DEFINITIONS),
    timing: {
      tickRate: RULES.tickRate,
      cadenceTicks: RULES.spawnIntervalTicks,
      firstSpawnActiveTick: 0,
      twelfthSpawnActiveTick: spawnTicks(12),
      twelfthSpawnSeconds: spawnSeconds(12),
      twentyFourthSpawnActiveTick: spawnTicks(24),
      twentyFourthSpawnSeconds: spawnSeconds(24),
      reserveAfterTwelfthSeconds: RULES.stageDurationTicks / RULES.tickRate - spawnSeconds(12),
      reserveAfterTwentyFourthSeconds: RULES.stageDurationTicks / RULES.tickRate - spawnSeconds(24),
      minimumDeparturesByNinthSpawn: Math.max(0, 9 - RULES.maxActiveFruit),
      ninthSpawnSeconds: spawnSeconds(9),
      minimumDeparturesByTwelfthSpawn: Math.max(0, 12 - RULES.maxActiveFruit),
      assumesNoCapacityDeferral: true,
    },
    boundedSeedSweep: {
      seeds, stages: seeds * 3, bags: seeds * 3 * 6,
      observedBagLayouts: observedLayouts.size,
      observedRecipeOrdersByStage: observedRecipes.map(set => set.size),
      observedGustRotations: [...gustRotations].sort((a, b) => a - b),
      deterministicReplayAndFreshRetryRematchIdentity: true,
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--out')) throw new Error('Usage: node games/gravity-orchard/checks/inventory.mjs [--out path]');
  const report = proveInventory();
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (args.length) {
    const path = resolve(args[1]);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, json);
  }
  process.stdout.write(json);
}
