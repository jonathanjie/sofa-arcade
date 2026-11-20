import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createFixtureServer } from '../fixture/server.mjs';

const evidenceDirectory = resolve(process.env.GO2_EVIDENCE_DIR
  ?? fileURLToPath(new URL('../evidence/browser/', import.meta.url)));

async function browserTools() {
  try { return await import(process.env.SOFA_PLAYWRIGHT_MODULE ?? 'playwright'); }
  catch {
    throw new Error('GO2 browser checks require the pinned nested Playwright dependency. Run npm ci --prefix server/realtime/gravity-orchard and npx --prefix server/realtime/gravity-orchard playwright install chromium, or set SOFA_PLAYWRIGHT_MODULE.');
  }
}

const waitConnected = (page) => page.waitForFunction(() => document.getElementById('connection-state')?.dataset.state === 'connected', null, { timeout: 15_000 });
const waitPhase = (page, phase, timeout = 12_000) => page.waitForFunction((expected) => document.getElementById('phase')?.dataset.phase === expected, phase, { timeout });
const position = (page, seat) => page.locator(`#${seat}-marker`).evaluate((element) => ({ x: Number(element.dataset.x), y: Number(element.dataset.y) }));
const metrics = (page) => page.evaluate(() => window.__go2FixtureMetrics());

test('three isolated browsers exercise real sockets, applied input, interruption, readiness, and measured diagnostics', { timeout: 150_000 }, async (t) => {
  const { chromium } = await browserTools();
  const fixture = await createFixtureServer();
  let browser;
  t.after(async () => { await browser?.close(); await fixture.close(); });
  browser = await chromium.launch({ headless: true, ...(process.env.SOFA_CHROMIUM_PATH ? { executablePath: process.env.SOFA_CHROMIUM_PATH } : {}) });
  await mkdir(evidenceDirectory, { recursive: true });
  const errors = [];
  const screenshotFiles = [];
  const contexts = [];
  const pages = {};
  const viewport = { host: { width: 1280, height: 720 }, jon: { width: 360, height: 800 }, lydia: { width: 390, height: 844 } };
  const capture = async (page, filename) => {
    await page.screenshot({ path: join(evidenceDirectory, filename), fullPage: false, animations: 'disabled' });
    screenshotFiles.push(filename);
  };
  for (const role of ['host', 'jon', 'lydia']) {
    const context = await browser.newContext({ viewport: viewport[role], reducedMotion: 'reduce' });
    contexts.push(context);
    const page = await context.newPage();
    pages[role] = page;
    page.on('pageerror', (error) => errors.push({ role, message: error.message }));
    await page.goto(`${fixture.origin}/?viewer=${role}`, { waitUntil: 'networkidle' });
    await waitConnected(page);
  }
  const { host, jon, lydia } = pages;
  const startTogether = async () => {
    // Wait for current neutral heartbeat and the relevant durable boundary view.
    await Promise.all([waitConnected(jon), waitConnected(lydia)]);
    await Promise.all([jon.locator('#ready-button').waitFor({ state: 'visible' }), lydia.locator('#ready-button').waitFor({ state: 'visible' })]);
    await jon.locator('#ready-button').click();
    await host.waitForFunction(() => document.getElementById('jon-ready').dataset.ready === 'true', null, { timeout: 5000 });
    await lydia.locator('#ready-button').click();
    await waitPhase(host, 'countdown');
    await waitPhase(host, 'playing');
    await Promise.all([waitPhase(jon, 'playing'), waitPhase(lydia, 'playing')]);
  };

  try {
    assert.equal(contexts.length, 3, 'host and the two player pages have isolated browser storage');
    await host.waitForFunction(() => ['jon', 'lydia'].every((seat) => document.getElementById(`presence-${seat}`).dataset.connected === 'true'));
    for (const page of Object.values(pages)) {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal overflow');
      assert.equal(await page.evaluate(() => document.querySelector('a[href*="token"], [data-token]') === null), true, 'no credential navigation or DOM field');
    }
    assert.equal(await host.locator('.orchard-panel').evaluate((element) => element.getBoundingClientRect().bottom <= innerHeight), true, 'the complete TV board and both presence strips fit 720p');
    for (const page of [jon, lydia]) {
      for (const id of ['brake-button', 'ready-button', 'phone-pause']) {
        const bounds = await page.locator(`#${id}`).boundingBox();
        assert.ok(bounds.height >= 48 && bounds.width >= 48, `${id} retains a usable touch target`);
      }
    }
    await startTogether();
    const initial = { jon: await position(host, 'jon'), lydia: await position(host, 'lydia') };
    await jon.locator('#joystick').focus();
    await jon.keyboard.down('ArrowRight');
    await host.waitForFunction((x) => Number(document.getElementById('jon-marker').dataset.x) > x + 30, initial.jon.x);
    assert.deepEqual(await position(host, 'lydia'), initial.lydia, 'Jon’s authenticated input moves only Jon’s marker');
    await lydia.locator('#joystick').focus();
    await lydia.keyboard.down('ArrowUp');
    await host.waitForFunction((y) => Number(document.getElementById('lydia-marker').dataset.y) < y - 30, initial.lydia.y);
    await capture(host, 'healthy-tv-1280x720.png');
    await capture(jon, 'controller-jon-360x800.png');
    await capture(lydia, 'controller-lydia-390x844.png');
    await Promise.all([jon.keyboard.up('ArrowRight'), lydia.keyboard.up('ArrowUp')]);
    await host.waitForFunction(() => ['jon', 'lydia'].every((seat) => document.getElementById(`${seat}-brake`).dataset.brake === 'true'));
    const healthyMetrics = { host: await metrics(host), jon: await metrics(jon), lydia: await metrics(lydia) };
    assert.ok(healthyMetrics.jon.stats.inputsSent > 5);
    assert.ok(Number.isFinite(healthyMetrics.jon.stats.ackRttEwmaMs), 'applied acknowledgment produces a measured client RTT');
    assert.ok(Number.isFinite(healthyMetrics.lydia.stats.ackRttEwmaMs));
    assert.ok(healthyMetrics.host.stats.snapshotsReceived > 5);

    await host.locator('#host-pause').click();
    await Promise.all([waitPhase(host, 'paused'), waitPhase(jon, 'paused'), waitPhase(lydia, 'paused')]);
    const pause = await metrics(host);
    assert.equal(pause.pauseReason, 'requested');
    await capture(host, 'requested-pause-tv-1280x720.png');
    await startTogether();
    assert.ok((await metrics(host)).runEpoch > pause.runEpoch, 'resume uses a new run epoch');

    await jon.locator('#drop-socket').click();
    await host.waitForFunction(() => document.getElementById('presence-jon').dataset.connected === 'false');
    await waitPhase(host, 'paused', 6000);
    assert.equal((await metrics(host)).pauseReason, 'network');
    await capture(host, 'interrupted-tv-1280x720.png');
    await capture(jon, 'interrupted-controller-360x800.png');
    await jon.locator('#restore-socket').click();
    await waitConnected(jon);
    await Promise.all([waitPhase(jon, 'paused'), waitPhase(lydia, 'paused')]);
    const recoveryPosition = await position(host, 'jon');
    await jon.locator('#ready-button').click();
    await host.waitForFunction(() => document.getElementById('jon-ready').dataset.ready === 'true');
    assert.equal((await metrics(host)).phase, 'paused', 'reconnect and one ready player cannot resume alone');
    assert.deepEqual(await position(host, 'jon'), recoveryPosition, 'pre-interruption steering is not replayed');
    await lydia.locator('#ready-button').click();
    await Promise.all([waitPhase(host, 'playing'), waitPhase(jon, 'playing'), waitPhase(lydia, 'playing')]);

    await jon.locator('#stale-input').click();
    await host.waitForFunction(() => document.getElementById('presence-jon').dataset.fresh === 'false');
    const staleReasons = fixture.diagnostics().transport?.stats?.rejectedInputReasons ?? fixture.diagnostics().transport?.rejectedInputReasons;
    assert.ok((staleReasons?.stale_tick ?? 0) > 0, 'stale observed ticks reach and are rejected by the real coordinator');
    await host.waitForFunction(() => document.getElementById('presence-jon').dataset.fresh === 'true', null, { timeout: 5000 });
    assert.equal((await metrics(host)).phase, 'playing', 'a one-second fault safely expires input without the two-second shared pause');

    await host.locator('#slow-delivery').click();
    await host.waitForFunction(() => window.__go2FixtureMetrics().faults.coalescedSnapshots >= 5);
    const delayed = await metrics(host);
    assert.ok(delayed.faults.coalescedSnapshots > 0, 'delayed browser delivery coalesces into one newest snapshot');
    await host.locator('#slow-delivery').click();

    await host.locator('#host-stall').click();
    await waitPhase(host, 'paused');
    assert.equal((await metrics(host)).pauseReason, 'host-stall');
    await capture(host, 'host-stall-tv-1280x720.png');
    await host.setViewportSize({ width: 1920, height: 1080 });
    assert.equal(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await host.locator('.orchard-panel').evaluate((element) => element.getBoundingClientRect().bottom <= innerHeight), true, 'the complete TV board fits 1080p');
    await capture(host, 'host-stall-tv-1920x1080.png');

    const beforeRematch = await metrics(host);
    await host.locator('#rematch').click();
    await waitPhase(host, 'waiting');
    assert.notEqual((await metrics(host)).matchId, beforeRematch.matchId, 'host rematch allocates a fresh identity');
    assert.equal((await metrics(host)).stats.invalidMessages, 0);
    assert.equal((await metrics(jon)).stats.invalidMessages, 0);
    assert.equal((await metrics(lydia)).stats.invalidMessages, 0);
    assert.deepEqual(errors, [], 'the three browser contexts have no unhandled page errors');

    let revision = 'unavailable';
    try { revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fileURLToPath(new URL('../../../../', import.meta.url)), encoding: 'utf8' }).trim(); } catch {}
    const report = {
      schemaVersion: 1, title: 'Gravity Orchard GO2 transport fixture', testedCheckout: revision,
      node: process.version, platform: process.platform, browser: browser.version(),
      environment: 'Three isolated rendered Chromium contexts over actual loopback WebSockets; deterministic mock simulation.',
      limitations: ['Not orchard physics or scoring.', 'Not phone sensors, iOS Safari or Android Chrome.', 'Not home Wi-Fi or screen-casting latency.', 'Not a packaged Mac or secure-LAN certificate test.'],
      healthy: healthyMetrics, delayedDelivery: delayed, final: { host: await metrics(host), jon: await metrics(jon), lydia: await metrics(lydia) },
      coordinator: fixture.diagnostics(), screenshots: screenshotFiles,
      assertions: ['Two authenticated seats move separate markers', 'Recipient applied-input ACK RTT', 'Explicit pause and both-ready countdown', 'Socket loss, deadman and network pause', 'Reconnect clears steering and requires both ready', 'Stale observed-tick rejection', 'One pending delayed snapshot', 'Host-stall pause', 'Fresh match identity on rematch', '360/390 phone targets and 720p/1080p board widths', 'Reduced motion', 'No credential URLs, traces or logs'],
    };
    const encoded = JSON.stringify(report, null, 2) + '\n';
    assert.ok(!/"(?:token|bearer|controllerEpoch)"/.test(encoded), 'evidence contains no credentials or private controller epochs');
    await writeFile(join(evidenceDirectory, 'browser-evidence.json'), encoded);
    t.diagnostic(`GO2 browser fixture passed; ${screenshotFiles.length} screenshots and browser-evidence.json in ${evidenceDirectory}`);
  } catch (error) {
    if (!host.isClosed()) await host.screenshot({ path: join(evidenceDirectory, 'failure-tv.png'), fullPage: true }).catch(() => {});
    throw error;
  }
});
