import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, applyAction, legalActions, previewForecast, describeForecast,
  scoreFor, upcomingForecasts, roundStarter, SECOND_PLAYER_BONUS, SIZE, BAG_CAPACITY, ACTIONS_PER_TURN,
} from './engine.mjs';

const tileAt = (state, row, col) => state.tiles.find(tile => tile.row === row && tile.col === col);
const endRound = state => applyAction(applyAction(state, state.activePlayer, { type: 'end' }), state.activePlayer === 'jon' ? 'lydia' : 'jon', { type: 'end' });
const crumbsInWorld = state => state.tiles.reduce((sum, tile) => sum + tile.crumbs, 0)
  + Object.values(state.players).reduce((sum, player) => sum + player.carried + player.banked, 0);

function assertInvariants(state) {
  assert.equal(state.tiles.length, SIZE * SIZE);
  assert.equal(new Set(state.tiles.map(tile => tile.id)).size, SIZE * SIZE);
  assert.equal(new Set(state.tiles.map(tile => `${tile.row},${tile.col}`)).size, SIZE * SIZE);
  for (const tile of state.tiles) {
    assert.ok(tile.row >= 0 && tile.row < SIZE && tile.col >= 0 && tile.col < SIZE);
    assert.ok(Number.isInteger(tile.crumbs) && tile.crumbs >= 0);
  }
  for (const player of Object.values(state.players)) {
    assert.ok(player.row >= 0 && player.row < SIZE && player.col >= 0 && player.col < SIZE);
    assert.ok(player.carried >= 0 && player.carried <= BAG_CAPACITY);
    assert.ok(player.banked >= 0);
    assert.ok(Number.isInteger(player.bonusPoints || 0) && (player.bonusPoints || 0) >= 0);
    assert.ok(Number.isInteger(player.openingBonus || 0) && (player.openingBonus || 0) >= 0);
    assert.ok(player.lures >= 0 && player.lures <= 2);
  }
  if (state.phase === 'playing') {
    assert.ok(state.actionsLeft > 0 && state.actionsLeft <= ACTIONS_PER_TURN);
    assert.ok(legalActions(state, state.activePlayer).some(action => action.type === 'end'));
  }
}

test('new games are deterministic, symmetric, and immediately forecast a swipe', () => {
  const state = createGame({ seed: 'Lala' });
  assert.deepEqual(state, createGame({ seed: 'Lala' }));
  assert.notDeepEqual(state.tiles, createGame({ seed: 'Another Lala' }).tiles);
  assert.equal(state.forecast.type, 'swipe');
  assert.equal(state.version, 3);
  assert.equal(scoreFor(state.players[state.firstPlayer]), 0);
  assert.equal(state.activePlayer, state.firstPlayer);
  assert.equal(scoreFor(state.players[state.firstPlayer === 'jon' ? 'lydia' : 'jon']), SECOND_PLAYER_BONUS);
  assert.equal(crumbsInWorld(state), 27);
  for (const tile of state.tiles) assert.equal(tile.crumbs, tileAt(state, 4 - tile.row, 4 - tile.col).crumbs);
  assert.equal(tileAt(state, 4, 0).crumbs, 0);
  assert.equal(tileAt(state, 0, 4).crumbs, 0);
  assertInvariants(state);
});

test('invalid turns, directions, and impossible moves are rejected without mutation', () => {
  const state = createGame({ firstPlayer: 'jon' });
  const snapshot = structuredClone(state);
  assert.throws(() => applyAction(state, 'lydia', { type: 'move', direction: 'left' }), /Jon/);
  assert.throws(() => applyAction(state, 'jon', { type: 'move', direction: 'down' }), /edge/);
  assert.throws(() => applyAction(state, 'jon', { type: 'move', direction: '__proto__' }), /Choose up/);
  assert.throws(() => applyAction(state, 'jon', { type: 'collect' }), /no crumbs/);
  assert.throws(() => applyAction(state, 'jon', { type: 'delete' }), /not part/);
  assert.deepEqual(state, snapshot);
  assert.deepEqual(legalActions(state, 'lydia'), []);
  assert.deepEqual(legalActions(state, 'nobody'), []);
});

test('two actions auto-pass, and collection consumes one action and honours bag capacity', () => {
  const state = createGame({ firstPlayer: 'jon' });
  const moved = applyAction(state, 'jon', { type: 'move', direction: 'up' });
  assert.equal(state.players.jon.row, 4);
  assert.equal(moved.players.jon.row, 3);
  assert.equal(moved.actionsLeft, 1);
  moved.players.jon.carried = 3;
  tileAt(moved, 3, 0).crumbs = 6;
  const collected = applyAction(moved, 'jon', { type: 'collect' });
  assert.equal(collected.players.jon.carried, 5);
  assert.equal(tileAt(collected, 3, 0).crumbs, 4);
  assert.equal(collected.activePlayer, 'lydia');
  assert.equal(collected.actionsLeft, 2);
  assert.equal(collected.round, 1);
  assert.equal(collected.turnInRound, 1);
});

test('banking is restricted to your own home and protects all deposited crumbs', () => {
  const state = createGame({ firstPlayer: 'jon' });
  state.players.jon.carried = 4;
  const banked = applyAction(state, 'jon', { type: 'bank' });
  assert.equal(banked.players.jon.banked, 4);
  assert.equal(banked.players.jon.carried, 0);
  assert.equal(state.players.jon.carried, 4);
  state.players.jon.row = 3;
  assert.throws(() => applyAction(state, 'jon', { type: 'bank' }), /own burrow/);
});

test('a swipe wraps tiles, crumbs, and occupants; burrows do not move; preview is exact', () => {
  const state = createGame({ firstPlayer: 'jon' });
  state.forecast = { type: 'swipe', axis: 'row', index: 2, direction: 1 };
  state.players.jon.row = 2;
  state.players.jon.col = 4;
  state.players.lydia.row = 1;
  state.players.lydia.col = 2;
  tileAt(state, 2, 4).crumbs = 7;
  const movingTileId = tileAt(state, 2, 4).id;
  const before = structuredClone(state);
  const preview = previewForecast(state);
  assert.deepEqual(state, before);
  const next = endRound(state);
  assert.equal(next.players.jon.col, 0);
  assert.equal(next.players.jon.row, 2);
  assert.deepEqual(next.players.jon.home, { row: 4, col: 0 });
  assert.equal(tileAt(next, 2, 0).id, movingTileId);
  assert.equal(tileAt(next, 2, 0).crumbs, 7);
  assert.deepEqual(next.tiles, preview.tiles);
  for (const id of ['jon', 'lydia']) {
    assert.deepEqual({ row: next.players[id].row, col: next.players[id].col }, preview.players[id]);
  }
  assert.equal(next.round, 2);
  assert.equal(next.activePlayer, 'lydia');
  assert.equal(next.lastEvent.round, 1);
  assert.equal(crumbsInWorld(next), crumbsInWorld(state));
  assertInvariants(next);
});

test('an upward column swipe wraps the top square to the bottom', () => {
  const state = createGame({ firstPlayer: 'jon' });
  state.forecast = { type: 'swipe', axis: 'column', index: 4, direction: -1 };
  const next = endRound(state);
  assert.equal(next.players.lydia.row, 4);
  assert.equal(next.players.lydia.col, 4);
  assert.deepEqual(next.players.lydia.home, { row: 0, col: 4 });
  assertInvariants(next);
});

test('pounce catches the cross, drops carried crumbs, preserves banked points, and returns home', () => {
  const state = createGame({ firstPlayer: 'jon' });
  state.forecast = { type: 'pounce', row: 2, col: 2 };
  Object.assign(state.players.jon, { row: 2, col: 1, carried: 4, banked: 8 });
  Object.assign(state.players.lydia, { row: 1, col: 1, carried: 3, banked: 7 });
  const oldCrumbs = tileAt(state, 2, 1).crumbs;
  const preview = previewForecast(state);
  assert.deepEqual(preview.caught, ['jon']);
  assert.equal(preview.affectedCells.length, 5);
  const next = endRound(state);
  assert.equal(next.players.jon.carried, 0);
  assert.equal(next.players.jon.banked, 8);
  assert.equal(next.players.jon.row, 4);
  assert.equal(next.players.jon.col, 0);
  assert.equal(tileAt(next, 2, 1).crumbs, oldCrumbs + 4);
  assert.equal(next.players.lydia.carried, 3);
  assert.equal(next.players.lydia.row, 1);
  assert.equal(crumbsInWorld(next), crumbsInWorld(state));
});

test('both players can be caught on one square without losing any crumbs', () => {
  const state = createGame({ firstPlayer: 'jon' });
  state.forecast = { type: 'pounce', row: 2, col: 2 };
  Object.assign(state.players.jon, { row: 2, col: 2, carried: 3 });
  Object.assign(state.players.lydia, { row: 2, col: 2, carried: 4 });
  const next = endRound(state);
  assert.equal(tileAt(next, 2, 2).crumbs, 10);
  assert.deepEqual(next.lastEvent.caught, ['jon', 'lydia']);
  assert.equal(crumbsInWorld(next), crumbsInWorld(state));
});

test('toys cost one action and one charge, can counter a lure, and cannot change a pounce', () => {
  const state = createGame({ firstPlayer: 'jon' });
  state.forecast = { type: 'swipe', axis: 'row', index: 0, direction: -1 };
  const first = applyAction(state, 'jon', { type: 'lure', index: 3 });
  assert.equal(first.forecast.index, 3);
  assert.equal(first.players.jon.lures, 1);
  assert.equal(first.actionsLeft, 1);
  assert.equal(state.forecast.index, 0);
  assert.throws(() => applyAction(first, 'jon', { type: 'lure', index: 3 }), /already/);
  assert.throws(() => applyAction(first, 'jon', { type: 'lure', index: 8 }), /from 1 to 5/);
  const passed = applyAction(first, 'jon', { type: 'end' });
  const countered = applyAction(passed, 'lydia', { type: 'lure', index: 0 });
  assert.equal(countered.forecast.index, 0);
  assert.equal(countered.forecast.luredBy, 'lydia');
  countered.forecast = { type: 'pounce', row: 2, col: 2 };
  assert.throws(() => applyAction(countered, 'lydia', { type: 'lure', index: 1 }), /pounce/);
  countered.forecast = { type: 'swipe', axis: 'column', index: 3, direction: 1 };
  countered.players.lydia.lures = 0;
  assert.throws(() => applyAction(countered, 'lydia', { type: 'lure', index: 1 }), /both/);
});

test('a nap leaves the board and bags unchanged and still advances the round', () => {
  const state = createGame({ firstPlayer: 'jon' });
  state.forecast = { type: 'nap' };
  const next = endRound(state);
  assert.deepEqual(next.tiles, state.tiles);
  assert.deepEqual(next.players, state.players);
  assert.equal(next.round, 2);
  assert.equal(previewForecast(state).affectedCells.length, 0);
});

test('the final round resolves Lala, excludes carried crumbs from score, and blocks extra moves', () => {
  const state = createGame({ maxRounds: 1, firstPlayer: 'jon' });
  state.players.jon.banked = 5;
  state.players.lydia.banked = 3;
  state.players.lydia.carried = 5;
  const next = endRound(state);
  assert.equal(next.phase, 'finished');
  assert.equal(next.activePlayer, null);
  assert.equal(next.actionsLeft, 0);
  assert.equal(next.forecast, null);
  assert.equal(next.winner, 'jon');
  assert.equal(next.lastEvent.round, 1);
  assert.deepEqual(legalActions(next, 'jon'), []);
  assert.throws(() => applyAction(next, 'jon', { type: 'end' }), /finished/);
  const tied = createGame({ maxRounds: 1, firstPlayer: 'jon' });
  tied.players.jon.banked = 3;
  tied.players.lydia.banked = 2;
  tied.players.jon.carried = 4;
  assert.equal(endRound(tied).winner, 'tie');
});

test('64 complete seeded games preserve resources and valid positions without stalling', () => {
  for (let seed = 0; seed < 64; seed++) {
    let state = createGame({ seed: `test-${seed}` });
    const total = crumbsInWorld(state);
    let turns = 0;
    while (state.phase === 'playing') {
      const actions = legalActions(state, state.activePlayer);
      const bank = actions.find(action => action.type === 'bank');
      const collect = actions.find(action => action.type === 'collect');
      const preferred = actions.filter(action => action.type === 'move' || action.type === 'lure');
      const selected = bank || collect || preferred[(seed * 7 + turns * 11) % preferred.length] || { type: 'end' };
      const before = JSON.stringify(state);
      const next = applyAction(state, state.activePlayer, selected);
      assert.equal(JSON.stringify(state), before);
      state = next;
      turns++;
      assertInvariants(state);
      assert.equal(crumbsInWorld(state), total);
      assert.ok(turns <= 40);
    }
    assert.equal(state.round, 10);
    assert.ok(['jon', 'lydia', 'tie'].includes(state.winner));
  }
});

test('helpers handle finished previews and validate creation options', () => {
  assert.throws(() => createGame({ maxRounds: 0 }), /between/);
  assert.throws(() => createGame({ maxRounds: 21 }), /between/);
  assert.throws(() => createGame({ seed: {} }), /word or number/);
  assert.equal(createGame({ seed: '' }).seed, 'a-little-living-room');
  const finished = endRound(createGame({ maxRounds: 1, firstPlayer: 'jon' }));
  const preview = previewForecast(finished);
  assert.deepEqual(preview.affectedCells, []);
  assert.deepEqual(preview.tiles, finished.tiles);
  assert.match(describeForecast(null), /finished/);
});

test('banking creates separate full-bag bonus points and replenishes one toy only at the threshold', () => {
  for (const carried of [1, 2, 3, 4, 5]) {
    for (const toys of [0, 1, 2]) {
      const state = createGame({ firstPlayer: 'jon' });
      Object.assign(state.players.jon, { carried, lures: toys });
      const total = crumbsInWorld(state);
      const next = applyAction(state, 'jon', { type: 'bank' });
      assert.equal(next.players.jon.banked, carried);
      assert.equal(next.players.jon.carried, 0);
      assert.equal(next.players.jon.bonusPoints, carried === 5 ? 2 : 0);
      assert.equal(next.players.jon.lures, Math.min(2, toys + (carried >= 3 ? 1 : 0)));
      assert.equal(scoreFor(next.players.jon), carried + (carried === 5 ? 2 : 0));
      assert.equal(crumbsInWorld(next), total, 'bonus points must not create physical crumbs');
      assert.equal(next.actionsLeft, 1);
      assert.throws(() => applyAction(next, 'jon', { type: 'bank' }), /Collect some crumbs/);
    }
  }
});

test('full-bag bonuses accumulate only on deliveries and decide victory and ties', () => {
  let state = createGame({ maxRounds: 1, firstPlayer: 'jon' });
  state.players.jon.carried = 5;
  state.players.lydia.banked = 5;
  state = applyAction(state, 'jon', { type: 'bank' });
  const finished = endRound(state);
  assert.equal(finished.players.jon.banked, 5);
  assert.equal(finished.players.jon.bonusPoints, 2);
  assert.equal(scoreFor(finished.players.jon), 7);
  assert.equal(finished.winner, 'jon', 'five secured crumbs plus the delivery bonus beats six total points');
  const tied = structuredClone(state);
  tied.players.lydia.banked = 6;
  assert.equal(endRound(tied).winner, 'tie');

  const anotherDelivery = structuredClone(state);
  anotherDelivery.players.jon.carried = 5;
  const twiceBanked = applyAction(anotherDelivery, 'jon', { type: 'bank' });
  assert.equal(twiceBanked.players.jon.banked, 10);
  assert.equal(twiceBanked.players.jon.bonusPoints, 4);
  assert.equal(scoreFor(twiceBanked.players.jon), 14);
  assert.equal(scoreFor({ banked: 3 }), 3, 'old player records have no bonus field');
});

test('strategic toys can change axis, line, or direction and all enumerated choices are legal', () => {
  const state = createGame({ firstPlayer: 'jon' });
  state.forecast = { type: 'swipe', axis: 'row', index: 2, direction: 1 };
  const actions = legalActions(state, 'jon').filter(action => action.type === 'lure');
  assert.equal(actions.length, 19);
  assert.equal(new Set(actions.map(action => `${action.axis}:${action.index}:${action.direction}`)).size, 19);
  assert.ok(!actions.some(action => action.axis === 'row' && action.index === 2 && action.direction === 1));
  for (const action of actions) {
    const next = applyAction(state, 'jon', action);
    assert.deepEqual(next.forecast, { ...action, type: 'swipe', luredBy: 'jon' });
    assert.equal(next.players.jon.lures, 1);
    assert.equal(next.actionsLeft, 1);
    assert.equal(crumbsInWorld(next), crumbsInWorld(state));
  }
  const reversed = applyAction(state, 'jon', { type: 'lure', index: 2, direction: -1 });
  assert.equal(reversed.forecast.axis, 'row');
  assert.equal(reversed.forecast.direction, -1);
  const legacyPayload = applyAction(state, 'jon', { type: 'lure', index: 1 });
  assert.equal(legacyPayload.forecast.axis, 'row');
  assert.equal(legacyPayload.forecast.direction, 1);
  assert.equal(state.forecast.index, 2, 'lures do not mutate the input');
});

test('toy validation rejects malformed steering without mutating state', () => {
  const state = createGame({ firstPlayer: 'jon' });
  state.forecast = { type: 'swipe', axis: 'row', index: 2, direction: 1 };
  const before = structuredClone(state);
  for (const axis of ['diagonal', '', null, false, 1]) {
    assert.throws(() => applyAction(state, 'jon', { type: 'lure', axis, index: 1, direction: 1 }), /row or a column/);
  }
  for (const direction of [0, 2, '1', '-1', null, false]) {
    assert.throws(() => applyAction(state, 'jon', { type: 'lure', axis: 'column', index: 1, direction }), /two swipe directions/);
  }
  for (const index of [-1, 5, 1.5, '1', null]) {
    assert.throws(() => applyAction(state, 'jon', { type: 'lure', axis: 'column', index, direction: 1 }), /from 1 to 5/);
  }
  assert.throws(() => applyAction(state, 'jon', { type: 'lure', axis: 'row', index: 2, direction: 1 }), /already/);
  assert.deepEqual(state, before);
});

test('classic room states retain old banking, toys, and victory rules through match completion', () => {
  const state = createGame({ maxRounds: 1, firstPlayer: 'jon' });
  state.version = 1;
  delete state.firstPlayer;
  for (const player of Object.values(state.players)) { delete player.bonusPoints; delete player.openingBonus; }
  state.forecast = { type: 'swipe', axis: 'row', index: 2, direction: 1 };
  Object.assign(state.players.jon, { carried: 5, lures: 1 });
  state.players.lydia.banked = 6;
  const banked = applyAction(state, 'jon', { type: 'bank' });
  assert.equal(banked.version, 1);
  assert.equal(banked.players.jon.lures, 1);
  assert.equal(banked.players.jon.bonusPoints, undefined);
  assert.equal(scoreFor(banked.players.jon), 5);
  assert.deepEqual(legalActions(banked, 'jon').filter(action => action.type === 'lure'),
    [0, 1, 3, 4].map(index => ({ type: 'lure', index })));
  assert.throws(() => applyAction(banked, 'jon', { type: 'lure', axis: 'column', index: 1, direction: 1 }), /classic match/);
  assert.throws(() => applyAction(banked, 'jon', { type: 'lure', axis: 'row', index: 1, direction: -1 }), /classic match/);
  const lured = applyAction(banked, 'jon', { type: 'lure', axis: 'row', index: 1, direction: 1 });
  assert.equal(lured.players.jon.lures, 0);
  assert.equal(lured.forecast.index, 1);
  const finished = applyAction(lured, 'lydia', { type: 'end' });
  assert.equal(finished.winner, 'lydia');
  assert.equal(finished.players.jon.bonusPoints, undefined);
});

test('lookahead is deterministic, untouched by current lures, and matches subsequent resolution', () => {
  let state = createGame({ seed: 'planning-ahead', maxRounds: 4, firstPlayer: 'jon' });
  const before = structuredClone(state);
  const upcoming = upcomingForecasts(state, 2);
  assert.equal(upcoming.length, 2);
  assert.deepEqual(upcoming.map(forecast => forecast.round), [2, 3]);
  assert.equal(upcoming[1].type, 'pounce');
  assert.deepEqual(upcomingForecasts(state), [upcoming[0]]);
  assert.deepEqual(state, before);
  const lure = legalActions(state, 'jon').find(action => action.type === 'lure');
  const lured = applyAction(state, 'jon', lure);
  assert.deepEqual(upcomingForecasts(lured, 2), upcoming);
  state = endRound(lured);
  assert.deepEqual({ round: state.round, ...state.forecast }, upcoming[0]);
  state = endRound(state);
  assert.deepEqual({ round: state.round, ...state.forecast }, upcoming[1]);
  assert.equal(upcomingForecasts(state, 2).length, 1);
  state = endRound(state);
  assert.deepEqual(upcomingForecasts(state, 2), []);
  assert.deepEqual(upcomingForecasts(endRound(state)), []);
  assert.throws(() => upcomingForecasts(before, 3), /two future rounds/);
  assert.throws(() => upcomingForecasts(before, 1.5), /two future rounds/);
});

test('the starter alternates from either draw and both players receive consecutive turns across Lala', () => {
  for (const [firstPlayer, expected] of [
    ['jon', ['1:jon', '1:lydia', '2:lydia', '2:jon', '3:jon', '3:lydia']],
    ['lydia', ['1:lydia', '1:jon', '2:jon', '2:lydia', '3:lydia', '3:jon']],
  ]) {
    let state = createGame({ maxRounds: 3, firstPlayer });
    const order = [];
    while (state.phase === 'playing') {
      order.push(`${state.round}:${state.activePlayer}`);
      assert.equal(state.actionsLeft, 2);
      if (state.turnInRound === 0) assert.equal(roundStarter(state), state.activePlayer);
      state = applyAction(state, state.activePlayer, { type: 'end' });
    }
    assert.deepEqual(order, expected);
  }
});

test('opening draws are reproducible, select both players, and award only the second player a separate point', () => {
  const starts = { jon: 0, lydia: 0 };
  for (let index = 0; index < 256; index++) {
    const seed = `opening-${index}`;
    const state = createGame({ seed });
    assert.deepEqual(state, createGame({ seed }));
    assert.equal(state.activePlayer, state.firstPlayer);
    starts[state.firstPlayer] += 1;
    const second = state.firstPlayer === 'jon' ? 'lydia' : 'jon';
    assert.equal(state.players[state.firstPlayer].openingBonus, 0);
    assert.equal(state.players[second].openingBonus, SECOND_PLAYER_BONUS);
    assert.equal(scoreFor(state.players[second]), 1);
    assert.equal(state.players[second].banked, 0);
    assert.equal(state.players[second].bonusPoints, 0);
    assert.equal(state.players[second].carried, 0);
    assert.equal(crumbsInWorld(state), 27);
    assert.match(state.log.find(entry => entry.kind === 'opening').text,
      new RegExp(`${state.players[state.firstPlayer].name} starts.*${state.players[second].name} receives \\+1`));
  }
  // This fixed seed sample catches a broken or heavily biased choice; it is not
  // evidence that the compensation makes the overall game perfectly balanced.
  assert.ok(starts.jon >= 80 && starts.jon <= 176, JSON.stringify(starts));
  assert.ok(starts.lydia >= 80 && starts.lydia <= 176, JSON.stringify(starts));
});

test('an explicit tutorial starter changes only opening order and compensation, not the board or cat plan', () => {
  const jon = createGame({ seed: 'same-room', firstPlayer: 'jon' });
  const lydia = createGame({ seed: 'same-room', firstPlayer: 'lydia' });
  assert.equal(jon.activePlayer, 'jon');
  assert.equal(lydia.activePlayer, 'lydia');
  assert.deepEqual(jon.tiles, lydia.tiles);
  assert.deepEqual(jon.forecast, lydia.forecast);
  assert.deepEqual(upcomingForecasts(jon, 2), upcomingForecasts(lydia, 2));
  assert.equal(roundStarter(lydia, 2), 'jon');
  assert.equal(roundStarter(lydia, 3), 'lydia');
  for (const firstPlayer of ['Jon', 'nobody', '', null, false, 0, {}, ['jon']]) {
    assert.throws(() => createGame({ firstPlayer }), /Jon or Lydia as the first player/);
  }
});

test('the opening point survives pounce and never repeats when later rounds change starter', () => {
  let state = createGame({ firstPlayer: 'lydia', maxRounds: 4 });
  Object.assign(state.players.jon, { row: 2, col: 2, carried: 4, banked: 3, bonusPoints: 2 });
  state.forecast = { type: 'pounce', row: 2, col: 2 };
  const total = crumbsInWorld(state);
  state = endRound(state);
  assert.equal(state.players.jon.carried, 0);
  assert.deepEqual({ row: state.players.jon.row, col: state.players.jon.col }, state.players.jon.home);
  assert.equal(scoreFor(state.players.jon), 6);
  while (state.phase === 'playing') {
    assert.equal(state.players.jon.openingBonus, 1);
    assert.equal(state.players.lydia.openingBonus, 0);
    state = endRound(state);
  }
  assert.equal(scoreFor(state.players.jon), 6);
  assert.equal(crumbsInWorld(state), total);
});

test('opening points count for wins, ties, and full-bag scoring without becoming banked crumbs', () => {
  const state = createGame({ firstPlayer: 'lydia', maxRounds: 1 });
  assert.equal(endRound(state).winner, 'jon', 'the second player owns the one-point opening lead');
  const tied = structuredClone(state);
  tied.players.lydia.banked = 1;
  assert.equal(endRound(tied).winner, 'tie');
  const delivering = applyAction(state, 'lydia', { type: 'end' });
  delivering.players.jon.carried = 5;
  const banked = applyAction(delivering, 'jon', { type: 'bank' });
  assert.equal(banked.players.jon.banked, 5);
  assert.equal(banked.players.jon.bonusPoints, 2);
  assert.equal(banked.players.jon.openingBonus, 1);
  assert.equal(scoreFor(banked.players.jon), 8);
  assert.equal(scoreFor({ banked: 4, bonusPoints: 2 }), 6, 'v2 records have no opening point');
  assert.equal(scoreFor({ banked: 4 }), 4, 'v1 records have no score bonuses');
});

test('saved v2 matches retain Jon-first round parity, scoring, and field shape', () => {
  let state = createGame({ firstPlayer: 'jon', maxRounds: 3 });
  state.version = 2;
  delete state.firstPlayer;
  for (const player of Object.values(state.players)) delete player.openingBonus;
  state.players.jon.banked = 5;
  state.players.jon.bonusPoints = 2;
  state.players.lydia.banked = 7;
  const order = [];
  while (state.phase === 'playing') {
    order.push(`${state.round}:${state.activePlayer}`);
    state = applyAction(state, state.activePlayer, { type: 'end' });
  }
  assert.deepEqual(order, ['1:jon', '1:lydia', '2:lydia', '2:jon', '3:jon', '3:lydia']);
  assert.equal(state.winner, 'tie');
  assert.equal(state.version, 2);
  assert.equal(state.firstPlayer, undefined);
  assert.ok(Object.values(state.players).every(player => player.openingBonus === undefined));
});
