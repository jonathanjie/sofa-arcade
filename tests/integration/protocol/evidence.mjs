import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { latencySummary } from './harness.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export const LATENCY_METHOD = Object.freeze({
  transport: 'real Node HTTP actions and three authenticated SSE subscriptions',
  network: '127.0.0.1 loopback IPv4',
  clock: 'performance.now(), milliseconds',
  start: 'immediately before fetch submits a successful city action',
  end: 'the subscriber parses the SSE snapshot carrying that resulting room revision',
  heartbeatMs: 60_000,
  updateTimeoutMs: 5_000,
  percentiles: 'nearest rank over observed update samples',
  performanceThreshold: null,
  excludes: ['physical phones', 'home LAN/Wi-Fi', 'browser paint/rendering', 'AirPlay/casting', 'TV refresh', 'human input'],
});

/** Exact committed source plus an honest dirty indicator; never emit a raw diff or filenames. */
export function captureSource() {
  const commit = git(['rev-parse', 'HEAD']);
  const tree = git(['rev-parse', 'HEAD^{tree}']);
  const status = git(['status', '--porcelain=v1', '--untracked-files=normal']);
  const after = git(['rev-parse', 'HEAD']);
  return {
    repository: 'jonathanjie/sofa-arcade', commit, tree,
    worktreeClean: status.length === 0,
    commitChangedDuringCapture: commit !== after,
  };
}

function safeSource(value) {
  if (!/^[a-f0-9]{40,64}$/.test(value?.commit || '') || !/^[a-f0-9]{40,64}$/.test(value?.tree || '')) {
    throw new TypeError('Evidence requires a real Git commit and tree.');
  }
  return { repository: 'jonathanjie/sofa-arcade', commit: value.commit, tree: value.tree,
    worktreeClean: value.worktreeClean === true, commitChangedDuringCapture: value.commitChangedDuringCapture === true };
}

/** Only aggregate counts/timings and source identity may enter evidence. No room or token object. */
export async function writeLatencyEvidence({ name, gameId, chair = null, policy = null, samples, sourceBefore,
  directory = process.env.SOFA_EVIDENCE_DIR } = {}) {
  if (!directory) return null;
  if (!/^[a-z0-9][a-z0-9-]{0,90}$/.test(name || '')) throw new TypeError('Use a safe evidence name.');
  if (!['sofa-kingdoms', 'odd-laws-society'].includes(gameId)) throw new TypeError('Use a known game ID.');
  if (chair !== null && !['jon', 'lydia'].includes(chair)) throw new TypeError('Use a known initial Chair.');
  if (policy !== null && !['rich', 'fill', 'tie'].includes(policy)) throw new TypeError('Use a known acceptance policy.');
  const timings = {};
  for (const viewer of ['host', 'jon', 'lydia']) {
    const values = samples?.[viewer];
    if (!Array.isArray(values) || values.length === 0 || values.some(value => !Number.isFinite(value) || value < 0)) {
      throw new TypeError('Evidence requires finite observed timing samples for every viewer.');
    }
    timings[viewer] = { ...latencySummary(values), samplesMs: values.map(value => Number(value.toFixed(3))) };
  }
  const sourceAfter = safeSource(captureSource());
  const before = safeSource(sourceBefore || sourceAfter);
  const sourceStable = before.commit === sourceAfter.commit && before.tree === sourceAfter.tree
    && before.worktreeClean && sourceAfter.worktreeClean
    && !before.commitChangedDuringCapture && !sourceAfter.commitChangedDuringCapture;
  const cleanCommitEvidence = sourceStable && before.worktreeClean && sourceAfter.worktreeClean;
  const ci = {
    ...(process.env.GITHUB_SHA?.match(/^[a-f0-9]{40}$/) ? { githubSha: process.env.GITHUB_SHA } : {}),
    ...(process.env.GITHUB_RUN_ID?.match(/^\d+$/) ? { githubRunId: process.env.GITHUB_RUN_ID } : {}),
    ...(process.env.GITHUB_RUN_ATTEMPT?.match(/^\d+$/) ? { githubRunAttempt: Number(process.env.GITHUB_RUN_ATTEMPT) } : {}),
  };
  const artifact = {
    schemaVersion: 1, suite: 'ws6-protocol-latency', scenario: name,
    capturedAt: new Date().toISOString(), gameId, initialChair: chair, policy,
    source: { before, after: sourceAfter, sourceStable, cleanCommitEvidence,
      limitation: cleanCommitEvidence ? null : 'The working tree was dirty or changed. These are local diagnostic timings, not evidence for an immutable release commit.' },
    runtime: { node: process.version, platform: process.platform, architecture: process.arch },
    ci, method: LATENCY_METHOD, viewers: timings,
  };
  const destination = path.resolve(directory);
  await mkdir(destination, { recursive: true });
  const target = path.join(destination, `${name}-latency.json`);
  const temporary = `${target}.tmp-${process.pid}`;
  await writeFile(temporary, JSON.stringify(artifact, null, 2) + '\n', { mode: 0o600 });
  await rename(temporary, target);
  return target;
}
