import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { startHarness } from './server.mjs';

const output = resolve(process.env.GO1_BROWSER_EVIDENCE || '/tmp/gravity-orchard-browser-evidence');
await mkdir(output, { recursive: true });
const server = await startHarness();
const browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}), headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
const shots = [];
const screenshot = async name => { const path = resolve(output, `${name}.png`); await page.screenshot({ path, fullPage: true }); shots.push(path); };
const advance = ticks => page.evaluate(n => window.orchardLab.advance(n), ticks);
try {
  await page.goto(server.url);
  await page.waitForFunction(() => Boolean(window.orchardLab));
  await page.evaluate(() => window.orchardLab.setRunning(false));
  assert.deepEqual(errors, []);
  const layout = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, canvas: (() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })() }));
  assert.ok(layout.scrollWidth <= 1280 && layout.scrollHeight <= 720, JSON.stringify(layout));
  await screenshot('waiting-1280x720');

  // Genuine keyboard control, not an automatic test-only fruit fixture.
  await page.keyboard.press('r');
  let view = await advance(180);
  assert.equal(view.phase, 'playing');
  assert.equal(view.fruits[0].type, 'plum');
  await page.keyboard.down('a'); await page.keyboard.down('s');
  view = await advance(75);
  await page.keyboard.up('a'); await page.keyboard.up('s');
  assert.ok(view.events.some(event => event.kind === 'catch' && event.data.fruitType === 'plum'), 'WASD delivery must pass through authoritative basket capture.');
  await screenshot('keyboard-catch-1280x720');

  view = await advance(135);
  const beforeMove = view.fruits.find(fruit => fruit.type === 'apple');
  assert.ok(beforeMove, 'Second scheduled fruit should exist.');
  await page.keyboard.down('ArrowLeft');
  view = await advance(30);
  await page.keyboard.up('ArrowLeft');
  const beforeBrake = view.fruits.find(fruit => fruit.id === beforeMove.id);
  assert.ok(beforeBrake.x < beforeMove.x - 10, 'Lydia arrow keys must move fruit on her tray.');
  await page.keyboard.down('Shift');
  view = await advance(20);
  await page.keyboard.up('Shift');
  const afterBrake = view.fruits.find(fruit => fruit.id === beforeMove.id);
  assert.ok(Math.hypot(afterBrake.vx, afterBrake.vy) < Math.hypot(beforeBrake.vx, beforeBrake.vy) * .1, 'Held Shift must strongly damp motion.');
  assert.equal(view.players.lydia.input.brake, true);

  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const paused = await page.evaluate(() => window.orchardLab.getView());
  view = await advance(300);
  assert.equal(view.phase, 'paused'); assert.equal(view.tick, paused.tick); assert.equal(view.timeRemainingTicks, paused.timeRemainingTicks);
  await page.keyboard.press('r');
  view = await advance(179);
  assert.equal(view.phase, 'countdown'); assert.equal(view.timeRemainingTicks, paused.timeRemainingTicks);
  view = await advance(1);
  assert.equal(view.phase, 'playing'); assert.equal(view.timeRemainingTicks, paused.timeRemainingTicks);
  await page.getByRole('button', { name: 'Keys / help' }).click();
  assert.equal((await page.evaluate(() => window.orchardLab.getView())).pauseReason, 'help');
  await page.getByRole('button', { name: 'Back to the orchard' }).click();

  // A full rendered campaign uses the same pilot and normalized input seam as
  // the Node route proof. advance accelerates wall time, never the physics dt.
  await page.evaluate(() => { window.orchardLab.newRun('orchard-proof-1', 'campaign'); window.orchardLab.setAuto(true); });
  view = await advance(500);
  assert.equal(view.stageIndex, 0);
  await screenshot('morning-delivery-1280x720');
  for (let calls = 0; view.stageIndex === 0 && calls < 200; calls++) view = await advance(30);
  assert.equal(view.stageIndex, 1, 'Morning Delivery must advance within a bounded run.');
  for (let calls = 0; view.phase !== 'playing' && calls < 200; calls++) view = await advance(1);
  assert.equal(view.phase, 'playing');
  view = await advance(410);
  await screenshot('switchback-grove-1280x720');
  for (let calls = 0; view.stageIndex === 1 && calls < 200; calls++) view = await advance(30);
  assert.equal(view.stageIndex, 2, 'Switchback Grove must advance within a bounded run.');
  for (let calls = 0; view.phase !== 'playing' && calls < 200; calls++) view = await advance(1);
  assert.equal(view.phase, 'playing');
  view = await advance(1180);
  assert.equal(view.gust?.phase, 'forecast');
  await screenshot('moonlight-forecast-1280x720');
  await page.setViewportSize({ width: 1920, height: 1080 });
  const largeLayout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight }));
  assert.ok(largeLayout.scrollWidth <= 1920 && largeLayout.scrollHeight <= 1080);
  await screenshot('moonlight-forecast-1920x1080');
  view = await advance(180);
  assert.equal(view.gust?.phase, 'active');
  await screenshot('moonlight-gust-1920x1080');
  for (let calls = 0; view.phase !== 'finished' && calls < 50; calls++) view = await advance(120);
  assert.equal(view.phase, 'finished', 'Campaign must finish within a bounded fixed-step run.');
  assert.equal(view.results.reduce((sum, result) => sum + result.ordersCompleted, 0), 12);
  assert.equal(view.results.reduce((sum, result) => sum + result.stars, 0), 9);
  assert.equal(view.results.reduce((sum, result) => sum + result.composted, 0), 0);
  await screenshot('perfect-picnic-1920x1080');
  const stats = await page.evaluate(() => window.orchardLab.getStats());
  assert.ok(stats.eventHistory.some(event => event.kind === 'transfer' && event.playerId === 'jon'));
  assert.ok(stats.eventHistory.some(event => event.kind === 'transfer' && event.playerId === 'lydia'));
  assert.ok(stats.eventHistory.some(event => event.kind === 'gate-forecast'));
  assert.ok(stats.eventHistory.some(event => event.kind === 'gust-start'));
  assert.deepEqual(errors, []);

  // Completed-stage retry is a host command and a fresh waiting boundary.
  await page.getByRole('button', { name: 'Retry stage' }).click();
  const retry = await page.evaluate(() => window.orchardLab.getView());
  assert.equal(retry.phase, 'waiting'); assert.equal(retry.stageIndex, 2); assert.equal(retry.results.length, 2);
  assert.ok(retry.runEpoch > view.runEpoch);
  await page.evaluate(() => { window.orchardLab.setAuto(false); window.orchardLab.newRun('orchard-proof-1', 'practice'); });
  await page.keyboard.press('r');
  const practice = await advance(6000);
  assert.equal(practice.mode, 'practice'); assert.equal(practice.phase, 'playing'); assert.equal(practice.timeRemainingTicks, null); assert.equal(practice.gust, null);
  assert.equal(await page.locator('#mode').inputValue(), 'practice', 'Diagnostic mode selector must describe the live run.');
  await screenshot('untimed-practice-1920x1080');
  assert.deepEqual(errors, []);

  // The diagnostic listener cannot serve arbitrary repo files or test fixtures.
  for (const path of ['/AGENTS.md', '/fixtures/private.json', '/validation/run-routes.mjs', '/harness/package-lock.json']) {
    const response = await fetch(new URL(path, server.url)); assert.equal(response.status, 404, path);
  }
  const report = { schemaVersion: 1, browser: await browser.version(), node: process.version, layout, largeLayout, errors, screenshots: shots.map(path => path.split('/').at(-1)), assertions: ['Manual WASD basket capture', 'Lydia arrow steering and held Brake', 'Pause and 180-tick resume conserve active time', 'Help pauses the real run', 'Three stages and both bridge directions through real controls', 'Gate and gust forecasts rendered', 'Perfect Picnic result', 'Host retry enters fresh waiting boundary', 'Untimed practice stays active beyond90s', 'Loopback listener serves only explicit diagnostic modules'], results: view.results, maxWork: stats.maxWork, limitations: ['Screenshots need human/assistant visual inspection in addition to these assertions.', 'Accelerated fixed-tick browser run is not a real-phone, Wi-Fi, latency or human-balance measurement.'] };
  await writeFile(resolve(output, 'browser-summary.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, browser: report.browser, screenshots: report.screenshots.length, assertions: report.assertions.length, results: report.results }, null, 2));
} catch (error) {
  await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }).catch(() => {});
  console.error('Page errors:', errors);
  throw error;
} finally {
  await browser.close(); await server.close();
}
