import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollectionGame } from '../../../ui/collection-game.mjs';
import { phaseAction } from '../fixtures/odd-laws-policy.mjs';
import { oddComponents, oddServer, ODD_GAME_ID } from './components.mjs';
import { openRoom, connectThree, closeStreams, request, command, submit, expectRevision,
  assertNoCredentials } from './harness.mjs';

function deferred() {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
}

async function within(promise, message, milliseconds = 5000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

test('Odd Laws: preference remount retains the uncertain real command until transport recovery resolves it', async t => {
  const components = await oddComponents(t);
  if (!components) return;
  const { createRoomClient } = await import('../../../ui/room-client.mjs');
  const host = await oddServer(components, { chair: 'lydia' });
  const streams = {};
  let bridge;
  const recoveryRequest = deferred();
  const releaseRecovery = deferred();
  t.after(async () => {
    releaseRecovery.resolve();
    bridge?.dispose();
    await closeStreams(streams);
    await host.close();
  });
  const live = await openRoom(host, { gameId: ODD_GAME_ID });
  Object.assign(streams, await connectThree(host, live));
  const initial = await request(host, `/api/rooms/${live.code}`, { token: live.tokens.jon });
  assert.equal(initial.status, 200);

  const posts = [];
  const updates = [];
  const statuses = [];
  const recovered = deferred();
  let dispatch;
  let recovering = false;
  let recoveryFinished = false;
  let unlocks = 0;
  let clientCreations = 0;
  let disposedViews = 0;
  const mountedPreferences = [];

  bridge = createCollectionGame({
    root: {}, viewer: { role: 'player', playerId: 'jon' },
    code: live.code, token: live.tokens.jon, initialRoom: initial.value,
    // The real client is used. Zero retries deterministically reaches its
    // exhausted-acknowledgment recovery path without a multi-second backoff.
    createRoomClient: options => {
      clientCreations++;
      return createRoomClient({ ...options, retryMs: 0, maxRetries: 0 });
    },
    fetcher: async (url, options) => {
      if (options.method === 'POST') {
        posts.push(options.body);
        if (posts.length === 2) {
          recoveryRequest.resolve();
          await releaseRecovery.promise;
        }
      }
      const response = await fetch(host.origin + url, {
        ...options, headers: { ...options.headers, ...(options.method === 'POST' ? { Origin: host.origin } : {}) },
      });
      if (options.method === 'POST' && posts.length === 1) {
        assert.equal(response.status, 200, 'the authority committed before the simulated lost acknowledgment');
        await response.body.cancel();
        throw new Error('Test-only transport loss after authority commit.');
      }
      return response;
    },
    sound: { unlock() { unlocks++; } },
    mount(_root, injected) {
      mountedPreferences.push(injected.preferences);
      dispatch = injected.dispatch;
      return {
        update(room) { updates.push(room); },
        setConnection(status) { statuses.push(status); },
        dispose() { disposedViews++; },
      };
    },
    onStatus(status) {
      if (recovering && status.state === 'connected') {
        recoveryFinished = true;
        recovered.resolve();
      }
    },
  });

  const vote = phaseAction(initial.value.state, 'commitCouncil', { choiceId: 'keep', bid: 1 });
  await assert.rejects(dispatch(vote), { code: 'unconfirmed_action' });
  assert.equal(unlocks, 1, 'the original dispatch unlocks sound synchronously');
  assert.equal(posts.length, 1);
  const sealed = await expectRevision(streams, initial.value.revision + 1);
  bridge.receive(sealed.jon.value);
  assert.deepEqual(updates.at(-1).state.council.ownCommitment, { choiceId: 'keep', bid: 1 });

  const revealed = await submit(host, live, 'lydia', command(initial.value,
    phaseAction(initial.value.state, 'commitCouncil', { choiceId: 'keep', bid: 0 })));
  assert.equal(revealed.status, 200);
  const visible = await expectRevision(streams, revealed.value.revision);
  bridge.receive(visible.jon.value);
  assert.equal(updates.at(-1).state.activePlayer, 'jon');
  assert.equal(posts.length, 1, 'ordinary room delivery does not start an uncontrolled retry loop');

  // Changing a mount-time presentation preference replaces only the view. The
  // authenticated client still owns its unresolved original command identity.
  const previousDispatch = dispatch;
  assert.equal(bridge.setPreferences({ reducedMotion: true }), true);
  assert.equal(clientCreations, 1, 'preference changes cannot replace the authenticated client');
  assert.equal(mountedPreferences.length, 2);
  assert.equal(disposedViews, 1);
  assert.equal(mountedPreferences.at(-1).reducedMotion, true);
  assert.equal(updates.at(-1).revision, revealed.value.revision);
  assert.equal(statuses.at(-1).state, 'offline', 'the new view retains unresolved-command status');
  await assert.rejects(previousDispatch(phaseAction(updates.at(-1).state, 'work')), /controller has closed/);
  assert.equal(posts.length, 1, 'the retired view cannot submit through the retained client');
  assert.equal(unlocks, 1, 'the retired view cannot manufacture another audio gesture');

  // A fresh transport connection must recover the original request identity,
  // even though SSE has already moved the UI past the original council.
  recovering = true;
  bridge.setConnection({ state: 'connected' });
  await within(recoveryRequest.promise, 'The shell did not ask the real client to resolve its uncertain command.');
  assert.equal(statuses.at(-1).state, 'reconnecting');
  assert.equal(recoveryFinished, false, 'connected cannot be advertised before uncertainty is resolved');
  bridge.setConnection({ state: 'connected' });
  bridge.setConnection({ state: 'connected' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(posts.length, 2, 'simultaneous transport heartbeats share one recovery request');
  assert.equal(posts[0], posts[1], 'recovery keeps the exact original action, ID, phase and revision');
  releaseRecovery.resolve();
  await within(recovered.promise, 'The recovered controller did not become connected.');
  assert.equal(statuses.at(-1).state, 'connected');
  assert.equal(updates.at(-1).revision, revealed.value.revision, 'retrying an already committed vote cannot advance revision');
  assert.equal(updates.at(-1).state.players.jon.influence, initial.value.state.players.jon.influence - 1,
    'the sealed bid is paid exactly once');

  const next = phaseAction(updates.at(-1).state, 'work');
  const applied = await dispatch(next);
  assert.equal(applied.revision, revealed.value.revision + 1);
  assert.equal(applied.state.activePlayer, 'lydia');
  assert.equal(posts.length, 3, 'a distinct action is permitted after recovery');
  assert.notEqual(JSON.parse(posts[2]).actionId, JSON.parse(posts[0]).actionId);
  assert.equal(unlocks, 2, 'background recovery does not fabricate another user gesture');
  const finalViews = await expectRevision(streams, applied.revision);
  for (const event of Object.values(finalViews)) assertNoCredentials(event.raw, live);
});
