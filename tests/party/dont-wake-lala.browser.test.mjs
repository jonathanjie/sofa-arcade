import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchPartyHarness } from './harness.mjs';

const output = fileURLToPath(new URL('../../work/dont-wake-lala/', import.meta.url));

function percentiles(values) {
  assert.ok(values.length >= 100, `Only ${values.length} frames collected`);
  const sorted = [...values].sort((a, b) => a - b);
  return { median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * 0.95) - 1] };
}

test('Lala plays on a 1080p TV, two touch phones and fourteen socket phones', { timeout: 90_000 }, async t => {
  const fixture = await launchPartyHarness(t, { gameId: 'dont-wake-lala', manual: false });
  const browser = await chromium.launch({ executablePath: process.env.SOFA_CHROMIUM_EXECUTABLE });
  t.after(() => browser.close());
  await mkdir(output, { recursive: true });
  const issues = [];
  async function page(options, name) {
    const context = await browser.newContext(options);
    await context.addInitScript(() => {
      window.partyCsp = [];
      document.addEventListener('securitypolicyviolation', event => window.partyCsp.push(event.violatedDirective));
      const nativeFrame = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => {
        if (callback.name !== 'drawFrame') return nativeFrame(callback);
        return nativeFrame(at => {
          const start = performance.now();
          callback(at);
          window.lalaRenderTimes?.push(performance.now() - start);
        });
      };
      if (window.DeviceMotionEvent) {
        window.lalaPermissionGranted = false;
        Object.defineProperty(window.DeviceMotionEvent, 'requestPermission', {
          configurable: true, value: async () => window.lalaPermissionGranted ? 'granted' : 'denied',
        });
      }
    });
    const tab = await context.newPage();
    tab.on('console', message => { if (message.type() === 'error') issues.push(`${name}: ${message.text()}`); });
    tab.on('pageerror', error => issues.push(`${name}: ${error.message}`));
    tab.on('response', response => { if (response.status() >= 400) issues.push(`${name}: ${response.status()} ${new URL(response.url()).pathname}`); });
    return tab;
  }

  const tv = await page({ viewport: { width: 1920, height: 1080 } }, 'TV');
  const mobileOptions = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
  const [pepper, juniper] = await Promise.all([page(mobileOptions, 'Pepper'), page(mobileOptions, 'Juniper')]);
  await tv.goto(fixture.origin);
  await tv.getByRole('button', { name: /Don't Wake Lala/ }).click();
  await tv.getByRole('link', { name: 'Host on the TV' }).click();
  await tv.locator('[data-party-qr] svg').waitFor();
  const code = await tv.locator('[data-party-code]').textContent();
  assert.match(code, /^[A-Z0-9]{6}$/);
  const joinUrl = `${fixture.origin}/?party=join&code=${code}`;
  async function join(tab, name, look) {
    await tab.goto(joinUrl);
    await tab.getByLabel('Your name').fill(name);
    await tab.getByRole('radio').nth(look).check();
    await tab.getByRole('button', { name: 'Ready', exact: true }).tap();
    await tab.getByText('Ready for the TV').waitFor();
  }
  await join(pepper, 'Pepper', 0);
  await join(juniper, 'Juniper', 3);
  const bots = await Promise.all(Array.from({ length: 16 }, async (_, look) => {
    if (look === 0 || look === 3) return null;
    const name = ['Pepper', 'Fig', 'Button', 'Juniper', 'Marmalade', 'Scout', 'Peaches', 'Miso',
      'Bluebell', 'Cricket', 'Poppy', 'Nutmeg', 'Dumpling', 'Bramble', 'Pip', 'Pickle'][look];
    const bot = await fixture.connect(await fixture.join(code, look, name));
    bot.send({ type: 'ready', value: true });
    return bot;
  }));
  await tv.getByText('16 of 16 ready').waitFor();
  await tv.screenshot({ path: output + 'lobby.png' });
  await tv.getByRole('button', { name: 'Start', exact: true }).click();
  await tv.locator('.party-countdown').waitFor();
  await tv.screenshot({ path: output + 'countdown.png' });
  const strict = juniper.getByRole('button', { name: 'Strict motion' });
  await strict.tap();
  assert.equal(await strict.getAttribute('aria-pressed'), 'false');
  await juniper.evaluate(() => { window.lalaPermissionGranted = true; });
  await strict.tap();
  assert.equal(await strict.getAttribute('aria-pressed'), 'true');
  await pepper.getByText('Go!', { exact: true }).waitFor();

  const pad = pepper.getByRole('button', { name: 'Hold to tiptoe' });
  const bounds = await pad.boundingBox();
  assert.ok(bounds.width >= 300 && bounds.height >= 500, JSON.stringify(bounds));
  const x = Math.round(bounds.x + bounds.width / 2);
  const y = Math.round(bounds.y + bounds.height / 2);
  const touch = await pepper.context().newCDPSession(pepper);
  let holding = false;
  async function setHold(value) {
    if (holding === value) return;
    holding = value;
    await touch.send('Input.dispatchTouchEvent', {
      type: value ? 'touchStart' : 'touchEnd', touchPoints: value ? [{ x, y }] : [],
    });
  }

  const movement = setInterval(() => {
    for (const [index, bot] of bots.entries()) {
      if (bot?.view.phase !== 'playing') continue;
      const elapsed = 60_000 - bot.view.ms;
      const held = elapsed > 2500 || elapsed > index % 6 * 370;
      bot.input({ kind: 'hold', held });
    }
  }, 100);
  t.after(() => clearInterval(movement));
  await setHold(true);
  await pepper.locator('.lala-hold[data-held=true]').waitFor();
  await tv.waitForFunction(() => document.querySelector('[data-party-canvas]').dataset.cue === 'sleep');
  await pepper.waitForFunction(() => Number.parseFloat(document.querySelector('.lala-progress span').style.width) >= 6);
  await tv.screenshot({ path: output + 'mid-play.png' });
  await pepper.screenshot({ path: output + 'phone.png' });

  await tv.waitForFunction(() => document.querySelector('[data-party-canvas]').dataset.cue === 'look');
  await juniper.evaluate(() => {
    window.dispatchEvent(new DeviceMotionEvent('devicemotion', { acceleration: { x: 3, y: 0, z: 0 } }));
  });
  await pepper.locator('.lala-hold[data-caught=true]').waitFor({ timeout: 1500 });
  assert.ok(await tv.locator('[data-party-canvas][data-cue=look]').isVisible());
  await tv.screenshot({ path: output + 'caught.png' });
  assert.ok(await tv.locator('[data-party-canvas][data-cue=look]').isVisible(), 'capture landed after the look ended');
  await juniper.locator('.lala-hold[data-caught=true]').waitFor({ timeout: 1500 });
  await setHold(false);
  await strict.tap();
  assert.equal(await strict.getAttribute('aria-pressed'), 'false');

  const measures = tv.evaluate(() => new Promise(resolve => {
    const cadence = [];
    window.lalaRenderTimes = [];
    let previous;
    function sample(at) {
      if (previous !== undefined) cadence.push(at - previous);
      previous = at;
      if (cadence.length < 360) requestAnimationFrame(sample);
      else {
        resolve({ cadence, render: window.lalaRenderTimes });
        window.lalaRenderTimes = null;
      }
    }
    requestAnimationFrame(sample);
  }));
  await tv.exposeFunction('driveLala', cue => setHold(cue === 'sleep' || cue === 'ear'));
  await tv.evaluate(() => {
    const canvas = document.querySelector('[data-party-canvas]');
    const follow = () => window.driveLala(canvas.dataset.cue);
    window.lalaCueObserver = new MutationObserver(follow);
    window.lalaCueObserver.observe(canvas, { attributeFilter: ['data-cue'] });
    void follow();
  });
  try {
    const podium = tv.getByRole('heading', { name: 'Podium' });
    const stalled = tv.getByText('The host paused. Start the round again when ready.');
    await podium.or(stalled).waitFor({ timeout: 70_000 });
    assert.equal(await stalled.isVisible(), false, 'the host clock stalled during the live run');
  } finally {
    await tv.evaluate(() => window.lalaCueObserver.disconnect());
    clearInterval(movement);
  }
  await tv.screenshot({ path: output + 'podium.png' });
  assert.equal(await tv.locator('.party-podium article strong').first().textContent(), 'Pepper');
  assert.equal(await tv.locator('.party-podium article small').first().textContent(), '150 pts');
  await pepper.getByText('Place #1', { exact: true }).waitFor();

  // The OS setting skips the push-in but leaves the cue and catch labels live.
  await tv.emulateMedia({ reducedMotion: 'reduce' });
  await tv.getByRole('button', { name: 'Next round', exact: true }).click();
  await tv.locator('.party-countdown').waitFor({ state: 'hidden' });
  await tv.waitForFunction(() => document.querySelector('[data-party-canvas]').dataset.cue === 'look');
  await tv.screenshot({ path: output + 'reduced-motion.png' });
  for (const tab of [tv, pepper, juniper]) {
    assert.deepEqual(await tab.evaluate(() => window.partyCsp), []);
    assert.equal(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await tab.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), true);
  }
  assert.deepEqual(issues, []);
  const measured = await measures;
  const metrics = { frames: measured.render.length, renderMs: percentiles(measured.render), cadenceMs: percentiles(measured.cadence) };
  await writeFile(output + 'frame-times.json', JSON.stringify(metrics, null, 2) + '\n');
  assert.ok(metrics.renderMs.p95 < 16.7, JSON.stringify(metrics));
  t.diagnostic(JSON.stringify(metrics));
});
