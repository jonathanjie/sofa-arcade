import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchPartyHarness } from './harness.mjs';

const output = fileURLToPath(new URL('../../work/timber-rush/review/', import.meta.url));

test('TV and phone browsers play Timber Rush with 16 players', { timeout: 135_000 }, async (t) => {
  const fixture = await launchPartyHarness(t, { gameId: 'timber-rush', manual: false });
  const browser = await chromium.launch({ executablePath: process.env.SOFA_CHROMIUM_EXECUTABLE });
  t.after(() => browser.close());
  await mkdir(output, { recursive: true });
  const issues = [];

  async function page(options, name) {
    const context = await browser.newContext(options);
    await context.addInitScript(() => {
      window.partyCsp = [];
      const animationFrame = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) => {
        if (callback.name !== 'drawFrame') return animationFrame(callback);
        return animationFrame((at) => {
          const start = performance.now();
          callback(at);
          window.partyRenderTimes?.push(performance.now() - start);
        });
      };
      document.addEventListener('securitypolicyviolation', (event) =>
        window.partyCsp.push(event.violatedDirective),
      );
    });
    const tab = await context.newPage();
    tab.on('console', (message) => {
      if (message.type() === 'error') issues.push(`${name}: ${message.text()}`);
    });
    tab.on('pageerror', (error) => issues.push(`${name}: ${error.message}`));
    tab.on('response', (response) => {
      if (response.status() === 404) issues.push(`${name}: 404 ${new URL(response.url()).pathname}`);
    });
    return tab;
  }

  const tv = await page({ viewport: { width: 1920, height: 1080 } }, 'TV');
  await tv.goto(fixture.origin);
  await tv.getByRole('tab', { name: 'Party', exact: true }).click();
  await tv.locator('.game-card[data-game="timber-rush"]').click();
  await tv.getByRole('link', { name: 'Host on the TV' }).click();
  await tv.getByRole('button', { name: 'Start', exact: true }).waitFor();
  const code = await tv.locator('[data-party-code]').textContent();
  assert.match(code, /^[A-Z0-9]{6}$/);

  const modeSelect = tv.locator('.party-next-mode select');
  await modeSelect.waitFor({ state: 'visible' });
  await modeSelect.selectOption('sabotage');

  const names = ['Blaze', 'Frost', 'Drift'];
  const phones = await Promise.all(
    names.map((name) =>
      page(
        {
          viewport: { width: 390, height: 844 },
          isMobile: true,
          hasTouch: true,
        },
        name,
      ),
    ),
  );

  const qrLink = new URL(await tv.getByRole('link', { name: 'Open phone link' }).getAttribute('href'));
  await Promise.all(
    phones.map(async (phone, look) => {
      await phone.goto(`${fixture.origin}${qrLink.pathname}${qrLink.search}`);
      await phone.getByLabel('Your name').fill(names[look]);
      await phone.getByRole('radio').nth(look).check();
      await phone.getByRole('button', { name: 'Ready', exact: true }).tap();
      await phone.getByText('Ready for the TV').waitFor();
    }),
  );

  const simulated = await Promise.all(
    Array.from({ length: 13 }, async (_, index) => {
      const phone = await fixture.connect(await fixture.join(code, index + 3));
      phone.send({ type: 'ready', value: true });
      return phone;
    }),
  );
  await tv.getByText('16 of 16 ready').waitFor();
  await tv.screenshot({ path: output + 'tv-lobby.png' });

  await tv.getByRole('button', { name: 'Start', exact: true }).click();
  await tv.locator('.party-countdown').waitFor({ state: 'visible' });
  await phones[0].getByText('Go!', { exact: true }).waitFor();
  await tv.locator('.party-countdown').waitFor({ state: 'hidden' });

  await tv.screenshot({ path: output + 'teaching.png' });
  await phones[0].screenshot({path: output + 'phone-teaching.png'});
  const frames = tv.evaluate(
    () =>
      new Promise((resolve) => {
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
      }),
  );

  const movement = setInterval(() => {
    for (const phone of simulated) {
      if (phone.view.state) phone.input({ kind: 'chop', side: -phone.view.state.b || 1 });
    }
  }, 450);

  try {
    for (const phone of phones) await phone.locator('.timber-pad button').first().tap();
    await tv.waitForTimeout(40_000);
    await tv.screenshot({ path: output + 'tv-playing.png' });
    const box = await tv.locator('[data-party-canvas]').boundingBox();
    await tv.screenshot({
      path: output + 'close-up.png',
      clip: { x: box.x + 50, y: box.y + 40, width: box.width / 4, height: box.height * 0.47 },
    });
    await phones[0].screenshot({ path: output + 'phone-playing.png' });
  } finally {
    clearInterval(movement);
  }

  const canvasNonBlank = await tv.locator('[data-party-canvas]').evaluate((canvas) => {
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

  await tv.getByRole('button', { name: 'Next round', exact: true }).waitFor({ timeout: 100000 });
  await tv.screenshot({ path: output + 'results.png' });
  assert.deepEqual(issues, []);

  const measured = await frames;
  const sorted = [...measured.render].sort((a, b) => a - b);
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
  await writeFile(output + 'frame-times.json', JSON.stringify({ count: sorted.length, p95 }, null, 2) + '\n');
  assert.ok(p95 < 16.7, `TV render p95 exceeded 16.7 ms: ${p95}`);
});
