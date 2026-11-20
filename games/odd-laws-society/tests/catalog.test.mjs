import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, LAWS, GUILDS } from '../catalog.mjs';

// Independent transcription of PRD v0.2 tables: changed balance requires explicit test review.
const EXPECTED_BUILDINGS = [
  ['corner-shop', 1, 'commerce', 3, 1, { type: 'income', amount: 1 }],
  ['tea-stall', 1, 'commerce', 2, 2, null],
  ['button-workshop', 1, 'craft', 3, 2, { type: 'firstBuildDiscount', amount: 1 }],
  ['petition-kiosk', 1, 'civic', 3, 2, { type: 'influenceOnBuild', amount: 2 }],
  ['pocket-theatre', 1, 'culture', 3, 2, { type: 'festivalBonus', amount: 1 }],
  ['community-garden', 1, 'culture', 2, 2, null],
  ['night-market', 2, 'commerce', 4, 3, { type: 'income', amount: 1 }],
  ['clockwork-studio', 2, 'craft', 4, 4, { type: 'firstBuildDiscount', amount: 1 }],
  ['public-library', 2, 'civic', 4, 4, { type: 'influenceOnBuild', amount: 2 }],
  ['debate-hall', 2, 'civic', 3, 2, { type: 'influenceOnBuild', amount: 3 }],
  ['concert-pavilion', 2, 'culture', 4, 4, { type: 'festivalBonus', amount: 1 }],
  ['quilt-bridge', 2, 'craft', 3, 3, null],
  ['grand-bazaar', 3, 'commerce', 6, 7, null],
  ['grand-clock', 3, 'craft', 6, 7, null],
  ['high-court', 3, 'civic', 5, 5, { type: 'influenceOnBuild', amount: 2 }],
  ['observatory', 3, 'civic', 7, 9, null],
  ['opera-house', 3, 'culture', 6, 7, { type: 'festivalBonus', amount: 1 }],
  ['lala-monument', 3, 'culture', 8, 10, null],
];
const EXPECTED_LAWS = [
  ['small-shop-supremacy', 'economy', { type: 'guildDiscount', guild: 'commerce', amount: 2 }],
  ['workshop-week', 'economy', { type: 'guildDiscount', guild: 'craft', amount: 2 }],
  ['public-grants', 'economy', { type: 'guildDiscount', guild: 'civic', amount: 2 }],
  ['everything-is-art', 'economy', { type: 'guildDiscount', guild: 'culture', amount: 2 }],
  ['open-tender', 'economy', { type: 'firstBuildDiscount', amount: 2 }],
  ['honest-wages', 'economy', { type: 'workIncome', coins: 4 }],
  ...[['shop-local', 'commerce'], ['industrial-pride', 'craft'], ['public-service-day', 'civic'], ['mandatory-applause', 'culture']].map(([id, guild]) => [id, 'civic', { type: 'guildThreshold', guild, thresholds: [{ atLeast: 2, points: 1 }, { atLeast: 4, points: 2 }] }]),
  ['fashionable-streets', 'civic', { type: 'streetCount', pointsEach: 1, cap: 2 }],
  ['diversity-parade', 'civic', { type: 'diversityThreshold', thresholds: [{ atLeast: 3, points: 1 }, { atLeast: 4, points: 2 }] }],
];
function assertDeepFrozen(value) {
  if (!value || typeof value !== 'object') return;
  assert.ok(Object.isFrozen(value));
  for (const child of Object.values(value)) assertDeepFrozen(child);
}
test('all 18 building designs preserve exact PRD costs, prestige and explicit abilities', () => {
  assert.deepEqual(BUILDINGS.map(b => [b.id, b.term, b.guild, b.cost, b.prestige, b.ability]), EXPECTED_BUILDINGS);
  for (const building of BUILDINGS) {
    assert.equal(typeof building.name, 'string');
    assert.equal(typeof building.abilityDescription, 'string');
    assert.deepEqual(Object.keys(building).sort(), ['id', 'name', 'term', 'guild', 'cost', 'prestige', 'ability', 'abilityDescription'].sort());
  }
});
test('12 laws use exact bounded data effects with no neutral agenda cards', () => {
  assert.deepEqual(LAWS.map(l => [l.id, l.category, l.effect]), EXPECTED_LAWS);
  for (const law of LAWS) {
    assert.equal(typeof law.description, 'string');
    assert.deepEqual(Object.keys(law).sort(), ['id', 'name', 'category', 'description', 'effect'].sort());
  }
});
test('guilds have fixed icon IDs and catalog values are deeply immutable JSON data', () => {
  assert.deepEqual(GUILDS.map(g => g.id), ['commerce', 'craft', 'civic', 'culture']);
  assert.deepEqual(GUILDS.map(g => g.iconKey), ['commerce', 'craft', 'civic', 'culture']);
  for (const guild of GUILDS) assert.ok(guild.name && guild.color);
  for (const collection of [BUILDINGS, LAWS, GUILDS]) {
    assertDeepFrozen(collection);
    assert.deepEqual(JSON.parse(JSON.stringify(collection)), collection);
  }
  assert.throws(() => { BUILDINGS[0].cost = 999; }, TypeError);
  assert.throws(() => { LAWS[0].effect.amount = 999; }, TypeError);
});
