import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createRun, normalizeInput, step, applyCommand, project, serializeCheckpoint } from '../engine.mjs';
import { createPilot } from './pilot.mjs';

export const PROOF_SEEDS = Object.freeze(Array.from({ length: 8 }, (_, index) => `orchard-proof-${index + 1}`));
const viewer = Object.freeze({ role: 'public', playerId: null });
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const safe = () => ({ jon: { x: 0, y: 0, brake: true }, lydia: { x: 0, y: 0, brake: true } });
function appendInputs(timeline, controls) {
  const values = [controls.jon.x, controls.jon.y, controls.jon.brake, controls.lydia.x, controls.lydia.y, controls.lydia.brake];
  const previous = timeline.at(-1);
  if (previous?.kind === 'inputs' && previous.values.every((value, index) => value === values[index])) previous.ticks++;
  else timeline.push({ kind: 'inputs', ticks: 1, values });
}

/** Drive only through the public interface. Never write authoritative fields. */
export function driveCampaign({ seed = PROOF_SEEDS[0], matchId = 'route-proof', mode = 'campaign', timeoutOnly = false, recordTranscript = true } = {}) {
  let state = createRun({ seed, matchId, options: { mode } });
  const pilot = createPilot();
  const timeline = [];
  const eventIds = new Set();
  const events = [];
  const spawns = new Map();
  const deliveries = [];
  const snapshots = [];
  const limits = { maxActive: 0, maxSpeed: 0, maxChecks: 0, maxSubsteps: 0, maxIterations: 0, maxFallbacks: 0 };
  let iterations = 0;
  const observe = () => {
    const view = project(state, viewer);
    limits.maxActive = Math.max(limits.maxActive, view.fruits.length);
    if (view.fruits.length > 8) throw new Error('Active fruit bound exceeded.');
    for (const fruit of view.fruits) {
      if (![fruit.x, fruit.y, fruit.vx, fruit.vy].every(Number.isFinite) || Math.hypot(fruit.vx, fruit.vy) > 220) throw new Error('Invalid finite/speed bound in actual route.');
    }
    limits.maxSpeed = Math.max(limits.maxSpeed, ...view.fruits.map(fruit => Math.hypot(fruit.vx, fruit.vy)));
    const work = state.diagnostics?.work || {};
    limits.maxChecks = Math.max(limits.maxChecks, work.checks || 0);
    limits.maxSubsteps = Math.max(limits.maxSubsteps, work.substeps || 0);
    limits.maxIterations = Math.max(limits.maxIterations, work.iterations || 0);
    limits.maxFallbacks = Math.max(limits.maxFallbacks, state.diagnostics?.fallbacks || 0);
    for (const event of view.events) if (!eventIds.has(event.id)) {
      eventIds.add(event.id); events.push(event);
      if (event.kind === 'spawn') spawns.set(event.entityId, { stageIndex: view.stageIndex, playerId: event.playerId, tick: event.tick, type: event.data.fruitType });
      if (event.kind === 'catch') {
        const spawn = spawns.get(event.entityId);
        if (!spawn) throw new Error(`Catch without preceding spawn: ${event.entityId}`);
        deliveries.push({ stageIndex: spawn.stageIndex, type: spawn.type, from: spawn.playerId, to: event.playerId, crossing: spawn.playerId !== event.playerId, spawnTick: spawn.tick, catchTick: event.tick, id: event.entityId });
      }
    }
    if (view.tick % 60 === 0 && ['countdown', 'playing'].includes(view.phase)) snapshots.push({ tick: view.tick, runEpoch: view.runEpoch, stageIndex: view.stageIndex, phase: view.phase, fruits: view.fruits, completed: view.orders.completedIds.length });
    return view;
  };
  let view = observe();
  while (iterations++ < 30000 && view.phase !== 'finished') {
    if (['waiting', 'interlude'].includes(view.phase)) {
      for (const playerId of ['jon', 'lydia']) {
        const actor = { role: 'player', playerId };
        const command = { kind: 'ready', payload: { value: true } };
        const outcome = applyCommand(state, actor, command);
        if (!outcome.accepted) throw new Error(`Normal readiness rejected: ${outcome.code}`);
        state = outcome.state;
        if (recordTranscript) timeline.push({ kind: 'command', actor, command });
        view = observe();
      }
    }
    const controls = timeoutOnly ? safe() : pilot.update(view);
    for (const playerId of ['jon', 'lydia']) {
      const normalized = normalizeInput(controls[playerId]);
      if (!normalized || JSON.stringify(normalized) !== JSON.stringify(controls[playerId])) throw new Error(`Pilot produced unnormalized controls: ${JSON.stringify(controls)}`);
    }
    if (recordTranscript) appendInputs(timeline, controls);
    state = step(state, controls);
    view = observe();
  }
  if (view.phase !== 'finished') throw new Error(`Bounded campaign failed to finish after ${iterations} calls.`);
  const coverage = [...new Set(deliveries.map(delivery => `${delivery.stageIndex}:${delivery.type}:${delivery.crossing ? 'cross' : 'local'}`))].sort();
  const summary = {
    schemaVersion: 1, seed, matchId, mode, timeoutOnly,
    tick: view.tick, results: view.results,
    ordersCompleted: view.results.reduce((sum, result) => sum + result.ordersCompleted, 0),
    stars: view.results.reduce((sum, result) => sum + result.stars, 0),
    composted: view.results.reduce((sum, result) => sum + result.composted, 0),
    deliveries: deliveries.length, coverage, limits,
    authoritativeDigest: digest(serializeCheckpoint(state)),
    publicDigest: digest(view),
    transcriptDigest: digest(timeline),
    source: 'Constructor + ready commands + fixed step with normalized controls; no state writes or fruit repositioning.',
  };
  return { state, view, summary, deliveries, events, snapshots, transcript: { schemaVersion: 1, seed, matchId, mode, timeline } };
}

/** Transcript playback makes no planning decisions and independently reuses the engine seam. */
export function replayTranscript(transcript) {
  let state = createRun({ seed: transcript.seed, matchId: transcript.matchId, options: { mode: transcript.mode } });
  for (const entry of transcript.timeline) {
    if (entry.kind === 'command') {
      const result = applyCommand(state, entry.actor, entry.command);
      if (!result.accepted) throw new Error(`Transcript command rejected: ${result.code}`);
      state = result.state;
    } else if (entry.kind === 'inputs') {
      const [x, y, brake, lx, ly, lb] = entry.values;
      const controls = { jon: { x, y, brake }, lydia: { x: lx, y: ly, brake: lb } };
      for (let i = 0; i < entry.ticks; i++) state = step(state, controls);
    } else throw new TypeError('Unknown transcript entry.');
  }
  return state;
}

export async function writeRouteEvidence(output, seeds = PROOF_SEEDS) {
  await mkdir(output, { recursive: true });
  const summaries = [];
  for (const [index, seed] of seeds.entries()) {
    const result = driveCampaign({ seed, matchId: `route-proof-${index + 1}` });
    if (result.summary.ordersCompleted !== 12) throw new Error(`${seed} only completed ${result.summary.ordersCompleted} orders; inspect real input replay.`);
    const replay = replayTranscript(result.transcript);
    if (digest(serializeCheckpoint(replay)) !== result.summary.authoritativeDigest) throw new Error(`${seed} replay diverged.`);
    summaries.push(result.summary);
    if (index === 0) {
      await writeFile(resolve(output, 'campaign-transcript.json.gz'), gzipSync(JSON.stringify(result.transcript), { level: 9 }));
      await writeFile(resolve(output, 'campaign-public-paths.json.gz'), gzipSync(JSON.stringify({ deliveries: result.deliveries, events: result.events, snapshots: result.snapshots }), { level: 9 }));
    }
  }
  const coverage = [...new Set(summaries.flatMap(summary => summary.coverage))].sort();
  const missing = [];
  for (let stage = 0; stage < 3; stage++) for (const type of ['apple', 'plum', 'pear', 'starfruit']) for (const origin of ['local', 'cross']) {
    if (!coverage.includes(`${stage}:${type}:${origin}`)) missing.push(`${stage}:${type}:${origin}`);
  }
  if (missing.length) throw new Error(`Missing normalized-input reachability coverage: ${missing.join(', ')}`);
  const evidence = { schemaVersion: 1, method: 'Eight fixed published seeds; public-view feedback; replayed accepted normalized inputs; no engine-state mutation.', limitations: ['A deterministic software route proof is not a human difficulty study.', 'This local diagnostic has no phone sensors, authenticated network clients, Wi-Fi measurement or Tauri packaging.'], coverage, missing, runs: summaries };
  await writeFile(resolve(output, 'route-summary.json'), JSON.stringify(evidence, null, 2) + '\n');
  return evidence;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.argv.find(arg => arg.startsWith('--output='))?.slice('--output='.length) || '/tmp/gravity-orchard-route-evidence';
  const result = await writeRouteEvidence(resolve(output));
  console.log(JSON.stringify({ output: resolve(output), runs: result.runs.length, coverage: result.coverage.length, results: result.runs.map(run => ({ seed: run.seed, orders: run.ordersCompleted, stars: run.stars, composted: run.composted, elapsedTicks: run.results.map(stage => stage.elapsedTicks) })) }, null, 2));
}
