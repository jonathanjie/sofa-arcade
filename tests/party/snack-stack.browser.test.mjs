import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { CARDS, PICTURE_ANGLE, TRACE, PREVIEW_MS, cheeseAngle, greenPosition, lalaLooks } from '../../ui/party/games/snack-stack/cards.mjs';
import { launchPartyHarness } from './harness.mjs';
import { inputsForCard } from './snack-stack-driver.mjs';

const output = fileURLToPath(new URL('../../work/snack-tutorial/', import.meta.url));

async function waitFor(predicate, label, timeout = 5000) {
  const limit = performance.now() + timeout;
  while (!predicate()) {
    assert.ok(performance.now() < limit, 'Timed out waiting for ' + label);
    await delay(20);
  }
}

function percentiles(values) {
  const sorted = [...values].sort((a, b) => a - b);
  assert.ok(sorted.length >= 100);
  return { median: sorted[Math.ceil(sorted.length * .5) - 1], p95: sorted[Math.ceil(sorted.length * .95) - 1] };
}

function watchMouseHeights() {
  const draw = CanvasRenderingContext2D.prototype.drawImage;
  window.mouseHeights = new Set();
  CanvasRenderingContext2D.prototype.drawImage = function (source, x, y, width, height) {
    if (source.width === 16 && source.height === 16 && height >= 64) {
      // Shared mice have 15 opaque rows. Snack Stack composites at CSS size on this TV.
      window.mouseHeights.add(height * 15 / 16);
    }
    return draw.apply(this, arguments);
  };
}

async function checkViewport(page) {
  const size = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth <= innerWidth + 1,
    vertical: document.documentElement.scrollHeight <= innerHeight + 1,
  }));
  assert.deepEqual(size, { horizontal: true, vertical: true });
}

async function playController(page, getView) {
  const { card, variant, index } = getView().scene;
  const zone = page.locator('.snack-control');
  const pad = zone.getByRole('button').first();
  await pad.waitFor({ state: 'visible' });
  async function reach(ready) {
    await waitFor(() => {
      const scene = getView().scene;
      return scene.index === index && scene.phase === 'play' && ready(scene.elapsed - PREVIEW_MS);
    }, CARDS[card].id + ' cue');
  }
  switch (card) {
    case 0:
    case 1:
    case 4: {
      const count = { 0: 7, 1: 16, 4: 6 }[card];
      for (let tap = 0; tap < count; tap++) {
        await pad.tap();
        await delay(145);
      }
      return;
    }
    case 2:
    case 3: {
      await waitFor(() => getView().scene.elapsed >= PREVIEW_MS + 200, 'enabled hold pad');
      const box = await pad.boundingBox();
      await reach(at => at >= 220);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      if (card === 2) await delay(3000);
      else await reach(at => at > 450 && Math.abs(greenPosition(at, variant) - 72) < 6);
      await page.mouse.up();
      return;
    }
    case 5: {
      const box = await pad.boundingBox();
      const x = box.x + box.width * (1 - PICTURE_ANGLE[variant] / 100) / 2;
      await reach(at => at >= 250);
      await page.mouse.move(x, box.y + box.height / 2);
      await page.mouse.down();
      await delay(550);
      await page.mouse.up();
      return;
    }
    case 6: {
      const box = await zone.locator('canvas').boundingBox();
      for (const [index, [x, y]] of TRACE.entries()) {
        await page.mouse.move(box.x + box.width * x / 100, box.y + box.height * y / 100, { steps: index ? 5 : 1 });
        if (!index) await page.mouse.down();
        await delay(170);
        // Leave a second sample inside the checkpoint after the slope.
        await page.mouse.move(box.x + box.width * x / 100 + 1, box.y + box.height * y / 100);
      }
      await page.mouse.up();
      return;
    }
    case 7: {
      const box = await pad.boundingBox();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + [0, 95, 0, -95][variant], y + [-95, 0, 95, 0][variant], { steps: 5 });
      await page.mouse.up();
      return;
    }
    case 8:
      await reach(at => at > 180 && (cheeseAngle(at, variant) >= 354 || cheeseAngle(at, variant) <= 4));
      // Trigger this narrow timing probe without waiting for Playwright's actionability frames.
      await pad.evaluate(button => button.click());
      return;
    case 9:
      await zone.getByRole('button', { name: String(3 + variant), exact: true }).tap();
      return;
    case 10:
      for (let index = 0; index < 5; index++) {
        await reach(at => !lalaLooks(at - 110, variant) && !lalaLooks(at + 180, variant));
        await pad.evaluate(button => button.click());
        await delay(100);
      }
      return;
    case 11:
      await zone.getByRole('button', { name: String(1 + variant), exact: true }).tap();
      return;
  }
}

test('Snack Stack runs on a 1920×1080 TV, two 390×844 phones and fourteen socket controllers', { timeout: 185_000 }, async t => {
  const fixture = await launchPartyHarness(t, { gameId: 'snack-stack', manual: false });
  const browser = await chromium.launch({ executablePath: process.env.SOFA_CHROMIUM_EXECUTABLE });
  t.after(() => browser.close());
  await mkdir(output, { recursive: true });
  const issues = [];
  async function page(options, name) {
    const context = await browser.newContext(options);
    if (name === 'TV') await context.addInitScript(watchMouseHeights);
    await context.addInitScript(() => {
      window.snackCsp = [];
      const animate = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => {
        if (callback.name !== 'drawFrame') return animate(callback);
        return animate(at => {
          const start = performance.now();
          callback(at);
          window.snackRenderTimes?.push(performance.now() - start);
        });
      };
      document.addEventListener('securitypolicyviolation', event => window.snackCsp.push(event.violatedDirective));
    });
    const tab = await context.newPage();
    tab.on('console', message => {
      if (message.type() === 'error') issues.push(name + ': ' + message.text());
    });
    tab.on('pageerror', error => issues.push(name + ': ' + error.message));
    tab.on('response', response => {
      if (response.status() >= 400) issues.push(name + ': ' + response.status() + ' ' + new URL(response.url()).pathname);
    });
    return tab;
  }

  const tv = await page({ viewport: { width: 1920, height: 1080 } }, 'TV');
  let view;
  let driver = () => {};
  tv.on('websocket', socket => {
    if (new URL(socket.url()).pathname !== '/api/realtime/party') return;
    socket.on('framereceived', ({ payload }) => {
      const { view: snapshot } = JSON.parse(payload);
      if (!snapshot) return;
      view = snapshot;
      driver(snapshot);
    });
  });
  await tv.goto(fixture.origin);
  await tv.getByRole('tab', { name: 'Party', exact: true }).click();
  await tv.locator('.game-card[data-game="snack-stack"]').click();
  await tv.getByRole('link', { name: 'Host on the TV' }).click();
  const code = await tv.locator('[data-party-code]').textContent();
  assert.match(code, /^[A-Z0-9]{6}$/);
  await tv.locator('[data-party-qr] svg').waitFor({ state: 'visible' });

  const names = ['Pepper', 'Juniper'];
  const phones = await Promise.all(names.map(name => page({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  }, name)));
  await phones[1].emulateMedia({ reducedMotion: 'reduce' });
  await Promise.all(phones.map(async (phone, look) => {
    await phone.goto(fixture.origin + '/?party=join&code=' + code);
    await phone.getByLabel('Your name').fill(names[look]);
    await phone.getByRole('radio').nth(look).check();
    await phone.getByRole('button', { name: 'Ready', exact: true }).tap();
    await phone.getByText('Ready for the TV').waitFor();
  }));
  const simulated = await Promise.all(Array.from({ length: 14 }, async (_, index) => {
    const name = ['Dumpling', 'Biscuit', 'Hazelnut', 'Waffle', 'Paprika', 'Plum', 'Turnip',
      'Chive', 'Crumpet', 'Pistachio', 'Sesame', 'Olive', 'Brioche', 'Clove'][index];
    const phone = await fixture.connect(await fixture.join(code, index + 2, name));
    phone.send({ type: 'ready', value: true });
    return phone;
  }));
  await tv.getByText('16 of 16 ready').waitFor();
  await checkViewport(tv);
  await tv.screenshot({ path: output + 'lobby.png' });
  await tv.getByRole('button', { name: 'Start', exact: true }).click();
  await tv.locator('.party-countdown').waitFor();
  await tv.screenshot({ path: output + 'countdown.png' });

  let driven;
  driver = snapshot => {
    if (snapshot.phase !== 'playing' || snapshot.scene.phase !== 'play') return;
    const key = snapshot.scene.index + '/' + snapshot.scene.elapsed;
    if (driven === key) return;
    driven = key;
    for (const [index, phone] of simulated.entries()) {
      for (const input of inputsForCard(snapshot.scene, index + 2)) {
        if (phone.view.phase === 'playing') phone.input(input);
      }
    }
  };
  await phones[0].locator('.snack-phone[data-active="true"]').waitFor();
  assert.equal(await tv.evaluate(() => window.mouseHeights.has(75)), true);
  const measure = () => tv.evaluate(() => new Promise(resolve => {
    const frames = [];
    let previous;
    window.snackRenderTimes = [];
    function sample(at) {
      if (previous !== undefined) frames.push(at - previous);
      previous = at;
      if (frames.length < 480) requestAnimationFrame(sample);
      else {
        resolve({ frames, render: window.snackRenderTimes });
        window.snackRenderTimes = null;
      }
    }
    requestAnimationFrame(sample);
  }));

  await phones[0].getByText(/12 tiny challenges/).waitFor();
  await tv.screenshot({ path: output + 'intro.png' });
  let timing;
  for (let index = 0; index < CARDS.length; index++) {
    if (index < 4) {
      await waitFor(() => view.scene.index === index && view.scene.phase === 'preview' && view.scene.elapsed >= 900, 'tutorial', 15_000);
      const id = CARDS[view.scene.card].id;
      assert.equal(await phones[0].locator('.snack-control').evaluate(node => node.inert), true);
      await Promise.all([tv.screenshot({ path: output + id + '-tv.png' }), phones[0].screenshot({ path: output + id + '-phone.png' })]);
      if (index === 0) await phones[1].screenshot({ path: output + 'tutorial-reduced.png' });
    }
    await waitFor(() => view.scene.index === index && view.scene.phase === 'play', 'challenge ' + (index + 1), 15_000);
    const purpose = CARDS[view.scene.card].instruction;
    for (const phone of phones) {
      const brief = phone.getByText(purpose, { exact: true });
      await brief.waitFor();
      assert.ok(await brief.evaluate(node => node.clientHeight <= 3 * parseFloat(getComputedStyle(node).lineHeight) + 1));
    }
    await Promise.all(phones.map(checkViewport));
    const plays = Promise.all(phones.map(phone => playController(phone, () => view)));
    if (index === 0) {
      await tv.locator('[data-party-canvas]').screenshot({ path: output + 'play-board.png' });
      await Promise.all([
        tv.screenshot({ path: output + 'mid-play-16.png' }),
        phones[0].screenshot({ path: output + 'phone-play.png' }),
      ]);
    }
    if (index === 1) {
      await phones[1].screenshot({ path: output + 'phone-trace.png' });
      await tv.emulateMedia({ reducedMotion: 'reduce' });
      await tv.screenshot({ path: output + 'reduced-motion.png' });
      await tv.emulateMedia({ reducedMotion: 'no-preference' });
    }
    if (index === 2) timing = measure();
    await tv.screenshot({ path: output + 'card-' + CARDS[view.scene.card].id + '.png' });
    await plays;
    if (view.scene.card === 0) {
      await phones[0].getByText('7 / 7 · Stop').waitFor();
      assert.equal(await phones[0].getByRole('button', { name: /Warm up/ }).isVisible(), true);
    }
    if ([2, 3, 8, 10].includes(view.scene.card)) {
      await waitFor(() => view.scene.index === index && view.scene.phase === 'score', 'timed card reveal');
      for (const name of names) {
        const id = view.roster.find(player => player.name === name).id;
        assert.ok(view.scene.players.find(player => player.id === id).gain >= 50 * view.scene.multiplier,
          name + ' hit the timing window for ' + purpose);
      }
    }
    if (index === 3) {
      await waitFor(() => view.scene.index === index && view.scene.phase === 'score', 'Lala bonus reveal');
      await phones[0].locator('.snack-phone[data-phase="score"]').waitFor();
      await delay(480);
      await Promise.all([
        tv.screenshot({ path: output + 'score.png' }),
        phones[0].screenshot({ path: output + 'phone-score.png' }),
      ]);
    }
  }

  await tv.getByRole('heading', { name: 'Podium' }).waitFor();
  assert.equal(view.results.length, 16);
  for (const name of names) {
    const id = view.roster.find(player => player.name === name).id;
    assert.ok(view.results.find(result => result.playerId === id).score >= 750, name + ' played the round');
  }
  await tv.screenshot({ path: output + 'podium.png' });
  await tv.getByRole('button', { name: /^Next / }).click();
  await waitFor(() => view.round === 2 && view.phase === 'playing' && view.scene.phase === 'preview', 'short repeat', 8000);
  assert.equal(view.scene.tutorialMs, 2000);
  await tv.screenshot({ path: output + 'short-repeat.png' });
  for (const tab of [tv, ...phones]) {
    assert.deepEqual(await tab.evaluate(() => window.snackCsp), []);
    await checkViewport(tab);
  }
  assert.deepEqual(issues, []);
  const samples = await timing;
  const result = {
    drawMs: percentiles(samples.render), frameIntervalMs: percentiles(samples.frames), frames: samples.frames.length,
  };
  await writeFile(output + 'frame-times.json', JSON.stringify(result, null, 2) + '\n');
  assert.ok(result.drawMs.p95 < 16.7);
  t.diagnostic(JSON.stringify(result));
});

for (const count of [2, 8]) {
  test(`Snack Stack fits ${count} seats in the full TV play area`, { timeout: 20_000 }, async t => {
    const fixture = await launchPartyHarness(t, { gameId: 'snack-stack' });
    const host = await fixture.create();
    const browser = await chromium.launch({ executablePath: process.env.SOFA_CHROMIUM_EXECUTABLE });
    t.after(() => browser.close());
    const names = ['Pepper', 'Juniper', 'Pistachio', 'Dumpling', 'Olive', 'Paprika', 'Biscuit', 'Sesame'];
    await Promise.all(names.slice(0, count).map(async (name, look) => {
      const phone = await fixture.connect(await fixture.join(host.code, look, name));
      phone.send({ type: 'ready', value: true });
    }));
    const tv = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await tv.addInitScript(watchMouseHeights);
    const code = host.code;
    // This separate context opens the existing room using the normal TV route.
    await tv.goto(fixture.origin + '/?shelf=1');
    await tv.evaluate(({ code, token }) => {
      sessionStorage.setItem('sofa-party:host:' + code, JSON.stringify({ code, token }));
    }, host);
    await tv.goto(fixture.origin + '/?party=host&code=' + code);
    const start = tv.getByRole('button', { name: 'Start', exact: true });
    for (let attempt = 0; attempt < 20 && !(await start.isEnabled()); attempt++) await fixture.advance();
    await start.click();
    // Let the browser consume snapshots between manual clock advances.
    for (let elapsed = 0; elapsed < 11_500; elapsed += 100) await fixture.advance(100);
    await tv.locator('[data-phase="playing"] canvas[data-party-canvas]').waitFor();
    await tv.waitForFunction(() => window.mouseHeights.size > 0);
    const heights = await tv.evaluate(() => [...window.mouseHeights]);
    assert.ok(heights.includes(count === 2 ? 150 : 90), heights.join(', '));
    await checkViewport(tv);
    await tv.screenshot({ path: output + `mid-play-${count}.png` });
    if (count === 2) {
      const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      await phone.goto(fixture.origin + '/?party=join&code=' + code);
      await phone.getByLabel('Your name').fill('Late guest');
      await phone.getByRole('radio').nth(2).check();
      await phone.getByRole('button', { name: 'Ready', exact: true }).tap();
      await phone.getByText('You’re in the next round').waitFor();
      const warmUp = phone.getByRole('button', { name: /Warm up/ });
      await warmUp.tap();
      assert.equal(await warmUp.textContent(), 'Warm up · 1 tap');
      await phone.screenshot({ path: output + 'phone-waiting.png' });
    }
  });
}
