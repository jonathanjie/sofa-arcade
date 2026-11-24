import { test, expect } from '@playwright/test';
import { openFixture, tv, action, tutorialAction, noOverflow, visibleActionsFit, capture, renderTurn } from './browser-helpers.mjs';

async function textContrast(locator) {
  return locator.evaluate(element => {
    const style = getComputedStyle(element);
    const luminance = color => {
      const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    const foreground = luminance(style.color), background = luminance(style.backgroundColor);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
}

async function heldBrake(page) {
  const button = tutorialAction(page, 'brake');
  await button.hover();
  expect(await textContrast(button), 'Released Brake hover contrast').toBeGreaterThanOrEqual(4.5);
  await button.focus(); await page.keyboard.down('Space');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  expect(await textContrast(button), 'Held Brake hover contrast').toBeGreaterThanOrEqual(4.5);
  // Advance animation frames through the tutorial’s 300 ms hold threshold.
  await page.clock.runFor(352);
  await page.keyboard.up('Space');
  expect(await textContrast(button), 'Brake release preserves hover contrast').toBeGreaterThanOrEqual(4.5);
}

async function completeStep(page, step) {
  if (step === 0) await tutorialAction(page, 'recenter').click();
  if (step === 1) {
    await tutorialAction(page, 'steer').filter({ hasText: '→' }).click();
    await tutorialAction(page, 'select-lydia').click();
    await page.keyboard.press('ArrowDown');
  }
  if (step === 2) await heldBrake(page);
  if (step === 3) await tutorialAction(page, 'pass').click();
  if (step === 4) {
    await page.locator('[data-tutorial-action="catch"][data-fruit="apple"]').click();
    await expect(page.locator('[data-tutorial-feedback]')).toContainText(/bounced back/i);
    await expect(tutorialAction(page, 'next')).toBeDisabled();
    await page.locator('[data-tutorial-action="catch"][data-fruit="pear"]').click();
  }
  if (step === 5) {
    await tutorialAction(page, 'deliver').click();
    await expect(page.locator('[data-tutorial-readout]')).toContainText('1 apples buffered');
    await tutorialAction(page, 'deliver').click();
    await expect(page.locator('[data-tutorial-readout]')).toContainText('2 apples buffered');
    await tutorialAction(page, 'deliver').click();
    await expect(page.locator('[data-tutorial-readout]')).toContainText(/order filled/i);
  }
  if (step === 6) { await tutorialAction(page, 'forecast').click(); await heldBrake(page); }
  if (step === 7) {
    await expect(tutorialAction(page, 'ready-jon')).toBeDisabled();
    await tutorialAction(page, 'pause').click();
    await tutorialAction(page, 'ready-jon').click();
    await expect(tutorialAction(page, 'next')).toBeDisabled();
    await tutorialAction(page, 'ready-lydia').click();
  }
  await expect(tutorialAction(page, 'next')).toBeEnabled();
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
  test(`optional tutorial completes all eight private lessons at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    // Each of the eight lessons captures a rendered screenshot.
    test.setTimeout(240_000);
    await page.clock.install();
    await page.setViewportSize(viewport); await openFixture(page);
    const before = await page.evaluate(() => window.fixture.view());
    await action(page, 'help').click();
    await expect(page.locator('[data-go-tutorial]')).toBeVisible();
    expect(await page.evaluate(() => window.fixture.commands)).toEqual([{ kind: 'pause', payload: { reason: 'help' } }]);
    const paused = await page.evaluate(() => window.fixture.view());
    expect(paused.phase).toBe('paused'); expect(paused.fruits).toEqual(before.fruits);
    for (let step = 0; step < 8; step++) {
      await expect(page.locator('[data-tutorial-step]')).toHaveAttribute('data-tutorial-step', String(step));
      await expect(tutorialAction(page, 'next')).toBeDisabled();
      await noOverflow(page); await visibleActionsFit(page, '[data-tutorial-action]');
      await completeStep(page, step); await renderTurn(page);
      const next = tutorialAction(page, 'next');
      await next.hover();
      expect(await textContrast(next), 'Enabled Next hover contrast').toBeGreaterThanOrEqual(4.5);
      if (step === 5) {
        const card = await page.locator('[data-tutorial-recipe]').boundingBox();
        for (const owner of ['jon', 'lydia']) {
          const label = await page.locator(`[data-tutorial-owner="${owner}"]`).boundingBox();
          const intersects = card.x < label.x + label.width && card.x + card.width > label.x && card.y < label.y + label.height && card.y + card.height > label.y;
          expect(intersects, `Recipe must not cover ${owner}'s ownership label`).toBe(false);
        }
      }
      await capture(page, `tutorial-${viewport.width}-step-${step + 1}`, testInfo);
      await tutorialAction(page, 'next').click();
    }
    await expect(page.locator('[data-go-tutorial]')).toHaveCount(0);
    await expect(tv(page)).toHaveAttribute('data-go-phase', 'paused');
    expect(await page.evaluate(() => window.fixture.commands)).toEqual([{ kind: 'pause', payload: { reason: 'help' } }]);
    expect(await page.evaluate(() => window.fixture.view())).toEqual(paused);
  });
}

test('Help waits for shared pause acknowledgment and snapshot; rejection leaves live state unchanged', async ({ page }) => {
  await openFixture(page); const before = await page.evaluate(() => window.fixture.view());
  await page.evaluate(() => window.fixture.rejectNext());
  await action(page, 'help').click();
  await expect(page.locator('[data-go-tutorial]')).toHaveCount(0);
  await expect(tv(page)).toHaveAttribute('data-go-phase', 'playing');
  expect(await page.evaluate(() => window.fixture.view())).toEqual(before);
  await page.evaluate(() => { window.fixture.setAutoApply(false); window.fixture.holdNext(); });
  await action(page, 'help').click();
  await expect(page.locator('[data-go-tutorial]')).toHaveCount(0);
  await page.evaluate(() => window.fixture.releaseNext()); await renderTurn(page);
  await expect(page.locator('[data-go-tutorial]')).toHaveCount(0);
  await page.evaluate(() => { const view = window.fixture.view(); view.phase = 'paused'; view.pauseReason = 'help'; view.runEpoch++; window.fixture.update(view); });
  await expect(page.locator('[data-go-tutorial]')).toBeVisible();
});

test('Help during countdown pauses; Escape restores focus without resuming or issuing readiness', async ({ page }) => {
  await openFixture(page, 'countdown'); await action(page, 'help').click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
  for (let index = 0; index < 15; index++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement.closest('[data-go-tutorial]')))).toBe(true);
  }
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement.closest('[data-go-tutorial]')))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0); await expect(action(page, 'help')).toBeFocused();
  await expect(tv(page)).toHaveAttribute('data-go-phase', 'paused');
  expect(await page.evaluate(() => window.fixture.commands)).toEqual([{ kind: 'pause', payload: { reason: 'help' } }]);
});

test('standalone tutorial ignores live dispatcher options, supports live reduced motion and disposes fully', async ({ page }) => {
  await openFixture(page);
  await page.evaluate(() => window.fixture.mountTutorial({ onCommand: command => window.fixture.commands.push(command), inputMode: 'tilt' }));
  await expect(page.locator('[data-go-tutorial]')).toBeVisible();
  await expect(page.locator('[data-tutorial-content]')).toContainText(/resting angle|tilt/i);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('[data-go-tutorial]')).toHaveAttribute('data-reduced-motion', 'true');
  await completeStep(page, 0); await tutorialAction(page, 'next').click();
  await completeStep(page, 1);
  expect(await page.evaluate(() => window.fixture.commands)).toEqual([]);
  await page.evaluate(() => window.fixture.dispose()); await renderTurn(page);
  await expect(page.locator('[data-go-tutorial]')).toHaveCount(0);
  await expect(page.locator('[data-go-tutorial-style]')).toHaveCount(0);
  expect(await page.locator('#fixture-root').innerHTML()).toBe('');
});
