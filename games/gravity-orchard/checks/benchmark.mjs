/** Reproducible engine timing; measurements live outside the pure engine. */
import { performance } from 'node:perf_hooks';
import { cpus, availableParallelism, platform, arch } from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createRun, step, applyCommand, project } from '../engine.mjs';

const safe = { jon: { x: 0, y: 0, brake: true }, lydia: { x: 0, y: 0, brake: true } };
const drive = { jon: { x: 1, y: 0, brake: false }, lydia: { x: 1, y: 0, brake: false } };
let state = createRun({ seed: 'eight-fruit-benchmark', matchId: 'benchmark' });
function start() {
  for (const playerId of ['jon', 'lydia']) state = applyCommand(state, { role: 'player', playerId }, { kind: 'ready', payload: { value: true } }).state;
  while (state.phase === 'countdown') state = step(state, safe);
}
function percentile(values, fraction) { return values[Math.min(values.length - 1, Math.floor(values.length * fraction))]; }
const stages = [];
for (let stage = 0; stage < 3; stage += 1) {
  start();
  while (state.elapsedTicks < 1800) state = step(state, safe);
  // Warm the same eight-fruit work path before recording. Full engine copies,
  // events, collisions and supply checks are included; projection is separate.
  for (let i = 0; i < 200; i += 1) state = step(state, drive);
  const samples = []; const projections = [];
  let maxChecks = 0; let maxIterations = 0; let contactTicks = 0; let fallbacks = 0;
  for (let i = 0; i < 1000; i += 1) {
    if (state.fruits.length !== 8) throw new Error('Eight-fruit benchmark lost its stated occupancy.');
    const begin = performance.now(); state = step(state, drive); samples.push(performance.now() - begin);
    const projectionBegin = performance.now(); project(state, { role: 'public', playerId: null }); projections.push(performance.now() - projectionBegin);
    maxChecks = Math.max(maxChecks, state.diagnostics.work.checks);
    maxIterations = Math.max(maxIterations, state.diagnostics.work.iterations);
    if (state.diagnostics.hits.length) contactTicks += 1;
    fallbacks += state.diagnostics.fallbacks;
  }
  samples.sort((a, b) => a - b); projections.sort((a, b) => a - b);
  stages.push({ levelId: state.levelId, activeFruit: 8, samples: samples.length, contactTicks, fallbacks,
    tickMs: { median: percentile(samples, .5), p95: percentile(samples, .95), p99: percentile(samples, .99), max: samples.at(-1) },
    projectionMs: { median: percentile(projections, .5), p95: percentile(projections, .95) }, maxChecks, maxIterations });
  while (state.phase === 'playing') state = step(state, safe);
}
const report = { schemaVersion: 1, node: process.version, platform: platform(), arch: arch(),
  cpu: cpus()[0]?.model ?? 'unreported', logicalCPUs: availableParallelism(),
  method: '1000 measured full engine ticks per authored stage after200 warmup ticks, exactly8 fruit before every sample; constant normalized steering into terrain; performance.now around step; projection measured separately.',
  tickBudgetMs: 1000 / 60, stages,
  limitations: ['Host CPU microbenchmark includes JavaScript allocation/GC, not rendering/network/SQLite.', 'This is not phone-to-TV, home Wi-Fi, casting, macOS, or human-play performance.', 'Worst observed tick is noisy; no machine-speed threshold is used as a flaky CI pass condition.'] };
const index = process.argv.indexOf('--out');
if (index >= 0) {
  if (!process.argv[index + 1]) throw new Error('--out requires a file path.');
  const output = resolve(process.argv[index + 1]); await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report, null, 2));
