import test from 'node:test';
import assert from 'node:assert/strict';
import { paperSkies as game } from '../../../games/party/paper-skies/rules.mjs';
import { launchPartyHarness, runPartyRounds } from '../../party/harness.mjs';

function peakBandwidth(packets) {
  const playing = packets.filter(packet => packet.type === 'snapshot' && packet.phase === 'playing');
  return Math.max(0, ...playing.map(end => playing.filter(packet => packet.at > end.at - 1000 && packet.at <= end.at)
    .reduce((sum, packet) => sum + packet.bytes, 0)));
}

for (const playerCount of [2, 8, 16]) {
  test(`${playerCount} phones play Paper Skies rounds, reconnect, queue late guests, and stay under bandwidth cap`, { timeout: 20_000 }, async t => {
    const { phones } = await runPartyRounds(t, {
      gameId: game.id,
      playerCount,
      drive(activePhones, tick) {
        if (tick % 2) return;
        for (const [index, phone] of activePhones.entries()) {
          if (!phone.view.state) continue;
          const x = Math.cos(index * 0.7 + tick * 0.09);
          const y = Math.sin(index * 0.5 + tick * 0.06);
          const b = tick % 24 < 8 ? 1 : 0;
          const r = tick % 20 === 0 ? 1 : 0;
          const l = tick % 36 === 0 ? 1 : 0;
          phone.input({ kind: 'fly', x, y, b, r, l });
        }
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
    const peak = Math.max(...phones.map(phone => peakBandwidth(phone.packets)));
    t.diagnostic(`Paper Skies (${playerCount}p) peak phone downstream: ${peak} B/s`);
    assert.ok(peak > 0 && peak < 2000);
  });
}

test('Paper Skies switches across all 3 modes over real party sockets', { timeout: 20_000 }, async t => {
  const fixture = await launchPartyHarness(t, { gameId: game.id });
  const room = await fixture.create();
  const tv = await fixture.connect(room);
  const phones = await Promise.all(Array.from({ length: 4 }, async (_, look) => {
    const phone = await fixture.connect(await fixture.join(room.code, look, look === 0 ? '✈'.repeat(12) : `Pilot ${look}`));
    phone.send({ type: 'ready', value: true });
    return phone;
  }));
  await fixture.until(() => tv.view.players.length === 4 && tv.view.players.every(player => player.ready));
  assert.equal(tv.view.mode, 'ring-rally');
  assert.equal(tv.view.modes.length, 3);

  for (const [roundIndex, mode] of ['balloon-pop', 'sky-tag', 'ring-rally'].entries()) {
    tv.send({ type: 'mode', round: roundIndex, mode });
    await fixture.until(() => tv.view.mode === mode, { ticks: 10 });
    tv.send({ type: 'start', round: roundIndex });
    await fixture.until(() => tv.view.phase === 'playing' && phones.every(p => p.view.phase === 'playing'), { ticks: 80 });
    assert.equal(tv.view.scene.mode, mode);
    for (const phone of phones) {
      assert.equal('mode' in phone.view, false);
      assert.equal('modes' in phone.view, false);
      assert.equal(phone.view.state.m, ['ring-rally', 'balloon-pop', 'sky-tag'].indexOf(mode));
      assert.ok(Buffer.byteLength(JSON.stringify({ type: 'snapshot', view: phone.view })) <= 320);
    }
    await fixture.until(() => tv.view.phase === 'results', {
      ticks: 1600,
      drive(tick) {
        if (tick % 2) return;
        for (const [index, phone] of phones.entries()) {
          if (!phone.view.state) continue;
          const x = Math.cos(index * 1.1 + tick * 0.1);
          const y = Math.sin(index * 0.8 + tick * 0.07);
          phone.input({ kind: 'fly', x, y, b: tick % 20 < 6 ? 1 : 0, r: tick % 18 === 0 ? 1 : 0, l: tick % 32 === 0 ? 1 : 0 });
        }
      },
    });
    assert.equal(tv.view.results.length, 4);
    await fixture.until(() => tv.view.players.every(p => p.ready), { ticks: 10 });
  }
});
