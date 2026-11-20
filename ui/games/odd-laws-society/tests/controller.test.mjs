import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixtureController } from '../harness/controller.mjs';

const host = { role: 'host' };
const seat = playerId => ({ role: 'player', playerId });
const send = (controller, playerId, action) => {
  const view = controller.snapshot().state;
  return controller.actAs(playerId, { ...action, matchId: view.matchId, phaseId: view.phaseId });
};

test('fixture council projects readiness and fixed budgets before the two bids reveal atomically', () => {
  for (const first of ['jon', 'lydia']) {
    const controller = createFixtureController({ viewer: host });
    const votes = { jon: { type: 'commitCouncil', choiceId: 'small-shop-supremacy', bid: 1 }, lydia: { type: 'commitCouncil', choiceId: 'honest-wages', bid: 0 } };
    const other = first === 'jon' ? 'lydia' : 'jon';
    send(controller, first, votes[first]);
    for (const viewer of [host, seat(other)]) {
      const view = controller.snapshot(viewer).state;
      assert.equal(view.council.ready[first], true);
      assert.equal(view.council.ownCommitment, null);
      assert.equal(view.players.jon.influence, 2);
      assert.equal(view.players.lydia.influence, 2);
      assert.equal(view.lastCouncil, null);
    }
    assert.deepEqual(controller.snapshot(seat(first)).state.council.ownCommitment, { choiceId: votes[first].choiceId, bid: votes[first].bid });
    send(controller, other, votes[other]);
    const revealed = controller.snapshot().state;
    assert.equal(revealed.stage, 'actions');
    assert.equal(revealed.activePlayer, 'lydia');
    assert.equal(revealed.activeLaws.economy, 'small-shop-supremacy');
    assert.equal(revealed.players.jon.influence, 1);
    assert.equal(revealed.players.lydia.influence, 2);
    assert.deepEqual(revealed.lastCouncil.choices, { jon: { choiceId: 'small-shop-supremacy', bid: 1 }, lydia: { choiceId: 'honest-wages', bid: 0 } });
  }
});

test('fixture worked opening reaches the independently specified session-two accounting', () => {
  const controller = createFixtureController({ viewer: host });
  send(controller, 'jon', { type: 'commitCouncil', choiceId: 'small-shop-supremacy', bid: 1 });
  send(controller, 'lydia', { type: 'commitCouncil', choiceId: 'honest-wages', bid: 0 });
  send(controller, 'lydia', { type: 'build', designId: 'corner-shop', row: 0, col: 0 });
  send(controller, 'jon', { type: 'build', designId: 'corner-shop', row: 0, col: 0 });
  send(controller, 'lydia', { type: 'build', designId: 'pocket-theatre', row: 0, col: 1 });
  send(controller, 'jon', { type: 'build', designId: 'button-workshop', row: 0, col: 1 });
  send(controller, 'lydia', { type: 'work' });
  send(controller, 'jon', { type: 'work' });
  const view = controller.snapshot().state;
  assert.equal(view.session, 2);
  assert.equal(view.stage, 'council');
  assert.equal(view.chair, 'lydia');
  for (const id of ['jon', 'lydia']) {
    assert.equal(view.players[id].coins, 7);
    assert.equal(view.players[id].score.buildings, 3);
    assert.equal(view.players[id].score.civic, 0);
    assert.equal(view.players[id].buildsThisSession, 0);
  }
  assert.equal(view.players.jon.influence, 2);
  assert.equal(view.players.lydia.influence, 3);
});

test('the fixture completes six councils and thirty-six turns with no extra income and an exact tie', () => {
  const controller = createFixtureController({ viewer: host });
  const phases = new Set();
  const counts = { jon: 0, lydia: 0 };
  const starts = { jon: 0, lydia: 0 };
  const chairs = { jon: 0, lydia: 0 };
  for (let session = 1; session <= 6; session++) {
    const council = controller.snapshot().state;
    assert.equal(council.session, session);
    assert.equal(council.term, Math.ceil(session / 2));
    assert.equal(council.market.length, 6);
    assert.equal(council.stage, 'council');
    chairs[council.chair]++;
    send(controller, 'jon', { type: 'commitCouncil', choiceId: 'keep', bid: 0 });
    send(controller, 'lydia', { type: 'commitCouncil', choiceId: 'keep', bid: 0 });
    starts[controller.snapshot().state.activePlayer]++;
    for (let index = 0; index < 6; index++) {
      const view = controller.snapshot().state;
      assert.equal(view.actionIndex, index);
      assert.ok(!phases.has(view.phaseId));
      phases.add(view.phaseId);
      counts[view.activePlayer]++;
      send(controller, view.activePlayer, { type: 'work' });
    }
  }
  const end = controller.snapshot().state;
  assert.equal(end.stage, 'finished');
  assert.equal(end.result.winner, 'tie');
  assert.deepEqual(counts, { jon: 18, lydia: 18 });
  assert.deepEqual(starts, { jon: 3, lydia: 3 });
  assert.deepEqual(chairs, { jon: 3, lydia: 3 });
  assert.deepEqual(end.result.scores, { jon: 4, lydia: 4 });
  for (const player of Object.values(end.players)) {
    assert.equal(player.coins, 73, '4 initial + 54 from Work + 15 from exactly five incomes');
    assert.equal(player.influence, 6);
  }
});

test('existing fixture cities and new placements keep distinct instance identities', () => {
  const controller = createFixtureController({ scene: 'actions', viewer: seat('jon') });
  send(controller, 'jon', { type: 'build', designId: 'public-library', row: 0, col: 2 });
  const instances = controller.snapshot().state.players.jon.city.filter(Boolean).map(tile => tile.instanceId);
  assert.equal(new Set(instances).size, instances.length);
});

test('a stale action cannot run in a later fixture turn or change the snapshot', () => {
  const controller = createFixtureController({ scene: 'actions', viewer: seat('jon') });
  const view = controller.snapshot().state;
  const stale = { type: 'work', matchId: view.matchId, phaseId: view.phaseId };
  controller.actAs('jon', stale);
  send(controller, 'lydia', { type: 'work' });
  const current = controller.snapshot();
  assert.throws(() => controller.actAs('jon', stale), /turn has ended/);
  assert.deepEqual(controller.snapshot(), current);
});
