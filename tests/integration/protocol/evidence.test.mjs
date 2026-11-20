import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { captureSource, writeLatencyEvidence } from './evidence.mjs';

test('latency artifacts contain only allowlisted source/runtime/timing evidence, never caller room or credential data', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ws6-metric-unit-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = captureSource();
  const token = 'not-a-real-token-do-not-copy-into-evidence';
  // These are metadata writer unit samples, not performance evidence; the temporary file is removed.
  const target = await writeLatencyEvidence({ name: 'metric-unit-test', gameId: 'odd-laws-society',
    chair: 'jon', policy: 'rich', directory,
    sourceBefore: { ...source, token, room: { privateCommitment: 2 } },
    samples: { host: [1, 2, 3], jon: [2, 3, 4], lydia: [3, 4, 5] },
    room: { hostToken: token, privateCommitments: { jon: 'hidden' } },
  });
  const text = await readFile(target, 'utf8');
  const artifact = JSON.parse(text);
  assert.ok(!text.includes(token));
  assert.ok(!text.includes('privateCommitment'));
  assert.ok(!text.includes('hostToken'));
  assert.equal(artifact.source.before.commit, source.commit);
  assert.equal(artifact.source.before.tree, source.tree);
  assert.equal(artifact.runtime.node, process.version);
  assert.equal(artifact.method.network, '127.0.0.1 loopback IPv4');
  assert.equal(artifact.viewers.host.medianMs, 2);
  assert.equal(artifact.viewers.host.p95Ms, 3);
  assert.deepEqual(artifact.viewers.lydia.samplesMs, [3, 4, 5]);
  if (!source.worktreeClean) {
    assert.equal(artifact.source.cleanCommitEvidence, false);
    assert.match(artifact.source.limitation, /not evidence for an immutable release commit/);
  }
});

test('latency evidence is opt-in and rejects unsafe names or non-observed numeric values', async () => {
  assert.equal(await writeLatencyEvidence({ directory: '' }), null);
  await assert.rejects(writeLatencyEvidence({ directory: tmpdir(), name: '../unsafe', gameId: 'sofa-kingdoms' }), /safe evidence name/);
  await assert.rejects(writeLatencyEvidence({ directory: tmpdir(), name: 'invalid-samples', gameId: 'sofa-kingdoms',
    samples: { host: [NaN], jon: [1], lydia: [1] } }), /finite observed timing/);
});
