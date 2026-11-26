import test from 'node:test';
import assert from 'node:assert/strict';
import { headHop as game } from '../../../games/party/head-hop/rules.mjs';
import { runPartyRounds } from '../../party/harness.mjs';

function peakBandwidth(packets) {
  const playing = packets.filter(packet => packet.type === 'snapshot' && packet.phase === 'playing');
  return Math.max(0, ...playing.map(end => playing.filter(packet => packet.at > end.at - 1000 && packet.at <= end.at)
    .reduce((sum, packet) => sum + packet.bytes, 0)));
}

for (const playerCount of [2, 8, 16]) {
  test(`${playerCount} phones play Head Hop rounds, reconnect, queue late guests, and stay under bandwidth cap`, { timeout: 60_000 }, async t => {
    const { phones } = await runPartyRounds(t, {
      gameId: game.id,
      playerCount,
      drive(activePhones, tick) {
        if (tick % 12) return;
        for (const phone of activePhones) phone.input({ kind: 'hop', power: tick % 11 });
      },
      assertResults(view, activePhones) {
        assert.equal(view.results.length, activePhones.length);
        assert.ok(view.results.every(result => Number.isInteger(result.score) && result.score >= 0));
      },
    });
    const sizes = phones.flatMap(phone => phone.packets.filter(p => p.phase === 'playing').map(p => p.bytes));
    t.diagnostic('Largest playing packet: ' + Math.max(...sizes) + ' bytes');
    for (const phone of phones) {
      for (const packet of phone.packets) {
        assert.ok(packet.bytes <= 320, `Phone packet exceeded 320B: ${packet.bytes}`);
      }
    }
    const peak = Math.max(...phones.map(phone => peakBandwidth(phone.packets)));
    t.diagnostic(`Head Hop (${playerCount}p) peak phone downstream: ${peak} B/s`);
    assert.ok(peak > 0 && peak < 2000);
  });
}
