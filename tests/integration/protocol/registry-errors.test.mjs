import test from 'node:test';
import assert from 'node:assert/strict';
import { engine as authority } from '../../../games/odd-laws-society/engine.mjs';
import { RuleError } from '../../../games/odd-laws-society/errors.mjs';
import { getGame } from '../../../games/catalog.mjs';
import { getGameEngine, oddLawsRoomEngine } from '../../../games/registry.mjs';
import { phaseAction } from '../fixtures/odd-laws-policy.mjs';
import { oddComponents, oddServer, ODD_GAME_ID } from './components.mjs';
import { openRoom, connectThree, closeStreams, request, command, submit,
  expectRevision, assertNoCredentials } from './harness.mjs';

function assertPublicError(response, live, code, message) {
  assert.equal(response.status, 400);
  assert.deepEqual(response.value, { error: message, code });
  assertNoCredentials(response.text, live);
  return response.text;
}

test('the server registry translates only known typed rule failures without changing authority or forwarding diagnostics', () => {
  const options = { seed: 'ws6-registry-errors', matchId: 'ws6-registry-errors', options: { firstChair: 'lydia' } };
  const state = authority.create(options);
  const before = structuredClone(state);
  const vote = phaseAction(state, 'commitCouncil', { choiceId: 'keep', bid: 1 });
  assert.equal(Object.isFrozen(oddLawsRoomEngine), true);
  for (const method of ['create', 'project', 'canRebaseAction']) assert.equal(oddLawsRoomEngine[method], authority[method]);
  assert.deepEqual(oddLawsRoomEngine.normalizeAction(vote), authority.normalizeAction(vote));
  assert.equal(oddLawsRoomEngine.actionKey(vote), authority.actionKey(vote));
  assert.deepEqual(oddLawsRoomEngine.apply(state, 'jon', vote), authority.apply(state, 'jon', vote));
  assert.deepEqual(state, before, 'the shared wrapper retains engine immutability');
  assert.equal(getGameEngine(ODD_GAME_ID), getGame(ODD_GAME_ID).status === 'playable' ? oddLawsRoomEngine : null,
    'the named server-only candidate export cannot enable a planned catalog entry');

  const invalidBid = { ...vote, bid: 4 };
  assert.throws(() => authority.normalizeAction(invalidBid), { code: 'INVALID_BID' });
  assert.throws(() => oddLawsRoomEngine.normalizeAction(invalidBid), { code: 'invalid_bid' });
  assert.throws(() => oddLawsRoomEngine.actionKey(invalidBid), { code: 'invalid_bid' });
  assert.throws(() => oddLawsRoomEngine.apply(state, 'jon', { ...vote, bid: 3 }), { code: 'invalid_bid' });

  // A throwing input is used only to probe the error boundary. It never enters
  // HTTP/SQLite, the browser, or a playable game state.
  const throwDuringValidation = error => new Proxy({}, { getPrototypeOf() { throw error; } });
  const secret = 'test-only-hidden-diagnostic';
  const typed = new RuleError('INVALID_BID', secret);
  typed.privateState = { secret };
  assert.throws(() => oddLawsRoomEngine.normalizeAction(throwDuringValidation(typed)), error => {
    assert.equal(error.code, 'invalid_bid');
    assert.equal(error.message, 'Choose a valid action for the current board.');
    assert.equal(Object.hasOwn(error, 'privateState'), false);
    assert.equal(Object.hasOwn(error, 'cause'), false);
    assert.ok(!JSON.stringify(error).includes(secret));
    return true;
  });
  const unknown = new RuleError('UNRECOGNIZED_RULE', secret);
  const impersonated = Object.assign(new Error(secret), { name: 'RuleError', code: 'INVALID_BID' });
  for (const error of [unknown, impersonated]) {
    assert.throws(() => oddLawsRoomEngine.normalizeAction(throwDuringValidation(error)), received => received === error,
      'unknown or untyped exceptions must not be promoted to an actionable public code');
  }
});

test('real room errors explain invalid bids and locked votes without revealing the other sealed choice', async t => {
  const components = await oddComponents(t);
  if (!components) return;
  assert.equal(components.engine, oddLawsRoomEngine, 'candidate acceptance uses the production registry adapter');
  const host = await oddServer(components);
  const sessions = [];
  t.after(async () => {
    for (const session of sessions) await closeStreams(session.streams);
    await host.close();
  });
  const errors = [];
  for (let variant = 0; variant < 2; variant++) {
    const live = await openRoom(host, { gameId: ODD_GAME_ID });
    const streams = await connectThree(host, live);
    sessions.push({ streams });
    const view = live.room.state;
    const hiddenVote = { choiceId: view.council.optionIds[variant], bid: variant * 2 };
    const sealed = await submit(host, live, 'jon', command(live.room, phaseAction(view, 'commitCouncil', hiddenVote)));
    assert.equal(sealed.status, 200);
    const pushed = await expectRevision(streams, sealed.value.revision);
    for (const [viewer, event] of Object.entries(pushed)) {
      assert.deepEqual(event.value.state.council.ownCommitment, viewer === 'jon' ? hiddenVote : null);
      assertNoCredentials(event.raw, live);
    }
    const rejected = {};
    for (const bid of [4, 3]) {
      // Four fails normalization; three is normalized but exceeds the real
      // player's initial fixed budget of two when the engine applies it.
      const response = await submit(host, live, 'lydia', command(sealed.value,
        phaseAction(view, 'commitCouncil', { choiceId: 'keep', bid })));
      rejected[`bid-${bid}`] = assertPublicError(response, live, 'invalid_bid',
        'Choose a whole-number bid within your available influence.');
    }
    const locked = await submit(host, live, 'jon', command(sealed.value,
      phaseAction(view, 'commitCouncil', { choiceId: 'keep', bid: 0 })));
    rejected.locked = assertPublicError(locked, live, 'already_committed', 'Your vote is already sealed for this council.');

    const malformed = await submit(host, live, 'lydia', command(sealed.value,
      { ...phaseAction(view, 'commitCouncil', { choiceId: 'keep', bid: 0 }), phaseId: `invalid-${live.tokens.jon}` }));
    rejected.unknown = assertPublicError(malformed, live, 'invalid_action', 'Choose a valid action for this game.');
    for (const viewer of ['public', 'host', 'jon', 'lydia']) {
      const read = await request(host, `/api/rooms/${live.code}`, { token: live.tokens[viewer] });
      assert.equal(read.status, 200);
      assert.equal(read.value.revision, sealed.value.revision, 'all rejected commands leave authority unchanged');
      assert.deepEqual(read.value.state, pushed[viewer === 'public' ? 'host' : viewer].value.state);
      assertNoCredentials(read.text, live);
    }
    errors.push(rejected);
  }
  assert.deepEqual(errors[0], errors[1], 'serialized errors cannot change with the other seat’s hidden vote');
  for (const route of ['/games/registry.mjs', '/games/odd-laws-society/engine.mjs']) {
    assert.equal((await request(host, route)).status, 404, 'the server adapter and authority are not browser assets');
  }
});

test('a legally reached low-coin city returns an actionable safe platform error through the real API', async t => {
  const components = await oddComponents(t);
  if (!components) return;
  const host = await oddServer(components, { chair: 'lydia' });
  const streams = {};
  t.after(async () => { await closeStreams(streams); await host.close(); });
  const live = await openRoom(host, { gameId: ODD_GAME_ID });
  Object.assign(streams, await connectThree(host, live));
  let room = live.room;
  const perform = async (playerId, action) => {
    const response = await submit(host, live, playerId, command(room, action));
    assert.equal(response.status, 200);
    room = response.value;
    const pushed = await expectRevision(streams, room.revision);
    for (const event of Object.values(pushed)) assertNoCredentials(event.raw, live);
  };
  await perform('jon', phaseAction(room.state, 'commitCouncil', { choiceId: 'keep', bid: 0 }));
  await perform('lydia', phaseAction(room.state, 'commitCouncil', { choiceId: 'keep', bid: 0 }));
  assert.equal(room.state.activePlayer, 'jon');
  await perform('jon', phaseAction(room.state, 'build', { designId: 'corner-shop', row: 0, col: 0 }));
  await perform('lydia', phaseAction(room.state, 'work'));
  assert.equal(room.state.activePlayer, 'jon');
  assert.equal(room.state.players.jon.coins, 1);
  const response = await submit(host, live, 'jon', command(room, phaseAction(room.state, 'festival')));
  assertPublicError(response, live, 'insufficient_coins', 'You do not have enough coins for that action.');
  const unchanged = await request(host, `/api/rooms/${live.code}`, { token: live.tokens.host });
  assert.equal(unchanged.value.revision, room.revision);
  assert.deepEqual(unchanged.value.state, room.state);
  assertNoCredentials(unchanged.text, live);
  await perform('jon', phaseAction(room.state, 'work'));
  assert.equal(room.state.players.jon.coins, 4, 'a safe rejection leaves the ordinary legal fallback available');
});
