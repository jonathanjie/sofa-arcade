import test from 'node:test';
import assert from 'node:assert/strict';
import { runPartyRounds } from '../../party/harness.mjs';
for (const playerCount of [2, 8, 16]) {
  test(playerCount + ' phones complete two Balloon Bop rounds', async t => {
    const { phones } = await runPartyRounds(t, { gameId: 'balloon-bop', playerCount,
      drive(clients, tick) {
        if (tick === 5) clients[0].input({ kind: 'hop', x: 140 });
      },
      assertResults(view, clients) {
        assert.equal(view.scene.drops, 3);
        assert.equal(view.results.length, clients.length);
      },
    });
    const bytes = Math.max(...phones.flatMap(p => p.packets.filter(packet => packet.phase === 'playing').map(p => p.bytes)));
    assert.ok(bytes > 0 && bytes <= 320);
    t.diagnostic('Largest playing packet ' + bytes + ' bytes');
  });
}
