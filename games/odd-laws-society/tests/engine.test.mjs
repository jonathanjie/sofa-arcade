import test from 'node:test';
import assert from 'node:assert/strict';
import { engine, chairForSession, legalActions } from '../engine.mjs';
import { BUILDINGS } from '../catalog.mjs';
import { buildQuote } from '../preview.mjs';
import { SEATS, other, clone, fresh, take, council, emptyTurns, toSession, frozen, scenario, cityOf, assertRuleError, OPENING_AGENDA } from './helpers.mjs';

test('setup is deterministic, has no session-one income, and publishes each law exactly once', () => {
  const parameters = frozen({ seed: 'seed-a', matchId: 'match-a' });
  const state = engine.create(parameters);
  assert.deepEqual(state, engine.create(parameters));
  assert.equal(state.schemaVersion, 1);
  assert.equal(state.rulesVersion, '0.2');
  assert.equal(state.stage, 'council');
  assert.equal(state.phase, 'playing');
  assert.equal(state.session, 1);
  assert.equal(state.term, 1);
  assert.equal(state.activePlayer, null);
  assert.equal(state.actionIndex, null);
  assert.deepEqual(state.activeLaws, { economy: 'economy-neutral', civic: 'civic-neutral' });
  for (const seat of SEATS) {
    assert.equal(state.players[seat].coins, 4);
    assert.equal(state.players[seat].influence, 2);
    assert.deepEqual(state.players[seat].city, Array(9).fill(null));
    assert.deepEqual(state.players[seat].streetEvaluated, [false, false, false]);
    assert.equal(state.players[seat].score.buildings + state.players[seat].score.streets + state.players[seat].score.festivals + state.players[seat].score.civic, 0);
  }
  assert.equal(new Set(state.agenda.flatMap(entry => entry.lawIds)).size, 12);
  assert.deepEqual(state.agenda.map(a => [a.session, a.category]), [[1, 'economy'], [2, 'civic'], [3, 'economy'], [4, 'civic'], [5, 'economy'], [6, 'civic']]);
  assert.equal(state.market.length, 6);
  assert.ok(state.market.every(stack => stack.remaining === 2));
  assert.deepEqual(state, JSON.parse(JSON.stringify(state)));
});

test('worked PRD opening: simultaneous all-pay council, exact construction and session-two accounts', () => {
  let state = fresh();
  state = council(state, { choiceId: 'small-shop-supremacy', bid: 1 }, { choiceId: 'honest-wages', bid: 0 });
  assert.equal(state.activePlayer, 'lydia');
  assert.equal(state.players.jon.influence, 1);
  assert.equal(state.players.lydia.influence, 2);
  assert.equal(state.activeLaws.economy, 'small-shop-supremacy');
  state = take(state, 'build', { designId: 'corner-shop', row: 0, col: 0 });
  state = take(state, 'build', { designId: 'corner-shop', row: 0, col: 0 });
  assert.equal(state.players.jon.coins, 3);
  assert.equal(state.players.lydia.coins, 3);
  state = take(state, 'build', { designId: 'pocket-theatre', row: 0, col: 1 });
  state = take(state, 'build', { designId: 'button-workshop', row: 0, col: 1 });
  assert.equal(state.players.jon.coins, 0);
  assert.equal(state.players.lydia.coins, 0);
  state = take(state, 'work');
  state = take(state, 'work');
  assert.equal(state.session, 2);
  assert.equal(state.chair, 'lydia');
  assert.equal(state.stage, 'council');
  assert.equal(state.players.jon.coins, 7);
  assert.equal(state.players.lydia.coins, 7);
  assert.equal(state.players.jon.influence, 2);
  assert.equal(state.players.lydia.influence, 3);
  for (const seat of SEATS) {
    assert.equal(state.players[seat].score.buildings, 3);
    assert.equal(state.players[seat].score.civic, 0);
    assert.equal(state.players[seat].buildsThisSession, 0);
    assert.equal(state.players[seat].festivalUsed, false);
  }
  assert.equal(council(state).activePlayer, 'jon');
});

for (const firstChair of SEATS) test(`six sessions have exact term-aware Chair/action parity (${firstChair} starts Chair)`, () => {
  let state = fresh({ options: { firstChair, agenda: clone(OPENING_AGENDA) } });
  const second = other(firstChair);
  const chairs = [firstChair, second, second, firstChair, firstChair, second];
  assert.deepEqual(state.chairSchedule, chairs);
  const counts = { jon: 0, lydia: 0 };
  const phases = new Set([state.phaseId]);
  for (let session = 1; session <= 6; session += 1) {
    assert.equal(state.session, session);
    assert.equal(state.term, Math.ceil(session / 2));
    assert.equal(chairForSession(state), chairs[session - 1]);
    assert.equal(state.chair, chairs[session - 1]);
    assert.deepEqual(state.actionsRemaining, { jon: 3, lydia: 3 });
    const oldPhase = state.phaseId;
    state = council(state);
    for (let index = 0; index < 6; index += 1) {
      const seat = index % 2 === 0 ? other(chairs[session - 1]) : chairs[session - 1];
      assert.equal(state.activePlayer, seat);
      assert.equal(state.actionIndex, index);
      assert.equal(state.phaseId, `${state.matchId}:s${session}:action:${index}`);
      assert.ok(!phases.has(state.phaseId));
      phases.add(state.phaseId);
      counts[seat] += 1;
      state = take(state, 'work');
    }
    assert.notEqual(state.phaseId, oldPhase);
    assert.ok(!phases.has(state.phaseId));
    phases.add(state.phaseId);
  }
  assert.deepEqual(counts, { jon: 18, lydia: 18 });
  assert.equal(phases.size, 43);
  assert.equal(state.phase, 'finished');
  assert.equal(state.stage, 'finished');
  assert.equal(state.session, 6);
  assert.equal(state.activePlayer, null);
  assert.equal(state.actionIndex, null);
  assert.deepEqual(state.actionsRemaining, { jon: 0, lydia: 0 });
  assert.deepEqual(state.result, { winner: 'tie', scores: { jon: 4, lydia: 4 } });
  for (const seat of SEATS) {
    assert.equal(state.players[seat].coins, 73); // 4 initial + five 3-coin incomes + eighteen 3-coin Works.
    assert.equal(state.players[seat].influence, 6);
  }
  assertRuleError(() => take(state, 'work', {}, 'jon'));
});

test('no-Work resource baseline is 19 coins and influence caps at six across a full match', () => {
  let state = fresh();
  while (state.phase === 'playing') state = state.stage === 'council' ? council(state) : take(state, 'lobby');
  for (const seat of SEATS) {
    assert.equal(state.players[seat].coins, 19);
    assert.equal(state.players[seat].influence, 6);
  }
});

test('all initial bids/choices are all-pay, Chair breaks ties, and arrival order cannot affect outcome', () => {
  const start = fresh();
  const options = [...start.council.optionIds];
  for (const jonChoice of options) for (const lydiaChoice of options) for (let jonBid = 0; jonBid <= 2; jonBid += 1) for (let lydiaBid = 0; lydiaBid <= 2; lydiaBid += 1) {
    const jon = { choiceId: jonChoice, bid: jonBid }, lydia = { choiceId: lydiaChoice, bid: lydiaBid };
    const left = council(start, jon, lydia, ['jon', 'lydia']);
    const right = council(start, jon, lydia, ['lydia', 'jon']);
    assert.deepEqual(left, right);
    assert.equal(left.players.jon.influence, 2 - jonBid);
    assert.equal(left.players.lydia.influence, 2 - lydiaBid);
    const winnerChoice = jonBid >= lydiaBid ? jonChoice : lydiaChoice;
    assert.equal(left.activeLaws.economy, winnerChoice === 'keep' ? 'economy-neutral' : winnerChoice);
    assert.equal(left.activeLaws.civic, 'civic-neutral');
    assert.deepEqual(left.lastCouncil.choices, { jon, lydia });
    assert.equal(left.council, null);
    assert.equal(left.activePlayer, 'lydia');
  }
});

test('later three-influence bids are spent for identical choices and Keep changes only its own slot', () => {
  let state = toSession(2);
  state.activeLaws.economy = 'honest-wages';
  const budgets = { jon: state.players.jon.influence, lydia: state.players.lydia.influence };
  state = council(state, { choiceId: 'shop-local', bid: 3 }, { choiceId: 'shop-local', bid: 3 });
  assert.equal(state.activeLaws.economy, 'honest-wages');
  assert.equal(state.activeLaws.civic, 'shop-local');
  for (const seat of SEATS) assert.equal(state.players[seat].influence, budgets[seat] - 3);
  state = emptyTurns(state);
  state = council(state);
  assert.deepEqual(state.activeLaws, { economy: 'honest-wages', civic: 'shop-local' });
});

test('finite public term stock permits duplicates with unique instances, never a third copy or early landmark', () => {
  let state = council(fresh(), { choiceId: 'small-shop-supremacy', bid: 0 });
  state = take(state, 'build', { designId: 'tea-stall', row: 0, col: 0 });
  state = take(state, 'work');
  state = take(state, 'build', { designId: 'tea-stall', row: 0, col: 1 });
  state = take(state, 'work');
  assert.equal(state.market.find(s => s.designId === 'tea-stall').remaining, 0);
  const cards = state.players.lydia.city.filter(Boolean);
  assert.equal(new Set(cards.map(c => c.instanceId)).size, 2);
  assert.equal(state.players.lydia.score.buildings, 4);
  assertRuleError(() => take(state, 'build', { designId: 'tea-stall', row: 0, col: 2 }));
  assertRuleError(() => take(state, 'build', { designId: 'grand-bazaar', row: 0, col: 2 }));
  const firstCity = clone(state.players.lydia.city);
  state = emptyTurns(state, 2);
  assert.equal(state.market.find(s => s.designId === 'tea-stall').remaining, 0);
  state = emptyTurns(council(state));
  assert.equal(state.session, 3);
  assert.deepEqual(state.market.map(s => s.designId), ['night-market', 'clockwork-studio', 'public-library', 'debate-hall', 'concert-pavilion', 'quilt-bridge']);
  assert.ok(state.market.every(s => s.remaining === 2));
  assert.deepEqual(state.players.lydia.city, firstCity);
  state = toSession(5, state);
  assert.deepEqual(state.market.map(s => s.designId), ['grand-bazaar', 'grand-clock', 'high-court', 'observatory', 'opera-house', 'lala-monument']);
  assert.ok(state.market.every(s => s.remaining === 2));
});

test('a newly built workshop neither discounts itself nor saves the first-Build privilege', () => {
  let state = scenario();
  const before = state.players.lydia.coins;
  state = take(state, 'build', { designId: 'button-workshop', row: 0, col: 0 });
  assert.equal(state.players.lydia.coins, before - 3);
  state = take(state, 'work');
  assert.deepEqual(buildQuote(state, 'lydia', 'petition-kiosk').discount, { amount: 0, sourceId: null });
  state = take(state, 'build', { designId: 'petition-kiosk', row: 0, col: 1 });
  assert.equal(state.players.lydia.coins, before - 6);
});

test('stronger law consumes first Build; duplicate workshops cannot stack or recur', () => {
  let state = scenario({ city: ['button-workshop', 'button-workshop'], economy: 'open-tender' });
  assert.deepEqual(buildQuote(state, 'lydia', 'petition-kiosk').discount, { amount: 2, sourceId: 'open-tender' });
  state = take(state, 'build', { designId: 'petition-kiosk', row: 0, col: 2 });
  state = take(state, 'work');
  assert.deepEqual(buildQuote(state, 'lydia', 'community-garden').discount, { amount: 0, sourceId: null });
  state.activeLaws.economy = 'economy-neutral';
  state.players.lydia.buildsThisSession = 0;
  assert.deepEqual(buildQuote(state, 'lydia', 'petition-kiosk').discount, { amount: 1, sourceId: 'workshop' });
});

test('established income caps at two and Honest Wages changes only Work, never income', () => {
  let state = scenario({ city: ['corner-shop', 'corner-shop', 'night-market'], economy: 'honest-wages', coins: 10 });
  const before = state.players.lydia.coins;
  state = take(state, 'work');
  assert.equal(state.players.lydia.coins, before + 4);
  state = emptyTurns(state, 5, 'lobby');
  assert.equal(state.session, 2);
  assert.equal(state.players.lydia.coins, before + 4 + 5);
  assert.equal(state.players.jon.coins, 7); // Opponent receives base income despite Honest Wages.
});

test('instant influence grants and Lobby obey exact six cap, including a zero-gain legal Lobby', () => {
  let state = scenario({ session: 3, seat: 'jon', influence: 5 });
  state = take(state, 'build', { designId: 'debate-hall', row: 0, col: 0 });
  assert.equal(state.players.jon.influence, 6);
  state = take(state, 'work');
  const phaseId = state.phaseId;
  state = take(state, 'lobby');
  assert.equal(state.players.jon.influence, 6);
  assert.notEqual(state.phaseId, phaseId);
});

test('Festival costs exactly three, cap is one bonus, once per session, and law cannot discount it', () => {
  let state = scenario({ city: ['pocket-theatre', 'pocket-theatre'], economy: 'everything-is-art', coins: 6 });
  state = take(state, 'festival');
  assert.equal(state.players.lydia.coins, 3);
  assert.equal(state.players.lydia.score.festivals, 4);
  assert.equal(state.players.lydia.festivalUsed, true);
  state = take(state, 'work');
  assertRuleError(() => take(state, 'festival'));
  state = emptyTurns(state, 4, 'lobby');
  assert.equal(state.players.lydia.festivalUsed, false);
  assert.equal(state.players.lydia.score.festivals, 4);
});

test('streets are immutable horizontal rows; same or three guilds score once, two-plus-one scores zero', () => {
  for (const [ids, nextId, points] of [
    [['corner-shop', 'tea-stall'], 'tea-stall', 2],
    [['corner-shop', 'button-workshop'], 'petition-kiosk', 2],
    [['corner-shop', 'tea-stall'], 'community-garden', 0],
  ]) {
    let state = scenario({ city: ids });
    state = take(state, 'build', { designId: nextId, row: 0, col: 2 });
    assert.equal(state.players.lydia.score.streets, points);
    assert.deepEqual(state.players.lydia.streetEvaluated, [true, false, false]);
    const cityBefore = clone(state.players.lydia.city);
    state = take(state, 'work');
    assertRuleError(() => take(state, 'build', { designId: 'petition-kiosk', row: 0, col: 0 }));
    state = take(state, 'work');
    assert.deepEqual(state.players.lydia.city, cityBefore);
    assert.equal(state.players.lydia.score.streets, points);
  }
  let state = scenario({ city: ['corner-shop', null, null, 'button-workshop'] });
  state = take(state, 'build', { designId: 'petition-kiosk', row: 2, col: 0 });
  assert.equal(state.players.lydia.score.streets, 0);
});

test('exhausted market, full city, zero coins and capped influence still allow Work', () => {
  let state = scenario({ coins: 0, influence: 6, city: Array(9).fill('community-garden') });
  for (const stack of state.market) stack.remaining = 0;
  assertRuleError(() => take(state, 'build', { designId: 'community-garden', row: 0, col: 0 }));
  assertRuleError(() => take(state, 'festival'));
  const allowed = legalActions(state, 'lydia');
  assert.ok(allowed.some(a => a.type === 'work'));
  assert.ok(allowed.some(a => a.type === 'lobby'));
  assert.ok(!allowed.some(a => a.type === 'build'));
  state = take(state, 'work');
  assert.equal(state.players.lydia.coins, 3);
});

test('Civic rewards secure after the six actions, at most ten across sessions two to six', () => {
  let state = toSession(2);
  for (const seat of SEATS) state.players[seat].city = cityOf(['petition-kiosk', 'petition-kiosk', 'public-library', 'high-court']);
  state.activeLaws.civic = 'public-service-day';
  while (state.phase === 'playing') {
    if (state.stage === 'council') state = council(state);
    else state = take(state, 'lobby');
    for (const seat of SEATS) assert.ok(state.players[seat].score.civic <= 10);
  }
  for (const seat of SEATS) assert.equal(state.players[seat].score.civic, 10);
  const result = clone(state.result);
  assertRuleError(() => take(state, 'lobby', {}, 'jon'));
  assert.deepEqual(state.result, result);
});

test('legal-action enumeration produces only accepted independent transitions and is nonmutating', () => {
  for (const state of [fresh(), scenario({ coins: 30 }), scenario({ session: 6, seat: 'jon', coins: 100 })]) {
    const before = clone(state);
    frozen(state);
    for (const seat of SEATS) for (const nextAction of legalActions(state, seat)) {
      const next = engine.apply(state, seat, frozen(nextAction));
      assert.notEqual(next, state);
      assert.deepEqual(next, JSON.parse(JSON.stringify(next)));
    }
    assert.deepEqual(state, before);
  }
});

test('seeded full-match JSON replay is deterministic and does not mutate any input snapshot', () => {
  for (let seed = 0; seed < 12; seed += 1) {
    let state = fresh({ seed: `replay-${seed}`, matchId: `replay-${seed}`, options: { firstChair: seed % 2 ? 'jon' : 'lydia' } });
    const initial = clone(state), trace = [];
    let step = 0;
    while (state.phase === 'playing') {
      const seat = state.stage === 'council' ? (state.council.commitments.jon ? 'lydia' : 'jon') : state.activePlayer;
      const candidates = legalActions(state, seat);
      assert.ok(candidates.length > 0);
      const chosen = candidates[(step * 37 + seed * 11) % candidates.length];
      const before = JSON.stringify(state);
      const next = engine.apply(frozen(state), seat, frozen(chosen));
      assert.equal(JSON.stringify(state), before);
      assert.notEqual(next, state);
      assert.deepEqual(next, JSON.parse(JSON.stringify(next)));
      trace.push({ seat, action: clone(chosen) });
      state = next;
      step += 1;
      assert.ok(step <= 48);
    }
    assert.equal(step, 48);
    let replay = initial;
    for (const item of trace) replay = engine.apply(replay, item.seat, item.action);
    assert.deepEqual(replay, state);
    for (const seat of SEATS) {
      const p = state.players[seat];
      assert.ok(p.coins >= 0 && p.influence >= 0 && p.influence <= 6);
      assert.ok(p.score.streets <= 6 && p.score.civic <= 10 && p.score.treasury <= 4);
      assert.equal(p.score.buildings, p.city.filter(Boolean).reduce((sum, card) => sum + BUILDINGS.find(b => b.id === card.designId).prestige, 0));
      assert.equal(p.score.total, p.score.buildings + p.score.streets + p.score.festivals + p.score.civic + p.score.treasury);
    }
  }
});
