import test from 'node:test';
import assert from 'node:assert/strict';
import { engine } from '../engine.mjs';
import { BUILDINGS } from '../catalog.mjs';
import { buildQuote, streetOutcome, civicAward, scoreBreakdown, incomeBonus, festivalBonus } from '../preview.mjs';
import { clone, fresh, action, take, council, scenario, cityOf, toSession, frozen, assertRuleError } from './helpers.mjs';

test('Build quote uses exact public shape and reports actual capped discount/payment', () => {
  const state = scenario({ economy: 'small-shop-supremacy', city: ['button-workshop'] });
  assert.deepEqual(buildQuote(state, 'lydia', 'tea-stall'), {
    allowed: true, reason: null, printedCost: 2, cost: 1,
    discount: { amount: 1, sourceId: 'small-shop-supremacy' }, influenceGain: 0, prestige: 2,
  });
  assert.deepEqual(buildQuote(state, 'lydia', 'corner-shop'), {
    allowed: true, reason: null, printedCost: 3, cost: 1,
    discount: { amount: 2, sourceId: 'small-shop-supremacy' }, influenceGain: 0, prestige: 1,
  });
  assert.deepEqual(buildQuote(state, 'lydia', 'petition-kiosk'), {
    allowed: true, reason: null, printedCost: 3, cost: 2,
    discount: { amount: 1, sourceId: 'workshop' }, influenceGain: 2, prestige: 2,
  });
});

test('known-design quote arithmetic remains available when stage, actor, stock, space or funds disallow Build', () => {
  const base = scenario({ economy: 'public-grants', influence: 5 });
  const variants = [clone(base), clone(base), clone(base), clone(base), clone(base)];
  variants[0].stage = 'council';
  variants[1].activePlayer = 'jon';
  variants[2].market.find(stack => stack.designId === 'petition-kiosk').remaining = 0;
  variants[3].players.lydia.city = cityOf(Array(9).fill('tea-stall'));
  variants[4].players.lydia.coins = 0;
  for (const state of variants) {
    const quote = buildQuote(state, 'lydia', 'petition-kiosk');
    assert.equal(quote.allowed, false);
    assert.equal(typeof quote.reason, 'string');
    assert.equal(quote.printedCost, 3);
    assert.equal(quote.cost, 1);
    assert.deepEqual(quote.discount, { amount: 2, sourceId: 'public-grants' });
    assert.equal(quote.influenceGain, 1);
    assert.equal(quote.prestige, 2);
  }
  const future = buildQuote(base, 'lydia', 'observatory');
  assert.equal(future.allowed, false);
  assert.equal(future.cost, 5);
  assert.equal(future.prestige, 9);
});

test('quotes use the pre-action city, no guild-implied abilities, and cap-adjusted influence', () => {
  const state = scenario({ city: ['tea-stall', 'grand-bazaar', 'community-garden'] });
  assert.equal(incomeBonus(state, 'lydia'), 0);
  assert.equal(festivalBonus(state, 'lydia'), 0);
  assert.deepEqual(buildQuote(state, 'lydia', 'button-workshop').discount, { amount: 0, sourceId: null });
  assert.equal(buildQuote(state, 'lydia', 'pocket-theatre').influenceGain, 0);
  for (const [influence, expected] of [[0, 3], [3, 3], [4, 2], [5, 1], [6, 0]]) {
    state.players.lydia.influence = influence;
    assert.equal(buildQuote(state, 'lydia', 'debate-hall').influenceGain, expected);
  }
  state.players.lydia.city = cityOf(['corner-shop', 'corner-shop', 'night-market', 'pocket-theatre', 'concert-pavilion']);
  assert.equal(incomeBonus(state, 'lydia'), 2);
  assert.equal(festivalBonus(state, 'lydia'), 1);
});

test('street preview is hypothetical and ignores phase, coins, stock and current actor', () => {
  const state = fresh();
  state.players.jon.city = cityOf(['tea-stall', 'button-workshop']);
  state.players.jon.coins = 0;
  state.market = [];
  assert.deepEqual(streetOutcome(state, 'jon', 0, 2, 'high-court'), {
    canPlace: true, reason: null, completes: true, qualifies: true, prestige: 2,
  });
  assert.deepEqual(streetOutcome(state, 'jon', 1, 1, 'high-court'), {
    canPlace: true, reason: null, completes: false, qualifies: false, prestige: 0,
  });
  assert.deepEqual(streetOutcome(state, 'jon', 0, 2, 'corner-shop'), {
    canPlace: true, reason: null, completes: true, qualifies: false, prestige: 0,
  });
  state.players.jon.streetEvaluated[0] = true;
  assert.equal(streetOutcome(state, 'jon', 0, 2, 'high-court').prestige, 0);
  const occupied = streetOutcome(state, 'jon', 0, 0, 'high-court');
  assert.equal(occupied.canPlace, false);
  assert.equal(typeof occupied.reason, 'string');
  assert.equal(occupied.completes, false);
  assert.equal(occupied.prestige, 0);
});

test('all preview helpers reject invalid public IDs/coordinates safely and never mutate input', () => {
  const state = frozen(scenario({ city: ['tea-stall', 'button-workshop'] }));
  const before = JSON.stringify(state);
  for (const callback of [
    () => buildQuote(state, 'intruder', 'tea-stall'), () => buildQuote(state, 'jon', 'nonsense'),
    () => streetOutcome(state, 'jon', 3, 0, 'tea-stall'), () => streetOutcome(state, 'jon', 0, -1, 'tea-stall'),
    () => streetOutcome(state, 'jon', '0', 0, 'tea-stall'), () => streetOutcome(state, 'jon', 0, 0, 'unknown'),
    () => civicAward(state, 'jon', 'honest-wages'), () => civicAward(state, 'jon', 'unknown'),
  ]) assertRuleError(callback);
  buildQuote(state, 'lydia', 'petition-kiosk');
  streetOutcome(state, 'lydia', 0, 2, 'petition-kiosk');
  civicAward(state, 'lydia', 'diversity-parade');
  scoreBreakdown(state, 'lydia');
  assert.equal(JSON.stringify(state), before);
});

test('Civic guild thresholds distinguish 0/1/2/3/4/9 districts and neutral always yields zero', () => {
  const targets = [['shop-local', 'tea-stall'], ['industrial-pride', 'button-workshop'], ['public-service-day', 'petition-kiosk'], ['mandatory-applause', 'community-garden']];
  const state = fresh();
  for (const [law, design] of targets) for (const [count, expected] of [[0, 0], [1, 0], [2, 1], [3, 1], [4, 2], [9, 2]]) {
    state.players.jon.city = cityOf(Array(count).fill(design));
    assert.equal(civicAward(state, 'jon', law), expected, `${law}: ${count} buildings`);
    assert.equal(civicAward(state, 'jon', 'civic-neutral'), 0);
  }
});

test('Diversity and Fashionable Streets have exact independent 0/1/2-point thresholds', () => {
  const state = fresh();
  for (const [ids, expected] of [
    [[], 0], [['tea-stall'], 0], [['tea-stall', 'button-workshop'], 0],
    [['tea-stall', 'button-workshop', 'petition-kiosk'], 1],
    [['tea-stall', 'button-workshop', 'petition-kiosk', 'community-garden'], 2],
  ]) {
    state.players.jon.city = cityOf(ids);
    assert.equal(civicAward(state, 'jon', 'diversity-parade'), expected);
  }
  for (const [ids, expected] of [
    [['tea-stall', 'tea-stall', 'community-garden'], 0],
    [['tea-stall', 'button-workshop', 'petition-kiosk'], 1],
    [['tea-stall', 'button-workshop', 'petition-kiosk', 'community-garden', 'community-garden', 'pocket-theatre'], 2],
    [Array(9).fill('community-garden'), 2],
  ]) {
    state.players.jon.city = cityOf(ids);
    assert.equal(civicAward(state, 'jon', 'fashionable-streets'), expected);
  }
});

test('score breakdown counts printed prestige once, retains secured awards, and treasury caps/floors exactly', () => {
  const state = fresh();
  state.players.jon.city = cityOf(['tea-stall', 'button-workshop', 'petition-kiosk']);
  state.players.jon.score = { buildings: 999, streets: 2, festivals: 7, civic: 3, treasury: 999, total: 9999 };
  for (const [coins, treasury] of [[0, 0], [2, 0], [3, 1], [5, 1], [6, 2], [11, 3], [12, 4], [10000, 4]]) {
    state.players.jon.coins = coins;
    assert.deepEqual(scoreBreakdown(state, 'jon'), { buildings: 6, streets: 2, festivals: 7, civic: 3, treasury, total: 18 + treasury });
  }
});

const ECONOMY = ['small-shop-supremacy', 'workshop-week', 'public-grants', 'everything-is-art', 'open-tender', 'honest-wages'];
const CIVIC_EXPECTED = { 'shop-local': 1, 'industrial-pride': 1, 'public-service-day': 1, 'mandatory-applause': 0, 'fashionable-streets': 0, 'diversity-parade': 2 };
for (const economy of ECONOMY) for (const [civic, expectedAward] of Object.entries(CIVIC_EXPECTED)) test(`all law pairs terminate with independently expected income/awards: ${economy} + ${civic}`, () => {
  let state = toSession(2);
  state.activeLaws = { economy, civic };
  state.players.jon.city = cityOf(['tea-stall', 'corner-shop', 'button-workshop', 'quilt-bridge', 'petition-kiosk', 'public-library', 'community-garden']);
  assert.equal(civicAward(state, 'jon'), expectedAward);
  const coinsBefore = state.players.jon.coins;
  while (state.phase === 'playing') state = state.stage === 'council' ? council(state) : take(state, 'work');
  assert.equal(state.players.jon.score.civic, expectedAward * 5);
  assert.equal(state.players.lydia.score.civic, 0);
  assert.equal(state.players.jon.coins, coinsBefore + 15 * (economy === 'honest-wages' ? 4 : 3) + 4 * 4);
  assert.equal(state.players.jon.score.buildings, 16);
});

test('each Economy law quotes all 18 designs against independent guild/first-build discounts', () => {
  const guildLaw = { 'small-shop-supremacy': 'commerce', 'workshop-week': 'craft', 'public-grants': 'civic', 'everything-is-art': 'culture' };
  for (const economy of ECONOMY) for (const builds of [0, 1, 2]) {
    const view = scenario({ economy, builds, city: ['button-workshop'], coins: 100 });
    for (const design of BUILDINGS) {
      const eligibleLaw = guildLaw[economy] === design.guild || (economy === 'open-tender' && builds === 0);
      const amount = eligibleLaw ? 2 : (builds === 0 ? 1 : 0);
      const expectedCost = Math.max(1, design.cost - amount);
      const quote = buildQuote(view, 'lydia', design.id);
      assert.equal(quote.cost, expectedCost);
      assert.equal(quote.discount.amount, design.cost - expectedCost);
      assert.equal(quote.discount.sourceId, eligibleLaw ? economy : builds === 0 ? 'workshop' : null);
    }
  }
});

test('committed Build matches public preview payment, influence and one-time street reward', () => {
  for (const economy of ECONOMY) {
    const state = scenario({ economy, city: ['corner-shop', 'button-workshop'], influence: 5, coins: 20 });
    const view = engine.project(state, { role: 'player', playerId: 'lydia' });
    const quote = buildQuote(view, 'lydia', 'petition-kiosk');
    const street = streetOutcome(view, 'lydia', 0, 2, 'petition-kiosk');
    const after = engine.apply(state, 'lydia', action(state, 'build', { designId: 'petition-kiosk', row: 0, col: 2 }));
    assert.equal(after.players.lydia.coins, state.players.lydia.coins - quote.cost);
    assert.equal(after.players.lydia.influence, state.players.lydia.influence + quote.influenceGain);
    assert.equal(after.players.lydia.score.streets, state.players.lydia.score.streets + street.prestige);
    assert.equal(after.players.lydia.score.buildings, 3 + quote.prestige);
  }
});
