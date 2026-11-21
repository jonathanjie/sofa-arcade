import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { request } from 'node:http';
import { readFile } from 'node:fs/promises';
import { serializeCheckpoint, project } from '../engine.mjs';
import { driveCampaign, replayTranscript, PROOF_SEEDS } from '../validation/run-routes.mjs';
import { startHarness } from '../harness/server.mjs';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const viewer = { role: 'public', playerId: null };

test('eight seeded campaigns solve every basket from local and opposite trays using real normalized inputs', { timeout: 120000 }, () => {
  const coverage = new Set();
  let perfect = 0, ordinary = 0;
  for (const [index, seed] of PROOF_SEEDS.entries()) {
    const result = driveCampaign({ seed, matchId: `route-proof-${index + 1}` });
    assert.equal(result.view.phase, 'finished');
    assert.equal(result.summary.ordersCompleted, 12, seed);
    assert.equal(result.summary.stars, 9, seed);
    assert.equal(result.summary.results.length, 3);
    assert.ok(result.summary.results.every(stage => stage.elapsedTicks > 0 && stage.elapsedTicks < 5400));
    assert.ok(result.summary.limits.maxActive <= 8);
    assert.ok(result.summary.limits.maxSpeed <= 220);
    assert.ok(result.summary.limits.maxSubsteps <= 8 * 3);
    assert.ok(result.summary.limits.maxIterations <= 8 * 3 * 4);
    assert.equal(new Set(result.deliveries.map(delivery => delivery.id)).size, result.deliveries.length);
    assert.ok(result.events.some(event => event.kind === 'gate-forecast'));
    assert.ok(result.events.some(event => event.kind === 'gust-forecast'));
    assert.ok(result.events.some(event => event.kind === 'gust-start'));
    for (const delivery of result.deliveries.filter(delivery => delivery.crossing)) {
      assert.ok(result.events.some(event => event.kind === 'transfer' && event.entityId === delivery.id && event.playerId === delivery.to), `Crossing catch requires actual transfer: ${delivery.id}`);
    }
    const replay = replayTranscript(result.transcript);
    assert.equal(hash(serializeCheckpoint(replay)), result.summary.authoritativeDigest, `Replay: ${seed}`);
    assert.deepEqual(project(replay, viewer), result.view);
    for (const key of result.summary.coverage) coverage.add(key);
    if (result.summary.composted === 0) perfect++; else ordinary++;
  }
  for (let stage = 0; stage < 3; stage++) for (const type of ['apple', 'plum', 'pear', 'starfruit']) for (const origin of ['local', 'cross']) assert.ok(coverage.has(`${stage}:${type}:${origin}`));
  assert.equal(coverage.size, 24);
  assert.ok(perfect > 0, 'Perfect Picnic path must be achievable.');
  assert.ok(ordinary > 0, 'Replacement supply must support a run after real compost.');
});

test('a complete safe-input campaign times out all three stages without changing their active budgets', { timeout: 30000 }, () => {
  const result = driveCampaign({ seed: 'timeout-proof', matchId: 'timeout-proof', timeoutOnly: true });
  assert.equal(result.view.phase, 'finished');
  assert.equal(result.summary.ordersCompleted, 0);
  assert.equal(result.summary.stars, 0);
  assert.equal(result.summary.tick, 3 * (5400 + 180));
  assert.deepEqual(result.view.results.map(stage => stage.elapsedTicks), [5400, 5400, 5400]);
  assert.equal(result.summary.limits.maxActive, 8);
  assert.equal(result.events.filter(event => event.kind === 'stage-complete').length, 3);
  const replay = replayTranscript(result.transcript);
  assert.equal(hash(serializeCheckpoint(replay)), result.summary.authoritativeDigest);
});

test('diagnostic controller has no authority, checkpoint, or future-supply import', async () => {
  const source = await readFile(new URL('../validation/pilot.mjs', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]);
  assert.deepEqual(imports.sort(), ['../catalog.mjs', '../geometry.mjs']);
  assert.equal(source.includes('createRun('), false);
  assert.equal(source.includes('step('), false);
  assert.equal(source.includes('serializeCheckpoint('), false);
  assert.equal(source.includes('.supply'), false);
});

test('diagnostic HTTP server is loopback-only and serves an explicit development closure', async () => {
  const harness = await startHarness();
  try {
    const main = await fetch(harness.url);
    assert.equal(main.status, 200);
    assert.match(main.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.match(await main.text(), /Gravity Orchard/);
    const module = await fetch(new URL('/engine.mjs', harness.url));
    assert.equal(module.status, 200, 'Authority import is deliberate in the development harness only.');
    for (const path of ['/AGENTS.md', '/server/rooms.mjs', '/fixtures/private.json', '/harness/package-lock.json', '/validation/run-routes.mjs', '/.git/config']) {
      assert.equal((await fetch(new URL(path, harness.url))).status, 404, path);
    }
    assert.equal((await fetch(harness.url, { method: 'POST' })).status, 405);
    // Fetch controls its Host header; use the HTTP client to test an actual
    // foreign authority on the wire rather than a silently rewritten header.
    const foreignStatus = await new Promise((resolve, reject) => {
      const req = request(harness.url, { headers: { Host: 'example.org' } }, response => { response.resume(); resolve(response.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(foreignStatus, 403);
  } finally { await harness.close(); }
});
