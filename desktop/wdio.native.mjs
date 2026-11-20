/** Native WKWebView only. The embedded driver exists solely in native-e2e builds. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile } from 'node:fs/promises';
import {
  binaryFor, evidenceDir, runFile, safePath, saveEvidence, statusPath,
  waitPortClosed, waitProcessExit,
} from './tests/native/helpers.mjs';

const desktopDir = fileURLToPath(new URL('./', import.meta.url));
assert.equal(process.platform, 'darwin', 'Native UI acceptance requires a real macOS runner');
assert.ok(process.env.SOFA_APP_PATH?.endsWith('.app'), 'Set SOFA_APP_PATH to the instrumented .app bundle');
const appBinaryPath = binaryFor(path.resolve(process.env.SOFA_APP_PATH));
const nativeControl = path.join(evidenceDir, 'native-control');

export const config = {
  runner: 'local',
  specs: [path.join(desktopDir, 'tests/native/ui.spec.mjs')],
  maxInstances: 1,
  capabilities: [{ browserName: 'tauri', 'tauri:options': { application: appBinaryPath } }],
  services: [['@wdio/tauri-service', {
    appBinaryPath,
    driverProvider: 'embedded',
    embeddedPort: 4445,
    autoInstallTauriDriver: false,
    autoDownloadEdgeDriver: false,
    windowLabel: 'main',
    startTimeout: 60000,
    commandTimeout: 15000,
    captureBackendLogs: false,
    captureFrontendLogs: false,
    logLevel: 'warn',
    env: { PATH: safePath, NODE_OPTIONS: '', NODE_PATH: '' },
  }]],
  logLevel: 'warn',
  outputDir: path.join(desktopDir, '.native-logs'),
  waitforTimeout: 15000,
  connectionRetryTimeout: 30000,
  connectionRetryCount: 1,
  framework: 'mocha',
  mochaOpts: { ui: 'bdd', timeout: 90000 },
  reporters: ['spec'],
  onPrepare: async () => {
    await mkdir(evidenceDir, { recursive: true });
    // Compile before the app launches, never between a test's final storage
    // write and Quit. This is the same native Quit helper as production tests.
    await runFile('/usr/bin/swiftc', [path.join(desktopDir, 'tests/native/mac-control.swift'), '-o', nativeControl], { timeout: 60000 });
  },
  before: async () => { await mkdir(evidenceDir, { recursive: true }); },
  afterTest: async (_test, _context, result) => {
    if (result.error) {
      try { await browser.saveScreenshot(path.join(evidenceDir, `native-ui-${process.env.SOFA_NATIVE_PHASE}-failure.png`)); } catch { /* No fabricated replacement. */ }
    }
  },
  onComplete: async () => {
    // WDIO 9.33.1 awaits this user hook after session deletion and before the
    // service's onComplete. @wdio/tauri-service 1.5.1 otherwise sends SIGTERM,
    // bypassing native Quit and potentially losing the newest WK storage write.
    // Hook failures fail the run; service cleanup remains only failure cleanup.
    const running = JSON.parse(await readFile(statusPath, 'utf8'));
    assert.equal(running.state, 'ready', 'Native UI acceptance did not leave a running owned host');
    for (const key of ['parentPid', 'childPid']) {
      assert.ok(Number.isSafeInteger(running[key]) && running[key] > 1, `Missing owned native ${key}`);
    }
    assert.ok(Number.isInteger(running.port) && running.port > 0 && running.port <= 65535, 'Missing owned LAN port');
    const parent = await runFile('/bin/ps', ['-ww', '-p', String(running.parentPid), '-o', 'ppid=', '-o', 'command='], { timeout: 3000 });
    const identity = parent.stdout.trim().match(/^(\d+)\s+(.+)$/);
    assert.ok(identity, 'Could not verify the native app process identity');
    assert.equal(Number(identity[1]), process.pid, 'Refuse to quit an app not spawned by this WebDriver launcher');
    assert.equal(identity[2], appBinaryPath, 'Refuse to quit a different native executable');
    const child = await runFile('/bin/ps', ['-p', String(running.childPid), '-o', 'ppid='], { timeout: 3000 });
    assert.equal(Number(child.stdout.trim()), running.parentPid, 'Refuse to attribute an unrelated sidecar to this app');

    await runFile(nativeControl, ['quit', String(running.parentPid)], { timeout: 5000 });
    await waitProcessExit(running.parentPid);
    await waitProcessExit(running.childPid);
    await waitPortClosed(running.port);
    const lastStatus = JSON.parse(await readFile(statusPath, 'utf8'));
    assert.equal(lastStatus.parentPid, running.parentPid, 'Native shutdown status belongs to a different process');
    assert.equal(lastStatus.port, running.port, 'Native shutdown changed the saved origin');
    assert.equal(lastStatus.state, 'stopped', 'Native Quit bypassed the owned supervisor shutdown');
    await saveEvidence(`native-quit-${process.env.SOFA_NATIVE_PHASE}.json`, {
      schemaVersion: 1, kind: 'native-macos-graceful-quit', commit: process.env.SOFA_TEST_COMMIT || null,
      passed: true, method: 'NSRunningApplication.terminate', nativeQuitRequested: true,
      parentPid: running.parentPid, childPid: running.childPid, port: running.port,
      parentExited: true, childExited: true, listenerClosed: true,
      lastSupervisorState: lastStatus.state,
    });
  },
};
