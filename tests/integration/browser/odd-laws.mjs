/** Run after the immutable WS1–WS4 handoffs are assembled. Missing modules fail. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { acceptanceSession, runtimeRoot } from './support.mjs';
import {
  openOddLaws, verifyOddPresentation, verifyOddTutorial, playOddMatch,
  rematchOddLaws, finishOddJourney,
} from './odd-laws-journey.mjs';

const load = file => import(pathToFileURL(path.join(runtimeRoot, file)).href);
const [authority, previews, definitions, catalog, registry, rooms] = await Promise.all([
  load('games/odd-laws-society/engine.mjs'), load('games/odd-laws-society/preview.mjs'),
  load('games/odd-laws-society/catalog.mjs'), load('games/catalog.mjs'),
  load('games/registry.mjs'), load('server/rooms.mjs'),
]);
assert.equal(typeof rooms.createRoomApi, 'function', 'A tested WS2 createRoomApi handoff is required');
assert.equal(typeof registry.oddLawsRoomEngine?.create, 'function', 'The shared server registration adapter must be delivered');
const candidate = process.env.SOFA_ACCEPTANCE_CANDIDATE === '1';
if (!candidate) assert.equal(catalog.getGame('odd-laws-society').status, 'playable', 'The final release journey must start from a playable collection card. Use SOFA_ACCEPTANCE_CANDIDATE=1 only for the pre-enablement candidate gate.');
const rules = { buildings: definitions.BUILDINGS, laws: definitions.LAWS, guilds: definitions.GUILDS, ...previews };
const requestedChair = process.env.SOFA_ACCEPTANCE_CHAIR;
assert.ok(!requestedChair || ['jon', 'lydia'].includes(requestedChair), 'SOFA_ACCEPTANCE_CHAIR must be jon or lydia');

for (const chair of requestedChair ? [requestedChair] : ['jon', 'lydia']) {
  // Only randomness at match creation is fixed. No mutable state, authority,
  // authentication, projection, persistence or transport behavior is replaced.
  let seed;
  for (let index = 0; index < 100 && !seed; index++) {
    const candidateSeed = `ws6-protocol-${index}`;
    const view = authority.engine.project(authority.engine.create({ seed: candidateSeed, matchId: 'ws6-browser-seed-search' }), { role: 'host' });
    if (view.chair === chair) seed = candidateSeed;
  }
  assert.ok(seed, `A stable seed must exercise initial Chair ${chair}`);
  const registered = registry.oddLawsRoomEngine;
  const engine = Object.freeze({ ...registered, create: options => registered.create({ ...options, seed }) });
  const roomApi = rooms.createRoomApi({
    resolveGame: id => candidate && id === 'odd-laws-society' ? { ...catalog.getGame(id), status: 'playable' } : catalog.getGame(id),
    resolveEngine: id => id === 'odd-laws-society' ? engine : registry.getGameEngine(id),
  });
  const run = await acceptanceSession(`odd-laws-chair-${chair}`, {
    serverOptions: { roomApi },
    setup: {
      initialChair: chair, seed,
      catalogStatus: catalog.getGame('odd-laws-society').status,
      candidate,
      entrypoint: candidate ? 'Real authenticated API create with candidate-only game resolver; stored returned host credential; ordinary rendered joining/start/actions thereafter.' : 'Unmodified playable collection card and rendered host creation.',
      authority: 'Delivered engine; only creation seed pinned. Real WS2 room API, SQLite database, bearer authentication and per-viewer HTTP/SSE projections.',
    },
  });
  let failure;
  try {
    const live = await openOddLaws(run, { candidate });
    await verifyOddPresentation(run, live);
    if (chair === 'jon') await verifyOddTutorial(run, live);
    const first = await playOddMatch(run, live, rules, { chair, policy: 'rich', recovery: chair === 'jon' });
    await rematchOddLaws(run, live, first);
    await playOddMatch(run, live, rules, { chair, policy: chair === 'jon' ? 'tie' : 'fill', lostAcknowledgment: chair === 'jon' });
    await finishOddJourney(run, live);
  } catch (error) {
    failure = error;
  } finally {
    await run.finish(failure);
  }
  if (failure) throw failure;
}
