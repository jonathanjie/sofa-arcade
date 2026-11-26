import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchPartyHarness } from './harness.mjs';
import { beatsFor, closestBeat } from '../../ui/party/games/tug-of-yarn/rhythm.mjs';

const output = fileURLToPath(new URL('../../work/tug-of-yarn/review/', import.meta.url));

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

  async function page(options, name, pongDelay = 0) {
    const context = await browser.newContext(options);
    await context.addInitScript(delay => {
      window.tugClockSamples = [];
      const sentAt = new Map();
      const send = WebSocket.prototype.send;
      WebSocket.prototype.send = function (body) {
        if (this.url.endsWith('/api/realtime/party') && typeof body === 'string') {
          const packet = JSON.parse(body);
          if (packet.type === 'clock-ping') sentAt.set(packet.id, performance.now());
        }
        return send.call(this, body);
      };
      const addListener = WebSocket.prototype.addEventListener;
      WebSocket.prototype.addEventListener = function (type, listener, options) {
        if (type !== 'message' || !this.url.endsWith('/api/realtime/party')) return addListener.call(this, type, listener, options);
        return addListener.call(this, type, event => {
          const packet = JSON.parse(event.data);
          if (packet.type !== 'clock-pong') { listener(event); return; }
          const arrivedAt = performance.now();
          const sent = sentAt.get(packet.id);
          const deliver = () => {
            window.tugClockSamples.push({ trip: performance.now() - sent, offsetError: (arrivedAt - performance.now()) / 2 });
            listener(event);
          };
          if (delay) setTimeout(deliver, delay);
          else deliver();
        }, options);
      };
      const drawImage = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (sprite, ...args) {
        if (this.canvas.hasAttribute('data-party-canvas') && sprite.width === 22 && sprite.height === 21) {
          window.tugSprites.push(args[3] * 20 / 21);
        }
        return drawImage.call(this, sprite, ...args);
      };
      window.tugSprites = [];
      window.tugSpriteFrame = [];
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
          window.tugSprites.length = 0;
          callback(at);
          window.tugSpriteFrame = [...window.tugSprites];
          window.tugRenderTimes?.push(performance.now() - start);
        });
      };
      document.addEventListener('securitypolicyviolation', event => window.tugCsp.push(event.violatedDirective));
    }, pongDelay);
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
  await tv.getByRole('tab', { name: 'Party', exact: true }).click();
  await tv.locator('.game-card[data-game="tug-of-yarn"]').click();
  await tv.getByRole('link', { name: 'Host on the TV' }).click();
  await tv.getByRole('button', { name: 'Start', exact: true }).waitFor();
  const code = await tv.locator('[data-party-code]').textContent();
  await tv.locator('[data-party-qr] svg').waitFor();

  const names = ['Pepper', 'Juniper', 'Biscuit', 'Clove', 'Fig', 'Pudding', 'Chestnut', 'Clover',
    'Sesame', 'Mochi', 'Maple', 'Pistachio', 'Marzipan', 'Oat', 'Miso', 'Thimble'];
  const phones = await Promise.all(names.slice(0, 2).map((name, index) => page({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    reducedMotion: index ? 'reduce' : 'no-preference',
  }, name, index ? 110 : 0)));
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
    const beats = beatsFor(scene.level);
    const beat = beats[closestBeat(elapsed - scene.heatStart, beats)];
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
    const firstScoredBeat = view.scene.beat;
    await waitFor(() => view.scene.beat > firstScoredBeat && view.scene.unity[0] > 0, 'a synchronized pull is visible');
    await tv.screenshot({ path: output + 'mid-play-16.png' });
    const spriteHeights = await tv.evaluate(() => window.tugSpriteFrame);
    assert.equal(spriteHeights.length, 16);
    assert.ok(Math.min(...spriteHeights) >= 64);
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

    const clockErrors = await Promise.all(phones.map(phone => phone.evaluate(() =>
      [...window.tugClockSamples].sort((a, b) => a.trip - b.trip)[0].offsetError)));
    assert.ok(Math.abs(clockErrors[0]) < 5 && clockErrors[1] <= -54 && clockErrors[1] >= -60);
    await writeFile(output + 'clock-offset.json', JSON.stringify({ clockErrors }, null, 2) + '\n');
    t.diagnostic(`Browser clock offset added by simulated asymmetry: ${clockErrors[1].toFixed(1)} ms`);

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
      frames: measured.cadence.length, minimumOpaqueMouseHeightCssPx: Math.min(...spriteHeights), intervalsOver25Ms: measured.cadence.filter(interval => interval > 25).length,
    };
    await writeFile(output + 'frame-times.json', JSON.stringify(metrics, null, 2) + '\n');
    t.diagnostic(JSON.stringify(metrics));
    assert.ok(metrics.renderMs.p95 < 16.7, 'TV render p95 fits one frame');

    await waitFor(() => view.scene?.breakUntil != null || view.notice === 'host_stall', 'first heat ended with a score');
    assert.notEqual(view.notice, 'host_stall', 'the shared host stopped the round after a scheduler gap');
    assert.deepEqual(view.scene.wins, [1, 0]);
    await tv.screenshot({ path: output + 'line-cross.png' });
    await tv.getByText('Menu', { exact: true }).click();
    await tv.getByLabel('Reduce motion').check();
    assert.ok(await tv.getByLabel('Reduce motion').isChecked());
    await tv.getByText('Menu', { exact: true }).click();
    await tv.getByRole('heading', { name: 'Podium' }).waitFor({ timeout: 23_000 });
    assert.deepEqual(view.scene.wins, [2, 0]);
    assert.equal(view.results.filter(result => result.place === 1).length, 8);
    await tv.getByText('Mint wins · 2–0', { exact: true }).waitFor();
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

test('a duel has larger characters and gives a late guest immediate practice', { timeout: 20_000 }, async t => {
  const fixture = await launchPartyHarness(t, { gameId: 'tug-of-yarn', manual: false });
  const browser = await chromium.launch({ executablePath: process.env.SOFA_CHROMIUM_EXECUTABLE });
  t.after(() => browser.close());
  await mkdir(output, { recursive: true });
  const tv = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await tv.addInitScript(() => {
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (body) {
      if (this.url.endsWith('/api/realtime/party')) window.tugTvSocket = this;
      return send.call(this, body);
    };
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (sprite, ...args) {
      if (this.canvas.hasAttribute('data-party-canvas')) {
        if (sprite.width === 1920) window.tugDuelSprites = [];
        if (sprite.width === 22 && sprite.height === 21) window.tugDuelSprites.push(args[3] * 20 / 21);
      }
      return drawImage.call(this, sprite, ...args);
    };
  });
  let view;
  const issues = [];
  tv.on('pageerror', error => issues.push(error.message));
  tv.on('websocket', socket => {
    if (socket.url().endsWith('/api/realtime/party')) socket.on('framereceived', ({ payload }) => {
      const packet = JSON.parse(payload);
      if (packet.view) view = packet.view;
    });
  });
  await tv.goto(fixture.origin + '/?party=host&game=tug-of-yarn');
  const code = await tv.locator('[data-party-code]').textContent();
  assert.ok(code);
  const contenders = await Promise.all(['Biscuit', 'Clove'].map(async (name, look) => {
    const phone = await fixture.connect(await fixture.join(code, look, name));
    phone.send({ type: 'ready', value: true });
    return phone;
  }));
  await tv.getByText('2 of 16 ready').waitFor();
  await tv.getByRole('button', { name: 'Start', exact: true }).click();
  await waitFor(() => view.phase === 'playing', 'duel started');
  const firstBeat = beatsFor(0)[0];
  await waitFor(() => view.scene.t >= firstBeat, 'first beat approaches');
  const mint = view.scene.teams.find(entry => entry.team === 0).playerId;
  contenders.find(phone => phone.playerId === mint).input({ kind: 'tap', at: firstBeat });
  await waitFor(() => view.scene.unity[0] === 1, 'Mint pulls');
  await tv.waitForFunction(() => window.tugDuelSprites?.length === 2);
  assert.equal(view.scene.teams.length, 2);
  const spriteHeights = await tv.evaluate(() => window.tugDuelSprites);
  assert.equal(spriteHeights.length, 2);
  assert.ok(spriteHeights.every(height => height >= 180), spriteHeights);
  await tv.screenshot({ path: output + 'mid-play-2.png' });

  const late = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  late.on('pageerror', error => issues.push(error.message));
  const sent = [];
  late.on('websocket', socket => {
    if (socket.url().endsWith('/api/realtime/party')) socket.on('framesent', ({ payload }) => sent.push(JSON.parse(payload).type));
  });
  await late.goto(`${fixture.origin}/?party=join&code=${code}`);
  await late.getByLabel('Your name').fill('Marzipan');
  await late.getByRole('button', { name: 'Ready', exact: true }).tap();
  await late.getByText('You’re in the next match').waitFor({ timeout: 3000 });
  await tv.getByText('Next match · Marzipan', { exact: true }).waitFor({ timeout: 3000 });
  await late.waitForFunction(() => document.querySelector('[data-tug-pad]')?.dataset.window === 'perfect');
  const pad = late.getByRole('button', { name: 'Tap on the beat' });
  const box = await pad.boundingBox();
  await late.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await late.locator('[data-grade="Perfect"], [data-grade="Good"]').waitFor({ timeout: 1500 });
  assert.ok(!sent.includes('input'));
  await late.screenshot({ path: output + 'phone-waiting.png' });
  await tv.screenshot({ path: output + 'tv-waiting.png' });

  const playerId = contenders[0].playerId;
  await tv.evaluate(playerId => window.tugTvSocket.send(JSON.stringify({ type: 'kick', playerId })), playerId);
  assert.equal(await contenders[0].disconnected, 4403);
  await waitFor(() => view.scene.teams.length === 1, 'kicked player leaves current heat');
  await tv.waitForFunction(() => window.tugDuelSprites?.length === 1, null, { timeout: 1000 });
  assert.equal(view.roster.length, 2);
  assert.deepEqual(issues, []);
});
