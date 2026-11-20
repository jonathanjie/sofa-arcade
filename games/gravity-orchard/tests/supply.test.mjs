import test from 'node:test';
import assert from 'node:assert/strict';
import { TYPES, RECIPE_DEFINITIONS, authorStage, basketOwner, makeBag, seededRandom, shuffle } from '../supply.mjs';
import { proveInventory } from '../checks/inventory.mjs';

const needs = [
  { id: 'apple-picnic', needs: { apple: 2, plum: 0, pear: 1, starfruit: 0 } },
  { id: 'plum-picnic', needs: { apple: 0, plum: 2, pear: 0, starfruit: 1 } },
  { id: 'sunlit-mix', needs: { apple: 1, plum: 0, pear: 1, starfruit: 1 } },
  { id: 'moonlit-mix', needs: { apple: 0, plum: 1, pear: 1, starfruit: 1 } },
];

test('recipe definitions exactly preserve the four authored three-fruit picnic orders', () => {
  assert.deepEqual(RECIPE_DEFINITIONS, needs);
  assert.deepEqual(TYPES, ['apple', 'plum', 'pear', 'starfruit']);
  assert.deepEqual(TYPES.map(basketOwner), ['jon', 'jon', 'lydia', 'lydia']);
  assert.ok(Object.isFrozen(RECIPE_DEFINITIONS));
  assert.ok(RECIPE_DEFINITIONS.every(recipe => Object.isFrozen(recipe) && Object.isFrozen(recipe.needs)));
});

test('hand-checked crossing assignment keeps one cross delivery in each direction', () => {
  const order = Object.freeze(['pear', 'apple', 'starfruit', 'plum']);
  assert.deepEqual(makeBag('apple', 'starfruit', order), [
    { type: 'pear', spawnOwner: 'lydia' },
    { type: 'apple', spawnOwner: 'lydia' },
    { type: 'starfruit', spawnOwner: 'jon' },
    { type: 'plum', spawnOwner: 'jon' },
  ]);
  assert.deepEqual(order, ['pear', 'apple', 'starfruit', 'plum']);
  for (const args of [
    ['pear', 'starfruit'], ['apple', 'plum'],
    ['apple', 'pear', ['apple', 'apple', 'pear', 'starfruit']],
    ['apple', 'pear', ['apple', 'plum', 'pear']],
    ['apple', 'pear', ['apple', 'plum', 'pear', 'mango']],
  ]) assert.throws(() => makeBag(...args), RangeError);
});

test('exhaustive inventory proof covers 96 layouts and all 331,776 combinations', () => {
  const proof = proveInventory();
  assert.equal(proof.crossingAssignments, 4);
  assert.equal(proof.bagOrders, 24);
  assert.equal(proof.bagLayouts, 96);
  assert.equal(proof.recipePermutations, 24);
  assert.equal(proof.firstThreeBagOrderPermutations, 13824);
  assert.equal(proof.combinations, 331776);
  assert.equal(proof.passedCombinations, proof.combinations);
  assert.equal(proof.completedRecipesPerCombination, 4);
  assert.equal(proof.consumedFruitPerCombination, 12);
  assert.deepEqual(proof.maxBufferedPerType, { apple: 3, plum: 3, pear: 3, starfruit: 3 });
  assert.deepEqual(proof.supplyPerType, { apple: 6, plum: 6, pear: 6, starfruit: 6 });
  assert.deepEqual(proof.demandPerType, { apple: 3, plum: 3, pear: 3, starfruit: 3 });
  assert.equal(proof.timing.twelfthSpawnSeconds, 38.5);
  assert.equal(proof.timing.twentyFourthSpawnSeconds, 80.5);
  assert.equal(proof.timing.twelfthSpawnActiveTick, 2310);
  assert.equal(proof.timing.twentyFourthSpawnActiveTick, 4830);
  assert.equal(proof.timing.reserveAfterTwelfthSeconds, 51.5);
  assert.equal(proof.timing.reserveAfterTwentyFourthSeconds, 9.5);
  assert.equal(proof.timing.minimumDeparturesByNinthSpawn, 1);
  assert.equal(proof.timing.ninthSpawnSeconds, 28);
  assert.equal(proof.timing.minimumDeparturesByTwelfthSpawn, 4);
  assert.equal(proof.boundedSeedSweep.seeds, 128);
  assert.equal(proof.boundedSeedSweep.stages, 384);
  assert.equal(proof.boundedSeedSweep.observedBagLayouts, 96);
  assert.equal(proof.boundedSeedSweep.observedRecipeOrdersByStage[0], 1);
  assert.ok(proof.boundedSeedSweep.observedRecipeOrdersByStage[1] > 16);
  assert.ok(proof.boundedSeedSweep.observedRecipeOrdersByStage[2] > 16);
  assert.deepEqual(proof.boundedSeedSweep.observedGustRotations, [0, 1, 2, 3]);
  assert.match(proof.limitation, /does not prove route/);
});

test('same seed replays authoring but retries and rematches create disjoint entity identities', () => {
  const stage = authorStage({ seed: 'reviewed-supply-example', matchId: 'first-match', stageIndex: 2, attempt: 0 });
  assert.deepEqual(stage, authorStage({ seed: 'reviewed-supply-example', matchId: 'first-match', stageIndex: 2, attempt: 0 }));
  const content = authored => ({
    entries: authored.entries.map(({ id, ...entry }) => entry),
    recipes: authored.recipes.map(({ id, ...recipe }) => recipe),
    gustRotation: authored.gustRotation,
  });
  const originalIDs = new Set(stage.entries.concat(stage.recipes).map(entry => entry.id));
  for (const args of [{ matchId: 'first-match', attempt: 1 }, { matchId: 'new-match', attempt: 0 }]) {
    const fresh = authorStage({ seed: 'reviewed-supply-example', stageIndex: 2, ...args });
    assert.deepEqual(content(fresh), content(stage));
    assert.ok(fresh.entries.concat(fresh.recipes).every(entry => !originalIDs.has(entry.id)));
  }
  const different = authorStage({ seed: 'a-different-seed', matchId: 'first-match', stageIndex: 2, attempt: 0 });
  assert.notDeepEqual(content(different), content(stage));
});

test('seeded authoring uses bounded deterministic random values and nonmutating shuffles', () => {
  const first = seededRandom('bounded-supply');
  const second = seededRandom('bounded-supply');
  for (let i = 0; i < 512; i++) {
    const value = first();
    assert.equal(value, second());
    assert.ok(Number.isFinite(value) && value >= 0 && value < 1);
  }
  const original = Object.freeze(['a', 'b', 'c', 'd']);
  const shuffled = shuffle(original, seededRandom('shuffle'));
  assert.notEqual(shuffled, original);
  assert.deepEqual([...shuffled].sort(), [...original].sort());
  assert.deepEqual(original, ['a', 'b', 'c', 'd']);
  assert.throws(() => proveInventory({ seeds: 0 }), RangeError);
  assert.throws(() => proveInventory({ seeds: 513 }), RangeError);
  assert.throws(() => proveInventory({ seeds: NaN }), RangeError);
});
