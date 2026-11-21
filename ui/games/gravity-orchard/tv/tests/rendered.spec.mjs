import { test, expect } from '@playwright/test';
import { openFixture, action, tv, noOverflow, visibleActionsFit, capture, renderTurn } from './browser-helpers.mjs';

for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
  test(`all lifecycle, dense fruit and hazards fit ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const errors = await openFixture(page, 'waiting');
    for (const scene of ['waiting', 'countdown', 'playing', 'dense', 'full-baskets', 'gate-forecast', 'gate-deferred', 'gate-closed', 'gust-forecast', 'gust-active', 'paused', 'reconnect', 'interlude', 'timeout', 'finished', 'perfect', 'practice']) {
      await page.evaluate(scene => window.fixture.show(scene), scene); await renderTurn(page);
      const expected = await page.evaluate(() => window.fixture.view());
      await expect(tv(page)).toHaveAttribute('data-go-phase', expected.phase);
      await expect(page.locator('[data-go-scene]')).toBeVisible();
      await expect(page.locator('[data-basket]')).toHaveCount(4);
      await expect(page.locator('[data-fruit-id]')).toHaveCount(expected.fruits.length);
      await noOverflow(page); await visibleActionsFit(page);
      await capture(page, `tv-${viewport.width}-${scene}`, testInfo);
    }
    expect(errors).toEqual([]);
  });
}

test('board dominates ordinary play; active and next-two recipes stay compact without instructions', async ({ page }) => {
  await openFixture(page);
  const board = await page.locator('[data-go-scene]').boundingBox();
  expect(board.height).toBeGreaterThan(480); expect(board.width).toBeGreaterThan(1100);
  await expect(page.locator('[data-go-orders]')).toBeVisible(); await expect(page.locator('[data-go-clock]')).toContainText('1:21');
  await expect(tv(page)).not.toContainText(/certificate|WebSocket|schema|Use the arrow buttons|calibrat/i);
  await expect(action(page, 'help')).toHaveAccessibleName(/help/i);
  await expect(action(page, 'pause')).toHaveAccessibleName(/pause/i);
  for (const type of ['apple', 'plum', 'pear', 'starfruit']) {
    const basket = page.locator(`[data-basket="${type}"]`);
    await expect(basket.locator('title').first()).toContainText(new RegExp(type, 'i'));
  }
});

test('authoritative clock, scores, captures and results never advance because of display time', async ({ page }) => {
  await openFixture(page);
  const before = await page.evaluate(() => window.fixture.view());
  const clock = await page.locator('[data-go-clock]').textContent();
  await page.evaluate(() => window.fixture.advance(90_000)); await renderTurn(page);
  expect(await page.evaluate(() => window.fixture.view())).toEqual(before);
  await expect(page.locator('[data-go-clock]')).toHaveText(clock);
  await expect(page.locator('[data-fruit-id]')).toHaveCount(before.fruits.length);
  await expect(tv(page)).toHaveAttribute('data-go-stale', 'true');
  for (const player of ['jon', 'lydia']) {
    await expect(page.locator(`[data-player-presence="${player}"]`)).toContainText('View held');
    await expect(page.locator(`[data-player-presence="${player}"]`)).not.toContainText('Steering');
  }
});

test('SVG world coordinates and injected geometry remain aligned through scaling and resize', async ({ page }) => {
  await openFixture(page, 'gate-deferred');
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport); await renderTurn(page);
    const alignment = await page.evaluate(() => {
      const svg = document.querySelector('[data-go-scene]');
      return window.fixture.view().fruits.map(fruit => {
        const el = document.querySelector(`[data-fruit-id="${fruit.id}"]`);
        const point = svg.createSVGPoint(); point.x = fruit.x; point.y = fruit.y;
        const expected = point.matrixTransform(svg.getScreenCTM());
        const actual = el.getScreenCTM();
        return { expectedX: expected.x, expectedY: expected.y, actualX: actual.e, actualY: actual.f, dataX: Number(el.dataset.x), dataY: Number(el.dataset.y), x: fruit.x, y: fruit.y };
      });
    });
    for (const fruit of alignment) {
      expect(fruit.dataX).toBe(fruit.x); expect(fruit.dataY).toBe(fruit.y);
      expect(fruit.actualX).toBeCloseTo(fruit.expectedX, 3); expect(fruit.actualY).toBeCloseTo(fruit.expectedY, 3);
    }
    await expect(page.locator('[data-gate="bridge-gate"]')).toHaveAttribute('data-closure-deferred', 'true');
    const caption = await page.locator('[data-gate-caption="bridge-gate"]').boundingBox();
    const bridge = await page.evaluate(() => {
      const svg = document.querySelector('[data-go-scene]');
      const bridge = window.fixture.geometry.getLevel(window.fixture.view().levelId).bridge;
      const left = new DOMPoint(bridge.x, bridge.y).matrixTransform(svg.getScreenCTM());
      const right = new DOMPoint(bridge.x + bridge.width, bridge.y).matrixTransform(svg.getScreenCTM());
      return { left: left.x, right: right.x };
    });
    expect(caption.x, 'Gate caption stays in bridge gap').toBeGreaterThanOrEqual(bridge.left - 1);
    expect(caption.x + caption.width, 'Gate caption cannot cover adjacent compost').toBeLessThanOrEqual(bridge.right + 1);
  }
});

test('rendered movement interpolates known positions and freezes at the last authoritative endpoint', async ({ page }) => {
  await openFixture(page);
  const fruit = page.locator('[data-fruit-id="apple-1"]');
  await expect(fruit).toHaveAttribute('data-x', '210');
  await page.evaluate(() => {
    const next = window.fixture.view();
    window.fixture.advance(100); next.tick += 6; next.fruits[0].x = 230;
    window.fixture.update(next);
  });
  await renderTurn(page);
  const first = Number(await fruit.getAttribute('data-x'));
  expect(first).toBeGreaterThan(210); expect(first).toBeLessThan(230);
  await page.evaluate(() => window.fixture.advance(50)); await renderTurn(page);
  const middle = Number(await fruit.getAttribute('data-x'));
  expect(middle).toBeGreaterThan(first); expect(middle).toBeLessThan(230);
  await page.evaluate(() => window.fixture.advance(5000)); await renderTurn(page);
  await expect(fruit).toHaveAttribute('data-x', '230');
  await expect(tv(page)).toHaveAttribute('data-go-stale', 'true');
  await expect(page.locator('[data-go-clock]')).toHaveText('1:21');
});

test('missing and malformed data retain a safe waiting surface and never draw NaN', async ({ page }) => {
  const errors = await openFixture(page, 'missing');
  await expect(tv(page)).toContainText(/waiting|connecting|garden/i);
  for (const value of [null, {}, { gameId: 'gravity-orchard', schemaVersion: 1, fruits: [{ x: 'bad' }] }]) await page.evaluate(value => window.fixture.update(value), value);
  await expect(page.locator('[data-fruit-id]')).toHaveCount(0);
  await page.evaluate(() => window.fixture.show('playing'));
  const count = await page.evaluate(() => window.fixture.view().fruits.length);
  await expect(page.locator('[data-fruit-id]')).toHaveCount(count);
  await page.evaluate(() => { const view = window.fixture.view(); view.fruits[0].x = Infinity; window.fixture.update(view); });
  await expect(page.locator('[data-fruit-id]')).toHaveCount(count);
  expect(await tv(page).innerHTML()).not.toMatch(/NaN|Infinity/); expect(errors).toEqual([]);
});

test('connection presence is independent of projected physics and exposes lost/neutral controllers', async ({ page }) => {
  await openFixture(page); const before = await page.evaluate(() => window.fixture.view());
  await page.evaluate(() => window.fixture.setConnection({ state: 'connected', presence: { jon: { connected: true, inputFresh: true }, lydia: { connected: true, inputFresh: false } } }));
  await expect(tv(page)).toContainText(/Lydia/); await expect(tv(page)).toContainText(/steady|brak|neutral|waiting/i);
  expect(await page.evaluate(() => window.fixture.view())).toEqual(before);
  await page.evaluate(() => window.fixture.setConnection({ state: 'reconnecting', presence: { jon: { connected: true, inputFresh: true }, lydia: { connected: false, inputFresh: false } } }));
  await expect(page.locator('[data-go-status]')).toBeVisible();
  await expect(tv(page)).toContainText(/reconnect|connection|waiting/i);
  await expect(action(page, 'pause')).toBeDisabled();
});

test('same-seed, new-seed and completed-stage retry controls dispatch exact host commands only in legal phases', async ({ page }) => {
  await openFixture(page, 'finished');
  await page.evaluate(() => window.fixture.setAutoApply(false));
  for (const [name, expected] of [
    ['rematch-same', { kind: 'rematch', payload: { seedMode: 'same' } }],
    ['rematch-new', { kind: 'rematch', payload: { seedMode: 'new' } }],
    ['retry-stage', { kind: 'retry-stage', payload: {} }],
  ]) {
    await action(page, name).click();
    await expect.poll(() => page.evaluate(() => window.fixture.commands.at(-1))).toEqual(expected);
  }
  await expect(tv(page)).toHaveAttribute('data-go-phase', 'finished');
  await page.evaluate(() => window.fixture.show('paused'));
  await expect(action(page, 'retry-stage')).toHaveCount(0);
  await expect(action(page, 'rematch-same')).toBeVisible();
  await page.evaluate(() => window.fixture.show('interlude'));
  await expect(action(page, 'retry-stage')).toBeVisible(); await expect(action(page, 'rematch-same')).toHaveCount(0);
  await page.evaluate(() => window.fixture.show('playing'));
  await expect(action(page, 'retry-stage')).toHaveCount(0); await expect(action(page, 'rematch-new')).toHaveCount(0);
});

test('full three-stage ordinary and perfect snapshot journeys render and rematch into a new match', async ({ page }) => {
  await openFixture(page, 'waiting');
  for (const perfect of [true, false]) {
    const journey = await page.evaluate(perfect => window.fixture.makeJourney({ perfect, matchId: `browser-journey-${perfect}` }), perfect);
    for (const frame of journey) {
      await page.evaluate(frame => window.fixture.update(frame.view), frame); await renderTurn(page);
      await expect(tv(page)).toHaveAttribute('data-go-phase', frame.view.phase);
      await expect(page.locator('[data-fruit-id]')).toHaveCount(frame.view.fruits.length);
    }
    await expect(tv(page)).toContainText(perfect ? /Perfect Picnic/i : /9\s*\/\s*12/);
    await action(page, 'rematch-same').click();
    await expect(tv(page)).toHaveAttribute('data-go-phase', 'waiting');
    const current = await page.evaluate(() => window.fixture.view());
    expect(current.matchId).not.toBe(`browser-journey-${perfect}`);
    await page.evaluate(previous => window.fixture.update(previous), journey.at(-1).view);
    await expect(tv(page)).toHaveAttribute('data-go-phase', 'waiting');
  }
});

test('duplicate and delayed event rings cannot replay sound or revert phases', async ({ page }) => {
  await openFixture(page);
  await page.evaluate(() => { const view = window.fixture.view(); view.tick++; view.events = [{ id: 'sound-catch', kind: 'catch', tick: view.tick, entityId: 'apple-1', x: 145, y: 555 }]; window.fixture.update(view); });
  await expect.poll(() => page.evaluate(() => window.fixture.sounds.filter(x => x.name === 'catch').length)).toBe(1);
  await page.evaluate(() => { const view = window.fixture.view(); window.fixture.update(view); window.fixture.update(view); });
  expect(await page.evaluate(() => window.fixture.sounds.filter(x => x.name === 'catch').length)).toBe(1);
  const old = await page.evaluate(() => window.fixture.view());
  await action(page, 'pause').click(); await expect(tv(page)).toHaveAttribute('data-go-phase', 'paused');
  await page.evaluate(old => window.fixture.update(old), old);
  await expect(tv(page)).toHaveAttribute('data-go-phase', 'paused');
});

test('live reduced motion retains gust direction, shapes and the current snapshot', async ({ page }, testInfo) => {
  await openFixture(page, 'gust-forecast');
  const before = await page.evaluate(() => window.fixture.view());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(tv(page)).toHaveAttribute('data-reduced-motion', 'true');
  await expect(tv(page)).toContainText(/gust/i);
  await expect(page.locator('[data-fruit-id]')).toHaveCount(before.fruits.length);
  expect(await page.evaluate(() => window.fixture.view())).toEqual(before);
  await capture(page, 'tv-1280-reduced-motion', testInfo);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(tv(page)).toHaveAttribute('data-reduced-motion', 'false');
});

test('missing injected image assets fall back to legible diagnostic shapes', async ({ page }, testInfo) => {
  const errors = await openFixture(page, 'dense');
  await page.evaluate(() => window.fixture.remount({ assets: { schemaVersion: 1, gameId: 'gravity-orchard', assets: {
    'fruit.apple': { src: '/assets/does-not-exist.png', width: 64, height: 64, kind: 'image' },
    'jon.idle': { src: '/assets/missing-jon.png', width: 128, height: 128, kind: 'image' },
  }, characterStates: {} } }));
  await renderTurn(page);
  await expect(page.locator('[data-fruit-id]')).toHaveCount(8); await expect(page.locator('[data-basket]')).toHaveCount(4);
  await noOverflow(page); expect(errors).toEqual([]);
  await capture(page, 'tv-1280-missing-assets', testInfo);
});

test('loaded atlas poses keep their artwork visible while selecting a new frame', async ({ page }) => {
  await page.route('**/assets/go4-pose-atlas.svg', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><path fill="#36765c" d="M0 0h100v100H0z"/><path fill="#c36b4f" d="M100 0h100v100H100z"/><path fill="#e3b54a" d="M200 0h100v100H200z"/><path fill="#8074a1" d="M300 0h100v100H300z"/></svg>',
  }));
  await openFixture(page);
  await page.evaluate(() => {
    const states = ['idle', 'lean', 'brace', 'cheer'];
    const assets = Object.fromEntries(states.map((pose, index) => [pose, {
      src: '/assets/go4-pose-atlas.svg', width: 400, height: 100,
      frames: [{ x: index * 100, y: 0, width: 100, height: 100 }],
    }]));
    window.fixture.remount({ assets: { assets, characterStates: { jon: Object.fromEntries(states.map(pose => [pose, pose])) } }, reducedMotion: true });
    const view = window.fixture.view(); view.tick++; view.players.jon.input = { x: 0, y: 0, brake: false };
    window.fixture.update(view);
  });
  const actor = page.locator('[data-character="jon"]');
  await expect(actor).toHaveAttribute('data-pose', 'idle');
  await expect(actor.locator('[data-go-media-fallback]')).toHaveAttribute('visibility', 'hidden');
  await page.evaluate(() => {
    const actor = document.querySelector('[data-character="jon"]');
    const proof = window.__go4PoseProof = { image: actor.querySelector('image'), flashes: 0 };
    proof.observer = new MutationObserver(() => {
      if (actor.querySelector('[data-go-media-fallback]').getAttribute('visibility') !== 'hidden') proof.flashes++;
    });
    proof.observer.observe(actor, { attributes: true, childList: true, subtree: true });
  });
  for (const [pose, frameX] of [['lean', 100], ['brace', 200], ['idle', 0], ['cheer', 300]]) {
    await page.evaluate(pose => {
      window.fixture.advance(200);
      const view = window.fixture.view(); view.tick += 12;
      view.players.jon.input = { x: pose === 'lean' ? .7 : 0, y: 0, brake: pose === 'brace' };
      view.events = pose === 'cheer' ? [{ id: 'atlas-cheer', kind: 'order-complete', tick: view.tick }] : [];
      window.fixture.update(view);
    }, pose);
    await renderTurn(page);
    await expect(actor).toHaveAttribute('data-pose', pose);
    await expect(actor.locator('image').locator('..')).toHaveAttribute('viewBox', `${frameX} 0 100 100`);
    await expect(actor.locator('[data-go-media-fallback]')).toHaveAttribute('visibility', 'hidden');
  }
  expect(await page.evaluate(() => {
    const proof = window.__go4PoseProof; proof.observer.disconnect();
    return { sameDecodedImage: document.querySelector('[data-character="jon"] image') === proof.image, fallbackFlashes: proof.flashes };
  })).toEqual({ sameDecodedImage: true, fallbackFlashes: 0 });
});

test('simultaneous final order and stage use one completion caption without losing sound identities', async ({ page }) => {
  await openFixture(page);
  await page.evaluate(() => {
    const view = window.fixture.view(); view.tick++;
    view.events = [{ id: 'earlier-order', kind: 'order-complete', tick: view.tick }];
    window.fixture.update(view);
  });
  await renderTurn(page);
  await expect(page.locator('[data-effect-kind="order-complete"]')).toHaveCount(1);
  await page.evaluate(() => {
    window.fixture.advance(200);
    const previous = window.fixture.view();
    const view = window.fixture.makeFixture('interlude', { matchId: previous.matchId });
    view.runEpoch = previous.runEpoch;
    view.events = [
      { id: 'final-order', kind: 'order-complete', tick: view.tick },
      { id: 'final-stage', kind: 'stage-complete', tick: view.tick },
    ];
    window.fixture.update(view);
  });
  await renderTurn(page);
  await expect(page.locator('[data-effect-kind="order-complete"]')).toHaveCount(0);
  await expect(page.locator('[data-effect-kind="stage-complete"]')).toHaveCount(1);
  await expect(page.locator('[data-effect-id="final-stage"]')).toContainText('Stage complete');
  expect(await page.evaluate(() => window.fixture.sounds.filter(entry => entry.detail?.id).map(entry => ({ name: entry.name, id: entry.detail.id })))).toEqual([
    { name: 'order', id: 'earlier-order' }, { name: 'order', id: 'final-order' }, { name: 'finish', id: 'final-stage' },
  ]);
  await page.evaluate(() => { const view = window.fixture.view(); window.fixture.update(view); window.fixture.update(view); });
  await renderTurn(page);
  await expect(page.locator('[data-effect-kind="stage-complete"]')).toHaveCount(1);
  expect(await page.evaluate(() => window.fixture.sounds.filter(entry => entry.detail?.id).length)).toBe(3);
});

test('paused reconnect guidance stays in the dialog without covering character badges', async ({ page }, testInfo) => {
  await openFixture(page, 'paused');
  await page.evaluate(() => {
    const view = window.fixture.view(); view.pauseReason = 'recovery'; view.ready = { jon: false, lydia: false };
    window.fixture.setConnection({ state: 'connected', presence: { jon: { connected: false, inputFresh: false }, lydia: { connected: false, inputFresh: false } } });
    window.fixture.update(view);
  });
  for (const viewport of [{ width: 1024, height: 684 }, { width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    // Reserve the integrated shell's observed margins, including the smaller
    // native content area, while keeping this component fixture isolated.
    await page.evaluate(width => { document.body.style.padding = width === 1024 ? '58px 12px 36px' : '58px 12px 8px'; }, viewport.width);
    await renderTurn(page);
    await expect(page.locator('[data-go-panel]')).toBeVisible();
    await expect(page.locator('[data-go-panel]')).toContainText('Your saved garden is ready to continue.');
    await expect(page.locator('[data-go-status]')).toBeHidden();
    for (const id of ['jon', 'lydia']) {
      await expect(page.locator(`[data-ready-player="${id}"]`)).toContainText('Reconnect phone');
      await expect(page.locator(`[data-player-presence="${id}"]`)).toContainText('Reconnect');
    }
    await noOverflow(page); await visibleActionsFit(page);
    await capture(page, `tv-${viewport.width}-paused-reconnect`, testInfo);
  }
  await page.evaluate(() => window.fixture.setConnection({ state: 'reconnecting' }));
  await expect(page.locator('[data-go-status]')).toBeVisible();
  await expect(page.locator('[data-go-status]')).toContainText('Reconnecting');
});

test('dispose clears the scene and late command settlement cannot reopen it; remount creates one view', async ({ page }) => {
  await openFixture(page);
  await page.evaluate(() => { window.fixture.setAutoApply(false); window.fixture.holdNext(); });
  await action(page, 'pause').click();
  await page.evaluate(() => window.fixture.dispose());
  await expect(tv(page)).toHaveCount(0);
  await page.evaluate(() => { window.fixture.releaseNext(); window.fixture.update(window.fixture.makeFixture('playing')); });
  await renderTurn(page); await expect(tv(page)).toHaveCount(0);
  await page.evaluate(() => window.fixture.remount()); await expect(tv(page)).toHaveCount(1);
  await page.evaluate(() => window.fixture.dispose());
  expect(await page.locator('#fixture-root').innerHTML()).toBe('');
});

test('an exit gesture during a pending pause cannot linger and exit after a rejected command', async ({ page }) => {
  await openFixture(page);
  await page.evaluate(() => { window.fixture.holdNext(); window.fixture.rejectNext(); });
  await action(page, 'pause').click();
  await action(page, 'exit').click();
  expect(await page.evaluate(() => window.fixture.commands)).toEqual([{ kind: 'pause', payload: { reason: 'requested' } }]);
  await page.evaluate(() => window.fixture.releaseNext());
  await expect(page.locator('[data-go-message]')).toContainText(/could not be completed/i);
  await page.evaluate(() => {
    const view = window.fixture.view(); view.phase = 'paused'; view.pauseReason = 'recovery'; view.runEpoch++;
    window.fixture.update(view);
  });
  await renderTurn(page);
  expect(await page.evaluate(() => window.fixture.exits)).toEqual([]);
  await expect(tv(page)).toHaveAttribute('data-go-phase', 'paused');
});
