import test from 'node:test';
import assert from 'node:assert/strict';
import { engine, legalActions, RULES_V03 } from '../engine.mjs';
import { features, normalizeModules, MODULES } from '../rules.mjs';
import { festivalPoints, buildQuote } from '../preview.mjs';
import { ALL_BUILDINGS } from '../catalog.mjs';
import { OPENING_AGENDA, clone, council, take, cityOf } from './helpers.mjs';

const create = (modules, extra = {}) => engine.create({
  seed: 'modules-seed', matchId: 'modules-match',
  options: { firstChair: 'jon', agenda: clone(OPENING_AGENDA), rulesVersion: RULES_V03, modules, ...extra },
});
const COMBINATIONS = [[], [MODULES.GRAND_MARKET], [MODULES.GRAND_MARKET, MODULES.BACK_ROOM]];
const byId = new Map(ALL_BUILDINGS.map(design => [design.id, design]));

test('module lists are validated: known IDs, no repeats, Back-Room Deals needs Grand Market, v0.3 only', () => {
  assert.deepEqual(normalizeModules([]), []);
  assert.deepEqual(normalizeModules(['back-room', 'grand-market']), ['grand-market', 'back-room']);
  assert.equal(normalizeModules(['back-room']), null);
  assert.equal(normalizeModules(['grand-market', 'grand-market']), null);
  assert.equal(normalizeModules(['unknown']), null);
  assert.throws(() => create(['back-room']), /valid modules/);
  assert.throws(() => engine.create({ seed: 's', matchId: 'm', options: { modules: ['grand-market'] } }), /valid modules/);
  assert.deepEqual(create(['back-room', 'grand-market']).modules, ['grand-market', 'back-room']);
});

test('base v0.3 keeps the two-copy market and has no deck, reserve or Scout', () => {
  const state = council(create([]));
  assert.deepEqual(state.modules, []);
  assert.equal(state.deck, undefined);
  assert.equal(state.players.jon.reserve, undefined);
  assert.equal(state.market.length, 6);
  assert.ok(state.market.every(stack => stack.remaining === 2));
  assert.equal(legalActions(state, state.activePlayer).some(action => action.type === 'scout'), false);
  assert.throws(() => take(state, 'scout'), error => error.code === 'INVALID_ACTION');
  const view = engine.project(state, { role: 'player', playerId: 'jon' });
  assert.deepEqual(view.modules, []);
  assert.equal(view.deckCount, undefined);
  assert.equal(view.players.jon.reserve, undefined);
});

test('base v0.3 includes winner-pays and Rebuild, but no sponsors or Festival influence; duplicates stay legal', () => {
  const contested = council(create([]), { choiceId: 'small-shop-supremacy', bid: 1 }, { choiceId: 'honest-wages', bid: 2 });
  assert.deepEqual([contested.players.jon.influence, contested.players.lydia.influence], [2, 0]);
  assert.equal(contested.sponsors, undefined);
  const seat = contested.activePlayer;
  contested.players[seat].coins = 20;
  contested.players[seat].city = cityOf(['tea-stall']);
  // Rebuild onto the Tea Stall, and building a second Tea Stall is still allowed.
  const quote = buildQuote(contested, seat, 'corner-shop', 0);
  assert.equal(quote.allowed, true);
  assert.equal(quote.rebuild.replacedDesignId, 'tea-stall');
  assert.equal(buildQuote(contested, seat, 'tea-stall', 1).allowed, true);
  const rebuilt = take(contested, 'build', { designId: 'corner-shop', row: 0, col: 0 });
  assert.equal(rebuilt.players[seat].city[0].designId, 'corner-shop');
  const festive = clone(contested);
  festive.players[seat].influence = 1;
  assert.equal(take(festive, 'festival').players[seat].influence, 1);
});

test('v0.3 trailing Chair: from session 2 the player who is behind chairs; equal scores keep the schedule', () => {
  let state = create([]);
  assert.equal(state.chair, 'jon');
  state = council(state);
  // Give Lydia a lead before session 2 opens; Jon is behind, so Jon chairs.
  while (state.session === 1) state = take(state, 'work');
  assert.equal(state.chair, state.players.jon.score.total < state.players.lydia.score.total ? 'jon' : state.chairSchedule[1]);
  const scripted = clone(council(create([])));
  scripted.players.lydia.score.festivals = 5;
  let advanced = scripted;
  while (advanced.session === 1) advanced = take(advanced, 'work');
  assert.equal(advanced.chair, 'jon', 'the player who is behind chairs');
  assert.equal(advanced.chairSchedule[1], 'jon');
  assert.equal(engine.project(advanced, { role: 'host' }).chair, 'jon');
  // v0.2 keeps its fixed schedule.
  const v02 = clone(council(engine.create({ seed: 'modules-seed', matchId: 'm', options: { firstChair: 'jon', agenda: clone(OPENING_AGENDA) } })));
  v02.players.jon.score.festivals = 5;
  let v02Next = v02;
  while (v02Next.session === 1) v02Next = take(v02Next, 'work');
  assert.equal(v02Next.chair, 'lydia');
});

test('Grand Market adds sponsors and Festival influence', () => {
  const state = council(create([MODULES.GRAND_MARKET]), { choiceId: 'small-shop-supremacy', bid: 1 }, { choiceId: 'honest-wages', bid: 2 });
  assert.deepEqual(state.sponsors, { economy: 'lydia', civic: null });
  const seat = state.activePlayer;
  state.players[seat].coins = 10;
  state.players[seat].influence = 1;
  assert.equal(take(state, 'festival').players[seat].influence, 2);
});

test('the Culture Festival comes with Grand Market', () => {
  for (const modules of COMBINATIONS) {
    const state = council(create(modules));
    const seat = state.activePlayer;
    state.players[seat].city = cityOf(['pocket-theatre']);
    const culture = features(state).cultureFestival;
    assert.equal(culture, modules.includes(MODULES.GRAND_MARKET));
    // Classic: 3 + icon bonus = 4. Culture: 2 + 1 Culture building = 3.
    assert.equal(festivalPoints(state, seat), culture ? 3 : 4);
  }
});

test('Grand Market without Back-Room Deals has no reserve, no Scout and no Scout designs', () => {
  let state = council(create([MODULES.GRAND_MARKET]));
  assert.equal(state.players.jon.reserve, undefined);
  assert.ok(state.termDecks.flat().every(designId => byId.get(designId).ability?.type !== 'scoutOnBuild'));
  assert.equal(legalActions(state, state.activePlayer).some(action => action.type === 'scout'), false);
  const view = engine.project(state, { role: 'host' });
  assert.equal(view.players.jon.reserve, undefined);
  assert.equal(typeof view.deckCount, 'number');
});

test('random matches finish for every module combination without duplicate cards or invalid resources', () => {
  for (const modules of COMBINATIONS) {
    for (let seed = 0; seed < 12; seed += 1) {
      let state = engine.create({ seed: `combo-${modules.join('+')}-${seed}`, matchId: `m${seed}`, options: { rulesVersion: RULES_V03, modules } });
      let pick = seed + 7;
      while (state.phase === 'playing') {
        const seat = state.stage === 'council'
          ? ['jon', 'lydia'].find(id => state.council.commitments[id] === null)
          : state.activePlayer;
        const options = legalActions(state, seat);
        pick = (pick * 1103515245 + 12345) % 2147483648;
        state = engine.apply(state, seat, options[pick % options.length]);
        assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
        for (const id of ['jon', 'lydia']) {
          const player = state.players[id];
          assert.ok(player.coins >= 0 && player.influence >= 0 && player.influence <= 6);
          if (features(state).grandMarket) {
            const own = player.city.filter(Boolean).map(card => card.designId);
            assert.equal(new Set(own).size, own.length);
          }
        }
      }
      assert.ok(['jon', 'lydia', 'tie'].includes(state.result.winner));
    }
  }
});
