import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate as settle } from 'node:timers/promises';
import { launchPartyHarness } from '../../party/harness.mjs';
import { inputsForCard } from '../../party/snack-stack-driver.mjs';
import { CARDS, SLOT_MS } from '../../../ui/party/games/snack-stack/cards.mjs';

const ROUND_TICKS = CARDS.length * SLOT_MS / 50 + 20;

async function launch(t, count) {
  const fixture = await launchPartyHarness(t, { gameId: 'snack-stack' });
  const host = await fixture.create();
  const tv = await fixture.connect(host);
  const phones = await Promise.all(Array.from({ length: count }, async (_, look) => {
    const phone = await fixture.connect(await fixture.join(host.code, look, look === 0 ? '🎉'.repeat(12) : undefined));
    phone.send({ type: 'ready', value: true });
    return phone;
  }));
  const ready = () => tv.view.players.filter(player => player.ready && player.connected).length;
  await fixture.until(() => ready() === count, { ticks: 12 });
  return { fixture, host, tv, phones, ready };
}

async function completeRound(fixture, tv, phones) {
  const shown = new Set();
  const settled = new Set();
  const absoluteTick = scene => scene.index * SLOT_MS + scene.elapsed;
  for (let tick = 0; tick < ROUND_TICKS && tv.view.phase === 'playing'; tick++) {
    const scene = tv.view.scene;
    shown.add(scene.card);
    for (const [seat, phone] of phones.entries()) {
      for (const input of inputsForCard(scene, seat)) phone.input(input);
    }
    if (scene.phase === 'score' && !settled.has(scene.index)) {
      settled.add(scene.index);
      assert.equal(scene.multiplier, (scene.index + 1) % 4 === 0 ? 2 : 1);
      for (const [seat, phone] of phones.entries()) {
        const entry = scene.players.find(player => player.id === phone.playerId);
        assert.ok(entry.gain >= scene.multiplier * 78, `seat ${seat} got ${entry.gain} in ${CARDS[scene.card].id}`);
      }
    }
    await fixture.advance();
    // On a busy event loop, the harness can return before the TV socket has
    // delivered the snapshot. Wait without advancing the simulation again.
    const until = performance.now() + 1000;
    while (tv.view.phase === 'playing' && absoluteTick(tv.view.scene) === absoluteTick(scene)) {
      assert.ok(performance.now() < until, 'TV did not receive the next 50 ms tick');
      await settle();
    }
  }
  assert.equal(tv.view.phase, 'results');
  assert.equal(tv.view.notice, null);
  assert.equal(shown.size, 12);
  assert.equal(settled.size, 12);
  assert.equal(tv.view.results.length, phones.length);
  for (const [index, result] of tv.view.results.entries()) {
    assert.equal(result.place, tv.view.results.findIndex(other => other.score === result.score) + 1);
    assert.ok(result.score >= 1300 && result.score <= 1500);
    if (index > 0) assert.ok(tv.view.results[index - 1].score >= result.score);
  }
}

test('16 phones finish two Snack Stack rounds with reconnect, kick and a waiting late guest', { timeout: 30_000 }, async t => {
  const { fixture, host, tv, phones, ready } = await launch(t, 16);
  tv.send({ type: 'start', round: 0 });
  await fixture.until(() => phones.every(phone => phone.view.phase === 'playing'), { ticks: 80 });
  const old = phones[1];
  phones[1] = await fixture.connect(old.credential);
  assert.equal(await old.disconnected, 4409);
  assert.equal(phones[1].view.waiting, false);
  const removed = phones.pop();
  tv.send({ type: 'kick', playerId: removed.playerId });
  assert.equal(await removed.disconnected, 4403);
  const late = await fixture.connect(await fixture.join(host.code, 15, 'Late guest'));
  late.send({ type: 'ready', value: true });
  assert.equal(late.view.waiting, true);
  assert.equal(late.view.state, null);
  await completeRound(fixture, tv, phones);
  assert.equal(tv.view.results.some(result => result.playerId === removed.playerId), false);
  await fixture.until(() => ready() === 16 && late.view.phase === 'results', { ticks: 12 });
  phones.push(late);
  tv.send({ type: 'start', round: 1 });
  await fixture.until(() => phones.every(phone => phone.view.round === 2 && phone.view.phase === 'playing'), { ticks: 80 });
  assert.equal(late.view.waiting, false);
  await completeRound(fixture, tv, phones);
  let peak = 0;
  await fixture.until(() => phones.every(phone => phone.view.phase === 'results'), { ticks: 12 });
  for (const phone of phones) {
    assert.deepEqual(Object.keys(phone.view.state).sort(), ['c', 'd', 'g', 'i', 'n', 's', 't',
      ...('v' in phone.view.state ? ['v'] : [])].sort());
    assert.equal('scene' in phone.view, false);
    const playing = phone.packets.filter(packet => packet.phase === 'playing');
    for (const [index, packet] of playing.entries()) {
      assert.ok(packet.bytes <= 324, 'phone JSON exceeds 320-byte limit');
      let bytes = 0;
      for (let next = index; next < playing.length && playing[next].at < packet.at + 1000; next++) bytes += playing[next].bytes;
      peak = Math.max(peak, bytes);
    }
  }
  assert.ok(peak > 0 && peak < 2000, `peak ${peak} B/s`);
  t.diagnostic(`Peak phone traffic ${peak} B/s`);
});

for (const count of [2, 8]) {
  test(`${count} phones share the same Snack Stack clock and finish ties`, async t => {
    const { fixture, tv, phones } = await launch(t, count);
    tv.send({ type: 'start', round: 0 });
    await fixture.until(() => phones.every(phone => phone.view.phase === 'playing'), { ticks: 80 });
    assert.equal(new Set(phones.map(phone => phone.view.state.c)).size, 1);
    assert.equal(tv.view.roster.length, count);
    if (count === 8) {
      await Promise.all(phones.map(phone => phone.disconnect()));
      await fixture.until(() => tv.view.phase === 'results', {
        ticks: ROUND_TICKS,
        drive() {
          if (!tv.view.players.length) assert.equal(tv.view.results.length, 0);
        },
      });
      assert.deepEqual(tv.view.results, []);
      return;
    }
    await fixture.until(() => tv.view.phase === 'results', { ticks: ROUND_TICKS });
    assert.deepEqual(tv.view.results.map(({ score, place }) => [score, place]), [[0, 1], [0, 1]]);
  });
}
