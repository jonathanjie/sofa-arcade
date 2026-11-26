import test from 'node:test';
import assert from 'node:assert/strict';
import { whiteoutDrift as game } from '../../../games/party/whiteout-drift/rules.mjs';
import { launchPartyHarness, runPartyRounds } from '../../party/harness.mjs';

function peakBandwidth(packets) {
  const playing = packets.filter(packet => packet.type === 'snapshot' && packet.phase === 'playing');
  return Math.max(0, ...playing.map(end => playing.filter(packet => packet.at > end.at - 1000 && packet.at <= end.at)
    .reduce((sum, packet) => sum + packet.bytes, 0)));
}

for (const playerCount of [2, 8, 16]) {
  test(`${playerCount} phones play Whiteout Drift rounds, reconnect, queue late guests, and stay under bandwidth cap`, { timeout: 20_000 }, async t => {
    const { phones } = await runPartyRounds(t, {
      gameId: game.id,
      playerCount,
      drive(activePhones, tick) {
        if (tick % 2) return;
        for (const [index, phone] of activePhones.entries()) {
          const state = phone.view.state;
          if (!state) continue;
          if (state.r === 2) {
            phone.input({ kind: 'dispatch', x: Math.cos(index + tick), y: Math.sin(index + tick) });
            continue;
          }
          const angle = index * 0.7 + tick * 0.08;
          const drift = tick % 20 >= 8 && tick % 20 <= 16 ? 1 : 0;
          phone.input({ kind: 'drive', x: Math.cos(angle), y: Math.sin(angle), d: drift });
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
    t.diagnostic(`Whiteout Drift (${playerCount}p) peak phone downstream: ${peak} B/s`);
    assert.ok(peak > 0 && peak < 2000);
  });
}

test('Whiteout Drift switches across all 4 modes over real party sockets', { timeout: 20_000 }, async t => {
  const fixture = await launchPartyHarness(t, { gameId: game.id });
  const room = await fixture.create();
  const tv = await fixture.connect(room);
  const phones = await Promise.all(Array.from({ length: 4 }, async (_, look) => {
    const phone = await fixture.connect(await fixture.join(room.code, look, look === 0 ? '❄'.repeat(12) : `Driver ${look}`));
    phone.send({ type: 'ready', value: true });
    return phone;
  }));
  await fixture.until(() => tv.view.players.length === 4 && tv.view.players.every(player => player.ready));
  assert.equal(tv.view.mode, 'getaway');
  assert.equal(tv.view.modes.length, 4);

  for (const [roundIndex, mode] of ['cops-and-robbers', 'freeze-tag', 'drift-king', 'getaway'].entries()) {
    tv.send({ type: 'mode', round: roundIndex, mode });
    await fixture.until(() => tv.view.mode === mode, { ticks: 10 });
    tv.send({ type: 'start', round: roundIndex });
    await fixture.until(() => tv.view.phase === 'playing' && phones.every(p => p.view.phase === 'playing'), { ticks: 80 });
    assert.equal(tv.view.scene.mode, mode);
    for (const phone of phones) {
      assert.equal('mode' in phone.view, false);
      assert.equal('modes' in phone.view, false);
      assert.equal(phone.view.state.m, ['getaway', 'cops-and-robbers', 'freeze-tag', 'drift-king'].indexOf(mode));
      assert.ok(Buffer.byteLength(JSON.stringify({ type: 'snapshot', view: phone.view })) <= 320);
    }
    await fixture.until(() => tv.view.phase === 'results', {
      ticks: 1600,
      drive(tick) {
        if (tick % 2) return;
        for (const [index, phone] of phones.entries()) {
          const state = phone.view.state;
          if (!state) continue;
          if (state.r === 2) {
            phone.input({ kind: 'dispatch', x: 0.7, y: -0.7 });
          } else {
            const angle = index * 1.1 + tick * 0.1;
            phone.input({ kind: 'drive', x: Math.cos(angle), y: Math.sin(angle), d: tick % 12 < 6 ? 1 : 0 });
          }
        }
      },
    });
    assert.equal(tv.view.results.length, 4);
    await fixture.until(() => tv.view.players.every(p => p.ready), { ticks: 10 });
  }
});
