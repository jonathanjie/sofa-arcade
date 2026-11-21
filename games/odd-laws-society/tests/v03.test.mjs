import test from 'node:test';
import assert from 'node:assert/strict';
import { engine, legalActions, RULES_V03, V03_STAPLES, V03_SPONSOR_PRESTIGE } from '../engine.mjs';
import { ALL_BUILDINGS, EFFECT_BUILDINGS, termPool } from '../catalog.mjs';
import { MODULE_IDS } from '../rules.mjs';
import { scoreBreakdown, buildQuote, festivalPoints } from '../preview.mjs';
import { OPENING_AGENDA, clone, council, take, cityOf } from './helpers.mjs';

const fresh03 = (overrides = {}) => engine.create({
  seed: 'v03-seed', matchId: 'v03-match',
  options: { firstChair: 'jon', agenda: clone(OPENING_AGENDA), rulesVersion: RULES_V03, modules: [...MODULE_IDS] },
  ...overrides,
});
// One entry per physical card: a staple stack with 2 copies counts twice.
const designsInPlay = state => [
  ...state.market.flatMap(stack => Array(stack.remaining).fill(stack.designId)), ...state.deck,
  ...['jon', 'lydia'].flatMap(seat => state.players[seat].reserve),
  ...['jon', 'lydia'].flatMap(seat => state.players[seat].city.filter(Boolean).map(card => card.designId)),
];
const toActions = state => council(state);
const copiesAllowed = designId => (V03_STAPLES.includes(designId) ? 2 : 1);
const assertCardCounts = state => {
  const counts = new Map();
  for (const designId of designsInPlay(state)) counts.set(designId, (counts.get(designId) ?? 0) + 1);
  for (const [designId, count] of counts) assert.ok(count <= copiesAllowed(designId), `${designId} appears ${count} times`);
};
const rowCards = state => state.market.filter(stack => !V03_STAPLES.includes(stack.designId));
const byId = new Map(ALL_BUILDINGS.map(design => [design.id, design]));

test('v0.3 is opt-in, and v0.2 matches are unchanged', () => {
  const v02 = engine.create({ seed: 'v03-seed', matchId: 'v03-match', options: { firstChair: 'jon' } });
  assert.equal(v02.rulesVersion, '0.2');
  assert.equal(v02.deck, undefined);
  assert.equal(v02.players.jon.reserve, undefined);
  assert.equal(fresh03().rulesVersion, '0.3');
  assert.throws(() => engine.create({ seed: 'x', matchId: 'm', options: { rulesVersion: '0.4' } }), /0.2 or 0.3/);
});

test('Grand Market adds twelve effect designs, ten per term with Back-Room Deals', () => {
  assert.equal(EFFECT_BUILDINGS.length, 12);
  for (const term of [1, 2, 3]) {
    assert.equal(termPool({ grandMarket: true, backRoom: true }, term).length, 10);
    assert.equal(termPool({ grandMarket: true }, term).length, 9, 'designs that Scout need Back-Room Deals');
    assert.equal(termPool({}, term).length, 6);
  }
  assert.equal(new Set(ALL_BUILDINGS.map(design => design.id)).size, 30);
});

test('v0.3 deals 8 designs per term plus its staple, with a 4-card row face up', () => {
  const state = fresh03();
  assert.deepEqual(state.market[0], { designId: 'corner-shop', remaining: 2 });
  assert.equal(rowCards(state).length, 4);
  assert.ok(rowCards(state).every(stack => stack.remaining === 1 && byId.get(stack.designId).term === 1));
  assert.equal(state.deck.length, 4);
  assert.equal(new Set(designsInPlay(state)).size, 9);
  assert.equal(designsInPlay(state).length, 10);
  assert.deepEqual(state.termDecks.map(deck => deck.length), [8, 8, 8]);
  assert.ok(state.termDecks.flat().every(designId => !V03_STAPLES.includes(designId)), 'staples are never dealt into a deck');
  // The deal does not depend on the Chair, so mirrored sweeps share it.
  const mirrored = engine.create({ seed: 'v03-seed', matchId: 'v03-match', options: { firstChair: 'lydia', agenda: clone(OPENING_AGENDA), rulesVersion: RULES_V03, modules: [...MODULE_IDS] } });
  assert.deepEqual(mirrored.termDecks, state.termDecks);
});

test('v0.3 council: only the winner pays, the Chair wins ties, and 0–0 keeps the law', () => {
  const contested = council(fresh03(), { choiceId: 'small-shop-supremacy', bid: 1 }, { choiceId: 'honest-wages', bid: 2 });
  assert.equal(contested.activeLaws.economy, 'honest-wages');
  assert.deepEqual([contested.players.jon.influence, contested.players.lydia.influence], [2, 0]);
  assert.deepEqual(contested.lastCouncil.paid, { jon: 0, lydia: 2 });

  const tie = council(fresh03(), { choiceId: 'small-shop-supremacy', bid: 1 }, { choiceId: 'honest-wages', bid: 1 });
  assert.equal(tie.activeLaws.economy, 'small-shop-supremacy');
  assert.deepEqual([tie.players.jon.influence, tie.players.lydia.influence], [1, 2]);

  const silent = council(fresh03(), { choiceId: 'small-shop-supremacy', bid: 0 }, { choiceId: 'small-shop-supremacy', bid: 0 });
  assert.equal(silent.activeLaws.economy, 'economy-neutral');
  assert.deepEqual([silent.players.jon.influence, silent.players.lydia.influence], [2, 2]);
});

test('v0.3 build from the row removes the only copy and refills from the deck', () => {
  const state = toActions(fresh03());
  const seat = state.activePlayer;
  const designId = rowCards(state).find(stack => buildQuote(state, seat, stack.designId).allowed).designId;
  const nextFromDeck = state.deck[0];
  const built = take(state, 'build', { designId, row: 0, col: 0 });
  assert.equal(built.players[seat].city[0].designId, designId);
  assert.equal(built.players[seat].city[0].instanceId, `v03-match:${designId}`);
  assert.equal(built.market.some(stack => stack.designId === designId), false);
  assert.equal(built.market.at(-1).designId, nextFromDeck);
  assert.equal(rowCards(built).length, 4);
  assert.equal(built.deck.length, 3);
  assertCardCounts(built);
});

test('v0.3 Scout is free, once per session, costs 1 influence, and fills the reserve to 2', () => {
  const state = toActions(fresh03());
  const seat = state.activePlayer;
  const top = state.deck.slice(0, 2);
  const scouted = take(state, 'scout');
  assert.deepEqual(scouted.players[seat].reserve, top);
  assert.equal(scouted.players[seat].influence, state.players[seat].influence - 1);
  assert.equal(scouted.deck.length, 2);
  // Scouting takes no city action: the same player keeps the same turn.
  assert.equal(scouted.activePlayer, seat);
  assert.equal(scouted.phaseId, state.phaseId);
  assert.equal(scouted.actionsRemaining[seat], state.actionsRemaining[seat]);
  assert.equal(scouted.players[seat].scoutedThisSession, true);
  assert.throws(() => take(scouted, 'scout'), error => ['RESERVE_FULL', 'SCOUT_USED'].includes(error.code));
  const emptied = clone(scouted);
  emptied.players[seat].reserve = [];
  assert.throws(() => take(emptied, 'scout'), error => error.code === 'SCOUT_USED');
  // A reserved card can be built on a later turn.
  let back = take(take(scouted, 'work'), 'work');
  assert.equal(back.activePlayer, seat);
  back.players[seat].coins = 30;
  const designId = back.players[seat].reserve[0];
  const built = take(back, 'build', { designId, row: 1, col: 1 });
  assert.equal(built.players[seat].city[4].designId, designId);
  assert.deepEqual(built.players[seat].reserve, [top[1]]);
  assertCardCounts(built);
  // On the other player's turn, a design held in this reserve is not available to them.
  const rivalTurn = take(scouted, 'work');
  const rival = rivalTurn.activePlayer;
  assert.notEqual(rival, seat);
  rivalTurn.players[rival].coins = 30;
  assert.throws(() => take(rivalTurn, 'build', { designId: top[1], row: 0, col: 0 }), error => error.code === 'NOT_AVAILABLE');
  // The Scout flag resets at the next session.
  let later = scouted;
  while (later.session === 1) later = later.stage === 'council' ? council(later) : take(later, 'work');
  assert.equal(later.players[seat].scoutedThisSession, false);
});

test('v0.3 reserves survive term changes, and each term opens a new row', () => {
  let state = toActions(fresh03());
  const seat = state.activePlayer;
  state = take(state, 'scout');
  const reserved = [...state.players[seat].reserve];
  while (state.session < 3) {
    if (state.stage === 'council') state = council(state);
    else state = take(state, 'work');
  }
  assert.deepEqual(state.players[seat].reserve, reserved);
  assert.deepEqual(state.market[0], { designId: 'night-market', remaining: 2 });
  assert.ok(state.market.every(stack => byId.get(stack.designId).term === 2));
  assert.equal(state.deck.length, 4);
});

test('v0.3 projection hides the deck and the other player’s reserve', () => {
  const state = take(toActions(fresh03()), 'scout');
  const owner = state.players.jon.reserve.length ? 'jon' : 'lydia';
  const rival = owner === 'jon' ? 'lydia' : 'jon';
  const ownView = engine.project(state, { role: 'player', playerId: owner });
  const rivalView = engine.project(state, { role: 'player', playerId: rival });
  const tvView = engine.project(state, { role: 'host' });
  assert.deepEqual(ownView.players[owner].reserve, state.players[owner].reserve);
  for (const view of [rivalView, tvView]) {
    assert.equal(view.players[owner].reserve, null);
    assert.equal(view.players[owner].reserveCount, 2);
    assert.equal(view.deck, undefined);
    assert.equal(view.termDecks, undefined);
    assert.equal(view.deckCount, state.deck.length);
    // No hidden design ID (reserve, deck or future terms) appears anywhere in the
    // view unless it is also public: in the open market or in a city.
    const text = JSON.stringify(view);
    const publicIds = new Set([
      ...state.market.map(stack => stack.designId),
      ...['jon', 'lydia'].flatMap(id => state.players[id].city.filter(Boolean).map(card => card.designId)),
    ]);
    for (const designId of [...state.players[owner].reserve, ...state.deck, ...state.termDecks.flat()]) {
      if (!publicIds.has(designId)) assert.equal(text.includes(`"${designId}"`), false, `${designId} leaked`);
    }
  }
});

test('v0.3 effects: street synergy, diversity, treasury rate, Lobby coin, rival Festival coin, scout on build', () => {
  const state = toActions(fresh03());
  const seat = state.activePlayer;
  const rival = seat === 'jon' ? 'lydia' : 'jon';
  const view = clone(state);
  // Carpenters' Lodge with two other Craft buildings in its street: +2.
  view.players[seat].city = cityOf(['carpenters-lodge', 'quilt-bridge', 'button-workshop']);
  assert.equal(scoreBreakdown(view, seat).buildings, 1 + 3 + 2 + 2);
  // Grand Museum with four guilds: +4.
  view.players[seat].city = cityOf(['grand-museum', 'tea-stall', 'quilt-bridge', 'public-library']);
  assert.equal(scoreBreakdown(view, seat).buildings, 4 + 2 + 3 + 4 + 4);
  // Counting House: treasury per 2 coins, still at most 4.
  view.players[seat].city = cityOf(['counting-house']);
  view.players[seat].coins = 7;
  assert.equal(scoreBreakdown(view, seat).treasury, 3);
  view.players[seat].coins = 20;
  assert.equal(scoreBreakdown(view, seat).treasury, 4);

  const lobbyState = clone(state);
  lobbyState.players[seat].city = cityOf(['town-crier']);
  const lobbied = take(lobbyState, 'lobby');
  assert.equal(lobbied.players[seat].coins, lobbyState.players[seat].coins + 1);

  const festivalState = clone(state);
  festivalState.players[rival].city = cityOf(['gossip-stand']);
  const celebrated = take(festivalState, 'festival');
  assert.equal(celebrated.players[rival].coins, festivalState.players[rival].coins + 1);

  const musicianState = clone(state);
  musicianState.market[0] = { designId: 'street-musicians', remaining: 1 };
  musicianState.players[seat].coins = 10;
  const topCard = musicianState.deck[1];
  const withMusicians = take(musicianState, 'build', { designId: 'street-musicians', row: 2, col: 2 });
  assert.deepEqual(withMusicians.players[seat].reserve, [topCard]);
});

test('v0.3 staples: each player can build one of the two copies, and the stack does not refill', () => {
  let state = toActions(fresh03());
  const first = state.activePlayer;
  const second = first === 'jon' ? 'lydia' : 'jon';
  state.players.jon.coins = 30;
  state.players.lydia.coins = 30;
  state = take(state, 'build', { designId: 'corner-shop', row: 0, col: 0 });
  assert.equal(state.players[first].city[0].instanceId, 'v03-match:corner-shop:copy-1');
  assert.deepEqual(state.market[0], { designId: 'corner-shop', remaining: 1 });
  state = take(state, 'build', { designId: 'corner-shop', row: 0, col: 0 });
  assert.equal(state.players[second].city[0].instanceId, 'v03-match:corner-shop:copy-2');
  assert.equal(state.market.some(stack => stack.designId === 'corner-shop'), false);
  assert.equal(rowCards(state).length, 4, 'an empty staple does not take a deck card');
  assertCardCounts(state);
});

test('v0.3 forbids a second copy of a design in one city', () => {
  const state = toActions(fresh03());
  const seat = state.activePlayer;
  state.players[seat].coins = 30;
  state.players[seat].city = cityOf(['corner-shop']);
  const quote = buildQuote(state, seat, 'corner-shop');
  assert.equal(quote.allowed, false);
  assert.match(quote.reason, /already have/);
  assert.equal(legalActions(state, seat).some(action => action.designId === 'corner-shop'), false);
  assert.throws(() => take(state, 'build', { designId: 'corner-shop', row: 1, col: 1 }), error => error.code === 'DUPLICATE_DESIGN');
});

test('v0.3 Festival scores 2 plus 1 per Culture building, at most 4', () => {
  const state = toActions(fresh03());
  const seat = state.activePlayer;
  const view = clone(state);
  const points = ids => { view.players[seat].city = cityOf(ids); return festivalPoints(view, seat); };
  assert.equal(points([]), 2);
  assert.equal(points(['community-garden']), 3);
  // A Festival icon adds nothing extra in v0.3; it counts only as a Culture building.
  assert.equal(points(['pocket-theatre']), 3);
  assert.equal(points(['community-garden', 'pocket-theatre', 'opera-house']), 4);
  view.players[seat].city = cityOf(['community-garden']);
  view.players[seat].coins = 10;
  const celebrated = take(view, 'festival');
  assert.equal(celebrated.players[seat].score.festivals, 3);
  // v0.2 keeps 3 plus the icon bonus.
  const v02 = engine.create({ seed: 'v03-seed', matchId: 'v03-match', options: { firstChair: 'jon' } });
  v02.players.jon.city = cityOf(['pocket-theatre']);
  assert.equal(festivalPoints(v02, 'jon'), 4);
});

test('v0.3 Rebuild replaces a building for the new cost minus the old printed cost', () => {
  const state = toActions(fresh03());
  const seat = state.activePlayer;
  state.players[seat].coins = 10;
  // A full street of Tea Stall (2), Community Garden (2) and a Term I card.
  const designId = rowCards(state).find(stack => !['tea-stall', 'community-garden'].includes(stack.designId)).designId;
  state.players[seat].city = cityOf(['tea-stall', 'community-garden']);
  const printed = byId.get(designId).cost;
  const quote = buildQuote(state, seat, designId, 0);
  assert.equal(quote.allowed, true);
  assert.equal(quote.cost, Math.max(1, printed - 2));
  assert.deepEqual(quote.rebuild, { replacedDesignId: 'tea-stall', credit: printed - quote.cost });
  const rebuilt = take(state, 'build', { designId, row: 0, col: 0 });
  assert.equal(rebuilt.players[seat].city[0].designId, designId);
  assert.equal(rebuilt.players[seat].coins, 10 - quote.cost);
  // The replaced building leaves the city and is not returned to the market or reserve.
  assert.equal(rebuilt.players[seat].city.some(card => card?.designId === 'tea-stall'), false);
  assert.equal(rebuilt.players[seat].reserve.includes('tea-stall'), false);
  assert.equal(rebuilt.market.length, state.market.length);
  assert.equal(rebuilt.players[seat].score.streets, 0, 'a rebuild never scores a street');
  // Rebuilding is legal in a full city, and v0.2 still forbids building on an occupied plot.
  const full = clone(state);
  full.players[seat].city = cityOf(['tea-stall', 'community-garden', 'button-workshop', 'petition-kiosk', 'pocket-theatre', 'gossip-stand', 'town-crier', 'carpenters-lodge', 'street-musicians']);
  full.players[seat].coins = 20;
  const fullOptions = legalActions(full, seat).filter(action => action.type === 'build');
  assert.ok(fullOptions.length > 0);
  const v02 = council(engine.create({ seed: 'v03-seed', matchId: 'v03-match', options: { firstChair: 'jon' } }));
  v02.players[v02.activePlayer].city = cityOf(['tea-stall']);
  v02.players[v02.activePlayer].coins = 20;
  assert.throws(() => take(v02, 'build', { designId: 'community-garden', row: 0, col: 0 }), error => error.code === 'PLOT_OCCUPIED');
});

test('v0.3 sponsors: the winning bid sponsors the law, paid only at Civic session ends', () => {
  // Session 1 (Economy): Lydia wins and sponsors Honest Wages.
  let state = council(fresh03(), { choiceId: 'small-shop-supremacy', bid: 1 }, { choiceId: 'honest-wages', bid: 2 });
  assert.deepEqual(state.sponsors, { economy: 'lydia', civic: null });
  const civicBefore = state.players.lydia.score.civic;
  while (state.session === 1) state = take(state, 'work');
  // No dividend after session 1, which is an Economy session.
  assert.equal(state.players.lydia.score.civic, civicBefore);
  // Session 2 (Civic): nobody bids, so the law is kept and sponsors do not change.
  state = council(state);
  assert.deepEqual(state.sponsors, { economy: 'lydia', civic: null });
  while (state.session === 2) state = take(state, 'work');
  assert.equal(state.players.lydia.score.civic, civicBefore + V03_SPONSOR_PRESTIGE);
  assert.equal(state.players.jon.score.civic, 0);
  // Projection shows sponsors to everyone.
  assert.deepEqual(engine.project(state, { role: 'host' }).sponsors, state.sponsors);
  // Session 3: Jon replaces Lydia's law and becomes its sponsor.
  state = council(state, { choiceId: 'workshop-week', bid: 1 }, { choiceId: 'keep', bid: 0 });
  assert.equal(state.activeLaws.economy, 'workshop-week');
  assert.equal(state.sponsors.economy, 'jon');
});

test('v0.3 Festival also gains 1 influence, up to 6', () => {
  const state = toActions(fresh03());
  const seat = state.activePlayer;
  state.players[seat].coins = 10;
  state.players[seat].influence = 2;
  assert.equal(take(state, 'festival').players[seat].influence, 3);
  state.players[seat].influence = 6;
  assert.equal(take(state, 'festival').players[seat].influence, 6);
});

test('random v0.3 matches finish, keep 8 designs per term in play and never duplicate a card', () => {
  for (let seed = 0; seed < 20; seed += 1) {
    let state = engine.create({ seed: `v03-random-${seed}`, matchId: `m${seed}`, options: { rulesVersion: RULES_V03, modules: [...MODULE_IDS] } });
    let pick = seed + 1;
    let term = 1;
    while (state.phase === 'playing') {
      const seat = state.stage === 'council'
        ? ['jon', 'lydia'].find(id => state.council.commitments[id] === null)
        : state.activePlayer;
      const options = legalActions(state, seat);
      pick = (pick * 1103515245 + 12345) % 2147483648;
      state = engine.apply(state, seat, options[pick % options.length]);
      assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
      assertCardCounts(state);
      for (const seatId of ['jon', 'lydia']) {
        const own = state.players[seatId].city.filter(Boolean).map(card => card.designId);
        assert.equal(new Set(own).size, own.length, 'no duplicate design in one city');
      }
      if (state.term !== term) term = state.term;
      for (const seatId of ['jon', 'lydia']) {
        assert.ok(state.players[seatId].reserve.length <= 2);
        assert.ok(state.players[seatId].influence >= 0 && state.players[seatId].influence <= 6);
        assert.ok(state.players[seatId].coins >= 0);
      }
    }
    assert.ok(['jon', 'lydia', 'tie'].includes(state.result.winner));
  }
});
