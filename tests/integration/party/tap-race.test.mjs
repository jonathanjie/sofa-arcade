import test from 'node:test';
import assert from 'node:assert/strict';
import { runPartyRounds } from '../../party/harness.mjs';

for (const playerCount of [2, 8, 16]) test(`${playerCount} phones race, reconnect, queue a late guest and race again`, { timeout: 12_000 }, async t => {
  const { phones } = await runPartyRounds(t, {
    gameId: 'tap-race',
    playerCount,
    drive(phones, tick) {
      phones[0].input({ kind: 'tap' });
      if (tick % 2 === 0) {
        for (const phone of phones.slice(1)) phone.input({ kind: 'tap' });
      }
    },
    assertResults(view, phones) {
      assert.equal(view.results[0].playerId, phones[0].playerId);
      assert.equal(view.results[0].score, 40);
      assert.deepEqual(view.results.slice(1).map(result => result.place), Array(phones.length - 1).fill(2));
    },
  });
  const peaks = phones.map(({ packets }) => {
    const racing = packets.filter(packet => packet.phase === 'playing' && packet.type === 'snapshot');
    return Math.max(0, ...racing.map(packet => racing.filter(sample => sample.at > packet.at - 1000 && sample.at <= packet.at)
      .reduce((sum, sample) => sum + sample.bytes, 0)));
  });
  const peak = Math.max(...peaks);
  t.diagnostic(`Tap Race max phone downstream (rolling 1 s, text frames and WebSocket headers): ${peak} B/s`);
  assert.ok(peak > 0 && peak < 2000);
});
