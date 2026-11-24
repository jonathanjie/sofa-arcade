import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Miniflare } from 'miniflare';
import { unstable_getMiniflareWorkerOptions } from 'wrangler';
import { phaseAction } from '../integration/fixtures/odd-laws-policy.mjs';
import { assertNoCredentials, command, openRoom, PLAYER_IDS, request, submit } from '../integration/protocol/harness.mjs';

const configPath = fileURLToPath(new URL('../../dist/server/wrangler.json', import.meta.url));
const migrations = new URL('../../drizzle/', import.meta.url);

async function startWorker(t) {
  const { main, workerOptions } = unstable_getMiniflareWorkerOptions(configPath);
  const modulesRoot = path.dirname(main);
  const files = await readdir(modulesRoot, { recursive: true });
  // The built server loads route chunks dynamically. Register the entry first.
  const modules = [{ type: 'ESModule', path: main }];
  for (const name of files) {
    const file = path.resolve(modulesRoot, name);
    if (name.endsWith('.js') && file !== main) modules.push({ type: 'ESModule', path: file });
  }
  const runtime = new Miniflare({
    ...workerOptions, modulesRoot, modules, host: '127.0.0.1', port: 0, cf: false,
  });
  t.after(() => runtime.dispose());
  const db = await runtime.getD1Database('DB');
  for (const file of (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort()) {
    const sql = await readFile(new URL(file, migrations), 'utf8');
    const statements = sql.split('--> statement-breakpoint').map(statement => db.prepare(statement.trim()));
    await db.batch(statements);
  }
  return { origin: (await runtime.ready).origin };
}

test('D1 accepts one council reveal when two players commit at the same revision', async t => {
  const host = await startWorker(t);
  const game = { gameId: 'odd-laws-society' };
  const live = await openRoom(host, game);
  const initial = live.room.state;
  const votes = {
    jon: { choiceId: initial.council.optionIds[0], bid: 2 },
    lydia: { choiceId: initial.council.optionIds[1], bid: 1 },
  };
  const requests = PLAYER_IDS.map(id => command(live.room, phaseAction(initial, 'commitCouncil', votes[id])));
  const responses = await Promise.all(PLAYER_IDS.map((id, i) => submit(host, live, id, requests[i])));
  for (const response of responses) assert.equal(response.status, 200);
  const revisions = responses.map(response => response.value.revision);
  const finalRevision = live.room.revision + 2;
  assert.deepEqual(revisions.toSorted((a, b) => a - b), [finalRevision - 1, finalRevision]);
  const second = revisions.indexOf(finalRevision);
  const first = 1 - second;
  assert.equal(responses[first].value.state.lastCouncil, null);
  for (const id of PLAYER_IDS) {
    assert.equal(responses[first].value.state.players[id].influence, initial.players[id].influence);
  }
  assert.deepEqual(responses[first].value.state.council.ownCommitment, votes[PLAYER_IDS[first]]);

  const publicRoom = await request(host, `/api/rooms/${live.code}`);
  assert.equal(publicRoom.status, 200);
  assertNoCredentials(publicRoom.text, live);
  const { state, revision } = publicRoom.value;
  assert.equal(revision, finalRevision);
  assert.equal(state.stage, 'actions');
  assert.equal(state.council, null);
  assert.deepEqual(state.lastCouncil.choices, votes);
  assert.equal(state.players.jon.influence, 0);
  assert.equal(state.players.lydia.influence, 1);
  const replay = await submit(host, live, PLAYER_IDS[second], requests[second]);
  assert.equal(replay.status, 200);
  assert.equal(replay.value.revision, finalRevision);
  assert.deepEqual(replay.value.state.lastCouncil, state.lastCouncil);
  assert.deepEqual(replay.value.state, responses[second].value.state);
  const afterReplay = await request(host, `/api/rooms/${live.code}`);
  assert.equal(afterReplay.value.revision, revision);
  assert.deepEqual(afterReplay.value.state, state);

  // Hold a second council at its half-committed revision for a public GET.
  const sealed = await openRoom(host, game);
  const vote = phaseAction(sealed.room.state, 'commitCouncil', { choiceId: 'keep', bid: 1 });
  assert.equal((await submit(host, sealed, 'jon', command(sealed.room, vote))).status, 200);
  const pending = await request(host, `/api/rooms/${sealed.code}`);
  assert.equal(pending.status, 200);
  assertNoCredentials(pending.text, sealed);
  assert.deepEqual(pending.value.state.council, {
    ...sealed.room.state.council, ready: { jon: true, lydia: false }, ownCommitment: null,
  });
  assert.equal(pending.value.state.lastCouncil, null);
});
