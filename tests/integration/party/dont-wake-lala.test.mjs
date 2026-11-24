import assert from 'node:assert/strict';
import test from 'node:test';
import { launchPartyHarness } from '../../party/harness.mjs';

const gameId = 'dont-wake-lala';
const hold = (phone, held) => phone.input({ kind: 'hold', held });
const isWatching = cue => cue === 'blink' || cue === 'look';

async function readyPhone(fixture, code, look, name) {
  const phone = await fixture.connect(await fixture.join(code, look, name));
  phone.send({ type: 'ready', value: true });
  return phone;
}

async function start(fixture, tv, number, players) {
  await fixture.until(() => tv.view.players.filter(player => player.connected && player.ready).length === players.length, { ticks: 16 });
  tv.send({ type: 'start', round: number - 1 });
  await fixture.until(() => players.every(phone => phone.view.round === number && phone.view.phase === 'playing'), { ticks: 80 });
  assert.equal(tv.view.roster.length, players.length);
}

// The shared helper that drives Tap Race has a 500-tick budget. Use the same
// WebSocket harness directly for this game's 30 seconds of movement and 60 s timeout.
test('sixteen phones play two full Lala rounds with reconnect, removal and a late guest', { timeout: 20_000 }, async t => {
  const fixture = await launchPartyHarness(t, { gameId });
  const host = await fixture.create();
  const tv = await fixture.connect(host);
  const phones = await Promise.all(Array.from({ length: 16 }, (_, index) =>
    readyPhone(fixture, host.code, index, index === 0 ? '🦔'.repeat(12) : `Hall Mouse${index}`)));
  await start(fixture, tv, 1, phones);

  const away = phones[1];
  await away.disconnect();
  await fixture.until(() => tv.view.players.some(player => player.id === away.playerId && !player.connected), { ticks: 16 });
  phones[1] = await fixture.connect(away.credential);
  assert.equal(phones[1].view.waiting, false);
  const removed = phones.pop();
  tv.send({ type: 'kick', playerId: removed.playerId });
  assert.equal(await removed.disconnected, 4403);
  const late = await readyPhone(fixture, host.code, 15, 'Late Guest');
  assert.equal(late.view.waiting, true);
  assert.equal(late.view.state, null);
  hold(late, true);

  let sawCatch = false;
  await fixture.until(() => tv.view.phase === 'results', { ticks: 1250, drive(tick) {
    if (tick % 2 === 0) {
      hold(phones[0], !isWatching(tv.view.scene.cue));
      for (const phone of phones.slice(1)) hold(phone, true);
    }
    sawCatch ||= tv.view.scene.runners.some(runner => runner.caught);
  } });
  assert.ok(sawCatch);
  assert.deepEqual(tv.view.results[0], { playerId: phones[0].playerId, score: 150, place: 1 });
  assert.equal(tv.view.results.length, 15);
  assert.ok(!tv.view.results.some(result => result.playerId === late.playerId));
  assert.ok(!tv.view.results.some(result => result.playerId === removed.playerId));

  phones.push(late);
  await start(fixture, tv, 2, phones);
  assert.equal(late.view.waiting, false);
  assert.deepEqual(Object.keys(late.view.state).sort(), ['caught', 'cue', 'distance']);
  assert.equal(Object.hasOwn(phones[0].view, 'players'), false);
  assert.equal(Object.hasOwn(phones[0].view, 'scene'), false);
  assert.ok(!JSON.stringify(phones[0].view).includes('Late Guest'));
  const startsAt = fixture.clock.now() + tv.view.ms - 60_000;
  await fixture.until(() => tv.view.phase === 'results', { ticks: 1250 });
  assert.equal(fixture.clock.now() - startsAt, 60_000);
  assert.equal(tv.view.results.length, 16);
  assert.ok(tv.view.results.every(result => result.score === 0 && result.place === 1));

  let peak = 0;
  for (const { packets } of phones) {
    const playing = packets.filter(packet => packet.phase === 'playing' && packet.type === 'snapshot');
    let begin = 0;
    let bytes = 0;
    for (const [index, packet] of playing.entries()) {
      assert.ok(packet.bytes <= 324);
      bytes += packet.bytes;
      while (playing[begin].at <= packet.at - 1000) bytes -= playing[begin++].bytes;
      assert.ok(begin <= index);
      peak = Math.max(peak, bytes);
    }
  }
  assert.ok(peak > 0 && peak < 2000);
  t.diagnostic(`Peak phone downstream over one second: ${peak} B/s`);
});

for (const size of [2, 8]) {
  test(`the party host locks ${size} lanes and runs the Lala rules`, async t => {
    const fixture = await launchPartyHarness(t, { gameId });
    const host = await fixture.create();
    const tv = await fixture.connect(host);
    const phones = await Promise.all(Array.from({ length: size }, (_, index) => readyPhone(fixture, host.code, index)));
    await start(fixture, tv, 1, phones);
    hold(phones[0], true);
    await fixture.until(() => phones[0].view.state.distance > 0, { ticks: 8 });
    hold(phones[0], false);
    assert.equal(tv.view.scene.runners.length, size);
    assert.equal(phones[1].view.state.distance, 0);
  });
}
