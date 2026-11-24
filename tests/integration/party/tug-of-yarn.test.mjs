import assert from 'node:assert/strict';
import test from 'node:test';
import { launchPartyHarness, runPartyRounds } from '../../party/harness.mjs';
import { BEATS, closestBeat } from '../../../ui/party/games/tug-of-yarn/rhythm.mjs';

function perfectMint(phone, submitted) {
  const { b, t, s } = phone.view.state ?? {};
  if (phone.view.phase !== 'playing' || b !== 0) return;
  const beat = s + BEATS[closestBeat(t - s)];
  const key = `${phone.view.round}/${beat}`;
  if (Math.abs(beat - t) > 100 || submitted.get(phone.playerId) === key) return;
  submitted.set(phone.playerId, key);
  phone.input({ kind: 'tap', at: beat });
}

test('sixteen phones finish two Tug of Yarn matches with reconnect, kick and late join', { timeout: 12_000 }, async t => {
  const submitted = new Map();
  const { phones } = await runPartyRounds(t, {
    gameId: 'tug-of-yarn',
    drive(phones) { for (const phone of phones) perfectMint(phone, submitted); },
    assertResults(view, phones) {
      assert.equal(view.scene.winner, 0);
      assert.equal(view.scene.position, -1);
      assert.deepEqual(view.scene.wins, [2, 0]);
      const eligible = view.scene.teams.filter(({ playerId }) => phones.some(phone => phone.playerId === playerId));
      assert.equal(view.results.length, eligible.length);
      const mint = eligible.filter(({ team }) => team === 0).map(({ playerId }) => playerId).sort();
      assert.deepEqual(view.results.filter(({ place }) => place === 1).map(({ playerId }) => playerId).sort(), mint);
      assert.ok(view.results.every(({ score, place }) => score === 2 && place === 1 || score === 0 && place === mint.length + 1));
    },
  });
  let peak = 0;
  for (const { packets, view } of phones) {
    assert.deepEqual(Object.keys(view.state).sort(), ['b', 's', 't']);
    assert.ok(!Object.hasOwn(view, 'scene') && !Object.hasOwn(view, 'players'));
    const playing = packets.filter(packet => packet.phase === 'playing' && packet.type === 'snapshot');
    for (const packet of playing) {
      assert.ok(packet.bytes <= 324);
      const rolling = playing.filter(sample => sample.at > packet.at - 1000 && sample.at <= packet.at)
        .reduce((total, sample) => total + sample.bytes, 0);
      peak = Math.max(peak, rolling);
    }
  }
  assert.ok(peak > 0 && peak < 2000);
  t.diagnostic(`16-phone peak downstream: ${peak} B/s including WebSocket headers`);
});

for (const count of [2, 8]) {
  test(`${count} phones finish a Tug of Yarn match`, { timeout: 12_000 }, async t => {
    const fixture = await launchPartyHarness(t, { gameId: 'tug-of-yarn' });
    const host = await fixture.create();
    const tv = await fixture.connect(host);
    const phones = await Promise.all(Array.from({ length: count }, async (_, look) => {
      const phone = await fixture.connect(await fixture.join(host.code, look, '🐭'.repeat(12)));
      phone.send({ type: 'ready', value: true });
      return phone;
    }));
    await fixture.until(() => tv.view.players.filter(player => player.ready).length === count, { ticks: 12 });
    tv.send({ type: 'start', round: 0 });
    const submitted = new Map();
    await fixture.until(() => tv.view.phase === 'results', {
      ticks: 500,
      drive() { for (const phone of phones) perfectMint(phone, submitted); },
    });
    assert.equal(tv.view.scene.teams.length, count);
    assert.deepEqual(tv.view.scene.wins, [2, 0]);
    assert.equal(tv.view.results.filter(({ place }) => place === 1).length, count / 2);
    for (const phone of phones) {
      const snapshot = JSON.stringify({ type: 'snapshot', view: phone.view });
      assert.ok(Buffer.byteLength(snapshot) <= 320);
      assert.equal(Object.keys(phone.view.state).length, 3);
    }
  });
}

test('expired seats leave an empty podium at the exact match deadline', { timeout: 12_000 }, async t => {
  const fixture = await launchPartyHarness(t, { gameId: 'tug-of-yarn' });
  const host = await fixture.create();
  const tv = await fixture.connect(host);
  const phones = await Promise.all([0, 1].map(async look => {
    const phone = await fixture.connect(await fixture.join(host.code, look));
    phone.send({ type: 'ready', value: true });
    return phone;
  }));
  await fixture.until(() => tv.view.players.every(player => player.ready), { ticks: 12 });
  tv.send({ type: 'start', round: 0 });
  await fixture.until(() => tv.view.phase === 'playing', { ticks: 80 });
  await Promise.all(phones.map(phone => phone.disconnect()));
  await fixture.until(() => tv.view.phase === 'results', { ticks: 2370 });
  assert.equal(tv.view.scene.t, 118_000);
  assert.deepEqual(tv.view.results, []);
  assert.deepEqual(tv.view.scene.wins, [0, 0]);
  assert.equal(tv.view.notice, null);
});
