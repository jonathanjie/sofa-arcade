import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchPartyHarness } from './harness.mjs';
import { BEATS, closestBeat } from '../../ui/party/games/tug-of-yarn/rhythm.mjs';

const output = fileURLToPath(new URL('../../work/tug-of-yarn/', import.meta.url));

async function waitFor(predicate, message, timeout = 5500) {
  const deadline = performance.now() + timeout;
  while (performance.now() < deadline) {
    if (predicate()) return;
    await sleep(20);
  }
  assert.ok(predicate(), message);
}

function percentiles(values) {
  assert.ok(values.length >= 100, `collected ${values.length} frames`);
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
  return { median: Number(median.toFixed(2)), p95: Number(p95.toFixed(2)) };
}

test('two touch browsers and fourteen harness phones pull yarn on a 1080p TV', { timeout: 60_000 }, async t => {
  const fixture = await launchPartyHarness(t, { gameId: 'tug-of-yarn', manual: false });
  const browser = await chromium.launch({ executablePath: process.env.SOFA_CHROMIUM_EXECUTABLE });
  t.after(() => browser.close());
  await mkdir(output, { recursive: true });
  const issues = [];

  async function page(options, name) {
    const context = await browser.newContext(options);
    await context.addInitScript(() => {
      window.tugCsp = [];
      window.tugAudio = 0;
      const audio = window.AudioContext?.prototype;
      if (audio) {
        const createOscillator = audio.createOscillator;
        audio.createOscillator = function () {
          window.tugAudio++;
          return createOscillator.call(this);
        };
      }
      const requestFrame = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => {
        if (callback.name !== 'drawFrame') return requestFrame(callback);
        return requestFrame(at => {
          const start = performance.now();
          callback(at);
          window.tugRenderTimes?.push(performance.now() - start);
        });
      };
      document.addEventListener('securitypolicyviolation', event => window.tugCsp.push(event.violatedDirective));
    });
    const tab = await context.newPage();
    tab.on('console', message => { if (message.type() === 'error') issues.push(`${name}: ${message.text()}`); });
    tab.on('pageerror', error => issues.push(`${name}: ${error.message}`));
    tab.on('response', response => {
      if (response.status() === 404) issues.push(`${name}: 404 ${new URL(response.url()).pathname}`);
    });
    return tab;
  }

  const tv = await page({ viewport: { width: 1920, height: 1080 } }, 'TV');
  let view;
  let arrivedAt;
  const hostDelay = monitorEventLoopDelay({ resolution: 20 });
  hostDelay.enable();
  t.after(() => hostDelay.disable());
  tv.on('websocket', socket => {
    if (!socket.url().endsWith('/api/realtime/party')) return;
    socket.on('framereceived', ({ payload }) => {
      const packet = JSON.parse(String(payload));
      if (!packet.view) return;
      if (packet.view.notice === 'host_stall' && view?.notice !== 'host_stall') {
        t.diagnostic(`Host scheduler stalled, max test-process delay: ${Math.round(hostDelay.max / 1e6)} ms`);
        issues.push('TV: host_stall');
      }
      view = packet.view;
      arrivedAt = performance.now();
    });
  });
  await tv.goto(fixture.origin);
  await tv.getByRole('button', { name: /Tug of Yarn/ }).click();
  await tv.getByRole('link', { name: 'Host on the TV' }).click();
  await tv.getByRole('button', { name: 'Start', exact: true }).waitFor();
  const code = await tv.locator('[data-party-code]').textContent();
  await tv.locator('[data-party-qr] svg').waitFor();

  const names = ['Pepper', 'Juniper', 'Biscuit', 'Clove', 'Fig', 'Pudding', 'Chestnut', 'Clover',
    'Sesame', 'Mochi', 'Maple', 'Pistachio', 'Marzipan', 'Oat', 'Miso', 'Thimble'];
  const phones = await Promise.all(names.slice(0, 2).map((name, index) => page({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    reducedMotion: index ? 'reduce' : 'no-preference',
  }, name)));
  await Promise.all(phones.map(async (phone, look) => {
    await phone.goto(`${fixture.origin}/?party=join&code=${code}`);
    await phone.getByLabel('Your name').fill(names[look]);
    await phone.getByRole('radio').nth(look).check();
    await phone.getByRole('button', { name: 'Ready', exact: true }).tap();
    await phone.getByText('Ready for the TV').waitFor();
  }));
  const harness = await Promise.all(names.slice(2).map(async (name, index) => {
    const phone = await fixture.connect(await fixture.join(code, index + 2, name));
    phone.send({ type: 'ready', value: true });
    return phone;
  }));
  await tv.getByText('16 of 16 ready').waitFor();
  await tv.screenshot({ path: output + 'lobby.png' });
  await tv.getByRole('button', { name: 'Start', exact: true }).click();
  await tv.locator('.party-countdown').waitFor();
  await tv.screenshot({ path: output + 'countdown.png' });
  await waitFor(() => view.phase === 'playing', 'TV entered play');
  assert.equal(view.roster.length, 16);

  const submitted = new Map();
  const driver = setInterval(() => {
    const scene = view.scene;
    if (view.phase !== 'playing' || scene.breakUntil !== null) return;
    const elapsed = scene.t + Math.min(48, performance.now() - arrivedAt);
    const beat = BEATS[closestBeat(elapsed - scene.heatStart)];
    const at = scene.heatStart + beat;
    if (Math.abs(elapsed - at) > 48) return;
    for (const phone of harness) {
      if (phone.view.phase !== 'playing' || phone.view.state.b === 1 || submitted.get(phone.playerId) === at) continue;
      phone.input({ kind: 'tap', at });
      submitted.set(phone.playerId, at);
    }
  }, 25);

  try {
    await waitFor(() => view.scene.beat >= 1, 'two beats scored');
    await tv.screenshot({ path: output + 'mid-play.png' });
    // Touchscreen events pass through the real browser pointer path on both phones.
    const firstHits = new Set();
    const onHit = setInterval(() => view.scene.hits.forEach(id => firstHits.add(id)), 20);
    try {
      await Promise.all(phones.map(async (phone, index) => {
        const pad = phone.getByRole('button', { name: 'Tap on the beat' });
        const box = await pad.boundingBox();
        assert.ok(box.height >= 540, `tap pad height: ${box.height}`);
        await phone.waitForFunction(() => document.querySelector('[data-tug-pad]')?.dataset.window === 'perfect');
        await phone.touchscreen.tap(Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2));
        await phone.locator('[data-grade="Perfect"], [data-grade="Good"]').waitFor({ timeout: 1500 });
        assert.equal(await phone.locator('.tug-ring').evaluate(ring => ring.getAnimations().length > 0), index === 0);
        await phone.screenshot({ path: output + `phone-${index + 1}.png` });
      }));
      const ids = view.roster.filter(player => names.slice(0, 2).includes(player.name)).map(player => player.id);
      await waitFor(() => ids.every(id => firstHits.has(id)), 'both phone taps counted on the TV', 1800);
    } finally {
      clearInterval(onHit);
    }

    const measured = await tv.evaluate(() => new Promise(resolve => {
      const cadence = [];
      let previous;
      window.tugRenderTimes = [];
      function frame(at) {
        if (previous !== undefined) cadence.push(at - previous);
        previous = at;
        if (cadence.length < 180) requestAnimationFrame(frame);
        else {
          resolve({ cadence, renderer: window.tugRenderTimes });
          window.tugRenderTimes = null;
        }
      }
      requestAnimationFrame(frame);
    }));
    const metrics = {
      renderMs: percentiles(measured.renderer), cadenceMs: percentiles(measured.cadence),
      frames: measured.cadence.length, intervalsOver25Ms: measured.cadence.filter(interval => interval > 25).length,
    };
    await writeFile(output + 'frame-times.json', JSON.stringify(metrics, null, 2) + '\n');
    t.diagnostic(JSON.stringify(metrics));
    assert.ok(metrics.renderMs.p95 < 16.7, 'TV render p95 fits one frame');

    await waitFor(() => view.scene?.breakUntil != null || view.notice === 'host_stall', 'first heat ended with a score');
    assert.notEqual(view.notice, 'host_stall', 'the shared host stopped the round after a scheduler gap');
    assert.deepEqual(view.scene.wins, [1, 0]);
    await tv.screenshot({ path: output + 'heat-score.png' });
    await tv.getByText('Settings', { exact: true }).click();
    await tv.getByLabel('Reduce motion').check();
    assert.ok(await tv.getByLabel('Reduce motion').isChecked());
    await tv.getByText('Settings', { exact: true }).click();
    await tv.getByRole('heading', { name: 'Podium' }).waitFor({ timeout: 23_000 });
    assert.deepEqual(view.scene.wins, [2, 0]);
    assert.equal(view.results.filter(result => result.place === 1).length, 8);
    await tv.screenshot({ path: output + 'podium.png' });
  } finally {
    clearInterval(driver);
  }

  assert.ok(await tv.evaluate(() => window.tugAudio > 0));
  for (const phone of phones) assert.equal(await phone.evaluate(() => window.tugAudio), 0);
  for (const tab of [tv, ...phones]) {
    assert.deepEqual(await tab.evaluate(() => window.tugCsp), []);
    assert.ok(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(await tab.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1));
  }
  assert.deepEqual(issues, []);
});
