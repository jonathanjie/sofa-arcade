import test from 'node:test';
import assert from 'node:assert/strict';
import { engine, legalActions, RuleError } from '../engine.mjs';
import { clone, fresh, action, take, council, emptyTurns, toSession, frozen, assertRuleError, OPENING_AGENDA } from './helpers.mjs';

test('normalization rejects unknown keys, forged identity and every malformed shape without reading accessors', () => {
  const valid = action(fresh(), 'commitCouncil', { choiceId: 'keep', bid: 0 });
  const values = [null, undefined, 'work', 1, [], new Date(), Object.create({ ...valid }),
    { ...valid, actor: 'jon' }, { ...valid, playerId: 'lydia' }, { ...valid, viewer: { role: 'host' } },
    { ...valid, revision: 999 }, { ...valid, actionId: 'transport-owned' }, { ...valid, row: 0 },
    { ...valid, type: '__proto__' }, { ...valid, type: 'constructor' }, { ...valid, type: 'move' },
    { ...valid, type: 'work' }, { type: 'work', matchId: valid.matchId }, { ...valid, choiceId: 'economy-neutral' },
    { ...valid, choiceId: 'not-a-law' }, { ...valid, bid: '1' }, { ...valid, bid: NaN },
    { ...valid, bid: Infinity }, { ...valid, bid: null }, { ...valid, bid: true },
    { ...valid, bid: -1 }, { ...valid, bid: 0.5 }, { ...valid, bid: 4 },
  ];
  const hidden = { ...valid };
  Object.defineProperty(hidden, 'private', { value: 'secret' });
  values.push(hidden, { ...valid, [Symbol('hidden')]: 'secret' });
  let accessed = false;
  const accessor = { ...valid };
  Object.defineProperty(accessor, 'bid', { enumerable: true, get() { accessed = true; return 1; } });
  values.push(accessor);
  for (const invalid of values) assertRuleError(() => engine.normalizeAction(invalid));
  assert.equal(accessed, false);
});

test('match and phase IDs require bounded canonical syntax and cannot carry old or future turns', () => {
  const state = fresh();
  const valid = action(state, 'commitCouncil', { choiceId: 'keep', bid: 0 });
  for (const phaseId of ['', null, 7, 'old', `${state.matchId}:s0:council`, `${state.matchId}:s7:council`, `${state.matchId}:s1:action:6`, `${state.matchId}:s01:council`, `${state.matchId}:s1:action:-1`, `${state.matchId}:s1:action:0.0`, `${state.matchId}:s1:finished`, 'other:s1:council', `${state.phaseId}\n`]) {
    assertRuleError(() => engine.normalizeAction({ ...valid, phaseId }));
  }
  for (const matchId of ['', null, 1, 'has spaces', 'with:colon', '../traversal', 'x'.repeat(129), 'weird\u0000id']) {
    assertRuleError(() => engine.normalizeAction({ ...valid, matchId }));
  }
  for (const phaseId of [`${state.matchId}:s2:council`, `${state.matchId}:s1:action:0`]) {
    assertRuleError(() => engine.apply(state, 'jon', { ...valid, phaseId }));
  }
  assertRuleError(() => engine.apply(state, 'jon', { ...valid, matchId: 'other', phaseId: 'other:s1:council' }));
});

test('action identity is stable across key order and separates every meaningful field', () => {
  const state = fresh();
  const a = action(state, 'commitCouncil', { choiceId: 'keep', bid: 0 });
  const reordered = { bid: -0, choiceId: 'keep', phaseId: a.phaseId, matchId: a.matchId, type: a.type };
  assert.deepEqual(engine.normalizeAction(a), engine.normalizeAction(reordered));
  assert.equal(engine.actionKey(a), engine.actionKey(reordered));
  const variants = [a, { ...a, bid: 1 }, { ...a, choiceId: 'honest-wages' }, { ...a, phaseId: `${state.matchId}:s2:council` }, { ...a, matchId: 'different', phaseId: 'different:s1:council' }];
  assert.equal(new Set(variants.map(engine.actionKey)).size, variants.length);
  const build = { type: 'build', matchId: state.matchId, phaseId: `${state.matchId}:s1:action:0`, designId: 'tea-stall', row: 0, col: 0 };
  const buildVariants = [build, { ...build, row: 1 }, { ...build, col: 1 }, { ...build, designId: 'corner-shop' }, { ...build, phaseId: `${state.matchId}:s1:action:2` }];
  assert.equal(new Set(buildVariants.map(engine.actionKey)).size, buildVariants.length);
  const simple = ['work', 'lobby', 'festival'].map(type => ({ type, matchId: state.matchId, phaseId: build.phaseId }));
  assert.equal(new Set(simple.map(engine.actionKey)).size, 3);
  assert.deepEqual(engine.normalizeAction(frozen(a)), a);
});

test('invalid plot, unavailable bill/building, funds, stage and actor errors leave authority untouched', () => {
  const start = fresh();
  for (const seat of [null, undefined, 'host', 'public', 'intruder', { playerId: 'jon' }]) {
    assertRuleError(() => engine.apply(start, seat, action(start, 'commitCouncil', { choiceId: 'keep', bid: 0 })));
  }
  assertRuleError(() => engine.apply(start, 'jon', action(start, 'work')));
  assertRuleError(() => engine.apply(start, 'jon', action(start, 'commitCouncil', { choiceId: 'open-tender', bid: 0 })));
  assertRuleError(() => engine.apply(start, 'jon', action(start, 'commitCouncil', { choiceId: 'keep', bid: 3 })));
  let state = council(start);
  state.players.lydia.coins = 0;
  const before = clone(state);
  frozen(state);
  const attempts = [
    () => take(state, 'work', {}, 'jon'),
    () => take(state, 'commitCouncil', { choiceId: 'keep', bid: 0 }),
    () => take(state, 'festival'),
    () => take(state, 'build', { designId: 'corner-shop', row: 0, col: 0 }),
    () => take(state, 'build', { designId: 'unknown', row: 0, col: 0 }),
  ];
  for (const value of [-1, 3, 0.1, '0', null, NaN, Infinity]) {
    attempts.push(() => take(state, 'build', { designId: 'tea-stall', row: value, col: 0 }));
    attempts.push(() => take(state, 'build', { designId: 'tea-stall', row: 0, col: value }));
  }
  for (const attempt of attempts) {
    assertRuleError(attempt);
    assert.deepEqual(state, before);
  }
});

test('delayed city commands are rejected on the same seat’s next turn, next session and rematch', () => {
  let state = council(fresh());
  const delayed = action(state, 'work');
  const actor = state.activePlayer;
  state = take(state, 'work');
  state = take(state, 'work');
  assert.equal(state.activePlayer, actor);
  assertRuleError(() => engine.apply(state, actor, delayed));
  assert.equal(engine.canRebaseAction(state, actor, delayed), false);
  state = emptyTurns(state, 4);
  assertRuleError(() => engine.apply(state, actor, delayed));
  const rematch = fresh({ matchId: 'fresh-match' });
  assert.notEqual(rematch.phaseId, fresh().phaseId);
  assertRuleError(() => engine.apply(rematch, actor, delayed));
});

test('rebase permits only an unsubmitted legal commitment in the exact still-open council', () => {
  const state = fresh();
  const pending = action(state, 'commitCouncil', { choiceId: 'honest-wages', bid: 2 });
  assert.equal(engine.canRebaseAction(state, 'lydia', pending), true);
  const first = engine.apply(state, 'jon', action(state, 'commitCouncil', { choiceId: 'keep', bid: 1 }));
  assert.equal(first.phaseId, state.phaseId);
  assert.equal(engine.canRebaseAction(first, 'lydia', pending), true);
  assert.equal(engine.canRebaseAction(first, 'jon', pending), false);
  assertRuleError(() => engine.apply(first, 'jon', action(first, 'commitCouncil', { choiceId: 'keep', bid: 1 })));
  const bad = [
    null, action(state, 'work'), { ...pending, bid: 3 }, { ...pending, choiceId: 'open-tender' },
    { ...pending, phaseId: `${state.matchId}:s2:council` }, { ...pending, revision: 100 },
    { ...pending, matchId: 'other', phaseId: 'other:s1:council' }, { ...pending, bid: 1.1 },
  ];
  for (const invalid of bad) assert.equal(engine.canRebaseAction(first, 'lydia', invalid), false);
  for (const actor of ['host', 'spectator', null]) assert.equal(engine.canRebaseAction(first, actor, pending), false);
  const budgetChanged = clone(first);
  budgetChanged.players.lydia.influence = 6;
  assert.equal(engine.canRebaseAction(budgetChanged, 'lydia', pending), false);
  const revealed = engine.apply(first, 'lydia', pending);
  assert.equal(engine.canRebaseAction(revealed, 'lydia', pending), false);
  assertRuleError(() => engine.apply(revealed, 'lydia', pending));
  for (const allowed of legalActions(revealed, revealed.activePlayer)) assert.equal(engine.canRebaseAction(revealed, revealed.activePlayer, allowed), false);
  const later = toSession(2);
  assert.equal(engine.canRebaseAction(later, 'lydia', pending), false);
});

test('fixed council budgets include zero through six with strict 0–3 integer bids', () => {
  for (let budget = 0; budget <= 6; budget += 1) {
    const state = fresh();
    state.players.jon.influence = budget;
    state.council.budgets.jon = budget;
    for (let bid = 0; bid <= 3; bid += 1) {
      const command = action(state, 'commitCouncil', { choiceId: 'keep', bid });
      assert.equal(engine.canRebaseAction(state, 'jon', command), bid <= budget);
      if (bid <= budget) {
        const locked = engine.apply(state, 'jon', command);
        assert.equal(locked.players.jon.influence, budget);
        const revealed = engine.apply(locked, 'lydia', action(locked, 'commitCouncil', { choiceId: 'keep', bid: 0 }));
        assert.equal(revealed.players.jon.influence, budget - bid);
      } else assertRuleError(() => engine.apply(state, 'jon', command));
    }
  }
});

test('setup rejects absent identity, unknown options, illegal Chairs and incomplete or repeated agendas', () => {
  const valid = { seed: 'seed', matchId: 'match', options: { firstChair: 'jon', agenda: clone(OPENING_AGENDA) } };
  const repeated = clone(valid); repeated.options.agenda[0].lawIds[1] = repeated.options.agenda[0].lawIds[0];
  const wrongCategory = clone(valid); wrongCategory.options.agenda[0].category = 'civic';
  const wrongLaw = clone(valid); wrongLaw.options.agenda[0].lawIds[0] = 'shop-local';
  const shuffledSessions = clone(valid); [shuffledSessions.options.agenda[0], shuffledSessions.options.agenda[1]] = [shuffledSessions.options.agenda[1], shuffledSessions.options.agenda[0]];
  const incomplete = clone(valid); incomplete.options.agenda.pop();
  for (const input of [null, {}, { seed: 'seed' }, { matchId: 'match' }, { ...valid, seed: '' }, { ...valid, seed: 5 }, { ...valid, seed: 'x'.repeat(257) }, { ...valid, options: null }, { ...valid, options: { firstChair: 'Lala' } }, { ...valid, options: { coins: 100 } }, { ...valid, phase: 'finished' }, repeated, wrongCategory, wrongLaw, shuffledSessions, incomplete]) {
    assertRuleError(() => engine.create(input));
  }
  const original = clone(valid);
  engine.create(frozen(valid));
  assert.deepEqual(valid, original);
  assert.ok(new RuleError('TEST_CODE', 'A safe message.') instanceof Error);
});
