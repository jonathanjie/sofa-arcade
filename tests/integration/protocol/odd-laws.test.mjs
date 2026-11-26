import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SCENARIOS } from '../fixtures/odd-laws-scenarios.mjs';
import { phaseAction as action, councilCommitments as currentCommitments, choosePublicAction } from '../fixtures/odd-laws-policy.mjs';
import { oddComponents, oddServer, ODD_GAME_ID } from './components.mjs';
import { captureSource, writeLatencyEvidence } from './evidence.mjs';
import { PLAYER_IDS, otherPlayer, openRoom, connectThree, closeStreams, listen, request, command, submit,
  expectRevision, assertNoCredentials, latencySummary } from './harness.mjs';

function assertSealed(view, prior, seat, commitment, viewer) {
  assert.equal(view.stage, 'council');
  assert.equal(view.phaseId, prior.phaseId);
  assert.deepEqual(view.council.ready, { jon: seat === 'jon', lydia: seat === 'lydia' });
  assert.deepEqual(view.council.ownCommitment, viewer === seat ? commitment : null);
  for (const id of PLAYER_IDS) assert.equal(view.players[id].influence, prior.players[id].influence, 'first bid must not change public influence');
  assert.deepEqual(view.lastCouncil, prior.lastCouncil, 'pending choices cannot enter public revealed history');
}

async function assertViews(host, live, state, seat, commitment) {
  for (const viewer of ['public', 'host', ...PLAYER_IDS]) {
    const result = await request(host, `/api/rooms/${live.code}`, { token: live.tokens[viewer] });
    assert.equal(result.status, 200);
    assertSealed(result.value.state, state, seat, commitment, viewer);
    assertNoCredentials(result.text, live);
  }
}

function assertFinalAccounting(view, components, actionsTaken) {
  assert.equal(view.phase, 'finished');
  assert.equal(view.stage, 'finished');
  assert.equal(view.session, 6);
  assert.deepEqual(actionsTaken, { jon: 18, lydia: 18 });
  for (const id of PLAYER_IDS) {
    const player = view.players[id];
    const designs = new Map(components.catalog.BUILDINGS.map(building => [building.id, building]));
    const buildings = player.city.reduce((sum, plot) => sum + (plot ? designs.get(plot.designId).prestige : 0), 0);
    const treasury = Math.min(4, Math.floor(player.coins / 3));
    assert.equal(player.score.buildings, buildings);
    assert.equal(player.score.treasury, treasury);
    assert.equal(player.score.total, buildings + player.score.streets + player.score.festivals + player.score.civic + treasury);
    assert.equal(view.result.scores[id], player.score.total);
    assert.ok(player.score.streets <= 6 && player.score.civic <= 10 && player.score.treasury <= 4);
  }
  const { jon, lydia } = view.result.scores;
  assert.equal(view.result.winner, jon === lydia ? 'tie' : jon > lydia ? 'jon' : 'lydia');
}

async function playMatch(t, components, { chair, policy = 'rich' }) {
  const sourceBefore = process.env.SOFA_EVIDENCE_DIR ? captureSource() : null;
  const host = await oddServer(components, { chair });
  const streams = {};
  t.after(async () => { await closeStreams(streams); await host.close(); });
  const live = await openRoom(host, { gameId: ODD_GAME_ID });
  Object.assign(streams, await connectThree(host, live));
  let room = live.room;
  assert.equal(room.state.chair, chair);
  const expectedChairs = [chair, otherPlayer(chair), otherPlayer(chair), chair, chair, otherPlayer(chair)];
  assert.deepEqual(room.state.chairSchedule, expectedChairs);
  assert.equal(new Set(room.state.agenda.flatMap(item => item.lawIds)).size, 12);
  const taken = { jon: 0, lydia: 0 };
  const types = new Set();
  const phases = new Set();
  const exhausted = new Set();
  const full = new Set();
  const delays = { host: [], jon: [], lydia: [] };
  let firstCityAction = null;
  let winnerRequest;
  let winnerActor;
  let councilCount = 0;

  while (room.phase === 'playing') {
    assert.ok(taken.jon + taken.lydia <= 36, 'match must terminate');
    const view = room.state;
    if (view.stage === 'council') {
      councilCount++;
      assert.equal(view.session, councilCount);
      assert.equal(view.chair, expectedChairs[view.session - 1]);
      assert.equal(view.market.length, 6);
      assert.equal(new Set(view.market.map(stack => stack.designId)).size, 6);
      if ([1, 3, 5].includes(view.session)) assert.ok(view.market.every(stack => stack.remaining === 2), 'new term stock starts with exactly two copies per design');
      for (const stack of view.market) {
        assert.equal(components.catalog.BUILDINGS.find(building => building.id === stack.designId).term, view.term);
        assert.ok(stack.remaining >= 0 && stack.remaining <= 2);
      }
      const plan = policy === 'rich' ? SCENARIOS.bids[view.session - 1] : { keep: true, sameChoice: true, jon: 0, lydia: 0 };
      const votes = currentCommitments(view, plan);
      const first = view.session % 2 === 1 ? 'jon' : 'lydia';
      const second = otherPlayer(first);
      const firstRequest = command(room, action(view, 'commitCouncil', votes[first]));
      // Both seats construct commands from the very same revision.
      const secondRequest = command(room, action(view, 'commitCouncil', votes[second]));
      const sealed = await submit(host, live, first, firstRequest);
      assert.equal(sealed.status, 200, sealed.text);
      assertSealed(sealed.value.state, view, first, votes[first], first);
      const pushed = await expectRevision(streams, sealed.value.revision);
      for (const [viewer, event] of Object.entries(pushed)) {
        assertSealed(event.value.state, view, first, votes[first], viewer);
        assertNoCredentials(event.raw, live);
      }
      await assertViews(host, live, view, first, votes[first]);
      const retry = await submit(host, live, first, firstRequest);
      assert.equal(retry.status, 200);
      assert.equal(retry.value.revision, sealed.value.revision);
      assertSealed(retry.value.state, view, first, votes[first], first);
      const collision = await submit(host, live, first, { ...firstRequest, action: { ...firstRequest.action, choiceId: firstRequest.action.choiceId === 'keep' ? view.council.optionIds[0] : 'keep' } });
      assert.equal(collision.status, 409);
      assert.equal(collision.value.code, 'action_id_reused');
      assertNoCredentials(collision.text, live);
      if (view.session === 1) {
        await streams[first].close();
        streams[first] = await listen(host, live.code, live.tokens[first]);
        const reconnected = await streams[first].waitFor(event => event.type === 'room');
        assertSealed(reconnected.value.state, view, first, votes[first], first);
      }
      const revealed = await submit(host, live, second, secondRequest);
      assert.equal(revealed.status, 200, 'second same-phase submission must rebase without losing its vote: ' + revealed.text);
      assert.equal(revealed.value.state.stage, 'actions');
      assert.equal(revealed.value.state.activePlayer, otherPlayer(view.chair));
      assert.equal(revealed.value.state.council, null);
      assert.deepEqual(revealed.value.state.lastCouncil.choices, votes);
      const councilWinner = votes.jon.bid === votes.lydia.bid ? view.chair : votes.jon.bid > votes.lydia.bid ? 'jon' : 'lydia';
      const selected = votes[councilWinner].choiceId;
      const enacted = selected === 'keep' ? view.activeLaws[view.council.category] : selected;
      assert.equal(revealed.value.state.activeLaws[view.council.category], enacted);
      for (const id of PLAYER_IDS) assert.equal(revealed.value.state.players[id].influence, view.players[id].influence - votes[id].bid, 'both bids are paid, exactly once');
      const visible = await expectRevision(streams, revealed.value.revision);
      for (const event of Object.values(visible)) assert.deepEqual(event.value.state, revealed.value.state);
      room = revealed.value;
      continue;
    }

    assert.equal(view.stage, 'actions');
    assert.ok(!phases.has(view.phaseId), 'each city action has a distinct phase ID');
    phases.add(view.phaseId);
    const actor = view.activePlayer;
    if (view.session === 1 && view.actionIndex === 0) {
      firstCityAction = { actor, action: action(view, 'work') };
      const forged = await submit(host, live, actor, command(room, { ...firstCityAction.action, playerId: otherPlayer(actor) }));
      assert.equal(forged.status, 400, 'actor fields must be rejected, not trusted');
      const future = await submit(host, live, actor, { ...command(room, firstCityAction.action), revision: room.revision + 100 });
      assert.equal(future.status, 409, 'future revisions must not rebase');
      const hostAction = await request(host, `/api/rooms/${live.code}/action`, { token: live.tokens.host, body: command(room, firstCityAction.action) });
      assert.equal(hostAction.status, 403);
    }
    if (firstCityAction && view.session === 1 && view.actionIndex === 2) {
      assert.equal(actor, firstCityAction.actor);
      const stalePhase = await submit(host, live, actor, command(room, firstCityAction.action));
      assert.equal(stalePhase.status, 409, 'fresh revision cannot revive an old city phase');
      assert.equal(stalePhase.value.code, 'stale_phase');
      const staleRevision = await submit(host, live, actor, { ...command(room, action(view, 'work')), revision: room.revision - 1 });
      assert.equal(staleRevision.status, 409, 'city actions never rebase');
    }
    if (policy === 'fill') {
      const empty = view.players[actor].city.indexOf(null);
      const emptyStack = view.market.find(stack => stack.remaining === 0 && !exhausted.has(stack.designId));
      if (empty >= 0 && emptyStack) {
        const result = await submit(host, live, actor, command(room, action(view, 'build', { designId: emptyStack.designId, row: Math.floor(empty / 3), col: empty % 3 })));
        assert.equal(result.status, 400, 'exhausted stock is not purchasable');
        exhausted.add(emptyStack.designId);
      }
      if (empty < 0 && !full.has(actor)) {
        const result = await submit(host, live, actor, command(room, action(view, 'build', { designId: view.market[0].designId, row: 0, col: 0 })));
        assert.equal(result.status, 400, 'a completed city cannot be built over');
        full.add(actor);
      }
    }
    const selected = choosePublicAction(view, actor, components.previews, policy);
    const payload = command(room, selected);
    const applied = await submit(host, live, actor, payload);
    assert.equal(applied.status, 200, applied.text);
    assert.equal(applied.value.revision, room.revision + 1, 'rejected requests did not advance the room');
    const pushed = await expectRevision(streams, applied.value.revision);
    for (const [viewer, event] of Object.entries(pushed)) {
      assert.deepEqual(event.value.state, applied.value.state);
      assertNoCredentials(event.raw, live);
      delays[viewer].push(event.receivedAt - applied.startedAt);
    }
    if (selected.type === 'build' && view.session === applied.value.state.session) {
      const quote = components.previews.buildQuote(view, actor, selected.designId);
      assert.equal(applied.value.state.players[actor].coins, view.players[actor].coins - quote.cost);
      const placed = applied.value.state.players[actor].city[selected.row * 3 + selected.col];
      assert.equal(placed.designId, selected.designId);
      const previousInstances = view.players[actor].city.filter(Boolean).map(plot => plot.instanceId);
      assert.ok(!previousInstances.includes(placed.instanceId));
    }
    types.add(selected.type); taken[actor]++;
    room = applied.value; winnerRequest = payload; winnerActor = actor;
  }

  assert.equal(councilCount, 6);
  assert.equal(phases.size, 36);
  assertFinalAccounting(room.state, components, taken);
  if (policy === 'rich') {
    assert.deepEqual([...types].sort(), ['build', 'festival', 'lobby', 'work']);
    assert.notEqual(room.state.result.winner, 'tie', 'asymmetric legal decisions must exercise a winning result, separately from the tie fixture');
  }
  if (policy === 'fill') {
    assert.equal(full.size, 2, 'both full-city fallback states were reached through legal actions');
    assert.ok(exhausted.size >= 2, 'exhausted stacks were actually requested and rejected');
  }
  if (policy === 'tie') {
    assert.equal(room.state.result.winner, 'tie');
    assert.deepEqual(room.state.result.scores, { jon: 4, lydia: 4 });
    for (const id of PLAYER_IDS) assert.equal(room.state.players[id].coins, 4 + 18 * 3 + 5 * 3, 'no extra income after the final session');
  }
  const duplicate = await submit(host, live, winnerActor, winnerRequest);
  assert.equal(duplicate.status, 200, 'lost final response remains retryable');
  assert.equal(duplicate.value.revision, room.revision);
  assert.deepEqual(duplicate.value.state.result, room.state.result);
  const rematch = await request(host, `/api/rooms/${live.code}/rematch`, { token: live.tokens.host, body: {} });
  assert.equal(rematch.status, 200);
  assert.notEqual(rematch.value.state.matchId, room.state.matchId, 'a rematch must have a new match identity');
  assert.equal(rematch.value.state.stage, 'council');
  assert.deepEqual(rematch.value.state.council.ready, { jon: false, lydia: false });
  await expectRevision(streams, rematch.value.revision);
  const lateRetry = await submit(host, live, winnerActor, winnerRequest);
  assert.equal(lateRetry.status, 200);
  assert.equal(lateRetry.value.revision, rematch.value.revision);
  assert.deepEqual(lateRetry.value.state.council.ready, { jon: false, lydia: false });
  const { type, phaseId, matchId } = winnerRequest.action;
  const changedAction = { type: type === 'work' ? 'lobby' : 'work', phaseId, matchId };
  const conflict = await submit(host, live, winnerActor, { ...winnerRequest, action: changedAction });
  assert.equal(conflict.value.code, 'action_id_reused');
  const oldMatch = await submit(host, live, winnerActor, { ...winnerRequest, revision: rematch.value.revision });
  assert.equal(oldMatch.status, 409, 'fresh revision cannot make an old-match command valid');
  assert.equal(oldMatch.value.code, 'stale_match');
  const evidence = await writeLatencyEvidence({ name: `odd-laws-${chair}-${policy}`, gameId: ODD_GAME_ID, chair, policy, samples: delays, sourceBefore });
  t.diagnostic(JSON.stringify({ chair, policy, cityActions: taken, councils: councilCount, score: room.state.result, latency: Object.fromEntries(Object.entries(delays).map(([viewer, values]) => [viewer, latencySummary(values)])), evidence, method: 'Node loopback POST start to parsed per-viewer SSE update, all 3 viewers, 60-second heartbeat; no home Wi-Fi or TV/casting measurement' }));
}

for (const chair of SCENARIOS.chairs) {
  test(`Odd Laws: complete real six-session HTTP/SSE match, initial Chair ${chair}`, async t => {
    const components = await oddComponents(t);
    if (components) await playMatch(t, components, { chair });
  });
}

test('Odd Laws: exhausted stacks and two full cities retain legal fallback actions through the final score', async t => {
  const components = await oddComponents(t);
  if (components) await playMatch(t, components, { chair: 'jon', policy: 'fill' });
});

test('Odd Laws: a fully played equal-score match produces a shared victory and capped treasury', async t => {
  const components = await oddComponents(t);
  if (components) await playMatch(t, components, { chair: 'lydia', policy: 'tie' });
});

test('Odd Laws: racing same-revision sealed votes resolve once, then reject future and out-of-phase votes', async t => {
  const components = await oddComponents(t);
  if (!components) return;
  const host = await oddServer(components);
  const streams = {};
  t.after(async () => { await closeStreams(streams); await host.close(); });
  const live = await openRoom(host, { gameId: ODD_GAME_ID });
  Object.assign(streams, await connectThree(host, live));
  const view = live.room.state;
  const votes = { jon: { choiceId: view.council.optionIds[0], bid: 2 }, lydia: { choiceId: view.council.optionIds[1], bid: 1 } };
  const requests = Object.fromEntries(PLAYER_IDS.map(id => [id, command(live.room, action(view, 'commitCouncil', votes[id]))]));
  const results = await Promise.all(PLAYER_IDS.map(id => submit(host, live, id, requests[id])));
  for (const result of results) assert.equal(result.status, 200, result.text);
  const final = await request(host, `/api/rooms/${live.code}`, { token: live.tokens.host });
  assert.equal(final.value.revision, live.room.revision + 2);
  assert.equal(final.value.state.stage, 'actions');
  assert.deepEqual(final.value.state.lastCouncil.choices, votes);
  assert.equal(final.value.state.players.jon.influence, 0);
  assert.equal(final.value.state.players.lydia.influence, 1);
  await expectRevision(streams, final.value.revision);
  const duplicates = await Promise.all(PLAYER_IDS.map(id => submit(host, live, id, requests[id])));
  for (const duplicate of duplicates) {
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.value.revision, final.value.revision);
    assert.deepEqual(duplicate.value.state.players, final.value.state.players);
  }
  const staleCouncil = await submit(host, live, 'jon', { ...requests.jon, revision: final.value.revision, actionId: crypto.randomUUID() });
  assert.equal(staleCouncil.status, 409, 'the old council phase must not reopen');
  assert.equal(staleCouncil.value.code, 'stale_phase');
  const future = await submit(host, live, final.value.state.activePlayer, {
    ...command(final.value, action(final.value.state, 'work')), revision: final.value.revision + 1,
  });
  assert.equal(future.status, 409);
  const unchanged = await request(host, `/api/rooms/${live.code}`, { token: live.tokens.host });
  assert.equal(unchanged.value.revision, final.value.revision);
});

function identityNeutral(view) {
  const replacement = JSON.stringify(view).replaceAll(view.matchId, '[same-test-match]');
  return JSON.parse(replacement);
}

for (const seat of PLAYER_IDS) {
  test(`Odd Laws: serialized public/TV/opponent HTTP and SSE are invariant to ${seat}'s hidden choice and bid`, async t => {
    const components = await oddComponents(t);
    if (!components) return;
    const host = await oddServer(components);
    const sessions = [];
    t.after(async () => { for (const session of sessions) await closeStreams(session.streams); await host.close(); });
    const visible = [];
    for (let variant = 0; variant < 2; variant++) {
      const live = await openRoom(host, { gameId: ODD_GAME_ID });
      const streams = await connectThree(host, live);
      sessions.push({ live, streams });
      const view = live.room.state;
      const vote = { choiceId: view.council.optionIds[variant], bid: variant * 2 };
      const response = await submit(host, live, seat, command(live.room, action(view, 'commitCouncil', vote)));
      assert.equal(response.status, 200);
      assert.deepEqual(response.value.state.council.ownCommitment, vote);
      const pushed = await expectRevision(streams, response.value.revision);
      const sample = {};
      for (const viewer of ['public', 'host', otherPlayer(seat)]) {
        const read = await request(host, `/api/rooms/${live.code}`, { token: live.tokens[viewer] });
        assert.equal(read.status, 200);
        assertNoCredentials(read.text, live);
        sample[`http-${viewer}`] = identityNeutral(JSON.parse(read.text).state);
        if (pushed[viewer]) {
          assertNoCredentials(pushed[viewer].raw, live);
          sample[`sse-${viewer}`] = identityNeutral(JSON.parse(pushed[viewer].raw).state);
        }
      }
      visible.push(sample);
    }
    assert.deepEqual(visible[0], visible[1], 'changing only a private choice/bid must not alter any other viewer’s serialized projection');
  });
}

test('Odd Laws: a sealed vote survives SQLite restart and returns only to its authenticated seat', async t => {
  const components = await oddComponents(t);
  if (!components) return;
  const directory = await mkdtemp(path.join(tmpdir(), 'odd-laws-ws6-restart-'));
  const databasePath = path.join(directory, 'rooms.sqlite');
  let host = await oddServer(components, { databasePath });
  let streams = {};
  t.after(async () => { await closeStreams(streams); await host.close(); await rm(directory, { recursive: true, force: true }); });
  const live = await openRoom(host, { gameId: ODD_GAME_ID });
  const initial = live.room.state;
  const vote = { choiceId: initial.council.optionIds[0], bid: 2 };
  const payload = command(live.room, action(initial, 'commitCouncil', vote));
  const sealed = await submit(host, live, 'jon', payload);
  assert.equal(sealed.status, 200);
  const port = host.port;
  await host.close();
  host = await oddServer(components, { databasePath, port });
  await assertViews(host, live, initial, 'jon', vote);
  live.room = sealed.value;
  streams = await connectThree(host, live);
  for (const [viewer, stream] of Object.entries(streams)) {
    const event = await stream.waitFor(item => item.type === 'room');
    assertSealed(event.value.state, initial, 'jon', vote, viewer);
  }
  const retried = await submit(host, live, 'jon', payload);
  assert.equal(retried.status, 200);
  assert.equal(retried.value.revision, sealed.value.revision);
  const other = await submit(host, live, 'lydia', command(live.room, action(initial, 'commitCouncil', { choiceId: 'keep', bid: 1 })));
  assert.equal(other.status, 200);
  assert.equal(other.value.state.players.jon.influence, 0);
  assert.equal(other.value.state.players.lydia.influence, 1);
  await expectRevision(streams, other.value.revision);
});
