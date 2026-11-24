import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchPartyHarness } from './harness.mjs';

const gameId = 'dust-bunny-sumo';
const output = fileURLToPath(new URL('../../work/dust-bunny-sumo/', import.meta.url));
const mobile = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

function direction({ x, y }, strength = 1) {
  const length = Math.hypot(x, y);
  return { kind: 'roll', x: x * strength / length, y: y * strength / length };
}

function percentiles(values) {
  assert.ok(values.length >= 100, `collected ${values.length} frames`);
  const sorted = [...values].sort((a, b) => a - b);
  return { median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * .95) - 1] };
}

function sampleFrames(page) {
  return page.evaluate(() => new Promise(resolve => {
    const elapsed = [];
    window.sumoRenderTimes = [];
    let prior;
    function sample(at) {
      if (prior !== undefined) elapsed.push(at - prior);
      prior = at;
      if (elapsed.length < 180) requestAnimationFrame(sample);
      else {
        resolve({ elapsed, render: window.sumoRenderTimes });
        window.sumoRenderTimes = null;
      }
    }
    requestAnimationFrame(sample);
  }));
}

test('Dust Bunny Sumo plays in Chromium with a TV, two phones and fourteen socket guests', { timeout: 45_000 }, async t => {
  const fixture = await launchPartyHarness(t, { gameId, manual: false });
  async function advanceUntil(predicate, { ticks = 500, drive } = {}) {
    for (let tick = 0; tick < ticks && !predicate(); tick++) {
      drive?.(tick);
      await delay(50);
    }
    assert.ok(predicate(), 'the browser did not reach the expected state');
  }
  const browser = await chromium.launch({ executablePath: process.env.SOFA_CHROMIUM_EXECUTABLE });
  t.after(() => browser.close());
  await mkdir(output, { recursive: true });
  const issues = [];
  async function open(options, label) {
    const context = await browser.newContext(options);
    await context.addInitScript(() => {
      window.sumoCsp = [];
      document.addEventListener('securitypolicyviolation', event => window.sumoCsp.push(event.violatedDirective));
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => {
        if (callback.name !== 'drawFrame') return raf(callback);
        return raf(at => {
          const start = performance.now();
          callback(at);
          window.sumoRenderTimes?.push(performance.now() - start);
        });
      };
    });
    const tab = await context.newPage();
    tab.setDefaultTimeout(4500);
    tab.on('pageerror', error => issues.push(`${label}: ${error.message}`));
    tab.on('console', message => { if (message.type() === 'error') issues.push(`${label}: ${message.text()}`); });
    tab.on('response', response => {
      if (response.status() >= 400) issues.push(`${label}: ${response.status()} ${new URL(response.url()).pathname}`);
    });
    return tab;
  }

  async function capture(page, name) {
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth
      && document.documentElement.scrollHeight <= innerHeight + 1);
    assert.ok(fits, `${name} fits the viewport`);
    await page.screenshot({ path: output + name + '.png' });
  }

  const tv = await open({ viewport: { width: 1920, height: 1080 } }, 'TV');
  let tvView;
  tv.on('websocket', socket => {
    if (!socket.url().endsWith('/api/realtime/party')) return;
    socket.on('framereceived', ({ payload }) => {
      const packet = JSON.parse(payload);
      if (packet.view) tvView = packet.view;
    });
  });
  await tv.goto(fixture.origin);
  await tv.getByRole('button', { name: /Dust Bunny Sumo/ }).click();
  await tv.getByRole('link', { name: 'Host on the TV' }).click();
  await tv.locator('[data-party-qr] svg').waitFor();
  const code = await tv.locator('[data-party-code]').textContent();
  assert.match(code, /^[A-Z0-9]{6}$/);

  const names = ['Miso', 'Pip', 'Juniper', 'Clover', 'Hazel', 'Bramble', 'Pebble', 'Fig',
    'Chai', 'Cricket', 'Pickle', 'Maple', 'Oat', 'Nettle', 'Button', 'Mochi'];
  const [tilt, touch] = await Promise.all([open(mobile, 'tilt phone'), open(mobile, 'touch phone')]);
  const touchscreen = await touch.context().newCDPSession(touch);
  function finger(type, x, y) {
    return touchscreen.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
    });
  }
  const orient = (beta, gamma) => tilt.evaluate(({ beta, gamma }) => {
    window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta, gamma }));
  }, { beta, gamma });
  for (const [look, phone] of [tilt, touch].entries()) {
    await phone.goto(`${fixture.origin}/?party=join&code=${code}`);
    await phone.getByLabel('Your name').fill(names[look]);
    await phone.getByRole('radio').nth(look).check();
    await phone.getByRole('button', { name: 'Ready', exact: true }).tap();
    await advanceUntil(() => tvView?.players[look]?.ready, { ticks: 30 });
  }
  const simulated = await Promise.all(names.slice(2).map(async (name, index) => {
    const phone = await fixture.connect(await fixture.join(code, index + 2, name));
    phone.send({ type: 'ready', value: true });
    return phone;
  }));

  await advanceUntil(() => tvView?.players.filter(player => player.ready).length === 16, { ticks: 50 });
  await tv.getByText('16 of 16 ready').waitFor();
  await capture(tv, 'lobby');
  const lobbyFrames = await sampleFrames(tv);
  await tv.getByRole('button', { name: 'Start', exact: true }).click();
  await delay(60);
  await advanceUntil(() => tvView?.phase === 'countdown', { ticks: 30 });
  await tv.locator('.party-countdown').waitFor({ state: 'visible' });
  await capture(tv, 'countdown');
  await delay(250);
  await tilt.getByRole('button', { name: 'Enable tilt' }).tap();
  await advanceUntil(() => tvView?.phase === 'playing', { ticks: 90 });
  await delay(250);
  await Promise.all([tilt, touch].map(phone => phone.getByText('Go!', { exact: true }).waitFor()));
  assert.equal(tvView.scene.bodies.length, 16);
  const start = new Map(tvView.scene.bodies.map(body => [body.id, body]));
  const playerForLook = look => tvView.roster.find(player => player.look === look).id;
  const tiltId = playerForLook(0);
  const touchId = playerForLook(1);
  assert.equal(await tilt.locator('.sumo-steering').getAttribute('data-tilt'), 'false');
  await orient(29, 5);
  await tilt.getByText('Tilt to roll').waitFor();
  await orient(33, -1);
  const pad = touch.getByRole('button', { name: 'Direction', exact: true });
  const bounds = await pad.boundingBox();
  assert.ok(bounds.height > 200);
  const dragX = bounds.x + bounds.width * .4;
  const dragY = bounds.y + bounds.height * .56;
  await finger('touchStart', dragX, dragY);
  await delay(70);

  const frames = sampleFrames(tv);
  const strengths = [-.45, -.30, .12, -.21];
  for (let tick = 0; tick < 70; tick++) {
    if (tick % 2 === 0) {
      for (const [index, phone] of simulated.entries()) {
        const { x, y } = start.get(phone.playerId);
        const angle = (index % 5 - 2) * .27;
        const offset = { x: x * Math.cos(angle) - y * Math.sin(angle), y: y * Math.cos(angle) + x * Math.sin(angle) };
        phone.input(direction(offset, strengths[index % strengths.length]));
      }
    }
    if (tick % 7 === 0) await orient(33, -1);
    await delay(47);
  }
  const measured = await frames;
  assert.equal(tvView.scene.bodies.filter(body => body.outAt === null).length, 16);
  const moved = id => {
    const now = tvView.scene.bodies.find(body => body.id === id);
    const was = start.get(id);
    return Math.hypot(now.x - was.x, now.y - was.y);
  };
  assert.ok(moved(tiltId) > 3 && moved(touchId) > 3, 'both browser controllers move their own bunny');
  await capture(tv, 'mid-play');
  await orient(33, -1);
  await capture(tilt, 'phone-tilt');
  await capture(touch, 'phone-stick');
  await finger('touchEnd');
  // Losing sensor samples automatically restores the touch controller.
  await tilt.getByText('Drag to roll').waitFor();
  await tilt.getByRole('button', { name: 'Enable tilt' }).tap();
  await orient(29, 5);
  await tilt.getByText('Tilt to roll').waitFor();
  await tilt.getByRole('button', { name: 'Use stick' }).tap();
  await tilt.getByText('Drag to roll').waitFor();
  await touch.getByRole('button', { name: 'Dash' }).tap();
  await advanceUntil(() => tvView.scene.events.some(event => event.kind === 'dash' && event.playerId === touchId));

  // Hold an actual drag away from the centre until the touch player's controller changes roles.
  const live = tvView.scene.bodies.find(body => body.id === touchId);
  const axis = direction(live);
  const x = bounds.x + bounds.width * (.5 + .48 * axis.x);
  const y = bounds.y + bounds.height * (.5 + .48 * axis.y);
  await finger('touchStart', x, y);
  await advanceUntil(() => tvView.scene.bodies.find(body => body.id === touchId).outAt !== null, { ticks: 160 });
  await finger('touchEnd');
  await touch.getByText('You’re a draught').waitFor();
  await capture(tv, 'knockout');
  await capture(touch, 'phone-draught');
  const swipe = await touch.getByRole('button', { name: /Swipe or use arrow keys/ }).boundingBox();
  await finger('touchStart', swipe.x + 35, swipe.y + swipe.height / 2);
  await finger('touchMove', swipe.x + swipe.width - 35, swipe.y + swipe.height / 2);
  await finger('touchEnd');
  await advanceUntil(() => tvView.scene.gusts.some(gust => gust.playerId === touchId));
  await delay(350);
  await capture(tv, 'gust');

  await tv.emulateMedia({ reducedMotion: 'reduce' });
  await advanceUntil(() => tvView.scene.warning?.ms > 0, { ticks: 400 });
  await capture(tv, 'shrink-warning');
  await advanceUntil(() => tvView.scene.events.some(event => event.kind === 'shrink'));
  const exit = new Map(tvView.scene.bodies.map(body => [body.id, direction(body)]));
  await advanceUntil(() => tvView.phase === 'results', {
    ticks: 350,
    drive(tick) {
      if (tick % 2) return;
      for (const phone of simulated) {
        if (!phone.view.state?.out) phone.input(exit.get(phone.playerId));
      }
    },
  });
  await tv.getByRole('heading', { name: 'Podium' }).waitFor();
  await capture(tv, 'podium');
  assert.equal(tvView.results[0].playerId, tiltId);
  assert.equal(tvView.results[0].score, 16);
  assert.equal(tvView.results.length, 16);
  await tv.getByLabel('Next game').selectOption('tap-race');
  await advanceUntil(() => tvView.gameId === 'tap-race' && tvView.phase === 'lobby');
  await tv.getByRole('heading', { name: 'Tap Race', exact: true }).waitFor();

  for (const page of [tv, tilt, touch]) {
    assert.deepEqual(await page.evaluate(() => window.sumoCsp), []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), true);
  }
  assert.deepEqual(issues, []);
  const result = {
    renderMs: percentiles(measured.render), cadenceMs: percentiles(measured.elapsed),
    lobbyCadenceMs: percentiles(lobbyFrames.elapsed), frames: measured.elapsed.length,
  };
  await writeFile(output + 'frame-times.json', JSON.stringify(result, null, 2) + '\n');
  t.diagnostic(JSON.stringify(result));
  // Headless Chromium controls frame delivery. Gate the time the game spends drawing each frame.
  assert.ok(result.renderMs.p95 < 16.7, `TV draw p95 reached ${result.renderMs.p95} ms`);
});
