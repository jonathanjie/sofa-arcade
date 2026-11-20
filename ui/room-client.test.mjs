import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoomClient, RoomClientError } from './room-client.mjs';

const CODE = 'ABC234';
const TOKEN = 'x'.repeat(43);
const fresh = (revision = 3, state = {}, envelope = {}) => ({
  code: CODE, gameId: 'private-fixture', revision, phase: 'playing',
  state: { matchId: 'match-one', phaseId: 'council-one', phase: 'playing', stage: 'council', activePlayer: null,
    council: { ready: { jon: false, lydia: false }, ownCommitment: null }, ...state },
  players: { jon: { joined: true, connected: true, lastSeen: 1 }, lydia: { joined: true, connected: true, lastSeen: 1 } },
  expiresAt: Date.now() + 100000, ...envelope,
});
const vote = () => ({ type: 'commitCouncil', matchId: 'match-one', phaseId: 'council-one', choiceId: 'keep', bid: 1 });
const city = () => ({ type: 'work', matchId: 'match-one', phaseId: 'turn-one' });
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
function client(t, options = {}) {
  const value = createRoomClient({ code: CODE, token: TOKEN, playerId: 'jon', initialRoom: fresh(), retryMs: 0, ...options });
  t.after(() => value.dispose());
  return value;
}

test('commands are immutable and serialized; a queued city action never follows the player into their next turn', async t => {
  const calls = [];
  const result = deferred();
  const views = [];
  const initialRoom = fresh(3, { stage: 'actions', phaseId: 'turn-one', activePlayer: 'jon', council: null });
  const c = client(t, { initialRoom, onRoom: value => views.push(value), fetcher: async (url, options) => {
    calls.push({ url, ...options }); return result.promise;
  } });
  const action = city();
  const first = c.submit(action);
  const second = assert.rejects(c.submit(city()), { code: 'stale_phase' });
  action.phaseId = 'tampered';
  await tick();
  assert.equal(calls.length, 1);
  assert.equal(views.length, 1, 'No private engine prediction is emitted');
  const next = fresh(4, { stage: 'actions', phaseId: 'turn-three', activePlayer: 'jon', council: null });
  result.resolve(json(next));
  assert.equal((await first).state.phaseId, 'turn-three');
  await second;
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].body).action, city());
  assert.equal(JSON.parse(calls[0].body).revision, 3);
  assert.equal(calls[0].headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(calls[0].url, `/api/rooms/${CODE}/action`);
});

test('a lost winning response retries the exact body even after a newer SSE finish arrives', async t => {
  const calls = [];
  const statuses = [];
  const finished = fresh(4, { phase: 'finished', stage: 'finished', phaseId: 'finished', council: null }, { phase: 'finished' });
  let c;
  c = client(t, { onStatus: status => statuses.push(status), fetcher: async (_url, options) => {
    calls.push(options.body);
    if (calls.length === 1) { c.receive(finished); throw new Error('socket lost after commit'); }
    return json(finished);
  } });
  assert.equal((await c.submit(vote())).phase, 'finished');
  assert.equal(calls.length, 2);
  assert.equal(calls[0], calls[1]);
  assert.equal(JSON.parse(calls[1]).revision, 3);
  assert.ok(statuses.some(value => value.state === 'offline'));
  assert.ok(statuses.some(value => value.state === 'reconnecting'));
  assert.equal(statuses.at(-1).state, 'connected');
});

test('newer projections win over delayed action acknowledgments; snapshot copies cannot change internal state', async t => {
  const result = deferred();
  const views = [];
  const c = client(t, { onRoom: value => views.push(value), fetcher: async () => result.promise });
  const sent = c.submit(vote());
  await tick();
  const locked = fresh(4, { council: { ready: { jon: true, lydia: false }, ownCommitment: { choiceId: 'keep', bid: 1 } } });
  c.receive(locked);
  locked.state.council.ownCommitment.bid = 99;
  views.at(-1).state.council.ownCommitment.bid = 77;
  const revealed = fresh(5, { stage: 'actions', phaseId: 'turn-one', activePlayer: 'jon', council: null });
  assert.equal(c.receive(revealed), true);
  result.resolve(json(fresh(4, { council: { ready: { jon: true, lydia: false }, ownCommitment: { choiceId: 'keep', bid: 1 } } })));
  assert.equal((await sent).revision, 5);
  assert.equal(views.at(-1).state.phaseId, 'turn-one');
  assert.equal(c.receive(fresh(5, { stage: 'actions', phaseId: 'obsolete', activePlayer: 'jon', council: null })), false);
});

test('exhausted retries retain uncertainty and reconnect resolves it with the original ID', async t => {
  const calls = [];
  let online = false;
  const locked = fresh(4, { council: { ready: { jon: true, lydia: false }, ownCommitment: { choiceId: 'keep', bid: 1 } } });
  const c = client(t, { maxRetries: 0, fetcher: async (url, options) => {
    calls.push({ url, body: options.body });
    if (!online) throw new Error('offline');
    return json(locked);
  } });
  await assert.rejects(c.submit(vote()), { code: 'unconfirmed_action' });
  await assert.rejects(c.submit({ ...vote(), bid: 2 }), { code: 'unconfirmed_action' });
  assert.equal(calls.length, 1);
  online = true;
  const restored = await c.reconnect();
  assert.equal(restored.state.council.ownCommitment.bid, 1);
  assert.equal(calls[0].body, calls[1].body);
  assert.equal(calls[2].url, `/api/rooms/${CODE}`);
  await assert.rejects(c.submit(vote()), { code: 'already_committed' });
  assert.equal(calls.length, 3);
});

test('resubmitting an uncertain action in another key order resumes the same immutable request', async t => {
  const calls = [];
  const c = client(t, { maxRetries: 0, fetcher: async (_url, options) => {
    calls.push(options.body);
    if (calls.length === 1) throw new Error('offline');
    return json(fresh(4));
  } });
  await assert.rejects(c.submit(vote()), { code: 'unconfirmed_action' });
  const original = vote();
  const same = Object.fromEntries(Object.entries(original).reverse());
  await c.submit(same);
  assert.equal(calls[0], calls[1]);
});

test('stale revision is refreshed and rejected, never rebased by the browser; error text is locally safe', async t => {
  const calls = [];
  const statuses = [];
  const c = client(t, { onStatus: value => statuses.push(value), fetcher: async (url, options) => {
    calls.push({ url, options });
    if (options.method === 'POST') return json({ code: 'stale_revision', error: `PRIVATE ${TOKEN}` }, 409);
    return json(fresh(5, { stage: 'actions', phaseId: 'turn-two', activePlayer: 'lydia', council: null }));
  } });
  const error = await c.submit(vote()).then(() => assert.fail(), value => value);
  assert.equal(error.code, 'stale_revision');
  assert.equal(calls.filter(value => value.options.method === 'POST').length, 1);
  assert.equal(calls.filter(value => value.options.method === 'GET').length, 1);
  assert.ok(!JSON.stringify(statuses).includes(TOKEN));
  assert.ok(!error.message.includes('PRIVATE'));
});

test('dispose cancels an in-flight fetch that ignores abort, rejects queued work, and ignores late responses', async t => {
  const result = deferred();
  const calls = [];
  const views = [];
  const statuses = [];
  const c = client(t, { onRoom: value => views.push(value), onStatus: value => statuses.push(value), fetcher: async (_url, options) => {
    calls.push(options); return result.promise;
  } });
  const first = assert.rejects(c.submit(vote()), { code: 'disposed' });
  const second = assert.rejects(c.submit(vote()), { code: 'disposed' });
  await tick();
  c.dispose(); c.dispose();
  await first; await second;
  assert.equal(calls[0].signal.aborted, true);
  const counts = { views: views.length, statuses: statuses.length };
  result.resolve(json(fresh(4)));
  await tick();
  assert.deepEqual({ views: views.length, statuses: statuses.length }, counts);
  assert.equal(c.receive(fresh(5)), false);
  await assert.rejects(c.submit(vote()), { code: 'disposed' });
});

test('request timeout bounds an unresponsive fetch while retaining its retry identity', async t => {
  let signal;
  const c = client(t, { requestTimeoutMs: 5, maxRetries: 0, fetcher: async (_url, options) => {
    signal = options.signal;
    return new Promise(() => {});
  } });
  await assert.rejects(c.submit(vote()), { code: 'unconfirmed_action' });
  assert.equal(signal.aborted, true);
});

test('immediate navigation cancels a command before the fetcher can send it', async t => {
  let calls = 0;
  const c = client(t, { fetcher: async () => { calls++; return json(fresh(4)); } });
  const pending = assert.rejects(c.submit(vote()), { code: 'disposed' });
  c.dispose();
  await pending;
  await tick();
  assert.equal(calls, 0);
});

test('dispose directly cancels a stalled JSON response reader when fetch ignores abort', async t => {
  const started = deferred();
  const cancelled = deferred();
  const c = client(t, { fetcher: async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"code":'));
      started.resolve();
    },
    cancel() { cancelled.resolve(); },
  }), { headers: { 'Content-Type': 'application/json' } }) });
  const pending = assert.rejects(c.submit(vote()), { code: 'disposed' });
  await started.promise;
  await tick();
  c.dispose();
  await pending;
  await cancelled.promise;
});

test('the initial snapshot is authenticated and credentials stay out of the projected view', async t => {
  const got = deferred();
  const calls = [];
  const c = client(t, { initialRoom: undefined, onRoom: value => got.resolve(value), fetcher: async (url, options) => {
    calls.push({ url, options });
    return json({ ...fresh(), playerToken: TOKEN, hostToken: 'must-not-reach-view', recentActions: ['private'] });
  } });
  const view = await got.promise;
  assert.equal(calls[0].url, `/api/rooms/${CODE}`);
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${TOKEN}`);
  assert.ok(!JSON.stringify(view).includes(TOKEN));
  assert.equal(Object.hasOwn(view, 'hostToken'), false);
  assert.equal(c.receive(fresh(2)), false);
  assert.equal(c.receive(fresh(4, {}, { code: 'DEF234' })), false);
  assert.equal(c.receive(fresh(4, {}, { gameId: 'other-game' })), false);
  assert.equal(c.receive(fresh(4, { matchId: undefined })), false);
  assert.equal(c.receive(fresh(4, { phaseId: null })), false);
});

test('retired match snapshots and old turn actions cannot return after a rematch', async t => {
  let calls = 0;
  const c = client(t, { fetcher: async () => { calls++; return json(fresh()); } });
  assert.equal(c.receive(fresh(10, { matchId: 'match-two', phaseId: 'council-two' })), true);
  assert.equal(c.receive(fresh(11)), false);
  await assert.rejects(c.submit(vote()), { code: 'stale_match' });
  assert.equal(calls, 0);
});

test('LAN action IDs use secure random values without requiring secure-context randomUUID', async t => {
  const original = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID');
  Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: undefined });
  t.after(() => { if (original) Object.defineProperty(globalThis.crypto, 'randomUUID', original); else delete globalThis.crypto.randomUUID; });
  let payload;
  const c = client(t, { fetcher: async (_url, options) => { payload = JSON.parse(options.body); return json(fresh(4)); } });
  await c.submit(vote());
  assert.match(payload.actionId, /^[a-f0-9]{48}$/);
});

test('terminal authentication failure stops further requests without exposing server errors', async t => {
  let calls = 0;
  const statuses = [];
  const c = client(t, { onStatus: value => statuses.push(value), fetcher: async () => {
    calls++; return json({ code: 'invalid_token', error: `private ${TOKEN}` }, 403);
  } });
  await assert.rejects(c.submit(vote()), { code: 'invalid_token' });
  await assert.rejects(c.submit(vote()), { code: 'invalid_token' });
  await assert.rejects(c.reconnect(), { code: 'invalid_token' });
  assert.equal(calls, 1);
  assert.equal(statuses.at(-1).state, 'error');
  assert.ok(!JSON.stringify(statuses).includes(TOKEN));
});

test('successful but unverifiable replies remain uncertain and retry with the same identity', async t => {
  for (const badReply of [() => new Response('broken'), () => json({ ...fresh(4), state: {} }), () => json(fresh(3))]) {
    const bodies = [];
    const c = client(t, { maxRetries: 0, fetcher: async (_url, options) => {
      bodies.push(options.body);
      return bodies.length === 1 ? badReply() : json(fresh(4));
    } });
    await assert.rejects(c.submit(vote()), { code: 'unconfirmed_action' });
    await c.submit(vote());
    assert.equal(bodies[0], bodies[1]);
  }
});

test('validation rejects missing phase fences and exposes only bounded safe client errors', async t => {
  let calls = 0;
  const c = client(t, { fetcher: async () => { calls++; return json(fresh()); } });
  await assert.rejects(c.submit({ type: 'work' }), { code: 'invalid_action' });
  await assert.rejects(c.submit({ ...vote(), phaseId: 'old-council' }), { code: 'stale_phase' });
  assert.equal(calls, 0);
  assert.equal(new RoomClientError(`private-${TOKEN}`).code, 'request_rejected');
  assert.throws(() => createRoomClient({ code: CODE, token: TOKEN, playerId: 'forged' }), TypeError);
});
