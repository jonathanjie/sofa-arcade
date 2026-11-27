import test from 'node:test';
import assert from 'node:assert/strict';
import { runPartyRounds } from '../../party/harness.mjs';

for (const playerCount of [2, 8, 16]) {
  test('Timber Rush replay and reconnect with ' + playerCount + ' phones', async (t) => {
    let projection = 0;
    const { phones } = await runPartyRounds(t, {
      gameId: 'timber-rush',
      playerCount,
      drive(phones, tick) {
        if (tick % 8) return;
        for (const phone of phones) {
          const state = phone.view.state;
          if (!state) continue;
          projection = Math.max(projection, Buffer.byteLength(JSON.stringify(state)));
          phone.input({ kind: 'chop', side: -state.b || 1 });
        }
      },
      assertResults(view, active) {
        assert.equal(view.results.length, active.length);
        assert.ok(view.results.some((r) => r.score > 0));
      },
    });
    const packet = Math.max(
      ...phones.flatMap((p) => p.packets.filter((s) => s.phase === 'playing').map((s) => s.bytes)),
    );
    assert.ok(packet <= 320);
    t.diagnostic(playerCount + ' players: projection ' + projection + ' B, playing packet ' + packet + ' B');
  });
}
