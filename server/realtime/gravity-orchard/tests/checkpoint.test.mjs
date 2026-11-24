import test from 'node:test';
import assert from 'node:assert/strict';
import { readCoordinatorDiagnostics } from '../index.mjs';
import { insertDedup } from '../lib/checkpoint.mjs';
import * as orchard from '../../../../games/gravity-orchard/engine.mjs';
import { flush, harness } from './unit-support/harness.mjs';
import { LIMITS, commandFingerprint, commandResult, normalizeCommand } from '../lib/protocol.mjs';

test('unchanged and rejected receipts leave space for both players to ready', () => {
  const room = { view: { matchId: 'match', runEpoch: 1, ready: { jon: false, lydia: false } }, dedup: new Map() };
  function record(playerId, id, value, rejection) {
    const actor = { role: 'player', playerId };
    const cmd = { type: 'command', protocol: 1, matchId: 'match', runEpoch: 1,
      kind: 'ready', id, payload: { value } };
    const result = rejection ? commandResult(id, false, rejection) : undefined;
    room.dedup = insertDedup(room, actor, cmd, result).dedup;
  }
  for (let index = 0; index < LIMITS.maxDedupRecords; index++) {
    const rejected = index % 2 === 1;
    try {
      record('jon', 'request-' + index, rejected, rejected ? 'unavailable_controllers' : null);
    } catch (error) {
      assert.equal(error.code, 'command_capacity');
      break;
    }
  }
  const retained = new Map(room.dedup);
  assert.ok(retained.size > 0);
  record('jon', 'confirm-jon', true);
  room.view.ready.jon = true;
  record('lydia', 'confirm-lydia', true);
  for (const [key, receipt] of retained) assert.deepEqual(room.dedup.get(key), receipt);
  assert.ok(room.dedup.size <= LIMITS.maxDedupRecords);
});

test('a full saved receipt history still answers retries and permits both players to ready', async (t) => {
  const store = new Map();
  const first = await harness({ store, simulation: orchard });
  await first.close();
  const checkpoint = store.get('UNIT');
  // Earlier hosts could persist an entire epoch of unchanged Ready commands.
  checkpoint.commands = Array.from({ length: LIMITS.maxDedupRecords }, (_, index) => {
    const command = normalizeCommand({ type: 'command', protocol: 1, kind: 'ready', payload: { value: false },
      id: 'saved-' + index, matchId: checkpoint.matchId, runEpoch: checkpoint.runEpoch });
    return { actor: 'player:jon', command, fingerprint: commandFingerprint(command),
      result: commandResult(command.id, true) };
  });

  const h = await harness({ store, simulation: orchard });
  t.after(() => h.close());
  const jon = await h.connect('jon'), lydia = await h.connect('lydia');
  const original = checkpoint.commands[0];
  jon.send(original.command); await flush();
  assert.deepEqual(jon.messages.at(-1), original.result);
  jon.send({ ...original.command, payload: { value: true } }); await flush();
  assert.equal(jon.messages.at(-1).code, 'command_conflict');
  assert.deepEqual(h.coordinator.getPublicView('UNIT').ready, { jon: false, lydia: false });

  const noChange = await jon.command('ready', { value: false });
  assert.equal(noChange.result.accepted, true);
  assert.equal(readCoordinatorDiagnostics(h.coordinator, 'UNIT').dedupRecords, LIMITS.maxDedupRecords / 2);

  jon.input(); lydia.input(); await flush();
  assert.equal((await jon.command('ready', { value: true })).result.accepted, true);
  assert.equal((await lydia.command('ready', { value: true })).result.accepted, true);
  assert.equal(h.coordinator.getPublicView('UNIT').phase, 'countdown');
});

test('alternating Ready changes cannot lock the waiting run at receipt capacity', async (t) => {
  const h = await harness({ simulation: orchard });
  t.after(() => h.close());
  const jon = await h.connect('jon'), lydia = await h.connect('lydia');
  const start = h.coordinator.getPublicView('UNIT');
  for (let i = 0; i < LIMITS.maxDedupRecords + 1; i++) {
    await h.clock.jump(1000 / LIMITS.maxCommandsPerSecond);
    jon.input(); await flush();
    const { result } = await jon.command('ready', { value: i % 2 === 0 });
    if (!result.accepted) {
      assert.equal(result.code, 'command_capacity');
      break;
    }
  }
  const refreshed = h.coordinator.getPublicView('UNIT');
  assert.ok(refreshed.runEpoch > start.runEpoch);
  assert.deepEqual(refreshed.ready, { jon: false, lydia: false });
  await h.clock.advance(1000);
  jon.input(); lydia.input(); await flush();
  assert.equal((await lydia.command('ready', { value: true })).result.accepted, true);
  assert.equal((await jon.command('ready', { value: true })).result.accepted, true);
  assert.equal(h.coordinator.getPublicView('UNIT').phase, 'countdown');
});
