import test from 'node:test';
import assert from 'node:assert/strict';
import { engine, legalActions, RULES_V03 } from '../engine.mjs';
import { ALL_BUILDINGS, EFFECT_BUILDINGS, termPool } from '../catalog.mjs';
import { scoreBreakdown, buildQuote } from '../preview.mjs';
import { OPENING_AGENDA, clone, council, take, cityOf } from './helpers.mjs';

const fresh03 = (overrides = {}) => engine.create({
  seed: 'v03-seed', matchId: 'v03-match',
  options: { firstChair: 'jon', agenda: clone(OPENING_AGENDA), rulesVersion: RULES_V03 },
  ...overrides,
});
const designsInPlay = state => [
  ...state.market.map(stack => stack.designId), ...state.deck,
  ...['jon', 'lydia'].flatMap(seat => state.players[seat].reserve),
  ...['jon', 'lydia'].flatMap(seat => state.players[seat].city.filter(Boolean).map(card => card.designId)),
];
const toActions = state => council(state);
const byId = new Map(ALL_BUILDINGS.map(design => [design.id, design]));

test('v0.3 is opt-in, and v0.2 matches are unchanged', () => {
  const v02 = engine.create({ seed: 'v03-seed', matchId: 'v03-match', options: { firstChair: 'jon' } });
  assert.equal(v02.rulesVersion, '0.2');
  assert.equal(v02.deck, undefined);
  assert.equal(v02.players.jon.reserve, undefined);
  assert.equal(fresh03().rulesVersion, '0.3');
  assert.throws(() => engine.create({ seed: 'x', matchId: 'm', options: { rulesVersion: '0.4' } }), /0.2 or 0.3/);
});

test('v0.3 catalog adds twelve effect designs, ten per term', () => {
  assert.equal(EFFECT_BUILDINGS.length, 12);
  for (const term of [1, 2, 3]) {
    assert.equal(termPool('0.3', term).length, 10);
    assert.equal(termPool('0.2', term).length, 6);
  }
  assert.equal(new Set(ALL_BUILDINGS.map(design => design.id)).size, 30);
});

test('v0.3 deals 8 of 10 designs per term, one copy each, with 4 face up', () => {
  const state = fresh03();
  assert.equal(state.market.length, 4);
  assert.ok(state.market.every(stack => stack.remaining === 1 && byId.get(stack.designId).term === 1));
  assert.equal(state.deck.length, 4);
  assert.equal(new Set(designsInPlay(state)).size, 8);
  assert.deepEqual(state.termDecks.map(deck => deck.length), [8, 8, 8]);
  // The deal does not depend on the Chair, so mirrored sweeps share it.
  const mirrored = engine.create({ seed: 'v03-seed', matchId: 'v03-match', options: { firstChair: 'lydia', agenda: clone(OPENING_AGENDA), rulesVersion: RULES_V03 } });
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
  const designId = state.market.find(stack => buildQuote(state, seat, stack.designId).allowed).designId;
  const nextFromDeck = state.deck[0];
  const built = take(state, 'build', { designId, row: 0, col: 0 });
  assert.equal(built.players[seat].city[0].designId, designId);
  assert.equal(built.players[seat].city[0].instanceId, `v03-match:${designId}`);
  assert.equal(built.market.some(stack => stack.designId === designId), false);
  assert.equal(built.market.at(-1).designId, nextFromDeck);
  assert.equal(built.market.length, 4);
  assert.equal(built.deck.length, 3);
  assert.equal(new Set(designsInPlay(built)).size, 8);
});

test('v0.3 Scout costs 1 influence, fills the reserve to 2, and reserved cards can be built later', () => {
  const state = toActions(fresh03());
  const seat = state.activePlayer;
  const top = state.deck.slice(0, 2);
  const scouted = take(state, 'scout');
  assert.deepEqual(scouted.players[seat].reserve, top);
  assert.equal(scouted.players[seat].influence, state.players[seat].influence - 1);
  assert.equal(scouted.deck.length, 2);
  // A full reserve cannot scout again.
  let back = take(scouted, 'work');
  assert.throws(() => take(back, 'scout'), error => error.code === 'RESERVE_FULL');
  // A reserved card can be built on a later turn.
  back.players[seat].coins = 30;
  const designId = back.players[seat].reserve[0];
  const built = take(back, 'build', { designId, row: 1, col: 1 });
  assert.equal(built.players[seat].city[4].designId, designId);
  assert.deepEqual(built.players[seat].reserve, [top[1]]);
  assert.equal(new Set(designsInPlay(built)).size, 8);
  // On the other player's turn, a design held in this reserve is not available to them.
  const rival = scouted.activePlayer;
  assert.notEqual(rival, seat);
  scouted.players[rival].coins = 30;
  assert.throws(() => take(scouted, 'build', { designId: top[1], row: 0, col: 0 }), error => error.code === 'NOT_AVAILABLE');
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

test('random v0.3 matches finish, keep 8 designs per term in play and never duplicate a card', () => {
  for (let seed = 0; seed < 20; seed += 1) {
    let state = engine.create({ seed: `v03-random-${seed}`, matchId: `m${seed}`, options: { rulesVersion: RULES_V03 } });
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
      const inPlay = designsInPlay(state);
      assert.equal(new Set(inPlay).size, inPlay.length, 'no design appears twice');
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
