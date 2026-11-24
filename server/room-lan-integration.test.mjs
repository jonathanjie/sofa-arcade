import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { request as httpRequest } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { startLanServer } from './lan.mjs';
import { MAX_BODY_BYTES } from './rooms.mjs';
import {
  PLAYERS, PRIVATE_SENTINEL, createPrivateApi, createPrivateEngine, openRoom, command,
  assertNoAuthoritySecrets, assertPendingView,
} from './room-platform-fixture.mjs';

// These journeys assert authorization and push delivery over real sockets.
// Keep the heartbeat outside the test watchdog so polling cannot satisfy a
// missing mutation notification, even on a busy runner.
const JOURNEY_TIMEOUT_MS = 60_000;
const HEARTBEAT_MS = 2 * JOURNEY_TIMEOUT_MS;

async function request(host, route, {
  body, token, method = body === undefined ? 'GET' : 'POST', headers = {},
} = {}) {
  const response = await fetch(host.origin + route, {
    method,
    headers: { ...(method === 'POST' ? { Origin: host.origin, 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  return { status: response.status, body: JSON.parse(text), text, response };
}

/** Independent raw frame reader: privacy assertions inspect the actual SSE bytes. */
async function listen(host, code, token) {
  const controller = new AbortController();
  const response = await fetch(`${host.origin}/api/rooms/${code}/events`, {
    headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  const reader = response.body.getReader();
  const history = [];
  const waiting = new Set();
  let stopped = false;
  let ended = false;
  let wire = '';
  let buffer = '';
  const decoder = new TextDecoder();
  const pumping = (async () => {
    try {
      while (!stopped) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        wire += text;
        buffer += text;
        let index;
        while ((index = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          const type = /^event: ([^\n]+)$/m.exec(frame)?.[1] || 'message';
          const data = frame.split('\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6)).join('\n');
          if (!data) continue;
          const event = { type, value: JSON.parse(data), raw: data, frame };
          history.push(event);
          for (const item of [...waiting]) if (item.predicate(event)) {
            waiting.delete(item);
            item.resolve(event);
          }
        }
      }
    } catch (error) {
      if (!stopped) {
        for (const item of waiting) item.reject(error);
        waiting.clear();
      }
    } finally {
      ended = true;
      for (const item of waiting) item.reject(new Error('Stream ended before the expected event.'));
      waiting.clear();
    }
  })();
  return {
    history,
    get wire() { return wire; },
    waitFor(predicate) {
      const found = history.find(predicate);
      if (found) return Promise.resolve(found);
      if (ended) return Promise.reject(new Error('Stream already ended.'));
      return new Promise((resolve, reject) => {
        waiting.add({ predicate, resolve, reject });
      });
    },
    async close() {
      if (stopped) return;
      stopped = true; controller.abort();
      await reader.cancel().catch(() => {});
      await pumping;
    },
  };
}

function rawRequest(host, route, headers) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(host.origin + route, { headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function fixtureHost(t, options = {}) {
  const engine = options.engine || createPrivateEngine({ sessions: 1 });
  const host = await startLanServer({ host: '127.0.0.1', port: 0, databasePath: ':memory:', heartbeatMs: HEARTBEAT_MS, roomApi: createPrivateApi(engine), ...options });
  const streams = [];
  t.after(async () => { await Promise.all(streams.map(stream => stream.close())); await host.close(); });
  const call = (route, values) => request(host, route, values);
  const live = await openRoom(call);
  const subscribe = async token => { const stream = await listen(host, live.code, token); streams.push(stream); return stream; };
  return { host, engine, live, call, subscribe, route: `/api/rooms/${live.code}` };
}

for (const firstActor of PLAYERS) {
  test(`actual TV and two-phone HTTP/SSE flow: ${firstActor} seals first, reconnect/retry/rematch stay private`, { timeout: JOURNEY_TIMEOUT_MS }, async t => {
    const { host, engine, live, call, subscribe, route } = await fixtureHost(t);
    const streams = { host: await subscribe(live.hostToken), jon: await subscribe(live.tokens.jon), lydia: await subscribe(live.tokens.lydia) };
    const initialRevision = live.game.revision;
    for (const stream of Object.values(streams)) {
      const snapshot = await stream.waitFor(event => event.type === 'room' && event.value.revision === initialRevision);
      assertPendingView(snapshot.value, null, { jon: false, lydia: false });
    }
    const choices = { jon: { choiceId: 'keep', bid: 1 }, lydia: { choiceId: live.game.state.council.optionIds[0], bid: 2 } };
    const firstBody = command(live.game, 'commitCouncil', choices[firstActor]);
    const first = await call(`${route}/action`, { token: live.tokens[firstActor], body: firstBody });
    assert.equal(first.status, 200, first.text);
    const ready = { jon: firstActor === 'jon', lydia: firstActor === 'lydia' };
    const credentials = [live.hostToken, ...Object.values(live.tokens), ...Object.values(live.clients)];
    assertPendingView(first.body, choices[firstActor], ready);
    assertNoAuthoritySecrets(first.text, credentials);
    for (const [viewer, stream] of Object.entries(streams)) {
      const pushed = await stream.waitFor(event => event.type === 'room' && event.value.revision === first.body.revision);
      assertPendingView(pushed.value, viewer === firstActor ? choices[firstActor] : null, ready);
      assertNoAuthoritySecrets(pushed.raw, credentials);
      if (viewer !== firstActor) assert.ok(!pushed.raw.includes('"bid":'), `${viewer} SSE must contain no sealed bid`);
    }
    const publicRead = await call(`${route}?role=player&playerId=${firstActor}`);
    assertPendingView(publicRead.body, null, ready);
    assertNoAuthoritySecrets(publicRead.text, credentials);
    assert.ok(!publicRead.text.includes('"bid":'));
    const duplicate = await call(`${route}/action`, { token: live.tokens[firstActor], body: firstBody });
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.body.revision, first.body.revision);
    assertPendingView(duplicate.body, choices[firstActor], ready);
    const idReuse = await call(`${route}/action`, { token: live.tokens[firstActor], body: { ...firstBody, action: { ...firstBody.action, bid: 0 } } });
    assert.equal(idReuse.status, 409);
    assert.equal(idReuse.body.code, 'action_id_reused');
    assertNoAuthoritySecrets(idReuse.text, credentials);
    assert.equal(idReuse.body.state, undefined);

    // A browser refresh gets its own lock back, while the TV and other seat never receive it.
    await streams[firstActor].close();
    streams[firstActor] = await subscribe(live.tokens[firstActor]);
    const restored = await streams[firstActor].waitFor(event => event.type === 'room' && event.value.revision === first.body.revision);
    assertPendingView(restored.value, choices[firstActor], ready);

    const secondActor = firstActor === 'jon' ? 'lydia' : 'jon';
    const second = await call(`${route}/action`, { token: live.tokens[secondActor], body: command(live.game, 'commitCouncil', choices[secondActor]) });
    assert.equal(second.status, 200, second.text);
    assert.equal(second.body.revision, initialRevision + 2);
    assert.equal(second.body.state.stage, 'actions');
    for (const stream of Object.values(streams)) {
      const revealed = await stream.waitFor(event => event.type === 'room' && event.value.revision === second.body.revision);
      assert.deepEqual(revealed.value.state.lastCouncil.choices, choices);
      assert.equal(revealed.value.state.players.jon.influence, 1);
      assert.equal(revealed.value.state.players.lydia.influence, 0);
      assertNoAuthoritySecrets(revealed.raw, credentials);
    }

    let current = second.body;
    const delayed = command(current, 'work');
    while (current.state.actionIndex < 5) {
      const applied = await call(`${route}/action`, { token: live.tokens[current.state.activePlayer], body: command(current, 'work') });
      assert.equal(applied.status, 200);
      current = applied.body;
    }
    const stale = await call(`${route}/action`, { token: live.tokens.lydia, body: { ...delayed, revision: current.revision } });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, 'stale_phase');
    const winning = command(current, 'work');
    const winnerToken = live.tokens[current.state.activePlayer];
    // Discard the actual winning HTTP body, as if the phone lost that response.
    const lost = await fetch(`${host.origin}${route}/action`, {
      method: 'POST', headers: { Origin: host.origin, Authorization: `Bearer ${winnerToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(winning),
    });
    assert.equal(lost.status, 200);
    await lost.body.cancel();
    const finished = await streams.host.waitFor(event => event.type === 'room' && event.value.phase === 'finished');
    const retried = await call(`${route}/action`, { token: winnerToken, body: winning });
    assert.equal(retried.status, 200);
    assert.equal(retried.body.revision, finished.value.revision);
    assert.deepEqual(retried.body.state.result, finished.value.state.result);
    for (const stream of Object.values(streams)) await stream.waitFor(event => event.type === 'room' && event.value.revision === retried.body.revision);

    const rematch = await call(`${route}/rematch`, { token: live.hostToken, body: {} });
    assert.equal(rematch.status, 200);
    assert.notEqual(rematch.body.state.matchId, live.game.state.matchId);
    assertPendingView(rematch.body, null, { jon: false, lydia: false });
    for (const stream of Object.values(streams)) {
      const fresh = await stream.waitFor(event => event.type === 'room' && event.value.revision === rematch.body.revision);
      assertPendingView(fresh.value, null, { jon: false, lydia: false });
      assertNoAuthoritySecrets(stream.wire, credentials);
    }
    const oldMatch = await call(`${route}/action`, { token: live.tokens[firstActor], body: { ...firstBody, revision: rematch.body.revision } });
    assert.equal(oldMatch.status, 409);
    assert.equal(oldMatch.body.code, 'stale_match');
    assertNoAuthoritySecrets(oldMatch.text, credentials);
    assert.ok(engine.stats.projections.some(viewer => viewer.role === 'host'));
    for (const playerId of PLAYERS) assert.ok(engine.stats.projections.some(viewer => viewer.role === 'player' && viewer.playerId === playerId));
  });
}

test('live private streams reject untrusted authority, rotate credentials, and never serve test/private modules', { timeout: JOURNEY_TIMEOUT_MS }, async t => {
  const { host, live, call, subscribe, route } = await fixtureHost(t);
  const jon = await subscribe(live.tokens.jon);
  const tv = await subscribe(live.hostToken);
  const sealedBody = command(live.game, 'commitCouncil', { choiceId: 'keep', bid: 2 });
  const sealed = await call(`${route}/action`, { token: live.tokens.jon, body: sealedBody });
  assert.equal(sealed.status, 200);
  await jon.waitFor(event => event.type === 'room' && event.value.revision === sealed.body.revision);
  assert.equal((await call(`${route}/events`)).status, 401);
  assert.equal((await call(`${route}/events`, { token: 'x'.repeat(43) })).status, 403);
  assert.equal((await call(`${route}/events?role=host&token=${live.hostToken}`)).status, 401);
  for (const origin of ['https://foreign.invalid', 'null', '']) {
    const result = await rawRequest(host, `${route}/events`, { Authorization: `Bearer ${live.hostToken}`, Origin: origin });
    assert.equal(result.status, 403, `Origin ${JSON.stringify(origin)}`);
    assertNoAuthoritySecrets(result.text);
  }
  for (const authority of [`evil.invalid:${host.port}`, `127.0.0.1:${host.port + 1}`, `127.0.0.1:${host.port}@evil.invalid:${host.port}`, `127.0.0.1:${host.port}/evil`]) {
    const result = await rawRequest(host, route, { Host: authority, Authorization: `Bearer ${live.hostToken}` });
    assert.ok([400, 421].includes(result.status), `Host ${authority}: ${result.status}`);
    assertNoAuthoritySecrets(result.text);
  }
  const rotated = await call(`${route}/join`, { body: { playerId: 'jon', clientId: live.clients.jon } });
  assert.equal(rotated.status, 200);
  assertPendingView(rotated.body, { choiceId: 'keep', bid: 2 });
  const revoked = await jon.waitFor(event => event.type === 'error');
  assert.equal(revoked.value.status, 403);
  assertNoAuthoritySecrets(revoked.raw, [rotated.body.playerToken, ...Object.values(live.tokens), live.hostToken]);
  assert.equal((await call(`${route}/events`, { token: live.tokens.jon })).status, 403);
  const replacement = await subscribe(rotated.body.playerToken);
  const restored = await replacement.waitFor(event => event.type === 'room');
  assertPendingView(restored.value, { choiceId: 'keep', bid: 2 });
  const tvUpdated = await tv.waitFor(event => event.type === 'room' && event.value.revision === rotated.body.revision);
  assertPendingView(tvUpdated.value, null);
  assert.ok(!tv.wire.includes('"bid":'));
  assertNoAuthoritySecrets(tv.wire, [rotated.body.playerToken, ...Object.values(live.tokens), live.hostToken]);

  const oversized = await call(`${route}/action`, { token: rotated.body.playerToken, body: 'x'.repeat(MAX_BODY_BYTES + 1) });
  assert.equal(oversized.status, 413);
  assertNoAuthoritySecrets(oversized.text);
  for (const source of [
    '/server/room-platform-fixture.mjs', '/server/rooms.mjs', '/server/room-platform.test.mjs',
    '/ui/room-client.test.mjs', '/games/odd-laws-society/engine.mjs', '/.sofa-lan/rooms.sqlite',
  ]) {
    const response = await fetch(host.origin + source);
    assert.equal(response.status, 404, source);
    assert.ok(!(await response.text()).includes(PRIVATE_SENTINEL));
  }
  const moduleResponse = await fetch(host.origin + '/room-client.mjs');
  assert.equal(moduleResponse.status, 200);
  assert.match(await moduleResponse.text(), /createRoomClient/);
});

test('SQLite restart restores locked own vote, identity, fixed budget and per-viewer SSE; expiry closes restored rooms', { timeout: JOURNEY_TIMEOUT_MS }, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'sofa-private-restore-'));
  const databasePath = path.join(directory, 'rooms.sqlite');
  const engine = createPrivateEngine({ sessions: 1 });
  const roomApi = createPrivateApi(engine);
  let host;
  const streams = [];
  t.after(async () => { await Promise.all(streams.map(stream => stream.close())); await host?.close(); await rm(directory, { recursive: true, force: true }); });
  const boot = () => startLanServer({ host: '127.0.0.1', port: 0, databasePath, roomApi, heartbeatMs: HEARTBEAT_MS });
  host = await boot();
  const live = await openRoom((route, options) => request(host, route, options));
  const route = `/api/rooms/${live.code}`;
  const body = command(live.game, 'commitCouncil', { choiceId: 'keep', bid: 2 });
  const sealed = await request(host, `${route}/action`, { token: live.tokens.jon, body });
  assert.equal(sealed.status, 200);
  await host.close();
  const persisted = new DatabaseSync(databasePath);
  const stored = persisted.prepare('SELECT data FROM sofa_rooms WHERE code = ?').get(live.code).data;
  assert.ok(stored.includes(PRIVATE_SENTINEL));
  for (const credential of [live.hostToken, ...Object.values(live.tokens), ...Object.values(live.clients)]) assert.ok(!stored.includes(credential));
  assert.deepEqual(JSON.parse(stored).state.privateState.phaseBudgets, { jon: 2, lydia: 2 });
  persisted.close();

  host = await boot();
  for (const [token, expected] of [[live.hostToken, null], [live.tokens.jon, { choiceId: 'keep', bid: 2 }], [live.tokens.lydia, null]]) {
    const read = await request(host, route, { token });
    assert.equal(read.status, 200);
    assert.equal(read.body.revision, sealed.body.revision);
    assertPendingView(read.body, expected);
    assertNoAuthoritySecrets(read.text, Object.values(live.tokens));
    const stream = await listen(host, live.code, token);
    streams.push(stream);
    const initial = await stream.waitFor(event => event.type === 'room');
    assertPendingView(initial.value, expected);
    assertNoAuthoritySecrets(initial.raw, Object.values(live.tokens));
  }
  const retried = await request(host, `${route}/action`, { token: live.tokens.jon, body });
  assert.equal(retried.status, 200);
  assert.equal(retried.body.revision, sealed.body.revision);
  const second = await request(host, `${route}/action`, { token: live.tokens.lydia, body: command(live.game, 'commitCouncil', { choiceId: 'keep', bid: 1 }) });
  assert.equal(second.status, 200);
  assert.equal(second.body.state.players.jon.influence, 0);
  assert.equal(second.body.state.players.lydia.influence, 1);
  for (const stream of streams) {
    const revealed = await stream.waitFor(event => event.type === 'room' && event.value.revision === second.body.revision);
    assertNoAuthoritySecrets(revealed.raw, Object.values(live.tokens));
  }
  await Promise.all(streams.map(stream => stream.close()));
  await host.close();
  const expiredDb = new DatabaseSync(databasePath);
  expiredDb.prepare('UPDATE sofa_rooms SET expires_at = ? WHERE code = ?').run(Date.now() - 1, live.code);
  expiredDb.close();
  host = await boot();
  for (const endpoint of [route, `${route}/events`]) {
    const expired = await request(host, endpoint, { token: live.tokens.jon });
    assert.equal(expired.status, 410);
    assertNoAuthoritySecrets(expired.text, Object.values(live.tokens));
    assert.equal(expired.body.state, undefined);
  }
});
