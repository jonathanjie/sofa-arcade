import assert from 'node:assert/strict';

export const select = name => `[data-go3="${name}"]`;
export const SAFE = Object.freeze({ x: 0, y: 0, brake: true });

export async function input(page) {
  return page.evaluate(() => window.go3Fixture.lastInput);
}
export async function status(page) {
  return page.evaluate(() => window.go3Fixture.lastStatus);
}
export async function waitInput(page, condition, message = 'expected control input') {
  try {
    await page.waitForFunction(condition, undefined, { timeout: 5000 });
  } catch (error) {
    throw new Error(`${message}: ${JSON.stringify(await input(page))}`, { cause: error });
  }
  return input(page);
}
export async function safe(page) {
  assert.deepEqual(await input(page), SAFE, 'a safe boundary must latch neutral + Brake');
}
export async function chooseTouch(page) {
  await page.locator(select('touch-mode')).click();
  await page.waitForFunction(() => document.querySelector('[data-go3="phone"]').dataset.mode === 'touch');
  await safe(page);
}
export async function beginPlay(page) {
  const phase = await page.evaluate(() => window.go3Fixture.view.phase);
  if (!['waiting', 'paused', 'interlude'].includes(phase)) {
    await page.evaluate(() => window.go3Fixture.setPhase('paused'));
  }
  await page.locator(select('ready')).click();
  await page.waitForFunction(() => {
    const fixture = window.go3Fixture;
    const player = document.querySelector('[data-go3="phone"]').dataset.player;
    return fixture.view.ready[player] || fixture.view.phase === 'countdown';
  });
  await page.evaluate(() => window.go3Fixture.peerReady());
  await page.waitForFunction(() => window.go3Fixture.view.phase === 'countdown');
  await safe(page);
  await page.evaluate(() => window.go3Fixture.setPhase('playing'));
  await page.waitForFunction(() => document.querySelector('[data-go3="phone"]').dataset.controlling === 'true');
}
export async function enableTilt(page, { beta = 35, gamma = 0, noise = .4 } = {}) {
  await page.locator(select('enable-tilt')).click();
  await page.waitForFunction(() => window.go3Fixture.lastStatus?.state === 'calibrating');
  await page.evaluate(values => window.go3Fixture.stableSamples(values), { beta, gamma, noise });
  await page.waitForFunction(() => window.go3Fixture.lastStatus?.calibrated === true);
  await safe(page);
}
export async function bounds(page, name) {
  const box = await page.locator(select(name)).boundingBox();
  assert.ok(box, `${name} has rendered bounds`);
  return box;
}
export async function mouseSteer(page, x, y) {
  await page.locator(select('joystick')).scrollIntoViewIfNeeded();
  const box = await bounds(page, 'joystick');
  const radius = Math.min(box.width, box.height) * .34;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + radius * x, box.y + box.height / 2 + radius * y, { steps: 4 });
}
export async function touchController(page) {
  const session = await page.context().newCDPSession(page);
  const points = new Map();
  const send = type => session.send('Input.dispatchTouchEvent', { type, touchPoints: [...points.values()] });
  const point = (id, x, y) => ({ id, x, y, radiusX: 9, radiusY: 9, force: 1 });
  return {
    async down(id, x, y) { points.set(id, point(id, x, y)); await send('touchStart'); },
    async move(id, x, y) { points.set(id, point(id, x, y)); await send('touchMove'); },
    async up(id) { points.delete(id); await send('touchEnd'); },
    async cancel() { points.clear(); await send('touchCancel'); },
    async close() {
      if (points.size) { points.clear(); await send('touchCancel'); }
      await session.detach();
    },
  };
}
export async function assertLayout(page, { active = false, allTargets = true } = {}) {
  const layout = await page.evaluate(() => {
    const phone = document.querySelector('[data-go3="phone"]');
    const visible = element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && !element.closest('[hidden]') && getComputedStyle(element).visibility !== 'hidden';
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      width: document.documentElement.scrollWidth,
      targets: [...phone.querySelectorAll('button, [tabindex="0"]')].filter(visible).map(element => {
        const rect = element.getBoundingClientRect();
        return { name: element.dataset.go3, width: rect.width, height: rect.height, label: element.getAttribute('aria-label') || element.textContent.trim() };
      }),
      safeArea: {
        top: getComputedStyle(phone.querySelector('.go3-shell')).paddingTop,
        bottom: getComputedStyle(phone.querySelector('.go3-shell')).paddingBottom,
      },
    };
  });
  assert.ok(layout.width <= layout.viewport.width + 1, `no horizontal scrolling: ${JSON.stringify(layout)}`);
  if (allTargets) {
    for (const target of layout.targets) {
      assert.ok(target.width >= 47.9 && target.height >= 47.9, `${target.name} target must be at least 48 × 48: ${JSON.stringify(target)}`);
      assert.ok(target.label.length, `${target.name} has an accessible label`);
    }
  }
  assert.ok(parseFloat(layout.safeArea.top) >= 12 && parseFloat(layout.safeArea.bottom) >= 18, 'phone retains safe-area fallback spacing');
  if (active) {
    await page.evaluate(() => scrollTo(0, 0));
    const viewport = page.viewportSize();
    for (const name of ['joystick', 'brake', 'pause', 'recenter', 'help']) {
      const target = page.locator(select(name));
      const box = await bounds(page, name);
      assert.ok(box.y >= -1 && box.y + box.height <= viewport.height + 1,
        `${name} is visible with all live controls (no play-time scrolling): ${JSON.stringify({ box, viewport })}`);
    }
  }
  return layout;
}
export async function checkRecordedInput(page) {
  const records = await page.evaluate(() => ({ inputs: window.go3Fixture.inputs, commands: window.go3Fixture.commands, statuses: window.go3Fixture.statuses }));
  for (const value of records.inputs) {
    assert.deepEqual(Object.keys(value).sort(), ['brake', 'x', 'y']);
    assert.ok(Number.isFinite(value.x) && Number.isFinite(value.y), 'all emitted coordinates are finite');
    assert.ok(Math.abs(value.x) <= 1 && Math.abs(value.y) <= 1 && Math.hypot(value.x, value.y) <= 1.00015, 'all emitted coordinates are normalized');
    assert.equal(typeof value.brake, 'boolean');
  }
  for (const command of records.commands) {
    assert.ok(['pause', 'ready'].includes(command.kind), 'phone sends only allowed discrete commands');
    assert.equal(typeof command.id, 'string');
    assert.ok(command.id.length <= 128);
    if (command.kind === 'pause') assert.ok(['requested', 'help', 'recenter'].includes(command.payload.reason));
    if (command.kind === 'ready') assert.equal(typeof command.payload.value, 'boolean');
  }
  const encoded = JSON.stringify(records);
  assert.ok(!/"(?:alpha|beta|gamma|token|bearer|password|score|seed)"\s*:/.test(encoded), 'records contain no raw readings, credentials, or client score authority');
  return records;
}
