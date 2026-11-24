import test from 'node:test';
import assert from 'node:assert/strict';
import { dustBunnySumo as game } from '../../../games/party/dust-bunny-sumo/rules.mjs';
import { launchPartyHarness, runPartyRounds } from '../../party/harness.mjs';

const DIRECTION_SEED = 'party-harness-seed';

function outward(body) {
  const length = Math.hypot(body.x, body.y);
  return { kind: 'roll', x: body.x / length, y: body.y / length };
}

function peakBandwidth(packets) {
  const playing = packets.filter(packet => packet.type === 'snapshot' && packet.phase === 'playing');
  return Math.max(0, ...playing.map(end => playing.filter(packet => packet.at > end.at - 1000 && packet.at <= end.at)
    .reduce((sum, packet) => sum + packet.bytes, 0)));
}

test('sixteen phones complete two sumo rounds with reconnects, a kick, and a late guest', { timeout: 12_000 }, async t => {
  let directions;
  let removedId;
  const { phones } = await runPartyRounds(t, {
    gameId: game.id,
    drive(phones, tick) {
      const round = phones[0].view.round;
      if (tick === 0) {
        const active = phones.map(phone => ({ id: phone.playerId }));
        if (round === 1) {
          const initial = Array.from({ length: 16 }, (_, index) => `p${index + 1}`);
          removedId = initial.find(id => active.every(player => player.id !== id));
          active.push({ id: removedId });
        }
        active.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
        directions = new Map(game.createRound(active, DIRECTION_SEED, round).bodies.map(body => [body.id, outward(body)]));
      }
      if (tick % 2 || tick < 100) return;
      for (const [index, phone] of phones.entries()) {
        if (index === 0) continue;
        if (!phone.view.state.out) phone.input(directions.get(phone.playerId));
      }
    },
    assertResults(view, phones, round) {
      const [first] = view.results;
      assert.equal(view.results.length, phones.length);
      assert.equal(first.playerId, phones[0].playerId);
      assert.equal(first.place, 1);
      assert.equal(first.score, round === 1 ? 15 : 16);
      assert.equal(view.scene.bodies.filter(body => body.outAt === null).length, 1);
      assert.equal(view.results.some(result => result.playerId === removedId), false);
      if (round === 2) assert.ok(view.results.some(result => result.playerId === phones[15].playerId));
      else assert.ok(view.scene.bodies.every(body => body.id !== removedId));
    },
  });
  const peak = Math.max(...phones.map(phone => peakBandwidth(phone.packets)));
  assert.ok(peak > 0 && peak < 2000);
  t.diagnostic(`Peak phone downstream: ${peak} B/s`);
});

for (const count of [2, 8]) {
  test(`${count} sumo seats keep private controls and score ring-outs`, { timeout: 10_000 }, async t => {
    const fixture = await launchPartyHarness(t, { gameId: game.id });
    const room = await fixture.create();
    const tv = await fixture.connect(room);
    const phones = await Promise.all(Array.from({ length: count }, async (_, look) => {
      const phone = await fixture.connect(await fixture.join(room.code, look, look === 0 ? '💨'.repeat(12) : undefined));
      phone.send({ type: 'ready', value: true });
      return phone;
    }));
    await fixture.until(() => tv.view.players.length === count && tv.view.players.every(player => player.ready));
    tv.send({ type: 'start', round: 0 });
    await fixture.until(() => phones.every(phone => phone.view.phase === 'playing'));
    for (const { view } of phones) {
      assert.deepEqual(Object.keys(view.state).sort(), ['cd', 'out']);
      assert.equal(view.state.out, false);
      assert.equal(view.waiting, false);
      assert.equal('scene' in view, false);
      assert.equal('roster' in view, false);
      assert.ok(Buffer.byteLength(JSON.stringify({ type: 'snapshot', view })) < 320);
    }
    phones[0].input({ kind: 'dash' });
    await fixture.until(() => phones[0].view.state.cd > 0, { ticks: 10 });
    const charge = phones[0].view.state;
    assert.ok(charge.at > fixture.clock.now());
    assert.ok(Buffer.byteLength(JSON.stringify({ type: 'snapshot', view: phones[0].view })) < 320);
    const directions = new Map(tv.view.scene.bodies.map(body => [body.id, outward(body)]));
    await fixture.until(() => tv.view.phase === 'results', {
      drive(tick) {
        if (tick < 100 || tick % 2) return;
        for (const phone of phones.slice(1)) phone.input(directions.get(phone.playerId));
      },
    });
    assert.equal(tv.view.results[0].playerId, phones[0].playerId);
    assert.equal(tv.view.results[0].score, count);
    assert.equal(tv.view.results.length, count);
  });
}
