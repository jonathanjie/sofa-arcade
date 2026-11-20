import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureRules as rules, makeFixture, projectFixture } from '../fixtures.mjs';

const viewers = [{ role: 'host' }, { role: 'public' }, { role: 'player', playerId: 'jon' }, { role: 'player', playerId: 'lydia' }];
const scenes = ['council', 'opponent-ready', 'locked', 'actions', 'reveal', 'income', 'full', 'exhausted', 'results', 'tie'];

function buildView() {
  const view = structuredClone(makeFixture('actions', viewers[2]).state);
  view.phase = 'playing';
  view.stage = 'actions';
  view.activePlayer = 'jon';
  view.activeLaws = { economy: 'economy-neutral', civic: 'civic-neutral' };
  view.players.jon = {
    ...view.players.jon,
    coins: 20, influence: 2,
    city: Array(9).fill(null), streetEvaluated: [false, false, false], buildsThisSession: 0,
  };
  view.market = rules.buildings.filter(b => b.term === 1).map(b => ({ designId: b.id, remaining: 2 }));
  return view;
}

const building = (designId, index = 0) => ({ designId, instanceId: `${designId}-test-${index}` });

test('every projected scene follows the agreed room and player schema', () => {
  for (const scene of scenes) for (const viewer of viewers) {
    const room = makeFixture(scene, viewer);
    const view = room.state;
    assert.equal(room.gameId, 'odd-laws-society');
    assert.equal(typeof room.code, 'string');
    assert.ok(Number.isInteger(room.revision));
    assert.equal(view.schemaVersion, 1);
    assert.equal(view.rulesVersion, '0.2');
    assert.equal(view.gameId, room.gameId);
    assert.equal(typeof view.matchId, 'string');
    assert.equal(typeof view.phaseId, 'string');
    assert.ok(['council', 'actions', 'finished'].includes(view.stage));
    assert.equal(view.agenda.length, 6);
    assert.equal(view.chairSchedule.length, 6);
    assert.equal(view.market.length, 6);
    for (const id of ['jon', 'lydia']) {
      assert.equal(view.players[id].city.length, 9);
      assert.equal(view.players[id].streetEvaluated.length, 3);
      assert.equal(typeof view.players[id].coins, 'number');
      assert.equal(typeof view.players[id].influence, 'number');
      assert.deepEqual(Object.keys(view.players[id].score).sort(), ['buildings', 'civic', 'festivals', 'streets', 'total', 'treasury']);
    }
    if (view.stage === 'council') {
      assert.equal(view.council.optionIds.length, 3);
      assert.ok(view.council.optionIds.includes('keep'));
      if (viewer.role !== 'player') assert.equal(view.council.ownCommitment, null);
    } else assert.equal(view.council, null);
    assert.deepEqual(JSON.parse(JSON.stringify(room)), room);
  }
});

test('host and public projection redact an injected own commitment and preserve public balances', () => {
  const room = makeFixture('council', viewers[2]);
  const a = structuredClone(room.state);
  const b = structuredClone(room.state);
  a.council.ownCommitment = { choiceId: a.council.optionIds[0], bid: 0 };
  b.council.ownCommitment = { choiceId: b.council.optionIds[1], bid: 2 };
  for (const role of ['host', 'public']) {
    const projectedA = projectFixture(a, { role });
    const projectedB = projectFixture(b, { role });
    assert.deepEqual(projectedA, projectedB);
    assert.equal(projectedA.council.ownCommitment, null);
    assert.equal(projectedA.players.jon.influence, room.state.players.jon.influence);
  }
  assert.equal(a.council.ownCommitment.bid, 0, 'projection never edits its argument');
  assert.equal(b.council.ownCommitment.bid, 2);
});

test('fixture catalog contains the exact eighteen public buildings and twelve laws', () => {
  assert.equal(rules.buildings.length, 18);
  assert.equal(rules.laws.length, 12);
  assert.deepEqual(rules.guilds.map(g => g.id).sort(), ['civic', 'commerce', 'craft', 'culture']);
  assert.equal(new Set(rules.buildings.map(b => b.id)).size, 18);
  assert.equal(new Set(rules.laws.map(l => l.id)).size, 12);
  const expected = {
    'corner-shop': [1, 'commerce', 3, 1], 'tea-stall': [1, 'commerce', 2, 2],
    'button-workshop': [1, 'craft', 3, 2], 'petition-kiosk': [1, 'civic', 3, 2],
    'pocket-theatre': [1, 'culture', 3, 2], 'community-garden': [1, 'culture', 2, 2],
    'night-market': [2, 'commerce', 4, 3], 'clockwork-studio': [2, 'craft', 4, 4],
    'public-library': [2, 'civic', 4, 4], 'debate-hall': [2, 'civic', 3, 2],
    'concert-pavilion': [2, 'culture', 4, 4], 'quilt-bridge': [2, 'craft', 3, 3],
    'grand-bazaar': [3, 'commerce', 6, 7], 'grand-clock': [3, 'craft', 6, 7],
    'high-court': [3, 'civic', 5, 5], observatory: [3, 'civic', 7, 9],
    'opera-house': [3, 'culture', 6, 7], 'lala-monument': [3, 'culture', 8, 10],
  };
  for (const item of rules.buildings) assert.deepEqual([item.term, item.guild, item.cost, item.prestige], expected[item.id]);
});

test('build preview uses pre-action workshops, non-stacking discounts, exact capped influence and contract fields', () => {
  const view = buildView();
  const original = structuredClone(view);
  const firstWorkshop = rules.buildQuote(view, 'jon', 'button-workshop');
  assert.deepEqual(firstWorkshop, {
    allowed: true, reason: null, printedCost: 3, cost: 3,
    discount: { amount: 0, sourceId: null }, influenceGain: 0, prestige: 2,
  });
  assert.deepEqual(view, original);
  view.players.jon.city[0] = building('button-workshop');
  let quote = rules.buildQuote(view, 'jon', 'corner-shop');
  assert.equal(quote.cost, 2);
  assert.deepEqual(quote.discount, { amount: 1, sourceId: 'workshop' });
  view.activeLaws.economy = 'small-shop-supremacy';
  quote = rules.buildQuote(view, 'jon', 'corner-shop');
  assert.equal(quote.cost, 1);
  assert.deepEqual(quote.discount, { amount: 2, sourceId: 'small-shop-supremacy' });
  view.players.jon.buildsThisSession = 1;
  view.activeLaws.economy = 'economy-neutral';
  assert.equal(rules.buildQuote(view, 'jon', 'corner-shop').cost, 3);
  view.activeLaws.economy = 'public-grants';
  view.players.jon.influence = 5;
  quote = rules.buildQuote(view, 'jon', 'petition-kiosk');
  assert.equal(quote.cost, 1);
  assert.equal(quote.influenceGain, 1);
});

test('disallowed quotes retain exact amounts, and full cities/exhausted stock give reasons', () => {
  const view = buildView();
  view.players.jon.coins = 0;
  let quote = rules.buildQuote(view, 'jon', 'corner-shop');
  assert.equal(quote.allowed, false);
  assert.equal(quote.cost, 3);
  assert.equal(quote.printedCost, 3);
  assert.equal(typeof quote.reason, 'string');
  view.players.jon.coins = 20;
  view.market.find(b => b.designId === 'corner-shop').remaining = 0;
  quote = rules.buildQuote(view, 'jon', 'corner-shop');
  assert.equal(quote.allowed, false);
  assert.equal(typeof quote.reason, 'string');
  view.market.find(b => b.designId === 'corner-shop').remaining = 2;
  view.players.jon.city = Array.from({ length: 9 }, (_, index) => building('tea-stall', index));
  assert.equal(rules.buildQuote(view, 'jon', 'corner-shop').allowed, false);
});

test('street preview independently evaluates a public hypothetical plot even without coins or a turn', () => {
  const view = buildView();
  view.activePlayer = 'lydia';
  view.players.jon.coins = 0;
  view.players.jon.city[0] = building('corner-shop');
  view.players.jon.city[1] = building('button-workshop');
  const before = structuredClone(view);
  assert.deepEqual(rules.streetOutcome(view, 'jon', 0, 2, 'petition-kiosk'), {
    canPlace: true, reason: null, completes: true, qualifies: true, prestige: 2,
  });
  assert.deepEqual(view, before);
  view.players.jon.city[1] = building('tea-stall');
  assert.equal(rules.streetOutcome(view, 'jon', 0, 2, 'petition-kiosk').prestige, 0);
  assert.equal(rules.streetOutcome(view, 'jon', 0, 2, 'corner-shop').prestige, 2);
  assert.equal(rules.streetOutcome(view, 'jon', 0, 0, 'petition-kiosk').canPlace, false);
});

test('civic preview respects two/four thresholds, qualifying streets and diversity caps', () => {
  const view = buildView();
  assert.equal(rules.civicAward(view, 'jon', 'civic-neutral'), 0);
  view.players.jon.city[0] = building('tea-stall', 0);
  assert.equal(rules.civicAward(view, 'jon', 'shop-local'), 0);
  view.players.jon.city[1] = building('tea-stall', 1);
  assert.equal(rules.civicAward(view, 'jon', 'shop-local'), 1);
  view.players.jon.city[2] = building('corner-shop', 0);
  view.players.jon.city[3] = building('corner-shop', 1);
  assert.equal(rules.civicAward(view, 'jon', 'shop-local'), 2);
  view.players.jon.city[4] = building('button-workshop');
  view.players.jon.city[5] = building('petition-kiosk');
  assert.equal(rules.civicAward(view, 'jon', 'diversity-parade'), 1);
  view.players.jon.city[6] = building('pocket-theatre');
  assert.equal(rules.civicAward(view, 'jon', 'diversity-parade'), 2);
});
