/** GO7's real WKWebView gate, including three distinct owned app processes. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataDir, desktopDir, evidenceDir, exists, requireFreshProfile, saveEvidence, statusPath, waitPortClosed, waitProcessExit } from '../../../desktop/tests/native/helpers.mjs';

const spec = fileURLToPath(new URL('./orchard.spec.mjs', import.meta.url));
const fixture = path.join(evidenceDir, 'go7-native-fixture.json');
let owned = false, runner;
const phases = [];
async function stopped() {
  if (!await exists(statusPath)) return;
  const state = JSON.parse(await readFile(statusPath, 'utf8'));
  await waitPortClosed(state.port); await waitProcessExit(state.childPid); await waitProcessExit(state.parentPid);
  for (const origin of state.secureControllerStatus?.controllerOrigins || []) await waitPortClosed(Number(new URL(origin).port));
}
try {
  await requireFreshProfile(); owned = true;
  assert.ok(process.env.SOFA_APP_PATH?.endsWith('.app'), 'Native acceptance requires the actual instrumented app bundle');
  await mkdir(evidenceDir, { recursive: true });
  for (const phase of ['first', 'relaunch', 'exited']) {
    if (phase === 'exited') {
      const saved = JSON.parse(await readFile(fixture, 'utf8'));
      const filename = path.join(dataDir, 'config.json');
      const config = JSON.parse(await readFile(filename, 'utf8'));
      assert.equal(config.port, Number(new URL(saved.origin).port));
      // Keep the old regression deterministic: native URL lag must not undo the
      // shared shell's explicit exit, even for a paused realtime checkpoint.
      await writeFile(filename, JSON.stringify({ ...config, lastPath: `/?room=${saved.code}` }) + '\n', { mode: 0o600 });
    }
    const result = await new Promise((resolve, reject) => {
      runner = spawn(process.execPath, [path.join(desktopDir, 'node_modules/@wdio/cli/bin/wdio.js'), 'run', path.join(desktopDir, 'wdio.native.mjs'), '--spec', spec], {
        cwd: desktopDir,
        env: { ...process.env, SOFA_NATIVE_PHASE: `go7-${phase}`, SOFA_GO7_NATIVE_PHASE: phase, SOFA_GO7_NATIVE_FIXTURE: fixture },
        stdio: 'inherit',
      });
      runner.once('error', reject);
      runner.once('exit', (code, signal) => signal ? reject(new Error('GO7 native runner was terminated')) : resolve(code));
    });
    runner = undefined;
    await stopped();
    assert.equal(result, 0, `GO7 ${phase} WKWebView acceptance failed; inspect the actual screenshot and logs`);
    phases.push({ phase, passed: true });
  }
  await saveEvidence('go7-native.json', { schemaVersion: 1, kind: 'native-macos-WKWebView', commit: process.env.SOFA_TEST_COMMIT || null, passed: true, phases,
    limitations: ['Authenticated controller clients in this native suite run on the same Mac CI runner. The separate browser suite renders both phones.', 'No physical sensor, mobile trust, home Wi-Fi, physical audio, casting or WAN-disconnected cold-start claim.'],
  });
} catch (error) {
  console.error(error.message); process.exitCode = 1;
  await saveEvidence('go7-native.json', { schemaVersion: 1, kind: 'native-macos-WKWebView', commit: process.env.SOFA_TEST_COMMIT || null, passed: false, phases, failure: error.message });
} finally {
  if (runner && runner.exitCode === null && runner.signalCode === null) runner.kill('SIGTERM');
  if (owned) {
    let clean = false; try { await stopped(); clean = true; } catch { /* Preserve a potentially owned data directory. */ }
    if (clean) await rm(dataDir, { recursive: true, force: true });
  }
}
