/** Actual rendered controls, with explicitly synthetic sensor/public-view fixtures. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { startFixture } from '../fixture/server.mjs';
import {
  select, input, status, waitInput, safe, chooseTouch, beginPlay, enableTilt,
  bounds, mouseSteer, touchController, assertLayout, checkRecordedInput,
} from './browser-helpers.mjs';

const componentRoot = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(process.env.GO3_EVIDENCE_DIR || join(componentRoot, 'test-results'));
await mkdir(output, { recursive: true });
const playwright = process.env.PLAYWRIGHT_MODULE
  ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
  : await import('playwright');
const fixture = await startFixture();
const browser = await playwright.chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
});
const summary = {
  evidenceKind: 'Chromium DOM/pointer/keyboard tests with injected synthetic motion and host snapshots',
  physicalDevices: { iOSSafari: 'unverified', androidChrome: 'unverified', certificateTrust: 'unverified' },
  noNetworkLatencyMeasurement: true,
  testedSHA: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: componentRoot, encoding: 'utf8' }).trim(),
  worktreeDirty: Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: componentRoot, encoding: 'utf8' }).trim()),
  browser: browser.version(),
  node: process.version,
  runtimeHashes: {},
  cases: [],
};
for (const name of ['index.mjs', 'motion.mjs', 'tuning.mjs', 'icons.mjs', 'phone.css']) {
  summary.runtimeHashes[name] = createHash('sha256').update(await readFile(join(componentRoot, name))).digest('hex');
}
const filter = process.argv.find(arg => arg.startsWith('--case='))?.slice('--case='.length);
const recordedControls = [];
let currentPage = null;
let currentContext = null;
let caseErrors = [];
let currentResult = null;

async function open({ width = 390, height = 844, scenario = 'permission', player = 'jon', reducedMotion = 'no-preference', angle = 0, mode = 'controller' } = {}) {
  if (currentPage) await closePage();
  currentContext = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    reducedMotion, locale: 'en-SG',
  });
  await currentContext.tracing.start({ screenshots: true, snapshots: true, sources: true });
  currentPage = await currentContext.newPage();
  currentPage.on('pageerror', error => caseErrors.push(error.message));
  currentPage.on('console', message => { if (message.type() === 'error') caseErrors.push(message.text()); });
  currentPage.on('request', request => {
    if (!request.url().startsWith(fixture.url) && !request.url().startsWith('data:')) caseErrors.push(`Unexpected external request: ${request.url()}`);
  });
  const search = new URLSearchParams({ scenario, player, angle: String(angle), mode });
  await currentPage.goto(`${fixture.url}?${search}`, { waitUntil: 'networkidle' });
  await currentPage.waitForFunction(() => window.go3Fixture && document.querySelector('[data-go3="phone"]'));
  await currentPage.locator(select('phone')).waitFor({ state: 'visible' });
  return currentPage;
}
async function closePage() {
  if (!currentPage) return;
  try {
    const records = await checkRecordedInput(currentPage);
    recordedControls.push({ case: currentResult.name, ...records });
  } catch (error) {
    caseErrors.push(error.message);
  }
  await currentContext.tracing.stop({ path: join(output, `${currentResult.name}-${currentResult.contexts++}.zip`) });
  await currentContext.close();
  currentPage = null;
  currentContext = null;
}
async function screenshot(page, name, { fullPage = true } = {}) {
  const filename = `${name}.png`;
  await page.screenshot({ path: join(output, filename), fullPage, animations: 'disabled' });
  currentResult.screenshots.push(filename);
}
async function assertPause(page, reason) {
  await safe(page);
  const commands = await page.evaluate(() => window.go3Fixture.commands);
  assert.ok(commands.some(command => command.kind === 'pause' && (!reason || command.payload.reason === reason)), `shared pause attempt${reason ? ` (${reason})` : ''} was emitted`);
  assert.equal(await page.evaluate(() => window.go3Fixture.view.phase), 'paused');
}

const cases = [
  ['touch-jon-360', async () => {
    const page = await open({ width: 360, height: 800, scenario: 'insecure' });
    assert.equal((await status(page)).state, 'insecure');
    await screenshot(page, '360-insecure-setup');
    await assertLayout(page);
    await chooseTouch(page);
    await safe(page);
    assert.equal(await page.evaluate(() => window.go3Fixture.permissionCalls.length), 0);
    const waiting = await page.evaluate(() => window.go3Fixture.view);
    await page.locator(select('ready')).click();
    await page.waitForFunction(() => window.go3Fixture.view.ready.jon === true);
    assert.equal(await page.evaluate(() => window.go3Fixture.view.phase), 'waiting', 'one player cannot start the fixture countdown');
    await screenshot(page, '360-touch-ready');
    await page.evaluate(() => window.go3Fixture.peerReady());
    await page.waitForFunction(() => window.go3Fixture.view.phase === 'countdown');
    await screenshot(page, '360-countdown');
    await safe(page);
    await page.evaluate(() => window.go3Fixture.setPhase('playing'));
    await page.waitForFunction(() => document.querySelector('[data-go3="phone"]').dataset.controlling === 'true');
    await assertLayout(page, { active: true });
    const beforeInput = await page.evaluate(() => window.go3Fixture.view);
    await mouseSteer(page, .65, .55);
    await waitInput(page, () => window.go3Fixture.lastInput.x > .4 && window.go3Fixture.lastInput.y > .3 && !window.go3Fixture.lastInput.brake);
    await screenshot(page, '360-touch-playing');
    assert.deepEqual(await page.evaluate(() => window.go3Fixture.view), beforeInput, 'steering does not mutate any public score, timer or position');
    await page.mouse.up();
    assert.deepEqual(await input(page), { x: 0, y: 0, brake: false });
    const joystick = page.locator(select('joystick'));
    await joystick.focus();
    await page.keyboard.down('ArrowLeft');
    await page.keyboard.down('ArrowUp');
    await waitInput(page, () => window.go3Fixture.lastInput.x < -.6 && window.go3Fixture.lastInput.y < -.6);
    await page.keyboard.down('Space');
    assert.equal((await input(page)).brake, true);
    await page.keyboard.up('Space');
    assert.equal((await input(page)).brake, false);
    await page.keyboard.up('ArrowLeft');
    await page.keyboard.up('ArrowUp');
    assert.deepEqual(await input(page), { x: 0, y: 0, brake: false });
    assert.equal(await page.evaluate(() => window.go3Fixture.view.timeRemainingTicks), waiting.timeRemainingTicks);
  }],
  ['touch-lydia-390-multitouch', async () => {
    const page = await open({ width: 390, height: 844, scenario: 'insecure', player: 'lydia' });
    await chooseTouch(page);
    await beginPlay(page);
    await assertLayout(page, { active: true });
    const pad = await bounds(page, 'joystick');
    const brake = await bounds(page, 'brake');
    const touch = await touchController(page);
    await touch.down(1, pad.x + pad.width / 2, pad.y + pad.height / 2);
    await touch.move(1, pad.x + pad.width * .7, pad.y + pad.height * .65);
    await waitInput(page, () => window.go3Fixture.lastInput.x > .4 && window.go3Fixture.lastInput.y > .2 && !window.go3Fixture.lastInput.brake);
    await touch.down(2, brake.x + brake.width / 2, brake.y + brake.height / 2);
    await waitInput(page, () => window.go3Fixture.lastInput.x > .4 && window.go3Fixture.lastInput.brake);
    assert.equal(await page.locator(select('brake')).getAttribute('aria-pressed'), 'true');
    await touch.move(1, pad.x + pad.width * .3, pad.y + pad.height * .3);
    await waitInput(page, () => window.go3Fixture.lastInput.x < -.4 && window.go3Fixture.lastInput.y < -.4 && window.go3Fixture.lastInput.brake);
    await screenshot(page, '390-touch-brake-combination');
    await touch.up(2);
    assert.equal((await touch.events()).filter(event => event.type === 'pointerup').at(-1)?.control, 'brake', 'the browser released the Brake finger, not the steering finger');
    await waitInput(page, () => window.go3Fixture.lastInput.x < -.4 && !window.go3Fixture.lastInput.brake);
    await touch.up(1);
    assert.equal((await touch.events()).filter(event => event.type === 'pointerup').at(-1)?.control, 'joystick', 'the browser released the steering finger independently');
    assert.deepEqual(await input(page), { x: 0, y: 0, brake: false });
    currentResult.pointerEvents = await touch.events();
    await touch.close();
  }],
  ['pointer-cancel-and-epoch-fence', async () => {
    const page = await open({ scenario: 'insecure' });
    await chooseTouch(page);
    await beginPlay(page);
    const pad = await bounds(page, 'joystick');
    const touch = await touchController(page);
    await touch.down(1, pad.x + pad.width * .7, pad.y + pad.height * .7);
    await waitInput(page, () => window.go3Fixture.lastInput.x > .4 && window.go3Fixture.lastInput.y > .4);
    await touch.cancel();
    await assertPause(page, 'requested');
    await screenshot(page, '390-pointer-cancel-paused');
    await beginPlay(page);
    const pad2 = await bounds(page, 'joystick');
    await touch.down(1, pad2.x + pad2.width * .7, pad2.y + pad2.height * .5);
    await waitInput(page, () => window.go3Fixture.lastInput.x > .4);
    await page.evaluate(() => {
      const f = window.go3Fixture;
      f.setPhase('paused', { runEpoch: f.view.runEpoch + 1 });
    });
    await safe(page);
    await touch.move(1, pad2.x + pad2.width * .8, pad2.y + pad2.height * .8);
    await touch.up(1);
    await safe(page);
    await beginPlay(page);
    assert.deepEqual(await input(page), { x: 0, y: 0, brake: false }, 'old held pointer is not restored after countdown');
    await touch.close();
  }],
  ['help-focus-and-no-auto-resume', async () => {
    const page = await open({ scenario: 'insecure' });
    await chooseTouch(page);
    await beginPlay(page);
    await page.locator(select('help')).click();
    await assertPause(page, 'help');
    assert.equal(await page.locator(select('close-help')).evaluate(element => document.activeElement === element), true);
    await assertLayout(page);
    await screenshot(page, '390-help-paused');
    const readyCount = await page.evaluate(() => window.go3Fixture.commands.filter(command => command.kind === 'ready' && command.payload.value).length);
    for (let index = 0; index < 8; index++) {
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => Boolean(document.activeElement.closest('[data-go3="help-dialog"]'))), true, 'dialog traps keyboard focus');
    }
    await page.locator(select('close-help')).click();
    assert.equal(await page.locator(select('help')).evaluate(element => document.activeElement === element), true, 'closing Help restores the trigger focus');
    await safe(page);
    assert.equal(await page.evaluate(() => window.go3Fixture.view.phase), 'paused');
    assert.equal(await page.evaluate(() => window.go3Fixture.commands.filter(command => command.kind === 'ready' && command.payload.value).length), readyCount, 'closing Help does not send ready');
    await page.evaluate(() => window.go3Fixture.peerReady());
    assert.equal(await page.evaluate(() => window.go3Fixture.view.phase), 'paused');
    await beginPlay(page);
    await page.locator(select('recenter')).click();
    await assertPause(page, 'recenter');
    await safe(page);
  }],
  ['permission-and-fallback-states', async () => {
    for (const scenario of ['insecure', 'unsupported', 'denied', 'rejected', 'no-samples']) {
      const page = await open({ scenario });
      if (['denied', 'rejected', 'no-samples'].includes(scenario)) {
        await page.locator(select('enable-tilt')).click();
        await page.waitForFunction(() => window.go3Fixture.permissionCalls.length === 1);
        if (scenario === 'no-samples') {
          await page.waitForFunction(() => window.go3Fixture.lastStatus?.state === 'calibrating');
          await page.evaluate(() => window.go3Fixture.sensor({ beta: null, gamma: null }));
          await page.evaluate(() => window.go3Fixture.advance(4000));
        }
      }
      const expected = scenario === 'rejected' ? 'denied' : scenario;
      await page.waitForFunction(value => window.go3Fixture.lastStatus?.state === value, expected);
      await safe(page);
      assert.ok(await page.locator(select('sensor-status')).innerText(), `${scenario} has readable recovery text`);
      await screenshot(page, `390-setup-${scenario}`);
      await assertLayout(page);
      const calls = await page.evaluate(() => window.go3Fixture.permissionCalls);
      assert.ok(calls.every(call => call.userActivation), 'permission call happened while the browser had user activation');
      await chooseTouch(page);
      await beginPlay(page);
      await mouseSteer(page, -.65, .65);
      await waitInput(page, () => window.go3Fixture.lastInput.x < -.4 && window.go3Fixture.lastInput.y > .4, `${scenario} supports complete touch steering`);
      await page.mouse.up();
      assert.equal(await page.evaluate(() => window.go3Fixture.permissionCalls.length), calls.length, 'touch fallback does not reprompt');
    }
  }],
  ['tilt-calibration-stationary-recenter', async () => {
    const page = await open({ width: 390, height: 844 });
    await page.locator(select('enable-tilt')).click();
    await page.waitForFunction(() => window.go3Fixture.lastStatus?.state === 'calibrating');
    await page.evaluate(() => window.go3Fixture.sensor({ beta: null, gamma: 0 }));
    await page.evaluate(() => window.go3Fixture.advance(250));
    assert.equal((await status(page)).calibrated, false);
    await safe(page);
    await screenshot(page, '390-tilt-calibrating');
    await page.evaluate(() => window.go3Fixture.stableSamples({ beta: 35, gamma: -4, noise: .5 }));
    await page.waitForFunction(() => window.go3Fixture.lastStatus?.calibrated === true);
    await safe(page);
    await beginPlay(page);
    await page.evaluate(() => window.go3Fixture.stableSamples({ beta: 35, gamma: 14, count: 10 }));
    await waitInput(page, () => window.go3Fixture.lastInput.x > .45 && Math.abs(window.go3Fixture.lastInput.y) < .05 && !window.go3Fixture.lastInput.brake);
    assert.equal(await page.locator(select('vector-label')).innerText(), 'Right');
    assert.ok(Number(await page.locator(select('joystick')).evaluate(el => el.style.getPropertyValue('--go3-x'))) > .45);
    await page.evaluate(() => window.go3Fixture.advance(1500));
    const held = await input(page);
    const viewBefore = await page.evaluate(() => window.go3Fixture.view);
    await page.evaluate(() => window.go3Fixture.advance(60000));
    assert.deepEqual(await input(page), held, '60s stationary sample silence retains its held vector');
    assert.equal((await status(page)).calibrated, true);
    assert.equal(await page.locator(select('phone')).getAttribute('data-connection'), 'connected');
    assert.deepEqual(await page.evaluate(() => window.go3Fixture.view), viewBefore, 'the phone cannot advance host time');
    await assertLayout(page, { active: true });
    await screenshot(page, '390-tilt-playing');
    const brake = await bounds(page, 'brake');
    await page.mouse.move(brake.x + brake.width / 2, brake.y + brake.height / 2);
    await page.mouse.down();
    assert.equal((await input(page)).brake, true);
    await page.mouse.up();
    assert.equal((await input(page)).brake, false);
    assert.ok((await input(page)).x > .45);
    await page.locator(select('recenter')).click();
    await assertPause(page, 'recenter');
    await page.evaluate(() => window.go3Fixture.stableSamples({ beta: 52, gamma: -12, noise: .3 }));
    await page.waitForFunction(() => window.go3Fixture.lastStatus?.calibrated === true);
    await safe(page);
    await screenshot(page, '390-recenter-ready');
    await beginPlay(page);
    await page.evaluate(() => window.go3Fixture.sensor({ beta: 52, gamma: -12 }));
    const centered = await input(page);
    assert.ok(Math.abs(centered.x) < .001 && Math.abs(centered.y) < .001, 'new comfortable center has no force spike');
    assert.equal(await page.evaluate(() => window.go3Fixture.permissionCalls.length), 1);
  }],
  ['all-screen-orientations', async () => {
    const page = await open();
    await enableTilt(page, { beta: 0, gamma: 0, noise: 0 });
    await beginPlay(page);
    const expected = [
      { angle: 0, axis: 'x', sign: 1 },
      { angle: 90, axis: 'y', sign: -1 },
      { angle: 180, axis: 'x', sign: -1 },
      { angle: 270, axis: 'y', sign: 1 },
    ];
    for (const { angle, axis, sign } of expected) {
      if (angle) {
        await page.evaluate(value => window.go3Fixture.rotate(value), angle);
        await assertPause(page, 'recenter');
        assert.equal((await status(page)).calibrated, false);
        await screenshot(page, `390-rotated-${angle}`);
        await page.locator(select('calibrate')).click();
        await page.evaluate(() => window.go3Fixture.stableSamples({ beta: 0, gamma: 0, noise: 0 }));
        await page.waitForFunction(() => window.go3Fixture.lastStatus?.calibrated === true);
        await beginPlay(page);
      }
      await page.evaluate(() => window.go3Fixture.stableSamples({ beta: 0, gamma: 25, count: 12 }));
      const value = await input(page);
      assert.ok(value[axis] * sign > .9, `${angle}° maps +gamma onto ${sign > 0 ? '+' : '-'}${axis}: ${JSON.stringify(value)}`);
      assert.ok(Math.abs(value[axis === 'x' ? 'y' : 'x']) < .01);
    }
    assert.equal(await page.evaluate(() => window.go3Fixture.permissionCalls.length), 1, 'rotation does not trigger a second permission prompt');
  }],
  ['hidden-resume-disposal', async () => {
    const page = await open({ scenario: 'insecure' });
    await chooseTouch(page);
    await beginPlay(page);
    await mouseSteer(page, .7, 0);
    await waitInput(page, () => window.go3Fixture.lastInput.x > .5);
    await page.evaluate(() => window.go3Fixture.setHidden(true));
    await assertPause(page, 'requested');
    await page.mouse.up();
    await page.evaluate(() => window.go3Fixture.setHidden(false));
    await safe(page);
    assert.equal(await page.evaluate(() => window.go3Fixture.view.phase), 'paused');
    await screenshot(page, '390-returned-paused');
    await beginPlay(page);
    assert.deepEqual(await input(page), { x: 0, y: 0, brake: false });
    await page.evaluate(() => window.go3Fixture.blur());
    await assertPause(page, 'requested');
    await page.evaluate(() => window.go3Fixture.focus());
    await safe(page);
    await beginPlay(page);
    await page.evaluate(() => window.go3Fixture.dispose());
    await safe(page);
    const stats = await page.evaluate(() => window.go3Fixture.stats());
    assert.equal(stats.listenerCount, 0, 'all injected sensor/lifecycle listeners are removed');
    assert.equal(stats.timerCount, 0, 'all injected sensor timers are cancelled');
    assert.equal(await page.locator(select('phone')).count(), 0, 'mount removes its DOM');
    await page.evaluate(() => {
      const f = window.go3Fixture;
      f.sensor({ beta: 70, gamma: 25 });
      f.setHidden(true); f.setHidden(false); f.rotate(90); f.advance(100000);
      f.setPhase('playing'); f.setConnection('connected');
    });
    const after = await page.evaluate(() => window.go3Fixture.stats());
    assert.equal(after.inputs, stats.inputs, 'late events and callbacks cannot emit after disposal');
    assert.equal(after.commands, stats.commands, 'late events cannot dispatch commands after disposal');
  }],
  ['authoritative-phases-and-connection', async () => {
    const page = await open({ player: 'lydia', scenario: 'insecure' });
    await chooseTouch(page);
    for (const state of ['connecting', 'reconnecting', 'offline', 'error']) {
      await page.evaluate(value => window.go3Fixture.setConnection({ state: value, message: 'Fixture connection state' }), state);
      await safe(page);
      assert.equal(await page.locator(select('ready')).isDisabled(), true);
      assert.ok((await page.locator(select('connection')).innerText()).trim(), `${state} is communicated with text`);
      await screenshot(page, `390-connection-${state}`);
    }
    await page.evaluate(() => window.go3Fixture.setConnection('connected'));
    await beginPlay(page);
    await page.evaluate(() => window.go3Fixture.setConnection('reconnecting'));
    await assertPause(page);
    await page.evaluate(() => window.go3Fixture.setConnection('connected'));
    await safe(page);
    await beginPlay(page);
    for (const phase of ['paused', 'interlude', 'finished']) {
      await page.evaluate(value => window.go3Fixture.setPhase(value), phase);
      await safe(page);
      await assertLayout(page);
      await screenshot(page, `390-phase-${phase}`);
    }
    assert.match(await page.locator(select('results-summary')).innerText(), /12.*9/);
    await page.locator(select('help')).click();
    await page.locator(select('exit')).click();
    assert.equal(await page.evaluate(() => window.go3Fixture.exited), true);
  }],
  ['narrow-and-landscape-reduced-motion', async () => {
    for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 800, height: 360 }, { width: 844, height: 390 }]) {
      const page = await open({ ...viewport, scenario: 'insecure', reducedMotion: 'reduce' });
      await chooseTouch(page);
      await beginPlay(page);
      const layout = await assertLayout(page, { active: true });
      currentResult.layouts.push(layout);
      assert.equal(await page.locator(select('phone')).getAttribute('data-reduced-motion'), 'true');
      const motions = await page.locator(select('phone')).evaluate(element => [...element.querySelectorAll('*')].map(child => ({ animation: getComputedStyle(child).animationName, transition: getComputedStyle(child).transitionDuration })));
      assert.ok(motions.every(value => value.animation === 'none' && value.transition.split(',').every(duration => parseFloat(duration) === 0)), 'reduced motion suppresses decorative animation/transition');
      await screenshot(page, `${viewport.width}x${viewport.height}-reduced-touch`);
      await page.locator(select('help')).click();
      await assertLayout(page);
      await screenshot(page, `${viewport.width}x${viewport.height}-help`);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator(select('help-dialog')).isVisible(), false);
      await safe(page);
    }
  }],
  ['unready-boundary-and-command-failure', async () => {
    const page = await open({ scenario: 'insecure' });
    await chooseTouch(page);
    await page.evaluate(() => window.go3Fixture.setPhase('playing'));
    await safe(page);
    assert.equal(await page.locator(select('phone')).getAttribute('data-controlling'), 'false', 'unexpected playing snapshot cannot arm a player who has not readied');
    await page.evaluate(() => window.go3Fixture.setPhase('paused'));
    await page.evaluate(() => window.go3Fixture.failCommands('offline'));
    await page.locator(select('ready')).click();
    await page.waitForFunction(() => document.querySelector('[data-go3="error"]').hidden === false);
    await safe(page);
    assert.equal(await page.evaluate(() => window.go3Fixture.view.ready.jon), false);
    await screenshot(page, '390-command-failed');
    await page.evaluate(() => window.go3Fixture.failCommands(null));
    await beginPlay(page);
    await page.evaluate(() => window.go3Fixture.failCommands('offline'));
    await page.locator(select('pause')).click();
    await safe(page);
    assert.equal(await page.evaluate(() => window.go3Fixture.view.phase), 'playing', 'a failed pause does not invent host state');
    await page.evaluate(() => window.go3Fixture.patchView({ tick: 99 }));
    await safe(page);
    assert.equal(await page.locator(select('phone')).getAttribute('data-controlling'), 'false', 'repeat active snapshots cannot override a local safety hold');
    await page.evaluate(() => window.go3Fixture.failCommands(null));
    await page.locator(select('pause')).click();
    await assertPause(page, 'requested');
  }],
  ['countdown-help-race-and-ready-withdrawal', async () => {
    const page = await open({ scenario: 'insecure' });
    await chooseTouch(page);
    await page.locator(select('ready')).click();
    await page.waitForFunction(() => window.go3Fixture.view.ready.jon === true);
    await page.locator(select('help')).click();
    await page.waitForFunction(() => window.go3Fixture.view.ready.jon === false);
    assert.ok(await page.evaluate(() => window.go3Fixture.commands.some(command => command.kind === 'ready' && !command.payload.value)), 'Help withdraws existing readiness');
    await page.evaluate(() => window.go3Fixture.peerReady());
    assert.equal(await page.evaluate(() => window.go3Fixture.view.phase), 'waiting');
    await page.locator(select('close-help')).click();
    await safe(page);
    await page.locator(select('ready')).click();
    await page.waitForFunction(() => window.go3Fixture.view.phase === 'countdown');
    const countdownEpoch = await page.evaluate(() => window.go3Fixture.view.runEpoch);
    await page.evaluate(() => window.go3Fixture.failCommands('offline'));
    await page.locator(select('help')).click();
    await page.waitForFunction(() => document.querySelector('[data-go3="error"]').hidden === false);
    await page.locator(select('close-help')).click();
    await page.evaluate(() => window.go3Fixture.setPhase('playing'));
    assert.equal(await page.evaluate(() => window.go3Fixture.view.runEpoch), countdownEpoch, 'countdown completion keeps the same run epoch');
    await safe(page);
    assert.equal(await page.locator(select('phone')).getAttribute('data-controlling'), 'false', 'delayed countdown completion cannot release the Help hold');
    await screenshot(page, '390-help-countdown-race');
    await page.evaluate(() => window.go3Fixture.failCommands(null));
    await page.locator(select('pause')).click();
    await assertPause(page, 'requested');
    await beginPlay(page);
    assert.deepEqual(await input(page), { x: 0, y: 0, brake: false }, 'deliberate both-ready countdown can arm controls again');
  }],
  ['granted-no-prompt-and-invalid-late-reading', async () => {
    const page = await open({ scenario: 'granted' });
    await enableTilt(page, { beta: 42, gamma: 3 });
    assert.equal(await page.evaluate(() => window.go3Fixture.permissionCalls.length), 0, 'browsers without requestPermission require no invented permission API');
    await beginPlay(page);
    await page.evaluate(() => window.go3Fixture.stableSamples({ beta: 55, gamma: 25 }));
    await waitInput(page, () => window.go3Fixture.lastInput.x > .3 && window.go3Fixture.lastInput.y > .3);
    await page.evaluate(() => window.go3Fixture.sensor({ beta: null, gamma: null }));
    await assertPause(page, 'requested');
    await safe(page);
    await screenshot(page, '390-invalid-reading-paused');
    await chooseTouch(page);
    await beginPlay(page);
    await mouseSteer(page, .6, -.6);
    await waitInput(page, () => window.go3Fixture.lastInput.x > .3 && window.go3Fixture.lastInput.y < -.3);
    await page.mouse.up();
  }],
  ['diagnostic-fixture', async () => {
    const page = await open({ width: 1100, height: 960, mode: 'diagnostics', scenario: 'permission' });
    await enableTilt(page);
    await beginPlay(page);
    await page.evaluate(() => window.go3Fixture.stableSamples({ beta: 45, gamma: 14 }));
    await screenshot(page, 'diagnostic-fixture');
    assert.match(await page.locator('#input-output').innerText(), /x .*y .*Brake/);
    const denied = await page.request.get(`${fixture.url}package.json`);
    assert.equal(denied.status(), 404, 'fixture server excludes dependency metadata');
    const privateSource = await page.request.get(`${fixture.url}../../server/rooms.mjs`);
    assert.equal(privateSource.status(), 404, 'fixture server cannot expose server/private source');
  }],
];

try {
  for (const [name, run] of cases) {
    if (filter && !name.includes(filter)) continue;
    currentResult = { name, passed: false, screenshots: [], layouts: [], contexts: 0 };
    caseErrors = [];
    try {
      await run();
      await closePage();
      assert.deepEqual(caseErrors, [], 'no browser errors, invalid records, or external network requests');
      currentResult.passed = true;
      process.stdout.write(`PASS ${name}\n`);
    } catch (error) {
      currentResult.error = error.stack || String(error);
      if (currentPage) {
        try { await screenshot(currentPage, `${name}-failure`); } catch { /* Preserve the primary failure. */ }
        try { currentResult.body = (await currentPage.locator('body').innerText()).slice(0, 12000); } catch { /* Browser may have closed. */ }
      }
      try { await closePage(); } catch (closeError) { caseErrors.push(closeError.message); }
      currentResult.browserErrors = [...caseErrors];
      process.stdout.write(`FAIL ${name}: ${error.message}\n`);
    }
    summary.cases.push(currentResult);
    await writeFile(join(output, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  }
} finally {
  await browser.close();
  await fixture.close();
  await writeFile(join(output, 'normalized-controls.json'), `${JSON.stringify(recordedControls, null, 2)}\n`);
}
const passed = summary.cases.filter(result => result.passed).length;
process.stdout.write(`GO3 browser fixture: ${passed}/${summary.cases.length} passed. Evidence: ${output}\n`);
if (passed !== summary.cases.length || !summary.cases.length) process.exitCode = 1;
