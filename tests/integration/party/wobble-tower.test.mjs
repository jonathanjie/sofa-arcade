import test from 'node:test';
import assert from 'node:assert/strict';
import { wobbleTower as game } from '../../../games/party/wobble-tower/rules.mjs';
import { launchPartyHarness, runPartyRounds } from '../../party/harness.mjs';

function peakBandwidth(packets) {
  const playing = packets.filter(packet => packet.type === 'snapshot' && packet.phase === 'playing');
  return Math.max(0, ...playing.map(end => playing.filter(packet => packet.at > end.at - 1000 && packet.at <= end.at)
    .reduce((sum, packet) => sum + packet.bytes, 0)));
}

for (const playerCount of [2, 8, 16]) {
  test(`${playerCount} phones play Wobble Tower rounds, reconnect, queue late guests, and stay under bandwidth cap`, { timeout: 60_000 }, async t => {
    const { phones } = await runPartyRounds(t, {
      gameId: game.id,
      playerCount,
      drive(activePhones, tick) {
        if (tick % 16) return;
        for (const phone of activePhones) if (phone.view.state?.q === 0) phone.input({ kind: 'tap' });
      },
      assertResults(view, activePhones) {
        assert.equal(view.results.length, activePhones.length);
        assert.ok(view.results.every(result => Number.isInteger(result.score) && result.score >= 0));
      },
    });
    for (const phone of phones) {
      for (const packet of phone.packets) {
        assert.ok(packet.bytes <= 320, `Phone packet exceeded 320B: ${packet.bytes}`);
      }
    }
    t.diagnostic("Largest phone frame: " + Math.max(...phones.flatMap(p => p.packets.map(packet => packet.bytes))));
    const peak = Math.max(...phones.map(phone => peakBandwidth(phone.packets)));
    t.diagnostic(`Wobble Tower (${playerCount}p) peak phone downstream: ${peak} B/s`);
    assert.ok(peak > 0 && peak < 2000);
  });
}

test('the TV selects each tower mode through the party protocol', async t => {
  const fixture = await launchPartyHarness(t, { gameId: game.id });
  const room = await fixture.create();
  const tv = await fixture.connect(room);
  for (let look = 0; look < 2; look++) {
    const phone = await fixture.connect(await fixture.join(room.code, look));
    phone.send({ type: 'ready', value: true });
  }
  await fixture.until(() => tv.view.players.every(p => p.ready) && tv.view.players.length === 2);
  for (const [round, mode] of ['duel', 'coop', 'tallest'].entries()) {
    tv.send({ type: 'mode', round, mode });
    await fixture.until(() => tv.view.mode === mode);
    tv.send({ type: 'start', round });
    await fixture.until(() => tv.view.phase === 'playing');
    assert.equal(tv.view.scene.mode, mode);
    assert.equal(tv.view.scene.towers.length, mode === 'tallest' ? 2 : 1);
    await fixture.until(() => tv.view.phase === 'results');
  }
});
