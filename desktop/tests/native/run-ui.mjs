/** Runs two distinct native processes so persisted host credentials are really tested. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  dataDir, desktopDir, evidenceDir, exists, requireFreshProfile,
  saveEvidence, statusPath, waitPortClosed, waitProcessExit,
} from './helpers.mjs';

let profileOwned = false;
let clean = false;
let runner;
const phases = [];
const fixture = path.join(evidenceDir, 'native-ui-fixture.json');
try {
  await requireFreshProfile(); profileOwned = true;
  assert.ok(process.env.SOFA_APP_PATH?.endsWith('.app'), 'Set SOFA_APP_PATH to the native-e2e app bundle');
  await mkdir(evidenceDir, { recursive: true });
  for (const phase of ['first', 'relaunch']) {
    const code = await new Promise((resolve, reject) => {
      runner = spawn(process.execPath, [path.join(desktopDir, 'node_modules/@wdio/cli/bin/wdio.js'),
        'run', path.join(desktopDir, 'wdio.native.mjs')], {
        cwd: desktopDir,
        env: { ...process.env, SOFA_NATIVE_PHASE: phase, SOFA_NATIVE_FIXTURE: fixture },
        stdio: 'inherit',
      });
      runner.once('error', reject);
      runner.once('exit', (exitCode, signal) => signal ? reject(new Error('Native WebDriver runner was terminated')) : resolve(exitCode));
    });
    runner = undefined;
    if (await exists(statusPath)) {
      const status = JSON.parse(await readFile(statusPath, 'utf8'));
      await waitPortClosed(status.port);
      await waitProcessExit(status.childPid);
      await waitProcessExit(status.parentPid);
    }
    assert.equal(code, 0, `Native ${phase} UI phase failed; see actual screenshot and CI log`);
    phases.push({ phase, passed: true });
  }
  clean = true;
  await saveEvidence('native-ui.json', { schemaVersion: 1, kind: 'native-macos-WKWebView',
    commit: process.env.SOFA_TEST_COMMIT || null, passed: true, phases,
    testDriver: 'tauri-plugin-wdio-webdriver, Cargo feature native-e2e, excluded from production bundle',
    limitations: ['Phone seats are HTTP/SSE clients on the runner; physical phone and Wi-Fi checks remain.', 'Native screenshot and relaunch checks do not test device audio or TV casting.'],
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
  await saveEvidence('native-ui.json', { schemaVersion: 1, passed: false, phases, failure: error.message });
} finally {
  if (runner && runner.exitCode === null && runner.signalCode === null) runner.kill('SIGTERM');
  if (profileOwned) {
    try {
      if (await exists(statusPath)) {
        const status = JSON.parse(await readFile(statusPath, 'utf8'));
        await waitPortClosed(status.port);
        await waitProcessExit(status.childPid);
        await waitProcessExit(status.parentPid);
      }
      clean = true;
    } catch { clean = false; }
    // Preserve a profile if the native host may still own its SQLite database.
    if (clean) await rm(dataDir, { recursive: true, force: true });
  }
}
