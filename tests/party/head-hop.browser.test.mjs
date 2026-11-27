import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchPartyHarness } from './harness.mjs';

const output = fileURLToPath(new URL('../../work/head-hop/review/', import.meta.url));

test('TV and phone browsers play Head Hop with 16 players', { timeout: 150_000 }, async t => {
  const fixture = await launchPartyHarness(t, { gameId: 'head-hop', manual: false });
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
  await tv.locator('.game-card[data-game="head-hop"]').click();
  await tv.getByRole('link', { name: 'Host on the TV' }).click();
  await tv.getByRole('button', { name: 'Start', exact: true }).waitFor();
  const code = await tv.locator('[data-party-code]').textContent();
  assert.match(code, /^[A-Z0-9]{6}$/);

  const modeSelect = tv.locator('.party-next-mode select');
  await modeSelect.waitFor({ state: 'visible' });
  await modeSelect.selectOption('last-one-up');

  const names = ['Blaze', 'Frost', 'Drift'];
  const phones = await Promise.all(names.map(name => page({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  }, name)));

  const hops = [];
  phones[0].on('websocket', socket => socket.on('framesent', ({ payload }) => {
    const packet = JSON.parse(payload);
    if (packet.type === 'input') hops.push(packet.input);
  }));
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
  await tv.screenshot({ path: output + 'teaching.png' });
  await phones[0].screenshot({ path: output + 'phone-teaching.png' });
  await phones[0].getByText('Go!', { exact: true }).waitFor();
  await tv.locator('.party-countdown').waitFor({ state: 'hidden' });

  for (const phone of simulated) phone.input({ kind: 'hop', power: 7 });
  for (const phone of phones) await phone.getByRole('button', { name: 'Hop!' }).tap();
  const button = phones[0].getByRole('button', { name: 'Hop!' });
  const box = await button.boundingBox();
  assert.ok(box.width >= 240 && box.height >= 220);
  const touch = await phones[0].context().newCDPSession(phones[0]);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + 80, y: box.y + 80 }] });
  await phones[0].waitForTimeout(500);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await phones[0].waitForTimeout(100);
  assert.ok(hops.some(hop => hop.power <= 2));
  assert.ok(hops.some(hop => hop.power >= 7));
  await tv.waitForTimeout(30_000);
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

  for (let beat = 0; beat < 16; beat++) {
    simulated.forEach((phone, i) => {
      if ((i + beat) % 4 === 0) phone.input({ kind: 'hop', power: (i + beat) % 11 });
    });
    await tv.waitForTimeout(300);
  }
  await tv.screenshot({ path: output + 'tv-playing.png' });
  await tv.screenshot({ path: output + 'close-up.png', clip: { x: 520, y: 190, width: 840, height: 650 } });
  await phones[0].screenshot({ path: output + 'phone-playing.png' });

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

  await tv.getByRole('button', { name: 'Next round' }).waitFor({ timeout: 100_000 });
  await tv.locator('.party-podium').waitFor();
  await tv.screenshot({ path: output + 'results.png' });
  assert.deepEqual(issues, []);

  const measured = await frames;
  const sorted = [...measured.render].sort((a, b) => a - b);
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
  await writeFile(output + 'frame-times.json', JSON.stringify({ count: sorted.length, p95 }, null, 2) + '\n');
  assert.ok(p95 < 16.7, `TV render p95 exceeded 16.7 ms: ${p95}`);
});
