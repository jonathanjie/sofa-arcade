import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { SECURE_LAN_FIXTURE_ASSETS } from '../fixtures/assets.mjs';
import { createCertificateStore } from '../../../server/secure-lan/certificates/index.mjs';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const evidence = process.env.GO6_EVIDENCE_DIR ? resolve(process.env.GO6_EVIDENCE_DIR) : fileURLToPath(new URL('../evidence/', import.meta.url));
const temp = await realpath(await mkdtemp(join(tmpdir(), 'sofa-go6-browser-')));
const appDataDir = join(temp, 'app-data'); await mkdir(appDataDir, { mode: 0o700 });
const store = createCertificateStore({ appDataDir });
await store.provision({ identities: ['127.0.0.1', 'localhost'], port: 4178 });
const exports = { pem: await store.exportPublicTrust({ format: 'pem' }), mobileconfig: await store.exportPublicTrust({ format: 'mobileconfig' }) };
const assets = new Map(await Promise.all(SECURE_LAN_FIXTURE_ASSETS.map(async ({ route, file, type }) => [route, { data: await readFile(join(repo, file)), type }])));
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
  if (url.pathname === '/fixture/public-trust' && ['pem', 'mobileconfig'].includes(url.searchParams.get('format'))) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(exports[url.searchParams.get('format')])); return;
  }
  const asset = assets.get(url.pathname);
  if (!asset) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, {
    'Content-Type': asset.type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  });
  res.end(asset.data);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const executablePath = process.env.GO6_CHROMIUM_EXECUTABLE || (existsSync(chromium.executablePath()) ? undefined : existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
} catch (error) {
  server.closeAllConnections(); await new Promise((r) => server.close(r));
  await rm(temp, { recursive: true, force: true });
  throw error;
}
const context = await browser.newContext({ viewport: { width: 1280, height: 1080 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const results = [];
async function check(name, action) { await action(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
async function load(state = 'initial') {
  await page.goto(`${base}/secure-lan/setup?state=${state}`);
  await page.waitForFunction(() => window.__go6Fixture && !document.querySelector('.go6-setup')?.getAttribute('aria-busy')?.includes('true'));
  await page.waitForFunction((s) => document.getElementById('fixture-state').value === s, state);
}

try {
  await mkdir(evidence, { recursive: true });
  await check('setup, status refresh and immediate touch fallback use only injected callbacks', async () => {
    await load();
    assert.equal(await page.locator('.go6-setup').getAttribute('data-state'), 'needs-setup');
    await page.getByRole('button', { name: 'Set up tilt', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.go6-setup').dataset.state === 'ready');
    assert.equal(await page.locator('.go6-phone-state').first().textContent(), 'Not set up yet');
    assert.deepEqual(await page.evaluate(() => window.__go6Fixture.operations), [{ operation: 'provision', result: 'simulated-success' }]);
    await page.getByRole('button', { name: 'Play with touch for now' }).click();
    assert.equal(await page.getByRole('heading', { name: 'Continue with touch' }).count(), 1);
  });
  await check('all required setup states are inspectable and produce safe links', async () => {
    for (const [scenario, expected] of [['initial', 'needs-setup'], ['ready', 'ready'], ['missing-trust', 'ready'], ['permission-denied', 'ready'], ['expired', 'certificate-expired'], ['address-changed', 'address-mismatch'], ['failed', 'failed'], ['disabled', 'disabled']]) {
      await load(scenario); assert.equal(await page.locator('.go6-setup').getAttribute('data-state'), expected);
      assert.equal(await page.getByRole('heading', { name: 'Simulated phone checks' }).count(), 1);
      const hrefs = await page.locator('.go6-origin').evaluateAll((links) => links.map((a) => a.href));
      for (const href of hrefs) { const url = new URL(href); assert.equal(url.protocol, 'https:'); assert.equal(url.username, ''); assert.equal(url.search, ''); assert.equal(url.hash, ''); }
    }
  });
  await check('public PEM and CA-only profile download; no private bytes in download or UI', async () => {
    await load('ready');
    for (const [button, format] of [['Save file for Android', 'pem'], ['Save file for iPhone', 'mobileconfig']]) {
      const pending = page.waitForEvent('download'); await page.getByRole('button', { name: button, exact: true }).click();
      const download = await pending; const contents = await readFile(await download.path(), 'utf8');
      assert.equal(contents, exports[format].contents); assert.ok(!contents.includes('PRIVATE KEY'));
      assert.ok(!contents.includes(temp));
    }
    assert.ok(!(await page.locator('body').textContent()).includes('PRIVATE KEY'));
  });
  await check('callback failures and cancellation show safe retry copy without error contents', async () => {
    await load('failed');
    await page.evaluate(() => {
      window.__go6Fixture.callbacks.provision = async () => { throw new Error('PRIVATE KEY /secret/path host-token'); };
      window.__go6Fixture.mount();
    });
    await page.getByRole('button', { name: 'Retry setup', exact: true }).click();
    assert.ok((await page.locator('.go6-notice').textContent()).includes('did not work'));
    assert.ok(!(await page.locator('body').textContent()).includes('host-token'));
    await page.evaluate(() => {
      window.__go6Fixture.callbacks.provision = async () => { throw { code: 'CANCELLED' }; };
      window.__go6Fixture.mount();
    });
    await page.getByRole('button', { name: 'Retry setup', exact: true }).click();
    assert.ok((await page.locator('.go6-notice').textContent()).startsWith('Cancelled.'));
    await load('failed'); await page.getByRole('button', { name: 'Retry setup', exact: true }).click();
    assert.equal(await page.locator('.go6-setup').getAttribute('data-state'), 'ready');
  });
  await check('unsafe origin and malformed status are rejected before rendering', async () => {
    await load();
    await page.evaluate(() => {
      window.__go6Fixture.callbacks.getStatus = async () => ({ enabled: true, status: 'ready', requiresPhoneTrust: true, controllerOrigins: ['https://user:room-token@example.com/?key=secret'] });
      window.__go6Fixture.mount();
    });
    await page.waitForFunction(() => document.querySelector('.go6-setup').dataset.state === 'failed');
    assert.equal(await page.locator('.go6-origin').count(), 0);
    assert.ok(!(await page.locator('body').textContent()).includes('room-token'));
  });
  await check('out-of-order refresh and late disposed callbacks cannot change the current view', async () => {
    await load('ready');
    await page.evaluate(async () => {
      let resolveOld; let calls = 0; const current = window.__go6Fixture.snapshot();
      window.__go6Fixture.callbacks.getStatus = () => ++calls === 1 ? new Promise((resolve) => { resolveOld = resolve; }) : Promise.resolve(current);
      window.__go6Fixture.mount();
      await window.__go6Fixture.view.refresh();
      resolveOld({ enabled: false, status: 'needs-setup', controllerOrigins: [], requiresPhoneTrust: true });
      await Promise.resolve();
    });
    assert.equal(await page.locator('.go6-setup').getAttribute('data-state'), 'ready');
    await load();
    await page.evaluate(() => {
      window.__go6Fixture.callbacks.provision = () => new Promise((resolve) => { window.__resolveProvision = resolve; });
      window.__go6Fixture.mount();
    });
    await page.getByRole('button', { name: 'Set up tilt', exact: true }).click();
    assert.equal(await page.locator('.go6-setup').getAttribute('aria-busy'), 'true');
    await page.getByRole('button', { name: 'Play with touch for now' }).click();
    await page.evaluate(() => window.__resolveProvision({ enabled: true, status: 'ready', controllerOrigins: ['https://192.168.1.24:4178'], requiresPhoneTrust: true }));
    assert.equal(await page.locator('.go6-setup').count(), 0);
  });
  await check('remove and root replacement require keyboard-accessible local confirmation', async () => {
    await load('ready');
    await page.locator('summary', { hasText: 'What this allows, and how to undo it' }).click();
    await page.getByRole('button', { name: 'Remove the setup from this Mac', exact: true }).click();
    assert.equal(await page.getByRole('dialog').count(), 1);
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Keep current setup');
    await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Remove setup');
    await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').isVisible(), false);
    assert.deepEqual(await page.evaluate(() => window.__go6Fixture.operations), []);
    await page.getByRole('button', { name: 'Start over with a new setup…', exact: true }).click();
    await page.getByRole('button', { name: 'Start over' }).click();
    assert.deepEqual(await page.evaluate(() => window.__go6Fixture.operations), [{ operation: 'replace-root', result: 'simulated-success' }]);
    await page.getByRole('button', { name: 'Remove the setup from this Mac', exact: true }).click();
    await page.getByRole('button', { name: 'Remove setup', exact: true }).click();
    assert.equal(await page.locator('.go6-setup').getAttribute('data-state'), 'needs-setup');
  });
  await check('disabling keeps the certificate; repeated mount/dispose owns only its root', async () => {
    await load('ready');
    await page.locator('summary', { hasText: 'What this allows, and how to undo it' }).click();
    await page.getByRole('button', { name: 'Turn tilt off', exact: true }).click();
    assert.equal(await page.locator('.go6-setup').getAttribute('data-state'), 'disabled');
    assert.ok((await page.locator('[data-testid=fingerprint]').textContent()).length > 60);
    await page.evaluate(() => {
      const first = window.__go6Fixture.view; window.__go6Fixture.mount(); first.dispose(); first.dispose();
    });
    assert.equal(await page.locator('.go6-setup').count(), 1);
    await page.evaluate(() => { window.__go6Fixture.view.dispose(); window.__go6Fixture.view.dispose(); });
    assert.equal(await page.locator('.go6-setup').count(), 0);
  });
  await check('export rejects secret or mixed-purpose payloads without starting a download', async () => {
    await load('ready');
    await page.evaluate(() => {
      window.__go6Fixture.callbacks.exportPublicTrust = async () => ({ filename: 'bad.crt', mediaType: 'application/x-x509-ca-cert', contents: '-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----', certificateFingerprint: window.__go6Fixture.snapshot().certificateFingerprint });
      window.__go6Fixture.mount();
    });
    let downloaded = false; const listener = () => { downloaded = true; }; page.on('download', listener);
    await page.getByRole('button', { name: 'Save file for Android', exact: true }).click();
    assert.ok((await page.locator('.go6-notice').textContent()).includes('could not be saved'));
    assert.equal(downloaded, false); page.off('download', listener);
    assert.ok(!(await page.locator('body').textContent()).includes('PRIVATE KEY'));
  });
  await check('phone diagnostic reports actual page context and rejects synthetic events as sensor proof', async () => {
    await page.goto(`${base}/secure-lan/diagnostic`);
    assert.equal(await page.locator('#https-state').textContent(), 'No');
    assert.equal(await page.locator('#context-state').textContent(), 'Yes'); // localhost exception; not a LAN HTTPS claim.
    await page.getByRole('button', { name: 'Check motion on this phone' }).click();
    await page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: 2, gamma: 5 })));
    assert.equal(await page.locator('#sample-state').textContent(), 'None yet');
    assert.ok((await page.locator('#evidence').textContent()).includes('Synthetic event detected'));
    await page.getByRole('button', { name: 'Stop checking' }).click();
    assert.ok((await page.locator('#probe-status').textContent()).includes('paused'));
  });
  await check('required wide states and 390px narrow layout fit with reduced motion and visible focus', async () => {
    for (const scenario of ['initial', 'ready', 'missing-trust', 'permission-denied', 'expired', 'address-changed', 'failed']) {
      await load(scenario);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false);
      await page.screenshot({ path: join(evidence, `${scenario}-1280.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 844 }); await load('missing-trust');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const touchBounds = await page.getByRole('button', { name: 'Play with touch for now' }).boundingBox();
    assert.ok(touchBounds.y >= 0 && touchBounds.y + touchBounds.height <= 844, 'Touch fallback is visible without scrolling on a 390x844 viewport.');
    assert.equal(await page.locator('.go6-main > .go6-action-card').count(), 1);
    await page.locator('[data-action=provision]').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.action), 'touch');
    assert.notEqual(await page.getByRole('button', { name: 'Play with touch for now' }).evaluate((el) => getComputedStyle(el).outlineStyle), 'none');
    await page.screenshot({ path: join(evidence, 'missing-trust-390.png'), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 1080 });
    await page.waitForFunction(() => document.querySelector('.go6-controls > .go6-action-card'));
    assert.equal(await page.locator('.go6-action-card').count(), 1);
    await page.evaluate(() => window.__go6Fixture.view.dispose());
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator('.go6-setup').count(), 0);
    await page.goto(`${base}/secure-lan/diagnostic`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: join(evidence, 'diagnostic-http-390.png'), fullPage: true });
  });
  assert.deepEqual(errors, []);
  await writeFile(join(evidence, 'browser-results.json'), `${JSON.stringify({ schemaVersion: 1, browser: await browser.version(), viewport: '1280x1080 and 390x844', transport: 'loopback HTTP', certificateErrorsIgnored: false, simulatedHostOperations: true, realPhoneTrustVerified: false, realPhoneSensorsVerified: false, screenshots: ['initial-1280.png', 'ready-1280.png', 'missing-trust-1280.png', 'permission-denied-1280.png', 'expired-1280.png', 'address-changed-1280.png', 'failed-1280.png', 'missing-trust-390.png', 'diagnostic-http-390.png'], checks: results }, null, 2)}\n`);
  console.log(`${results.length} browser checks passed; screenshots in ${evidence}`);
} finally {
  await browser.close();
  server.closeAllConnections(); await new Promise((r) => server.close(r));
  await rm(temp, { recursive: true, force: true });
}
