import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction } from '../game/engine.mjs';
import { createActionQueue } from './action-queue.mjs';

const turn = () => new Promise(resolve => setImmediate(resolve));
function setup() {
  const room = { code: 'ABCDEF', revision: 3, phase: 'playing', state: createGame({ seed: 'queue', firstPlayer: 'jon' }) };
  const requests = [], views = [], errors = [];
  let sequence = 0;
  const queue = createActionQueue({ room, playerId: 'jon', apply: applyAction, makeId: () => `action-${++sequence}`,
    send: payload => new Promise((resolve, reject) => requests.push({ payload, resolve, reject })),
    onView: (value, count) => views.push({ room: value, count }), onError: error => errors.push(error),
  });
  const commit = (base, action) => {
    const state = applyAction(base.state, 'jon', action);
    return { ...base, revision: base.revision + 1, state, phase: state.phase };
  };
  return { room, queue, requests, views, errors, commit };
}

test('two rapid taps render immediately but reach the server in revision order', async () => {
  const f = setup();
  f.queue.dispatch({ type: 'move', direction: 'up' });
  f.queue.dispatch({ type: 'move', direction: 'up' });
  assert.equal(f.views.at(-1).room.state.players.jon.row, 2);
  assert.equal(f.views.at(-1).count, 2);
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].payload.revision, 3);
  const first = f.commit(f.room, f.requests[0].payload.action);
  f.requests[0].resolve(first);
  await turn();
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[1].payload.revision, 4);
  assert.notEqual(f.requests[0].payload.actionId, f.requests[1].payload.actionId);
  f.requests[1].resolve(f.commit(first, f.requests[1].payload.action));
  await turn();
  assert.equal(f.queue.pendingCount, 0);
  assert.equal(f.views.at(-1).room.revision, 5);
  assert.equal(f.views.at(-1).room.state.players.jon.row, 2);
  assert.equal(f.errors.length, 0);
});

test('stale polling cannot undo prediction and early push acknowledgement is not applied twice', async () => {
  const f = setup();
  f.queue.dispatch({ type: 'move', direction: 'up' });
  f.queue.receive(f.room);
  assert.equal(f.views.length, 1);
  const next = f.commit(f.room, f.requests[0].payload.action);
  f.queue.receive(next);
  assert.equal(f.views.length, 1);
  f.requests[0].resolve(next);
  await turn();
  assert.equal(f.views.at(-1).room.state.players.jon.row, 3);
  assert.equal(f.views.at(-1).room.state.actionNumber, 1);
});

test('rejected moves roll back both predictions and do not send queued input', async () => {
  const f = setup();
  f.queue.dispatch({ type: 'move', direction: 'up' });
  f.queue.dispatch({ type: 'move', direction: 'up' });
  f.requests[0].reject(Object.assign(new Error('Stale revision'), { status: 409 }));
  await turn();
  assert.equal(f.requests.length, 1);
  assert.equal(f.queue.pendingCount, 0);
  assert.equal(f.views.at(-1).room.state.players.jon.row, 4);
  assert.equal(f.errors.length, 1);
});

test('a newer authoritative turn invalidates unsent predictions without sending illegal actions', async () => {
  const f = setup();
  f.queue.dispatch({ type: 'move', direction: 'up' });
  f.queue.dispatch({ type: 'move', direction: 'up' });
  const first = f.commit(f.room, f.requests[0].payload.action);
  const external = f.commit(first, { type: 'end' });
  f.queue.receive(external);
  f.requests[0].resolve(first);
  await turn();
  assert.equal(f.requests.length, 1);
  assert.equal(f.views.at(-1).room.revision, external.revision);
  assert.equal(f.views.at(-1).room.state.activePlayer, 'lydia');
  assert.equal(f.queue.pendingCount, 0);
});

test('leaving a room prevents late responses from altering the next screen', async () => {
  const f = setup();
  f.queue.dispatch({ type: 'move', direction: 'up' });
  f.queue.dispose();
  f.requests[0].resolve(f.commit(f.room, f.requests[0].payload.action));
  await turn();
  assert.equal(f.views.length, 1);
  assert.equal(f.errors.length, 0);
});

test('invalid and wrong-room pushes cannot poison the acknowledged revision', () => {
  const f = setup();
  for (const revision of [undefined, null, NaN, Infinity, -1, 3.5, '4']) {
    f.queue.receive({ ...f.room, revision });
  }
  f.queue.receive({ ...f.room, code: 'UVWXYZ', revision: 99 });
  assert.equal(f.views.length, 0);
  assert.equal(f.queue.confirmedRoom, f.room);
  f.queue.dispatch({ type: 'move', direction: 'up' });
  assert.equal(f.requests[0].payload.revision, 3);
  f.queue.dispose();
});

test('a failed request keeps a newer pushed authority and drops only local predictions', async () => {
  const f = setup();
  f.queue.dispatch({ type: 'move', direction: 'up' });
  f.queue.dispatch({ type: 'move', direction: 'up' });
  const committed = f.commit(f.room, f.requests[0].payload.action);
  f.queue.receive(committed);
  f.requests[0].reject(new Error('Response lost'));
  await turn();
  assert.equal(f.requests.length, 1);
  assert.equal(f.queue.pendingCount, 0);
  assert.equal(f.queue.confirmedRoom.revision, 4);
  assert.equal(f.views.at(-1).room.state.players.jon.row, 3);
  assert.equal(f.errors.length, 1);
});

test('wrong-room and stale POST replies cannot replace confirmed state', async () => {
  for (const reply of [{ code: 'UVWXYZ', revision: 4 }, { code: 'ABCDEF', revision: 2 }]) {
    const f = setup();
    f.queue.dispatch({ type: 'move', direction: 'up' });
    f.requests[0].resolve({ ...f.room, ...reply });
    await turn();
    assert.equal(f.queue.confirmedRoom, f.room);
    assert.equal(f.views.at(-1).room.state.players.jon.row, 4);
    assert.equal(f.queue.pendingCount, 0);
    assert.equal(f.errors.length, 1);
  }
});

test('a newer rematch discards unsent old plans even when their moves remain legal', async () => {
  const f = setup();
  f.queue.dispatch({ type: 'move', direction: 'up' });
  f.queue.dispatch({ type: 'move', direction: 'up' });
  const first = f.commit(f.room, f.requests[0].payload.action);
  const rematch = { ...f.room, revision: 90, state: createGame({ seed: 'a-new-match', firstPlayer: 'jon' }) };
  f.queue.receive(rematch);
  assert.equal(f.queue.pendingCount, 2, 'an early push must not clear the live in-flight item');
  assert.equal(f.requests.length, 1);
  f.requests[0].resolve(first);
  await turn();
  assert.equal(f.requests.length, 1, 'the old second move must never enter the new game');
  assert.equal(f.queue.pendingCount, 0);
  assert.equal(f.queue.confirmedRoom.revision, 90);
  assert.equal(f.views.at(-1).room.state.players.jon.row, 4);

  f.queue.dispatch({ type: 'move', direction: 'up' });
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[1].payload.revision, 90);
  f.requests[1].resolve(f.commit(rematch, f.requests[1].payload.action));
  await turn();
  assert.equal(f.views.at(-1).room.state.players.jon.row, 3);
  assert.equal(f.queue.pendingCount, 0);
});

test('four rapid inputs across an alternating-round boundary stay legal and ordered', async () => {
  const f = setup();
  // Jon finishes round two, then starts round three. A nap isolates the turn-order
  // behavior from the swipe so all four legal movements can be predicted now.
  Object.assign(f.room.state, { round: 2, turnInRound: 1, forecast: { type: 'nap' } });
  const actions = [
    { type: 'move', direction: 'up' }, { type: 'move', direction: 'up' },
    { type: 'move', direction: 'right' }, { type: 'move', direction: 'down' },
  ];
  for (const action of actions) f.queue.dispatch(action);
  assert.equal(f.queue.pendingCount, 4);
  assert.equal(f.views.at(-1).room.state.round, 3);
  assert.equal(f.views.at(-1).room.state.activePlayer, 'lydia');
  assert.equal(f.views.at(-1).room.state.players.jon.row, 3);
  assert.equal(f.views.at(-1).room.state.players.jon.col, 1);
  assert.equal(f.requests.length, 1);
  let authoritative = f.room;
  for (let index = 0; index < actions.length; index++) {
    assert.equal(f.requests.length, index + 1);
    assert.equal(f.requests[index].payload.revision, 3 + index);
    authoritative = f.commit(authoritative, f.requests[index].payload.action);
    f.requests[index].resolve(authoritative);
    await turn();
  }
  assert.equal(f.queue.pendingCount, 0);
  assert.equal(f.queue.confirmedRoom.revision, 7);
  assert.equal(f.errors.length, 0);
});
