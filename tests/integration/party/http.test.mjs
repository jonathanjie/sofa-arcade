import test from 'node:test';
import assert from 'node:assert/strict';
import { startLanServer } from '../../../server/lan.mjs';
import { WebSocket } from 'ws';

test('party LAN routes share the same-origin JSON and upgrade rules', { timeout: 7000 }, async t => {
  const host = await startLanServer({ host: '127.0.0.1', port: 0, databasePath: ':memory:' });
  t.after(() => host.close());
  const address = host.origin + '/api/party/rooms';
  const body = JSON.stringify({ gameId: 'tap-race', requestId: 'key1'.repeat(8) });
  const post = headers => fetch(address, { method: 'POST', headers, body });
  const json = { 'Content-Type': 'application/json' };
  assert.equal((await post(json)).status, 403);
  assert.equal((await post({ ...json, Origin: 'https://example.test' })).status, 403);
  assert.equal((await post({ Origin: host.origin })).status, 415);
  const oversized = await fetch(address, { method: 'POST', headers: { ...json, Origin: host.origin }, body: ' '.repeat(1025) });
  assert.equal(oversized.status, 413);
  const created = await post({ ...json, Origin: host.origin });
  assert.equal(created.status, 201);
  const { code } = await created.json();
  const url = new URL('/api/realtime/party', host.origin);
  url.protocol = 'ws:';
  async function rejectedUpgrade(address, origin, protocols = []) {
    return new Promise((resolve, reject) => {
      const client = new WebSocket(address, protocols, { origin });
      client.on('error', reject);
      client.once('open', () => { client.close(); resolve(101); });
      client.once('unexpected-response', (_, response) => {
        response.resume();
        resolve(response.statusCode);
      });
    });
  }
  assert.equal(await rejectedUpgrade(url, undefined), 403);
  assert.equal(await rejectedUpgrade(url, 'https://example.test'), 403);
  assert.equal(await rejectedUpgrade(url, host.origin, ['extra']), 403);
  const withQuery = new URL(url);
  withQuery.searchParams.set('extra', '1');
  assert.equal(await rejectedUpgrade(withQuery, host.origin), 403);
  function socketCloseCode(payload) {
    return new Promise((resolve, reject) => {
      const client = new WebSocket(url, { origin: host.origin });
      client.on('error', reject);
      client.once('open', () => client.send(payload));
      client.once('close', resolve);
    });
  }
  assert.equal(await socketCloseCode(JSON.stringify({ type: 'auth', protocol: 1, code, token: 'A'.repeat(43) })), 4403);
  assert.equal(await socketCloseCode(' '.repeat(513)), 1009);
});
