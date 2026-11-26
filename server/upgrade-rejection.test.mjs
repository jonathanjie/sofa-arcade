import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { startLanServer } from './lan.mjs';

test('a rejected HTTP upgrade owns transport errors and destroys a stalled socket at its deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const host = await startLanServer({ port: 0, host: '127.0.0.1', databasePath: ':memory:' });
  t.after(() => host.close());
  function rejectedSocket() {
    const socket = Object.assign(new EventEmitter(), {
      destroyed: false,
      end(response) { assert.match(response, /^HTTP\/1\.1 403/); },
      destroy() { this.destroyed = true; this.emit('close'); },
    });
    const accepted = host.handleUpgrade({ url: '/not-a-game', headers: {} }, socket, Buffer.alloc(0));
    assert.equal(accepted, false);
    return socket;
  }
  const reset = rejectedSocket();
  assert.doesNotThrow(() => reset.emit('error', new Error('socket reset')));
  assert.equal(reset.destroyed, true);
  const stalled = rejectedSocket();
  t.mock.timers.tick(249);
  assert.equal(stalled.destroyed, false);
  t.mock.timers.tick(1);
  assert.equal(stalled.destroyed, true);
});
