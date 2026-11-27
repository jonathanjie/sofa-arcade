import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchPartyHarness } from './harness.mjs';

const output = fileURLToPath(new URL('../../work/whiteout-drift/review/', import.meta.url));

test('TV and phone browsers play Whiteout Drift across modes with 16 players', { timeout: 45_000 }, async t => {
  const fixture = await launchPartyHarness(t, { gameId: 'whiteout-drift', manual: false });
  const browser = await chromium.launch({ executablePath: process.env.SOFA_CHROMIUM_EXECUTABLE });
  t.after(() => browser.close());
  await mkdir(output, { recursive: true });
  const issues = [];

  async function page(options, name) {
    const context = await browser.newContext(options);
    await context.addInitScript(() => {
      window.partyCsp = [];
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
  await tv.getByRole('tab', { name: 'Party', exact: true }).click();
  await tv.locator('.game-card[data-game="whiteout-drift"]').click();
  await tv.getByRole('link', { name: 'Host on the TV' }).click();
  await tv.getByRole('button', { name: 'Start', exact: true }).waitFor();
  const code = await tv.locator('[data-party-code]').textContent();
  assert.match(code, /^[A-Z0-9]{6}$/);

  const modeSelect = tv.locator('.party-next-mode select');
  await modeSelect.waitFor({ state: 'visible' });
  await modeSelect.selectOption('drift-king');
  await tv.getByText(/Grab the crown and keep it moving/i).waitFor();

  const names = ['Blaze', 'Frost', 'Drift'];
  const phones = await Promise.all(names.map(name => page({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  }, name)));

  const qrLink = new URL(await tv.getByRole('link', { name: 'Open phone link' }).getAttribute('href'));
  await Promise.all(phones.map(async (phone, look) => {
    await phone.goto(`${fixture.origin}${qrLink.pathname}${qrLink.search}`);
    await phone.getByLabel('Your name').fill(names[look]);
    await phone.getByRole('radio').nth(look).check();
    await phone.getByRole('button', { name: 'Ready', exact: true }).tap();
    await phone.getByText('Ready for the TV').waitFor();
  }));

  const simulated = await Promise.all(Array.from({ length: 13 }, async (_, index) => {
    const phone = await fixture.connect(await fixture.join(code, index + 3));
    phone.send({ type: 'ready', value: true });
    return phone;
  }));
  await tv.getByText('16 of 16 ready').waitFor();
  await tv.screenshot({ path: output + 'tv-lobby.png' });

  await tv.getByRole('button', { name: 'Start', exact: true }).click();
  await tv.locator('.party-countdown').waitFor({ state: 'visible' });
  await phones[0].getByText('Go!', { exact: true }).waitFor();
  await tv.locator('.party-countdown').waitFor({ state: 'hidden' });

  const frames = tv.evaluate(() => new Promise(resolve => {
    const elapsed = [];
    window.partyRenderTimes = [];
    let prior;
    function frame(at) {
      if (prior !== undefined) elapsed.push(at - prior);
      prior = at;
      if (elapsed.length < 70) requestAnimationFrame(frame);
      else {
        resolve({ elapsed, render: window.partyRenderTimes });
        window.partyRenderTimes = null;
      }
    }
    requestAnimationFrame(frame);
  }));

  const movement = setInterval(() => {
    const now = performance.now() / 500;
    for (const [index, phone] of simulated.entries()) {
      if (phone.view.phase === 'playing') {
        const angle = index * 0.6 + now;
        phone.input({ kind: 'drive', x: Math.cos(angle), y: Math.sin(angle), d: index % 2 });
      }
    }
  }, 100);

  try {
    const stick = phones[0].locator('.wd-stick');
    const box = await stick.boundingBox();
    assert.ok(box && box.width >= 100 && box.height >= 100);
    // Steer with one thumb and hold Drift with the other, as on a real phone.
    const driftBox = await phones[0].locator('.wd-drift').boundingBox();
    const steerStart = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.5, id: 1 };
    const steerEnd = { x: box.x + box.width * 0.85, y: box.y + box.height * 0.35, id: 1 };
    const driftPoint = { x: driftBox.x + driftBox.width / 2, y: driftBox.y + driftBox.height / 2, id: 2 };
    const touch = await phones[0].context().newCDPSession(phones[0]);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [steerStart] });
    for (let step = 1; step <= 6; step++) {
      const point = { x: steerStart.x + (steerEnd.x - steerStart.x) * step / 6, y: steerStart.y + (steerEnd.y - steerStart.y) * step / 6, id: 1 };
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] });
    }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [steerEnd, driftPoint] });
    await phones[0].waitForTimeout(600);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [steerEnd] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    await frames;
    await tv.screenshot({ path: output + 'tv-playing.png' });
    await phones[0].screenshot({ path: output + 'phone-playing.png' });
  } finally {
    clearInterval(movement);
  }

  const canvasNonBlank = await tv.locator('[data-party-canvas]').evaluate(canvas => {
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, Math.min(200, canvas.width), Math.min(200, canvas.height)).data;
    let nonZero = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) nonZero++;
    return nonZero > 100;
  });
  assert.equal(canvasNonBlank, true);

  for (const tab of [tv, ...phones]) {
    assert.deepEqual(await tab.evaluate(() => window.partyCsp), []);
    assert.equal(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await tab.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), true);
  }

  // During play the TV menu holds the settings and the End party button.
  await tv.getByText('Menu', { exact: true }).click();
  await tv.getByLabel('Reduce motion').check();
  await tv.waitForTimeout(150);
  await tv.getByRole('button', { name: 'End party' }).click();
  await tv.getByText('This party has closed.').waitFor();
  assert.deepEqual(issues, []);

  const measured = await frames;
  const sorted = [...measured.render].sort((a, b) => a - b);
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
  await writeFile(output + 'frame-times.json', JSON.stringify({ count: sorted.length, p95 }, null, 2) + '\n');
  assert.ok(p95 < 16.7, `TV render p95 exceeded 16.7 ms: ${p95}`);
});

test('TV and phones play Whiteout Drift Car Soccer mode with 16 players', { timeout: 35_000 }, async t => {
  const fixture = await launchPartyHarness(t, { gameId: 'whiteout-drift', manual: false });
  const browser = await chromium.launch({ executablePath: process.env.SOFA_CHROMIUM_EXECUTABLE });
  t.after(() => browser.close());
  await mkdir(output, { recursive: true });
  const issues = [];
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await context.newPage();
  tv.on('console', message => { if (message.type() === 'error') issues.push(`TV: ${message.text()}`); });
  tv.on('pageerror', error => issues.push(`TV: ${error.message}`));
  tv.on('response', response => { if (response.status() === 404) issues.push(`TV: 404 ${new URL(response.url()).pathname}`); });

  await tv.goto(fixture.origin);
  await tv.getByRole('tab', { name: 'Party', exact: true }).click();
  await tv.locator('.game-card[data-game="whiteout-drift"]').click();
  await tv.getByRole('link', { name: 'Host on the TV' }).click();
  await tv.getByRole('button', { name: 'Start', exact: true }).waitFor();
  const code = await tv.locator('[data-party-code]').textContent();
  await tv.locator('.party-next-mode select').selectOption('car-soccer');
  await tv.getByText(/snowy stadium pitch/i).waitFor();

  const phones = await Promise.all(Array.from({ length: 16 }, async (_, index) => {
    const phone = await fixture.connect(await fixture.join(code, index));
    phone.send({ type: 'ready', value: true });
    return phone;
  }));
  await tv.getByText('16 of 16 ready').waitFor();
  await tv.getByRole('button', { name: 'Start', exact: true }).click();
  await tv.locator('.party-countdown').waitFor({ state: 'hidden' });

  const drive = setInterval(() => {
    for (const [index, phone] of phones.entries()) {
      if (phone.view.phase === 'playing') {
        const towardCenter = index % 2 === 0 ? 1 : -1;
        phone.input({ kind: 'drive', x: towardCenter * 0.9, y: Math.sin(index) * 0.3, d: 0 });
      }
    }
  }, 100);
  try {
    await tv.waitForTimeout(1400);
    await tv.screenshot({ path: output + 'tv-soccer.png' });
  } finally {
    clearInterval(drive);
  }
  await tv.getByText('Menu', { exact: true }).click();
  await tv.getByRole('button', { name: 'End party' }).click();
  await tv.getByText('This party has closed.').waitFor();
  assert.deepEqual(issues, []);
});
