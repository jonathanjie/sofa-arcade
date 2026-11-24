import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchPartyHarness } from './harness.mjs';

const output = fileURLToPath(new URL('../../work/party-p1/review/', import.meta.url));

test('TV and three phone browsers play Tap Race with thirteen socket controllers', { timeout: 35_000 }, async t => {
  const fixture = await launchPartyHarness(t, { gameId: 'tap-race', manual: false });
  const browser = await chromium.launch({ executablePath: process.env.SOFA_CHROMIUM_EXECUTABLE });
  t.after(() => browser.close());
  await mkdir(output, { recursive: true });
  const issues = [];
  async function page(options, name) {
    const context = await browser.newContext(options);
    await context.addInitScript(() => {
      window.partyCsp = [];
      window.partyWakeLocks = { requested: 0, released: 0 };
      Object.defineProperty(navigator, 'wakeLock', { value: {
        async request(type) {
          if (type !== 'screen') throw new Error('Expected a screen wake lock');
          window.partyWakeLocks.requested++;
          const lock = new EventTarget();
          lock.released = false;
          lock.release = async () => {
            lock.released = true;
            window.partyWakeLocks.released++;
            lock.dispatchEvent(new Event('release'));
          };
          return lock;
        },
      } });
      const animationFrame = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => {
        if (callback.name !== 'drawFrame') return animationFrame(callback);
        return animationFrame(at => {
          const start = performance.now();
          callback(at);
          window.partyRenderTimes?.push(performance.now() - start);
        });
      };
      document.addEventListener('securitypolicyviolation', event => window.partyCsp.push(event.violatedDirective));
    });
    const tab = await context.newPage();
    tab.on('console', message => { if (message.type() === 'error') issues.push(`${name}: ${message.text()}`); });
    tab.on('pageerror', error => issues.push(`${name}: ${error.message}`));
    tab.on('response', response => { if (response.status() === 404) issues.push(`${name}: 404 ${new URL(response.url()).pathname}`); });
    return tab;
  }

  const tv = await page({ viewport: { width: 1920, height: 1080 } }, 'TV');
  await tv.goto(fixture.origin);
  await tv.getByRole('heading', { name: 'Party', exact: true }).waitFor({ timeout: 4000 });
  await tv.getByRole('button', { name: /Tap Race/ }).click();
  await tv.getByRole('link', { name: 'Host on the TV' }).click();
  await tv.getByRole('button', { name: 'Start', exact: true }).waitFor();
  const code = await tv.locator('[data-party-code]').textContent();
  assert.match(code, /^[A-Z0-9]{6}$/);
  await tv.locator('[data-party-qr] svg').waitFor({ state: 'visible' });
  const qrLink = new URL(await tv.getByRole('link', { name: 'Open phone link' }).getAttribute('href'));
  assert.equal(qrLink.search, `?party=join&code=${code}`);

  const names = ['Pepper', 'Pip', 'Juniper'];
  const phones = await Promise.all(names.map(name => page({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  }, name)));
  const joinStartedAt = performance.now();
  await phones[0].goto(`${fixture.origin}${qrLink.pathname}${qrLink.search}`);
  await phones[1].goto(`${fixture.origin}/?party=join`);
  await phones[1].getByLabel('Room code').fill(code);
  await phones[1].getByRole('button', { name: 'Find party' }).click();
  await phones[2].goto(`${fixture.origin}/?party=join&code=${code}`);
  await phones[0].getByLabel('Your name').waitFor();
  await phones[0].screenshot({ path: output + 'phone-join.png' });
  await Promise.all(phones.map(async (phone, look) => {
    await phone.getByLabel('Your name').fill(names[look]);
    await phone.getByRole('radio').nth(look).check();
    await phone.getByRole('button', { name: 'Ready', exact: true }).tap();
    await phone.getByText('Ready for the TV').waitFor();
  }));
  const joinMs = Math.round(performance.now() - joinStartedAt);
  assert.ok(joinMs < 10_000, `browser join took ${joinMs} ms`);
  const simulated = await Promise.all(Array.from({ length: 13 }, async (_, index) => {
    const phone = await fixture.connect(await fixture.join(code, index + 3));
    phone.send({ type: 'ready', value: true });
    return phone;
  }));
  await tv.getByText('16 of 16 ready').waitFor();
  await tv.screenshot({ path: output + 'lobby-16.png' });
  await tv.locator('[data-party-wall]').evaluate(wall => { wall.style.filter = 'grayscale(1)'; });
  await tv.screenshot({ path: output + 'lobby-16-grayscale.png' });
  await tv.locator('[data-party-wall]').evaluate(wall => { wall.style.filter = ''; });
  await tv.getByRole('button', { name: 'Start', exact: true }).click();
  await tv.locator('.party-countdown').waitFor({ state: 'visible' });
  await tv.screenshot({ path: output + 'countdown.png' });
  await phones[0].getByText('Go!', { exact: true }).waitFor();
  await tv.locator('.party-countdown').waitFor({ state: 'hidden' });
  const playControls = await phones[0].getByRole('button', { name: 'Tap!', exact: true }).evaluate(button => ({
    width: button.getBoundingClientRect().width,
    height: button.getBoundingClientRect().height,
    touchAction: getComputedStyle(button).touchAction,
    overscroll: getComputedStyle(document.documentElement).overscrollBehavior,
  }));
  assert.ok(playControls.width >= 44 && playControls.height >= 44);
  assert.equal(playControls.touchAction, 'none');
  assert.equal(playControls.overscroll, 'none');
  await phones[0].waitForFunction(() => window.partyWakeLocks.requested === 1);

  // Sample display cadence alongside running canvas render cost. Use rAF,
  // which is also the TV kit's entry point, and time the actual renderer.
  const frames = tv.evaluate(() => new Promise(resolve => {
    const elapsed = [];
    window.partyRenderTimes = [];
    let prior;
    function frame(at) {
      if (prior !== undefined) elapsed.push(at - prior);
      prior = at;
      if (elapsed.length < 120) requestAnimationFrame(frame);
      else {
        resolve({ elapsed, render: window.partyRenderTimes });
        window.partyRenderTimes = null;
      }
    }
    requestAnimationFrame(frame);
  }));

  let beat = 0;
  const movement = setInterval(() => {
    for (const [index, phone] of simulated.entries()) {
      if (phone.view.phase === 'playing' && beat % (1 + index % 4) === 0) phone.input({ kind: 'tap' });
    }
    beat++;
  }, 100);
  try {
    await Promise.all(phones.map(async phone => {
      for (let tap = 0; tap < 7; tap++) await phone.getByRole('button', { name: 'Tap!', exact: true }).tap();
    }));
    await frames;
    await tv.screenshot({ path: output + 'race-16.png' });
    await phones[0].screenshot({ path: output + 'phone-playing.png' });
  } finally {
    clearInterval(movement);
  }
  const first = phones[0].getByRole('button', { name: 'Tap!', exact: true });
  await phones[0].getByText('7 / 40', { exact: true }).waitFor();
  for (let sent = 7; sent < 40;) {
    const next = Math.min(40, sent + 4);
    for (; sent < next; sent++) await first.tap();
    if (next < 40) await phones[0].getByText(`${next} / 40`, { exact: true }).waitFor();
  }
  await tv.locator('.party-stage[data-phase="results"]').waitFor({ state: 'visible' });
  await tv.evaluate(() => new Promise(resolve => {
    let frames = 0;
    function wait() {
      if (++frames === 8) resolve();
      else requestAnimationFrame(wait);
    }
    requestAnimationFrame(wait);
  }));
  await tv.screenshot({ path: output + 'finish.png' });
  await tv.getByRole('heading', { name: 'Podium' }).waitFor();
  await tv.screenshot({ path: output + 'podium.png' });
  await phones[0].getByText(/Place|Round complete/).waitFor();
  await phones[0].waitForFunction(() => window.partyWakeLocks.released === 1);
  for (const tab of [tv, ...phones]) {
    assert.deepEqual(await tab.evaluate(() => window.partyCsp), []);
    assert.equal(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await tab.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), true);
  }
  await tv.getByRole('button', { name: 'Players', exact: true }).click();
  await tv.getByRole('button', { name: 'Remove Juniper' }).click();
  await phones[2].getByText('Your seat has closed.').waitFor();
  await tv.getByRole('button', { name: 'End party' }).click();
  await tv.getByText('This party has closed.').waitFor();
  await phones[0].getByText('Your seat has closed.').waitFor();
  assert.deepEqual(issues, []);
  const measured = await frames;
  function percentiles(values) {
    assert.ok(values.length >= 100, `collected ${values.length} frames`);
    const sorted = [...values].sort((a, b) => a - b);
    return { median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * 0.95) - 1] };
  }
  const result = { frameMs: percentiles(measured.elapsed), renderMs: percentiles(measured.render), frames: measured.elapsed.length, joinMs };
  await writeFile(output + 'frame-times.json', JSON.stringify(result, null, 2) + '\n');
  t.diagnostic(JSON.stringify(result));
  assert.ok(result.renderMs.p95 < 16.7, 'TV draw exceeded the 16.7 ms frame budget');
});

test('the phone kit keeps touch available until a permitted tilt sample arrives', { timeout: 8000 }, async t => {
  const fixture = await launchPartyHarness(t, { gameId: 'tap-race', manual: false });
  const browser = await chromium.launch({ executablePath: process.env.SOFA_CHROMIUM_EXECUTABLE });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.goto(fixture.origin + '/?party=join');
  await page.getByLabel('Room code').waitFor();
  await page.evaluate(async () => {
    const { mountTilt } = await import('/party/phone/controls.mjs');
    window.samples = [];
    window.permission = 'denied';
    DeviceOrientationEvent.requestPermission = async () => window.permission;
    const root = document.querySelector('.party-phone-card');
    root.replaceChildren();
    mountTilt(root, { onInput: value => window.samples.push(value) });
  });
  const touch = page.getByRole('button', { name: 'Touch direction' });
  await page.getByRole('button', { name: 'Enable tilt' }).tap();
  await page.getByRole('button', { name: 'Tilt unavailable' }).waitFor();
  assert.equal(await touch.isEnabled(), true);
  await page.evaluate(() => { window.permission = 'granted'; });
  await page.getByRole('button', { name: 'Tilt unavailable' }).tap();
  await page.getByRole('button', { name: 'Cancel tilt' }).waitFor();
  assert.equal(await touch.isEnabled(), true);
  await page.evaluate(() => {
    window.dispatchEvent(new DeviceOrientationEvent('deviceorientation'));
    window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: 0, gamma: 0 }));
    window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: 30, gamma: -15 }));
  });
  const useTouch = page.getByRole('button', { name: 'Use touch' });
  await useTouch.waitFor();
  assert.equal(await touch.isEnabled(), false);
  await page.waitForFunction(() => window.samples.some(value => value.x === -0.5 && value.y === 1));
  await useTouch.tap();
  assert.equal(await touch.isEnabled(), true);
  assert.deepEqual(await page.evaluate(() => window.samples.at(-1)), { x: 0, y: 0 });
});
