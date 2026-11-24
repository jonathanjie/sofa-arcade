import test from 'node:test';
import assert from 'node:assert/strict';
import { launchPartyHarness, runPartyRounds } from '../../party/harness.mjs';

const gameId = 'wall-of-paddles';
const slide = position => ({ kind: 'slide', position });

function assertTeamResults(view, phones) {
  assert.equal(view.roster.length, view.scene.paddles.length);
  assert.equal(view.results.length, phones.length);
  assert.equal(new Set(view.results.map(result => result.playerId)).size, phones.length);
  const [cyan, coral] = view.scene.points;
  const winning = Math.max(cyan, coral);
  assert.equal(winning, 7);
  assert.ok(Math.min(cyan, coral) < winning);
  const winners = view.results.filter(result => result.score === winning).length;
  for (const result of view.results) {
    const paddle = view.scene.paddles.find(entry => entry.playerId === result.playerId);
    assert.equal(result.score, view.scene.points[paddle.team]);
    assert.equal(result.place, result.score === winning ? 1 : winners + 1);
  }
}

test('the shared 16-phone harness plays two full rounds and enforces phone privacy and traffic', { timeout: 12_000 }, async t => {
  // Round one has a kicked seat and a replacement waiting outside the locked roster.
  const { phones, tv } = await runPartyRounds(t, {
    gameId,
    drive(phones, tick) {
      if (tick % 4 !== 0) return;
      for (const phone of phones) {
        phone.input(slide(phone.view.state.team === 0 ? 0 : -1));
      }
    },
    assertResults: assertTeamResults,
  });
  let peak = 0;
  for (const { packets, view, playerId } of phones) {
    assert.equal(view.self.id, playerId);
    assert.deepEqual(Object.keys(view).sort(), ['gameId', 'ms', 'notice', 'phase', 'place', 'round', 'self', 'state', 'waiting']);
    assert.deepEqual(Object.keys(view.state).sort(), ['position', 'team']);
    assert.deepEqual(Object.keys(view.self).sort(), ['id', 'look', 'name', 'ready']);
    assert.equal(view.state.team, tv.view.scene.paddles.find(paddle => paddle.playerId === playerId).team);
    const playing = packets.filter(packet => packet.phase === 'playing' && packet.type === 'snapshot');
    for (const packet of playing) {
      assert.ok(packet.bytes <= 324);
      const rolling = playing.filter(sample => sample.at > packet.at - 1000 && sample.at <= packet.at);
      peak = Math.max(peak, rolling.reduce((total, sample) => total + sample.bytes, 0));
    }
  }
  t.diagnostic(`Wall of Paddles peak phone downstream: ${peak} B/s (rolling one second, including frame headers)`);
  assert.ok(peak > 0 && peak < 2000);
});

for (const count of [2, 8]) {
  test(`${count} real sockets share balanced walls and finish with team scores`, async t => {
    const fixture = await launchPartyHarness(t, { gameId });
    const credential = await fixture.create();
    const tv = await fixture.connect(credential);
    const phones = [];
    for (let look = 0; look < count; look++) {
      const name = look === 0 ? '🚀'.repeat(12) : `Guest ${look + 1}`;
      const phone = await fixture.connect(await fixture.join(credential.code, look, name));
      phone.send({ type: 'ready', value: true });
      phones.push(phone);
    }
    await fixture.until(() => tv.view.players.length === count && tv.view.players.every(player => player.ready));
    tv.send({ type: 'start', round: 0 });
    await fixture.until(() => phones.every(phone => phone.view.phase === 'playing'));
    assert.deepEqual(tv.view.scene.paddles.map(paddle => paddle.team), phones.map((_, index) => index % 2));
    await fixture.until(() => tv.view.phase === 'results', {
      ticks: 1801,
      drive(tick) {
        if (tick % 4 === 0) phones.forEach((phone, index) => phone.input(slide(index % 2 === 0 ? 0 : -1)));
      },
    });
    assertTeamResults(tv.view, phones);
    assert.ok(phones[0].packets.every(packet => packet.bytes <= 324));
  });
}

test('all seats can leave a round without changing geometry or retaining podium places', async t => {
  const fixture = await launchPartyHarness(t, { gameId });
  const credential = await fixture.create();
  const tv = await fixture.connect(credential);
  const left = await fixture.connect(await fixture.join(credential.code, 0));
  const right = await fixture.connect(await fixture.join(credential.code, 1));
  for (const seat of [left, right]) seat.send({ type: 'ready', value: true });
  await fixture.until(() => tv.view.players.every(player => player.ready));
  tv.send({ type: 'start', round: 0 });
  await fixture.until(() => left.view.phase === 'playing' && right.view.phase === 'playing');
  left.input(slide(1));
  await fixture.until(() => left.view.state.position === 1);
  const paddles = tv.view.scene.paddles;
  for (const seat of [left, right]) tv.send({ type: 'kick', playerId: seat.playerId });
  assert.deepEqual(await Promise.all([left.disconnected, right.disconnected]), [4403, 4403]);
  await fixture.until(() => tv.view.phase === 'results', { ticks: 1801 });
  assert.deepEqual(tv.view.players, []);
  assert.deepEqual(tv.view.scene.paddles, paddles);
  assert.deepEqual(tv.view.results, []);
});
