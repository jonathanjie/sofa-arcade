/** Separate actual macOS processes for the integrated Odd Laws WKWebView gate. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  dataDir, desktopDir, evidenceDir, exists, requireFreshProfile,
  saveEvidence, statusPath, waitPortClosed, waitProcessExit,
} from '../../../desktop/tests/native/helpers.mjs';

const spec = fileURLToPath(new URL('./odd-laws.spec.mjs', import.meta.url));
const fixture = path.join(evidenceDir, 'integration-native-fixture.json');
let profileOwned = false, runner;
const phases = [];

async function stopped() {
  if (!await exists(statusPath)) return;
  const status = JSON.parse(await readFile(statusPath, 'utf8'));
  await waitPortClosed(status.port);
  await waitProcessExit(status.childPid);
  await waitProcessExit(status.parentPid);
}

try {
  await requireFreshProfile();
  profileOwned = true;
  assert.ok(process.env.SOFA_APP_PATH?.endsWith('.app'), 'SOFA_APP_PATH must name the instrumented native-e2e app bundle');
  await mkdir(evidenceDir, { recursive: true });
  for (const phase of ['first', 'relaunch', 'exited']) {
    if (phase === 'exited') {
      // Reproduce a stale native URL deterministically after the previous
      // process proved that Exit cleared the browser's saved session. Only
      // this runner's fresh, stopped disposable profile is modified.
      const saved = JSON.parse(await readFile(fixture, 'utf8'));
      assert.match(saved.code, /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
      const filename = path.join(dataDir, 'config.json');
      const config = JSON.parse(await readFile(filename, 'utf8'));
      assert.equal(config.port, Number(new URL(saved.origin).port));
      await writeFile(filename, JSON.stringify({ ...config, lastPath: `/?room=${saved.code}` }, null, 2) + '\n', { mode: 0o600 });
    }
    const result = await new Promise((resolve, reject) => {
      runner = spawn(process.execPath, [
        path.join(desktopDir, 'node_modules/@wdio/cli/bin/wdio.js'),
        'run', path.join(desktopDir, 'wdio.native.mjs'), '--spec', spec,
      ], {
        cwd: desktopDir,
        env: { ...process.env, SOFA_NATIVE_PHASE: `integration-${phase}`, SOFA_INTEGRATION_NATIVE_PHASE: phase, SOFA_INTEGRATION_NATIVE_FIXTURE: fixture },
        stdio: 'inherit',
      });
      runner.once('error', reject);
      runner.once('exit', (code, signal) => signal ? reject(new Error('Integrated native WebDriver runner was terminated')) : resolve(code));
    });
    runner = undefined;
    await stopped();
    assert.equal(result, 0, `Integrated native ${phase} phase failed; see the actual WKWebView screenshot and CI log`);
    phases.push({ phase, passed: true });
  }
  await saveEvidence('integration-native.json', {
    schemaVersion: 1, kind: 'native-macos-WKWebView', commit: process.env.SOFA_TEST_COMMIT || null,
    passed: true, phases,
    testDriver: 'The existing WS5 embedded WebDriver, gated by native-e2e; this extension does not modify desktop/native sources.',
    limitations: [
      'Controller commands in this native test are authenticated HTTP clients on the same runner. Separate Chromium tests cover rendered phone contexts; physical phones remain a hardware gate.',
      'Native image decoding and local module requests do not establish device speaker output, home Wi-Fi, physical sleep/wake, downloaded-app Gatekeeper behavior or TV casting.',
    ],
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
  await saveEvidence('integration-native.json', { schemaVersion: 1, kind: 'native-macos-WKWebView', commit: process.env.SOFA_TEST_COMMIT || null, passed: false, phases, failure: error.message });
} finally {
  if (runner && runner.exitCode === null && runner.signalCode === null) runner.kill('SIGTERM');
  if (profileOwned) {
    let clean = false;
    try { await stopped(); clean = true; } catch { /* Keep a possibly-owned SQLite profile intact. */ }
    if (clean) await rm(dataDir, { recursive: true, force: true });
  }
}
