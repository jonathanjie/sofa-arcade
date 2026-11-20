import test from 'node:test';
import assert from 'node:assert/strict';
import { engine, legalActions } from '../engine.mjs';
import { buildQuote } from '../preview.mjs';
import { SEATS, other, clone, fresh, action, take, council, emptyTurns, frozen, assertRuleError, jsonError } from './helpers.mjs';

const PUBLIC_KEYS = ['schemaVersion', 'gameId', 'rulesVersion', 'matchId', 'phase', 'stage', 'phaseId', 'session', 'term', 'chair', 'chairSchedule', 'activePlayer', 'actionIndex', 'actionsRemaining', 'activeLaws', 'agenda', 'council', 'market', 'players', 'lastCouncil', 'result'].sort();
const PLAYER_KEYS = ['coins', 'influence', 'city', 'streetEvaluated', 'buildsThisSession', 'festivalUsed', 'score'].sort();
const SCORE_KEYS = ['buildings', 'streets', 'festivals', 'civic', 'treasury', 'total'].sort();
const viewFor = playerId => ({ role: 'player', playerId });

test('each role gets the exact stable shape, and public and host have no privileged commitment', () => {
  const start = fresh();
  const locked = engine.apply(start, 'jon', action(start, 'commitCouncil', { choiceId: 'honest-wages', bid: 2 }));
  for (const viewer of [{ role: 'public' }, { role: 'host' }, viewFor('jon'), viewFor('lydia')]) {
    const view = engine.project(frozen(locked), frozen(viewer));
    assert.deepEqual(Object.keys(view).sort(), PUBLIC_KEYS);
    assert.deepEqual(Object.keys(view.council).sort(), ['category', 'optionIds', 'ready', 'ownCommitment'].sort());
    assert.deepEqual(view.council.ready, { jon: true, lydia: false });
    assert.deepEqual(view.council.ownCommitment, viewer.playerId === 'jon' ? { choiceId: 'honest-wages', bid: 2 } : null);
    assert.equal(view.players.jon.influence, 2);
    assert.equal(view.players.lydia.influence, 2);
    assert.equal(view.lastCouncil, null);
    for (const seat of SEATS) {
      assert.deepEqual(Object.keys(view.players[seat]).sort(), PLAYER_KEYS);
      assert.deepEqual(Object.keys(view.players[seat].score).sort(), SCORE_KEYS);
    }
    assert.deepEqual(JSON.parse(JSON.stringify(view)), view);
  }
  assert.deepEqual(engine.project(locked, { role: 'public' }), engine.project(locked, { role: 'host' }));
});

for (const hiddenSeat of SEATS) test(`changing only ${hiddenSeat}'s sealed option/bid cannot alter TV, opponent, previews, legal actions or errors`, () => {
  const start = fresh();
  const observer = other(hiddenSeat);
  let baseline = null;
  for (const choiceId of start.council.optionIds) for (let bid = 0; bid <= 2; bid += 1) {
    const state = engine.apply(start, hiddenSeat, action(start, 'commitCouncil', { choiceId, bid }));
    const command = action(state, 'commitCouncil', { choiceId: 'keep', bid: 1 });
    const views = [engine.project(state, { role: 'public' }), engine.project(state, { role: 'host' }), engine.project(state, viewFor(observer))];
    const observations = {
      views,
      commands: legalActions(state, observer),
      rebase: engine.canRebaseAction(state, observer, command),
      quote: buildQuote(views[2], observer, 'petition-kiosk'),
      invalidActor: jsonError(() => engine.apply(state, 'outsider', command)),
      cityDuringCouncil: jsonError(() => engine.apply(state, observer, action(state, 'work'))),
      overBudget: jsonError(() => engine.apply(state, observer, { ...command, bid: 3 })),
      notOffered: jsonError(() => engine.apply(state, observer, { ...command, choiceId: 'open-tender' })),
      stale: jsonError(() => engine.apply(state, observer, { ...command, phaseId: `${state.matchId}:s2:council` })),
    };
    const serialized = JSON.stringify(observations);
    if (baseline === null) baseline = serialized;
    else assert.equal(serialized, baseline);
    assert.deepEqual(engine.project(state, viewFor(hiddenSeat)).council.ownCommitment, { choiceId, bid });
  }
});

test('readiness reveals only locking, and actual bids become public together exactly once', () => {
  const before = fresh();
  const first = engine.apply(before, 'lydia', action(before, 'commitCouncil', { choiceId: 'honest-wages', bid: 2 }));
  const publicBefore = engine.project(before, { role: 'host' });
  const publicAfter = engine.project(first, { role: 'host' });
  publicBefore.council.ready.lydia = true;
  assert.deepEqual(publicAfter, publicBefore);
  const revealed = engine.apply(first, 'jon', action(first, 'commitCouncil', { choiceId: 'keep', bid: 1 }));
  const expected = { jon: { choiceId: 'keep', bid: 1 }, lydia: { choiceId: 'honest-wages', bid: 2 } };
  for (const viewer of [{ role: 'host' }, { role: 'public' }, viewFor('jon'), viewFor('lydia')]) {
    const view = engine.project(revealed, viewer);
    assert.equal(view.council, null);
    assert.deepEqual(view.lastCouncil.choices, expected);
    assert.equal(view.players.jon.influence, 1);
    assert.equal(view.players.lydia.influence, 0);
  }
  assertRuleError(() => engine.apply(revealed, 'jon', action(before, 'commitCouncil', { choiceId: 'keep', bid: 1 })));
  assert.equal(revealed.players.jon.influence, 1);
});

test('previous reveal stays public in the next council without exposing the new commitment', () => {
  let state = council(fresh(), { choiceId: 'small-shop-supremacy', bid: 1 }, { choiceId: 'keep', bid: 0 });
  const previous = clone(state.lastCouncil);
  state = emptyTurns(state);
  const first = engine.apply(state, 'jon', action(state, 'commitCouncil', { choiceId: 'industrial-pride', bid: 1 }));
  assert.deepEqual(engine.project(first, viewFor('lydia')).lastCouncil, previous);
  assert.equal(engine.project(first, viewFor('lydia')).council.ownCommitment, null);
  const second = clone(first);
  second.council.commitments.jon = { choiceId: 'shop-local', bid: 0 };
  assert.deepEqual(engine.project(first, { role: 'host' }), engine.project(second, { role: 'host' }));
});

test('projection rebuilds all nested data and never aliases authority or spreads injected private fields', () => {
  let state = council(fresh());
  state = take(state, 'build', { designId: 'tea-stall', row: 0, col: 0 });
  const secret = 'DO_NOT_PROJECT_AUTHORITY_MARKER';
  state.private = secret;
  state.history = [{ private: secret }];
  state.players.jon.private = secret;
  state.players.lydia.city[0].private = secret;
  state.players.jon.score.private = secret;
  state.market[0].private = secret;
  state.activeLaws.private = secret;
  state.actionsRemaining.private = secret;
  state.agenda[0].private = secret;
  state.lastCouncil.private = secret;
  state.lastCouncil.choices.jon.private = secret;
  const original = clone(state);
  const projected = engine.project(state, { role: 'host' });
  assert.ok(!JSON.stringify(projected).includes(secret));
  projected.players.lydia.city[0].designId = 'lala-monument';
  projected.players.jon.score.total = 999;
  projected.market[0].remaining = 0;
  projected.agenda[0].lawIds[0] = 'fake';
  projected.chairSchedule[0] = 'fake';
  projected.actionsRemaining.jon = 0;
  projected.lastCouncil.choices.jon.bid = 999;
  assert.deepEqual(state, original);
  const a = engine.project(state, viewFor('jon'));
  const b = engine.project(state, viewFor('jon'));
  assert.notEqual(a, b);
  assert.notEqual(a.players, b.players);
  assert.notEqual(a.players.jon.city, b.players.jon.city);
});

test('viewer identity is strict and cannot be promoted by role flags, prototypes or accessors', () => {
  const state = fresh();
  const invalid = [null, undefined, {}, [], 'jon', { role: 'player' }, { role: 'player', playerId: 'other' },
    { role: 'host', playerId: 'jon' }, { role: 'public', playerId: 'jon' }, { role: 'player', playerId: 'jon', admin: true },
    { role: 'admin' }, Object.create({ role: 'player', playerId: 'jon' }), { role: 'host', [Symbol('secret')]: true }];
  let accessed = false;
  const getter = { playerId: 'jon' };
  Object.defineProperty(getter, 'role', { enumerable: true, get() { accessed = true; return 'player'; } });
  invalid.push(getter);
  for (const viewer of invalid) assertRuleError(() => engine.project(state, viewer));
  assert.equal(accessed, false);
});

test('projection masks fixed pre-bid balances and refuses pending council content masquerading as last reveal', () => {
  const state = fresh();
  state.council.commitments.jon = { choiceId: 'honest-wages', bid: 2 };
  state.players.jon.influence = 0; // Defensive projection check; valid authority never deducts early.
  state.lastCouncil = { session: 1, phaseId: state.phaseId, choices: { jon: state.council.commitments.jon, lydia: null }, adoptedLawId: 'honest-wages', category: 'economy' };
  const projected = engine.project(state, { role: 'host' });
  assert.equal(projected.players.jon.influence, 2);
  assert.equal(projected.lastCouncil, null);
  assert.equal(projected.council.ownCommitment, null);
});
