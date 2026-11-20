/** Native WKWebView only. The embedded driver exists solely in native-e2e builds. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { binaryFor, evidenceDir, safePath } from './tests/native/helpers.mjs';

const desktopDir = fileURLToPath(new URL('./', import.meta.url));
assert.equal(process.platform, 'darwin', 'Native UI acceptance requires a real macOS runner');
assert.ok(process.env.SOFA_APP_PATH?.endsWith('.app'), 'Set SOFA_APP_PATH to the instrumented .app bundle');
const appBinaryPath = binaryFor(path.resolve(process.env.SOFA_APP_PATH));

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
  before: async () => { await mkdir(evidenceDir, { recursive: true }); },
  afterTest: async (_test, _context, result) => {
    if (result.error) {
      try { await browser.saveScreenshot(path.join(evidenceDir, `native-ui-${process.env.SOFA_NATIVE_PHASE}-failure.png`)); } catch { /* No fabricated replacement. */ }
    }
  },
};
