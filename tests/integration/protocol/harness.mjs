import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { startLanServer } from '../../../server/lan.mjs';

export const PLAYER_IDS = Object.freeze(['jon', 'lydia']);
export const otherPlayer = playerId => playerId === 'jon' ? 'lydia' : 'jon';

/** Real HTTP. Returned text is the actual serialized response, not a reconstructed object. */
export async function request(host, route, { token, body, method = body === undefined ? 'GET' : 'POST', headers = {} } = {}) {
  const startedAt = performance.now();
  const response = await fetch(host.origin + route, {
    method,
    headers: {
      ...(method === 'POST' ? { Origin: host.origin, 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  let value;
  try { value = JSON.parse(text); } catch { value = null; }
  return { status: response.status, headers: response.headers, text, value, startedAt, receivedAt: performance.now() };
}

/** Deliberately separate from the production SSE decoder, so transport bugs are observable. */
export async function listen(host, code, token, { timeoutMs = 5_000 } = {}) {
  const controller = new AbortController();
  const response = await fetch(`${host.origin}/api/rooms/${code}/events`, {
    headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
  });
  assert.equal(response.status, 200, 'authenticated SSE should open');
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const history = [];
  const waiters = new Set();
  let stopped = false;
  let ended = false;
  let failure = null;
  let pending = '';

  function deliver(block) {
    let type = 'message';
    const data = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) type = line.slice(6).trimStart();
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    if (!data.length) return;
    const raw = data.join('\n');
    const event = { type, raw, value: JSON.parse(raw), receivedAt: performance.now() };
    history.push(event);
    for (const waiter of [...waiters]) {
      if (history.length - 1 >= waiter.after && waiter.predicate(event)) {
        clearTimeout(waiter.timer); waiters.delete(waiter); waiter.resolve(event);
      }
    }
  }

  const pumping = (async () => {
    try {
      while (!stopped) {
        const chunk = await reader.read();
        if (chunk.done) break;
        pending += decoder.decode(chunk.value, { stream: true });
        let separator;
        while ((separator = /\r?\n\r?\n/.exec(pending))) {
          const end = separator.index;
          deliver(pending.slice(0, end));
          pending = pending.slice(end + separator[0].length);
        }
      }
    } catch (error) {
      if (!stopped) failure = error;
    } finally {
      ended = true;
      for (const waiter of waiters) {
        clearTimeout(waiter.timer);
        waiter.reject(failure || new Error('SSE ended before the expected event.'));
      }
      waiters.clear();
    }
  })();

  return {
    history,
    waitFor(predicate, { after = 0 } = {}) {
      const found = history.slice(after).find(predicate);
      if (found) return Promise.resolve(found);
      if (ended) return Promise.reject(failure || new Error('SSE is closed.'));
      return new Promise((resolve, reject) => {
        const waiter = { predicate, after, resolve, reject, timer: null };
        waiter.timer = setTimeout(() => {
          waiters.delete(waiter);
          reject(new Error(`No matching SSE event within ${timeoutMs} ms.`));
        }, timeoutMs);
        waiters.add(waiter);
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

export async function openRoom(host, { gameId = 'sofa-kingdoms', start = true } = {}) {
  const created = await request(host, '/api/rooms', { body: { gameId } });
  assert.equal(created.status, 201, `create ${gameId}: ${created.text}`);
  const code = created.value.code;
  const tokens = { host: created.value.hostToken };
  const clients = Object.fromEntries(PLAYER_IDS.map(id => [id, crypto.randomUUID()]));
  for (const playerId of PLAYER_IDS) {
    const joined = await request(host, `/api/rooms/${code}/join`, { body: { playerId, clientId: clients[playerId] } });
    assert.equal(joined.status, 200, `join ${playerId}`);
    tokens[playerId] = joined.value.playerToken;
  }
  const opened = start
    ? await request(host, `/api/rooms/${code}/start`, { token: tokens.host, body: {} })
    : await request(host, `/api/rooms/${code}`, { token: tokens.host });
  assert.equal(opened.status, 200);
  return { code, tokens, clients, room: opened.value };
}

export async function connectThree(host, live) {
  // Separate requests and sessions. Only the authoritative Mac has all three credentials.
  const streams = {};
  try {
    for (const viewer of ['host', ...PLAYER_IDS]) streams[viewer] = await listen(host, live.code, live.tokens[viewer]);
    await Promise.all(Object.values(streams).map(stream => stream.waitFor(event => event.type === 'room' && event.value.revision === live.room.revision)));
    return streams;
  } catch (error) {
    await closeStreams(streams);
    throw error;
  }
}

export async function closeStreams(streams) {
  await Promise.all(Object.values(streams || {}).map(stream => stream.close()));
}

export function command(room, action, actionId = crypto.randomUUID()) {
  return { revision: room.revision, actionId, action };
}

export async function submit(host, live, playerId, payload) {
  return request(host, `/api/rooms/${live.code}/action`, { token: live.tokens[playerId], body: payload });
}

export async function expectRevision(streams, revision) {
  const values = await Promise.all(Object.entries(streams).map(async ([viewer, stream]) => [viewer,
    await stream.waitFor(event => event.type === 'room' && event.value.revision === revision),
  ]));
  return Object.fromEntries(values);
}

export function assertNoCredentials(text, live) {
  for (const credential of [...Object.values(live.tokens), ...Object.values(live.clients)]) {
    assert.ok(!text.includes(credential), 'serialized room response contains a bearer credential or client identity');
  }
  for (const privateKey of ['hostHash', 'tokenHash', 'clientHash', 'recentActions']) {
    assert.ok(!text.includes(`"${privateKey}"`), `serialized room response contains ${privateKey}`);
  }
}

export function latencySummary(samples) {
  assert.ok(samples.length > 0, 'latency needs observed samples');
  const sorted = samples.slice().sort((a, b) => a - b);
  const at = fraction => Number(sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)].toFixed(3));
  return { samples: sorted.length, medianMs: at(0.5), p95Ms: at(0.95), maxMs: at(1) };
}

export async function startFixtureServer(options = {}) {
  return startLanServer({ host: '127.0.0.1', port: 0, databasePath: ':memory:', heartbeatMs: 60_000, ...options });
}
