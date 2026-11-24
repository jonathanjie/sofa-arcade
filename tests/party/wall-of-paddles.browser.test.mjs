import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchPartyHarness } from './harness.mjs';

const output = fileURLToPath(new URL('../../work/wall-of-paddles/', import.meta.url));

function percentiles(values) {
  assert.ok(values.length >= 100, `collected ${values.length} frames`);
  const sorted = [...values].sort((a, b) => a - b);
  const pick = fraction => Number(sorted[Math.ceil(sorted.length * fraction) - 1].toFixed(2));
  return { median: pick(0.5), p95: pick(0.95) };
}

test('the TV and two touch pages play Wall of Paddles with fourteen socket controllers', { timeout: 115_000 }, async t => {
  const fixture = await launchPartyHarness(t, { gameId: 'wall-of-paddles', manual: false });
  const browser = await chromium.launch({ executablePath: process.env.SOFA_CHROMIUM_EXECUTABLE });
  t.after(() => browser.close());
  await mkdir(output, { recursive: true });
  const issues = [];

  async function page(options, name) {
    const context = await browser.newContext(options);
    await context.addInitScript(() => {
      window.partyCsp = [];
      document.addEventListener('securitypolicyviolation', event => window.partyCsp.push(event.violatedDirective));
      const animationFrame = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => {
        if (callback.name !== 'drawFrame') return animationFrame(callback);
        return animationFrame(at => {
          const start = performance.now();
          callback(at);
          if (window.paddleMeasurement) {
            window.paddleMeasurement.draw.push(performance.now() - start);
            window.paddleMeasurement.timestamps.push(at);
          }
        });
      };
    });
    const tab = await context.newPage();
    tab.on('console', message => {
      if (message.type() === 'error') issues.push(`${name}: ${message.text()}`);
    });
    tab.on('pageerror', error => issues.push(`${name}: ${error.message}`));
    tab.on('response', response => {
      if (response.status() >= 400) issues.push(`${name}: ${response.status()} ${new URL(response.url()).pathname}`);
    });
    return tab;
  }

  const tv = await page({ viewport: { width: 1920, height: 1080 } }, 'TV');
  let hostView;
  tv.on('websocket', socket => {
    if (!socket.url().endsWith('/api/realtime/party')) return;
    socket.on('framereceived', frame => { hostView = JSON.parse(frame.payload).view ?? hostView; });
  });
  await tv.goto(fixture.origin);
  await tv.getByRole('heading', { name: 'Party', exact: true }).waitFor();
  await tv.getByRole('button', { name: /Wall of Paddles/ }).click();
  await tv.getByRole('link', { name: 'Host on the TV' }).click();
  await tv.locator('[data-party-qr] svg').waitFor({ state: 'visible' });
  const code = await tv.locator('[data-party-code]').textContent();
  const url = `/?party=join&code=${code}`;
  assert.equal(new URL(await tv.getByRole('link', { name: 'Open phone link' }).getAttribute('href')).search, new URL(url, fixture.origin).search);

  const names = ['Iris', 'Beacon'];
  const phones = [];
  for (const [look, name] of names.entries()) {
    const phone = await page({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, name);
    await phone.goto(fixture.origin + (look === 0 ? url : '/?party=join'));
    if (look === 1) {
      await phone.getByLabel('Room code').fill(code);
      await phone.getByRole('button', { name: 'Find party' }).tap();
    }
    await phone.getByLabel('Your name').fill(name);
    await phone.getByRole('radio').nth(look).check();
    await phone.getByRole('button', { name: 'Ready', exact: true }).tap();
    await phone.getByText('Ready for the TV').waitFor();
    phones.push(phone);
  }
  const simulated = await Promise.all(Array.from({ length: 14 }, async (_, index) => {
    const phone = await fixture.connect(await fixture.join(code, index + 2, `Pixel ${String(index + 3).padStart(2, '0')}`));
    phone.send({ type: 'ready', value: true });
    return phone;
  }));
  await tv.getByText('16 of 16 ready').waitFor();
  await tv.screenshot({ path: output + '01-lobby.png' });
  await tv.getByRole('button', { name: 'Start', exact: true }).click();
  await tv.locator('.party-countdown').waitFor({ state: 'visible' });
  await tv.screenshot({ path: output + '02-countdown.png' });
  await phones[0].getByText('Go!', { exact: true }).waitFor();
  await tv.locator('.party-countdown').waitFor({ state: 'hidden' });

  const frames = tv.evaluate(() => new Promise(resolve => {
    window.paddleMeasurement = { draw: [], timestamps: [] };
    function read() {
      if (window.paddleMeasurement.draw.length < 240) {
        requestAnimationFrame(read);
        return;
      }
      const { draw, timestamps } = window.paddleMeasurement;
      window.paddleMeasurement = null;
      resolve({ draw, cadence: timestamps.slice(1).map((value, index) => value - timestamps[index]) });
    }
    requestAnimationFrame(read);
  }));

  const movement = setInterval(() => {
    for (const phone of simulated) {
      if (phone.view.phase === 'playing') phone.input({ kind: 'slide', position: phone.view.state.team === 0 ? 0 : -1 });
    }
  }, 200);
  t.after(() => clearInterval(movement));

  async function checkViewport(page, name) {
    const { width, height, scrollWidth, scrollHeight } = await page.evaluate(() => ({
      width: innerWidth, height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
    }));
    assert.ok(scrollWidth <= width && scrollHeight <= height + 1,
      `${name}: content ${scrollWidth} × ${scrollHeight} in viewport ${width} × ${height}`);
  }

  async function placePaddle(phone, index, proportion) {
    const slider = phone.getByRole('slider', { name: 'Paddle position' });
    const box = await slider.boundingBox();
    assert.ok(box.width >= 290 && box.height >= 500, `slide area is ${box.width} × ${box.height}`);
    const x = box.x + 35;
    const y = box.y + box.height * proportion;
    if (index === 0) {
      await phone.touchscreen.tap(x, y);
    } else {
      const session = await phone.context().newCDPSession(phone);
      const point = height => ({ x, y: height, id: 1 });
      const start = box.y + box.height * 0.5;
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(start)] });
      for (let sample = 1; sample <= 4; sample++) {
        const height = start + (y - start) * sample / 4;
        await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(height)] });
      }
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await session.detach();
    }
    const value = Number(await slider.inputValue());
    assert.ok(Math.abs(value - (proportion * 2 - 1)) < 0.07, `touch mapped to ${value}`);
    const id = hostView.roster.find(entry => entry.name === names[index]).id;
    const end = Date.now() + 2000;
    while (Date.now() < end) {
      const paddle = hostView.scene.paddles.find(entry => entry.playerId === id);
      const travel = paddle.bottom - paddle.top - paddle.length;
      const position = (paddle.y - paddle.top - paddle.length / 2) * 2 / travel - 1;
      if (Math.abs(position - value) < 0.001) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.fail('TV snapshot did not reflect the touched absolute position');
  }

  await Promise.all([placePaddle(phones[0], 0, 0.78), placePaddle(phones[1], 1, 0.24)]);
  await Promise.all(phones.map(async (phone, index) => {
    await checkViewport(phone, names[index]);
    await phone.screenshot({ path: output + `04-phone-${index + 1}.png` });
  }));
  await tv.getByRole('img', { name: /Cyan [1-7], Coral|Cyan 0, Coral [1-7]/ }).waitFor({ timeout: 12_000 });
  await tv.screenshot({ path: output + '05-goal.png' });
  const boostDeadline = Date.now() + 8000;
  while (!hostView.scene.pickup && Date.now() < boostDeadline) {
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  assert.ok(hostView.scene.pickup, 'a boost appeared in the live round');
  await tv.screenshot({ path: output + '03-mid-play.png' });

  const measured = await frames;
  const result = { frames: measured.draw.length, renderMs: percentiles(measured.draw), presentationMs: percentiles(measured.cadence) };
  await writeFile(output + 'frame-times.json', JSON.stringify(result, null, 2) + '\n');
  t.diagnostic(JSON.stringify(result));
  assert.ok(result.renderMs.p95 < 16.7, 'TV draw time must fit in one 60 Hz frame');

  await tv.getByRole('heading', { name: 'Podium' }).waitFor({ timeout: 92_000 });
  await tv.screenshot({ path: output + '06-podium.png' });
  assert.equal(Math.max(...hostView.scene.points), 7);
  assert.ok(hostView.results.every(result => result.score === hostView.scene.points[
    hostView.scene.paddles.find(paddle => paddle.playerId === result.playerId).team
  ]));
  await phones[0].getByText(/Place #/).waitFor();
  await tv.emulateMedia({ reducedMotion: 'reduce' });
  await tv.getByRole('button', { name: 'Next round', exact: true }).click();
  await tv.getByRole('img', { name: /^Cyan 0, Coral 0\./ }).waitFor();
  await tv.locator('.party-countdown').waitFor({ state: 'hidden' });
  assert.equal(hostView.round, 2);
  await tv.screenshot({ path: output + '07-reduced-motion.png' });

  for (const [index, tab] of [tv, ...phones].entries()) {
    assert.deepEqual(await tab.evaluate(() => window.partyCsp), []);
    await checkViewport(tab, index === 0 ? 'TV' : names[index - 1]);
  }
  assert.deepEqual(issues, []);
});
