import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoomApi, handleApi, MAX_BODY_BYTES } from './rooms.mjs';
import {
  FIXTURE_GAME_ID, PRIVATE_SENTINEL, PLAYERS, createPrivateEngine, memoryFixture,
  callApi, openRoom, command, rawRoom, assertNoAuthoritySecrets, assertPendingView,
} from './room-platform-fixture.mjs';

async function setup(t, options) {
  const fixture = memoryFixture(createPrivateEngine(options));
  t.after(() => fixture.close());
  const request = (route, values) => callApi(fixture, route, values);
  const live = await openRoom(request);
  return { fixture, request, live, route: `/api/rooms/${live.code}` };
}

async function resolveCouncil(request, live, game = live.game, bids = { jon: 1, lydia: 2 }) {
  const route = `/api/rooms/${live.code}/action`;
  let current;
  for (const actor of PLAYERS) {
    const result = await request(route, { token: live.tokens[actor], body: command(game, 'commitCouncil', { choiceId: actor === 'jon' ? 'keep' : game.state.council.optionIds[0], bid: bids[actor] }) });
    assert.equal(result.status, 200, result.text);
    current = result.body;
  }
  assert.equal(current.state.stage, 'actions');
  return current;
}

async function finishCity(request, live, game) {
  let current = game;
  while (current.state.stage === 'actions') {
    const next = await request(`/api/rooms/${live.code}/action`, { token: live.tokens[current.state.activePlayer], body: command(current, 'work') });
    assert.equal(next.status, 200, next.text);
    current = next.body;
  }
  return current;
}

test('injected private game stays absent from production registration', async t => {
  const fixture = memoryFixture();
  t.after(() => fixture.close());
  const result = await callApi({ ...fixture, handle: handleApi }, '/api/rooms', { body: { gameId: FIXTURE_GAME_ID } });
  assert.equal(result.status, 400);
  assert.equal(result.body.code, 'invalid_game');
  assert.equal(fixture.stats.writes, 0);
});

test('every serialized GET/start/join/duplicate path projects only its authenticated viewer', async t => {
  const { fixture, request, live, route } = await setup(t);
  const firstBody = command(live.game, 'commitCouncil', { choiceId: 'keep', bid: 1 });
  const first = await request(`${route}/action`, { token: live.tokens.jon, body: firstBody });
  assert.equal(first.status, 200, first.text);
  assertPendingView(first.body, { choiceId: 'keep', bid: 1 });
  const credentials = [live.hostToken, ...Object.values(live.tokens), ...Object.values(live.clients)];
  assertNoAuthoritySecrets(first.text, credentials);
  const stored = rawRoom(fixture, live.code).data;
  assert.ok(stored.includes(PRIVATE_SENTINEL), 'fixture actually stores private authority data');
  for (const credential of credentials) assert.ok(!stored.includes(credential), 'only credential hashes persist');

  for (const [role, token, expected] of [
    ['public', undefined, null], ['host', live.hostToken, null],
    ['jon', live.tokens.jon, { choiceId: 'keep', bid: 1 }], ['lydia', live.tokens.lydia, null],
  ]) {
    const response = await request(`${route}?role=player&playerId=jon&viewer=jon`, { token });
    assert.equal(response.status, 200, role);
    assertPendingView(response.body, expected);
    assertNoAuthoritySecrets(response.text, credentials);
    if (!expected) assert.ok(!response.text.includes('"bid":'), `${role} receives no sealed bid anywhere`);
  }
  const restart = await request(`${route}/start`, { token: live.hostToken, body: { role: 'player', playerId: 'jon' } });
  assert.equal(restart.status, 200);
  assertPendingView(restart.body, null);
  assertNoAuthoritySecrets(restart.text, credentials);
  assert.ok(!restart.text.includes('"bid":'));

  const retry = await request(`${route}/action`, { token: live.tokens.jon, body: firstBody });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.revision, first.body.revision);
  assertPendingView(retry.body, { choiceId: 'keep', bid: 1 });
  assertNoAuthoritySecrets(retry.text, credentials);

  // Seat restoration is itself a private projected response, and rotates its credential.
  const restored = await request(`${route}/join`, { body: { playerId: 'jon', clientId: live.clients.jon, role: 'host' } });
  assert.equal(restored.status, 200);
  assertPendingView(restored.body, { choiceId: 'keep', bid: 1 });
  assertNoAuthoritySecrets(restored.text, credentials);
  assert.notEqual(restored.body.playerToken, live.tokens.jon);
  assert.equal((await request(route, { token: live.tokens.jon })).status, 403);
  const forgedJoin = await request(`${route}/join`, { token: restored.body.playerToken, body: { playerId: 'lydia', clientId: crypto.randomUUID() } });
  assert.equal(forgedJoin.status, 409);
  assertNoAuthoritySecrets(forgedJoin.text, credentials);
  assert.equal(forgedJoin.body.state, undefined);
});

for (const firstActor of PLAYERS) {
  test(`two seats submit one revision, ${firstActor} arrives first, budgets reveal atomically`, async t => {
    const { fixture, request, live, route } = await setup(t);
    const secondActor = firstActor === 'jon' ? 'lydia' : 'jon';
    const choices = { jon: { choiceId: 'keep', bid: 1 }, lydia: { choiceId: live.game.state.council.optionIds[0], bid: 2 } };
    const first = await request(`${route}/action`, { token: live.tokens[firstActor], body: command(live.game, 'commitCouncil', choices[firstActor]) });
    assert.equal(first.status, 200, first.text);
    assertPendingView(first.body, choices[firstActor], { jon: firstActor === 'jon', lydia: firstActor === 'lydia' });
    const firstStored = JSON.parse(rawRoom(fixture, live.code).data).state;
    assert.deepEqual(firstStored.privateState.phaseBudgets, { jon: 2, lydia: 2 });
    assert.equal(firstStored.players[firstActor].influence, 2);
    const observer = await request(route);
    assert.ok(!observer.text.includes('"bid":'));
    assertNoAuthoritySecrets(observer.text);
    const second = await request(`${route}/action`, { token: live.tokens[secondActor], body: command(live.game, 'commitCouncil', choices[secondActor]) });
    assert.equal(second.status, 200, second.text);
    assert.equal(second.body.revision, live.game.revision + 2);
    assert.equal(second.body.state.stage, 'actions');
    assert.deepEqual(second.body.state.lastCouncil.choices, choices);
    assert.equal(second.body.state.players.jon.influence, 1);
    assert.equal(second.body.state.players.lydia.influence, 0);
    assert.ok(fixture.engine.stats.rebases >= 1, 'engine explicitly authorizes stale-revision council submission');
  });
}

test('two real CAS attempts on one revision re-evaluate the loser against the winning commitment', { timeout: 5000 }, async t => {
  const { fixture, request, live, route } = await setup(t);
  fixture.armCasBarrier(2);
  const results = await Promise.all(PLAYERS.map(actor => request(`${route}/action`, {
    token: live.tokens[actor], body: command(live.game, 'commitCouncil', { choiceId: 'keep', bid: actor === 'jon' ? 1 : 2 }),
  })));
  assert.deepEqual(results.map(result => result.status), [200, 200]);
  assert.ok(fixture.stats.casFailures >= 1, 'controlled barrier actually caused a lost compare-and-swap');
  const final = await request(route);
  assert.equal(final.body.revision, live.game.revision + 2);
  assert.deepEqual(final.body.state.lastCouncil.choices, { jon: { choiceId: 'keep', bid: 1 }, lydia: { choiceId: 'keep', bid: 2 } });
  assert.equal(final.body.state.players.jon.influence, 1);
  assert.equal(final.body.state.players.lydia.influence, 0);
  for (const result of results) assertNoAuthoritySecrets(result.text);
});

test('concurrent identical requests commit once; changed-content same IDs cannot replace a locked vote', { timeout: 5000 }, async t => {
  const { fixture, request, live, route } = await setup(t);
  const body = command(live.game, 'commitCouncil', { choiceId: 'keep', bid: 1 });
  fixture.armCasBarrier(2);
  const duplicates = await Promise.all([1, 2].map(() => request(`${route}/action`, { token: live.tokens.jon, body })));
  assert.deepEqual(duplicates.map(item => item.status), [200, 200]);
  assert.deepEqual(duplicates.map(item => item.body.revision), [live.game.revision + 1, live.game.revision + 1]);
  for (const changed of [{ bid: 2 }, { choiceId: live.game.state.council.optionIds[0] }]) {
    const result = await request(`${route}/action`, { token: live.tokens.jon, body: { ...body, action: { ...body.action, ...changed } } });
    assert.equal(result.status, 409);
    assert.equal(result.body.code, 'action_id_reused');
    assertNoAuthoritySecrets(result.text);
  }
  const replace = await request(`${route}/action`, { token: live.tokens.jon, body: { ...body, revision: live.game.revision + 1, actionId: crypto.randomUUID() } });
  assert.ok([400, 409].includes(replace.status));
  assertPendingView((await request(route, { token: live.tokens.jon })).body, { choiceId: 'keep', bid: 1 });
});

test('future revisions, including known duplicates, never bypass the revision fence', async t => {
  const { request, live, route } = await setup(t);
  const body = command(live.game, 'commitCouncil', { choiceId: 'keep', bid: 1 });
  const future = await request(`${route}/action`, { token: live.tokens.jon, body: { ...body, revision: live.game.revision + 1 } });
  assert.equal(future.status, 409);
  assert.equal(future.body.code, 'stale_revision');
  const first = await request(`${route}/action`, { token: live.tokens.jon, body });
  assert.equal(first.status, 200);
  const futureDuplicate = await request(`${route}/action`, { token: live.tokens.jon, body: { ...body, revision: first.body.revision + 1000 } });
  assert.equal(futureDuplicate.status, 409);
  assert.equal(futureDuplicate.body.code, 'stale_revision');
  assert.equal((await request(route)).body.revision, first.body.revision);
});

test('fixed council budget and authenticated actors reject overspend, malformed fields, and forged seats', async t => {
  const { request, live, route } = await setup(t);
  const body = command(live.game, 'commitCouncil', { choiceId: 'keep', bid: 1 });
  const first = await request(`${route}/action`, { token: live.tokens.jon, body });
  assert.equal(first.status, 200);
  const candidates = [
    { ...body, actionId: crypto.randomUUID(), action: { ...body.action, bid: 3 } },
    { ...body, actionId: crypto.randomUUID(), action: { ...body.action, playerId: 'jon' } },
    { ...body, actionId: crypto.randomUUID(), action: { ...body.action, actor: 'jon' } },
    { ...body, actionId: crypto.randomUUID(), action: { ...body.action, viewer: { role: 'host' } } },
    { ...body, actionId: crypto.randomUUID(), action: { ...body.action, bid: 1.5 } },
  ];
  for (const candidate of candidates) {
    const result = await request(`${route}/action`, { token: live.tokens.lydia, body: candidate });
    assert.ok([400, 409].includes(result.status), result.text);
    assertNoAuthoritySecrets(result.text, Object.values(live.tokens));
    assert.equal(result.body.state, undefined);
  }
  const forgedOuter = await request(`${route}/action`, { token: live.tokens.lydia, body: { ...body, actionId: crypto.randomUUID(), playerId: 'jon', role: 'host' } });
  // Extra envelope fields may be rejected; if accepted the bearer seat must still be Lydia.
  if (forgedOuter.status === 200) {
    assert.equal(forgedOuter.body.state.lastCouncil.choices.lydia.bid, 1);
    assert.equal(forgedOuter.body.state.lastCouncil.choices.jon.bid, 1);
  } else assert.ok([400, 409].includes(forgedOuter.status));
  const host = await request(`${route}/action`, { token: live.hostToken, body: { ...body, playerId: 'lydia' } });
  assert.equal(host.status, 403);
  const missing = await request(`${route}/action`, { body: { ...body, token: live.tokens.lydia, role: 'player' } });
  assert.equal(missing.status, 401);
});

test('engine authorization is required for CAS/stale re-evaluation and contention is bounded', { timeout: 5000 }, async t => {
  const { fixture, request, live, route } = await setup(t);
  const original = fixture.engine.canRebaseAction;
  fixture.engine.canRebaseAction = () => false;
  const first = await request(`${route}/action`, { token: live.tokens.jon, body: command(live.game, 'commitCouncil', { choiceId: 'keep', bid: 1 }) });
  assert.equal(first.status, 200);
  const stale = await request(`${route}/action`, { token: live.tokens.lydia, body: command(live.game, 'commitCouncil', { choiceId: 'keep', bid: 1 }) });
  assert.equal(stale.status, 409);
  fixture.engine.canRebaseAction = original;
  const before = fixture.stats.casAttempts;
  fixture.failCas();
  const contended = await request(`${route}/action`, { token: live.tokens.lydia, body: command(first.body, 'commitCouncil', { choiceId: 'keep', bid: 1 }) });
  assert.equal(contended.status, 409);
  assert.ok(fixture.stats.casAttempts - before > 0);
  assert.ok(fixture.stats.casAttempts - before <= 8, 'CAS loop has a small finite attempt budget');
  fixture.failCas(false);
  assert.equal((await request(route)).body.revision, first.body.revision);
});

test('a stale city command cannot execute on the same player’s next turn even with a fresh revision', async t => {
  const { fixture, request, live, route } = await setup(t);
  let current = await resolveCouncil(request, live);
  const delayed = command(current, 'work');
  const actor = current.state.activePlayer;
  current = (await request(`${route}/action`, { token: live.tokens[actor], body: command(current, 'lobby') })).body;
  current = (await request(`${route}/action`, { token: live.tokens[current.state.activePlayer], body: command(current, 'work') })).body;
  assert.equal(current.state.activePlayer, actor);
  const before = rawRoom(fixture, live.code).data;
  for (const revision of [delayed.revision, current.revision]) {
    const response = await request(`${route}/action`, { token: live.tokens[actor], body: { ...delayed, revision } });
    assert.equal(response.status, 409);
    assert.equal(response.body.code, 'stale_phase');
  }
  assert.equal(rawRoom(fixture, live.code).data, before);
  const futurePhase = { ...command(current, 'work'), action: { ...command(current, 'work').action, phaseId: `${current.state.matchId}:session-1:action-4` } };
  assert.equal((await request(`${route}/action`, { token: live.tokens[actor], body: futurePhase })).status, 409);
});

test('city actions never rebase, even if a buggy adapter authorizes all actions in the unchanged phase', async t => {
  const { fixture, request, live, route } = await setup(t);
  const current = await resolveCouncil(request, live);
  const actor = current.state.activePlayer;
  const delayed = command(current, 'work');
  const rejoin = await request(`${route}/join`, { body: { playerId: 'jon', clientId: live.clients.jon } });
  assert.equal(rejoin.status, 200);
  assert.equal(rejoin.body.state.phaseId, current.state.phaseId);
  fixture.engine.canRebaseAction = () => true;
  const before = fixture.stats.casAttempts;
  const stale = await request(`${route}/action`, { token: live.tokens[actor], body: delayed });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, 'stale_revision');
  assert.equal(fixture.stats.casAttempts, before);
  fixture.failCas();
  const contended = await request(`${route}/action`, { token: live.tokens[actor], body: { ...delayed, revision: rejoin.body.revision } });
  assert.equal(contended.status, 409);
  assert.equal(fixture.stats.casAttempts, before + 1, 'city CAS failure cannot apply again');
  fixture.failCas(false);
});

test('CAS re-evaluation authenticates again after a credential rotates during an in-flight vote', { timeout: 5000 }, async t => {
  const { fixture, request, live, route } = await setup(t);
  const pause = fixture.holdNextCas();
  t.after(pause.release);
  const pending = request(`${route}/action`, { token: live.tokens.jon, body: command(live.game, 'commitCouncil', { choiceId: 'keep', bid: 2 }) });
  await pause.entered;
  const rotated = await request(`${route}/join`, { body: { playerId: 'jon', clientId: live.clients.jon } });
  assert.equal(rotated.status, 200);
  pause.release();
  const rejected = await pending;
  assert.equal(rejected.status, 403);
  assert.equal(rejected.body.code, 'invalid_token');
  assertNoAuthoritySecrets(rejected.text, [live.tokens.jon, rotated.body.playerToken]);
  const restored = await request(route, { token: rotated.body.playerToken });
  assertPendingView(restored.body, null, { jon: false, lydia: false });
  assert.equal(restored.body.revision, rotated.body.revision);
  assert.ok(fixture.stats.casFailures >= 1);
});

test('normalization includes build coordinates, design, phase, and match in stable retry identity', async t => {
  const { request, live, route } = await setup(t);
  const current = await resolveCouncil(request, live);
  const actor = current.state.activePlayer;
  const body = command(current, 'build', { designId: 'fixture-house', row: 0, col: 0 });
  const built = await request(`${route}/action`, { token: live.tokens[actor], body });
  assert.equal(built.status, 200);
  // Reordered object keys normalize to the original identity.
  const reordered = { col: 0, row: 0, designId: 'fixture-house', phaseId: body.action.phaseId, matchId: body.action.matchId, type: 'build' };
  const retry = await request(`${route}/action`, { token: live.tokens[actor], body: { ...body, action: reordered } });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.revision, built.body.revision);
  for (const changed of [{ row: 1 }, { col: 1 }, { phaseId: `${body.action.phaseId}:changed` }, { matchId: `${body.action.matchId}:changed` }]) {
    const result = await request(`${route}/action`, { token: live.tokens[actor], body: { ...body, action: { ...body.action, ...changed } } });
    assert.equal(result.status, 409);
    assert.ok(['action_id_reused', 'stale_match', 'stale_phase'].includes(result.body.code));
  }
});

test('lost final response remains retryable; rematch resets secrets, history identity, and match fencing', async t => {
  const { request, live, route } = await setup(t, { sessions: 1 });
  let current = await resolveCouncil(request, live);
  while (current.state.actionIndex < 5) current = (await request(`${route}/action`, { token: live.tokens[current.state.activePlayer], body: command(current, 'work') })).body;
  const actor = current.state.activePlayer;
  const winning = command(current, 'work');
  const delivered = await request(`${route}/action`, { token: live.tokens[actor], body: winning });
  assert.equal(delivered.status, 200);
  assert.equal(delivered.body.phase, 'finished');
  const retry = await request(`${route}/action`, { token: live.tokens[actor], body: winning });
  assert.equal(retry.status, 200);
  assert.deepEqual(retry.body, delivered.body);
  assertNoAuthoritySecrets(retry.text);
  const rematch = await request(`${route}/rematch`, { token: live.hostToken, body: {} });
  assert.equal(rematch.status, 200);
  assert.notEqual(rematch.body.state.matchId, delivered.body.state.matchId);
  assertPendingView(rematch.body, null, { jon: false, lydia: false });
  assertNoAuthoritySecrets(rematch.text);
  const old = await request(`${route}/action`, { token: live.tokens[actor], body: { ...winning, revision: rematch.body.revision } });
  assert.equal(old.status, 409);
  assert.equal(old.body.code, 'stale_match');
  assert.equal((await request(route)).body.revision, rematch.body.revision);
});

test('a previous council remains revealed without exposing a new pending commitment in history', async t => {
  const { request, live, route } = await setup(t);
  const first = await resolveCouncil(request, live, live.game, { jon: 0, lydia: 0 });
  const secondCouncil = await finishCity(request, live, first);
  assert.equal(secondCouncil.state.session, 2);
  const sealed = await request(`${route}/action`, { token: live.tokens.jon, body: command(secondCouncil, 'commitCouncil', { choiceId: secondCouncil.state.council.optionIds[1], bid: 3 }) });
  assert.equal(sealed.status, 200);
  for (const token of [undefined, live.hostToken, live.tokens.lydia]) {
    const read = await request(route, { token });
    assert.deepEqual(read.body.state.lastCouncil, first.state.lastCouncil);
    assert.equal(read.body.state.council.ownCommitment, null);
    assert.ok(!read.text.includes('"bid":3'));
    assertNoAuthoritySecrets(read.text);
  }
});

test('private rule/diagnostic exceptions cannot exfiltrate commitments through serialized errors', async t => {
  const { fixture, request, live, route } = await setup(t);
  const secretError = () => Object.assign(new Error(`diagnostic ${PRIVATE_SENTINEL}: opponent chose bill-1-a for 2`), { code: 'invalid_bid', details: { secret: PRIVATE_SENTINEL } });
  const body = command(live.game, 'commitCouncil', { choiceId: 'keep', bid: 1 });
  const originalApply = fixture.engine.apply;
  fixture.engine.apply = () => { throw secretError(); };
  const known = await request(`${route}/action`, { token: live.tokens.jon, body });
  assert.equal(known.status, 400);
  assertNoAuthoritySecrets(known.text);
  assert.ok(!known.text.includes('opponent chose'));
  fixture.engine.apply = () => { throw new Error(PRIVATE_SENTINEL); };
  const unknown = await request(`${route}/action`, { token: live.tokens.jon, body });
  assert.ok([400, 500].includes(unknown.status));
  assertNoAuthoritySecrets(unknown.text);
  fixture.engine.apply = originalApply;
  const originalNormalize = fixture.engine.normalizeAction;
  fixture.engine.normalizeAction = () => { throw secretError(); };
  const invalid = await request(`${route}/action`, { token: live.tokens.jon, body });
  assertNoAuthoritySecrets(invalid.text);
  fixture.engine.normalizeAction = originalNormalize;
  fixture.engine.project = () => { throw secretError(); };
  const brokenProject = await request(route, { token: live.tokens.jon });
  assert.equal(brokenProject.status, 500);
  assertNoAuthoritySecrets(brokenProject.text);
});

test('partial private adapters fail closed without exposing full engine state', async t => {
  for (const missing of ['project', 'normalizeAction', 'actionKey', 'canRebaseAction']) {
    const engine = createPrivateEngine();
    delete engine[missing];
    const fixture = memoryFixture(engine);
    t.after(() => fixture.close());
    const created = await callApi(fixture, '/api/rooms', { body: { gameId: FIXTURE_GAME_ID } });
    assert.ok([409, 500, 503].includes(created.status), `${missing}: ${created.text}`);
    assert.equal(fixture.stats.writes, 0);
    assertNoAuthoritySecrets(created.text);
  }
  assert.throws(() => createRoomApi({ resolveGame: 1 }), /function|resolver/i);
});

test('privacy API retains origin/body/expiry rejection without returning state or credentials', async t => {
  const { fixture, request, live, route } = await setup(t);
  const hostile = await request(`${route}/action`, { token: live.tokens.jon, body: command(live.game, 'commitCouncil', { choiceId: 'keep', bid: 1 }), headers: { Origin: 'https://hostile.invalid' } });
  assert.equal(hostile.status, 403);
  assertNoAuthoritySecrets(hostile.text, Object.values(live.tokens));
  const oversized = await request(`${route}/action`, { token: live.tokens.jon, method: 'POST', rawBody: 'x'.repeat(MAX_BODY_BYTES + 1) });
  assert.equal(oversized.status, 413);
  const corrupt = await request(`${route}/action`, { token: live.tokens.jon, method: 'POST', rawBody: '{"bid":' });
  assert.equal(corrupt.status, 400);
  fixture.sqlite.prepare('UPDATE sofa_rooms SET expires_at = ? WHERE code = ?').run(Date.now() - 1, live.code);
  for (const token of [undefined, live.hostToken, live.tokens.jon]) {
    const expired = await request(route, { token });
    assert.equal(expired.status, 410);
    assertNoAuthoritySecrets(expired.text, Object.values(live.tokens));
    assert.equal(expired.body.state, undefined);
  }
});
