import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runPartyRounds } from '../../party/harness.mjs';
import { inputsForCard } from '../../party/snack-stack-driver.mjs';
import { CARDS, PREVIEW_MS, SHORT_MS } from '../../../ui/party/games/snack-stack/cards.mjs';

function checkTraffic(phones) {
  let peak = 0;
  for (const phone of phones) {
    assert.equal('scene' in phone.view, false);
    const playing = phone.packets.filter(packet => packet.phase === 'playing');
    for (const [index, packet] of playing.entries()) {
      assert.ok(packet.bytes <= 324, 'phone payload exceeds 320 bytes plus framing');
      let bytes = 0;
      for (let next = index; next < playing.length && playing[next].at < packet.at + 1000; next++) {
        bytes += playing[next].bytes;
      }
      peak = Math.max(peak, bytes);
    }
  }
  assert.ok(peak > 0 && peak < 2000, `peak ${peak} B/s`);
  return peak;
}

for (const playerCount of [2, 8, 16]) {
  test(`${playerCount} seats play two seeded Snack Stack rounds through the shared harness`, { timeout: 30_000 }, async t => {
    const seen = new Set();
    let previousTick;
    const { phones } = await runPartyRounds(t, {
      gameId: 'snack-stack',
      playerCount,
      drive(phones, tick, round, view) {
        const { scene } = view;
        assert.equal(scene.tutorialMs, round === 1 ? PREVIEW_MS : SHORT_MS);
        const key = [round, scene.index, scene.elapsed].join('/');
        if (key === previousTick) return;
        previousTick = key;
        if (tick > 0) assert.deepEqual(new Set(scene.players.map(player => player.id)),
          new Set(phones.map(phone => phone.playerId)));
        if (scene.phase === 'score' && !seen.has(scene.card)) {
          seen.add(scene.card);
          assert.equal(scene.multiplier, (scene.index + 1) % 4 === 0 ? 2 : 1);
          for (const entry of scene.players) {
            assert.ok(entry.gain >= scene.multiplier * 78, `${CARDS[scene.card].id} gave ${entry.gain}`);
          }
        }
        for (const [seat, phone] of phones.entries()) {
          for (const input of inputsForCard(scene, seat)) phone.input(input);
          if (phone.view.state?.c === scene.card && ['count-mice', 'odd-snack', 'follow-arrow'].includes(CARDS[scene.card].id)) {
            assert.equal('v' in phone.view.state, false, 'answer stays on TV');
          }
        }
      },
      assertResults(view, phones, round) {
        assert.equal(view.notice, null);
        assert.equal(view.scene.difficulty, round - 1);
        assert.equal(seen.size, CARDS.length);
        seen.clear();
        assert.deepEqual(new Set(view.results.map(result => result.playerId)), new Set(phones.map(phone => phone.playerId)));
        for (const [index, result] of view.results.entries()) {
          assert.equal(result.place, view.results.findIndex(other => other.score === result.score) + 1);
          assert.ok(result.score >= 1300 && result.score <= 1500);
          if (index > 0) assert.ok(view.results[index - 1].score >= result.score);
        }
      },
    });
    t.diagnostic(`Peak phone traffic ${checkTraffic(phones)} B/s`);
  });
}
