import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { openFixture, expectNoHorizontalOverflow, expectTargetsInsideViewport, expectTouchTargets } from './browser-helpers.mjs';

async function capture(page, name, testInfo) {
  const representative = new Set([
    'tv-1920-actions', 'tv-1280-council', 'tv-1280-reveal', 'tv-1280-results',
    'phone-jon-360-council', 'phone-jon-390-actions', 'phone-lydia-390-locked', 'phone-jon-360-full',
  ]);
  const persistent = process.env.WS3_CAPTURE_SCREENSHOTS && representative.has(name);
  const destination = persistent
    ? fileURLToPath(new URL(`../screenshots/${name}.png`, import.meta.url))
    : testInfo.outputPath(`${name}.png`);
  if (persistent) await mkdir(fileURLToPath(new URL('../screenshots/', import.meta.url)), { recursive: true });
  await page.screenshot({ path: destination, animations: 'disabled' });
}

for (const size of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }]) {
  for (const scene of ['actions', 'council', 'reveal', 'income', 'results', 'tie']) {
    test(`TV ${size.width}×${size.height}: ${scene} remains inside the screen`, async ({ page }, testInfo) => {
      await page.setViewportSize(size);
      const errors = await openFixture(page, 'host', scene);
      await expect(page.locator('.ols-tv')).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expectTargetsInsideViewport(page, '.ols-tv, .ols-tv .ols-city-grid, .ols-tv .ols-plot');
      if (!['results', 'tie'].includes(scene)) {
        await expect(page.locator('.ols-tv .ols-city-grid')).toHaveCount(2);
        await expect(page.locator('.ols-tv .ols-plot')).toHaveCount(18);
      }
      if (['actions', 'reveal'].includes(scene)) await expect(page.locator('.ols-tv-market-card')).toHaveCount(6);
      if (['council', 'income'].includes(scene)) await expect(page.locator('.ols-tv-proposal')).toHaveCount(3);
      expect(errors).toEqual([]);
      await capture(page, `tv-${size.width}-${scene}`, testInfo);
    });
  }
}

for (const size of [{ width: 360, height: 800 }, { width: 390, height: 844 }]) {
  for (const viewer of ['jon', 'lydia']) {
    for (const scene of ['actions', 'council', 'locked', 'full', 'exhausted', 'results', 'tie']) {
      test(`${viewer} phone ${size.width}×${size.height}: ${scene}`, async ({ page }, testInfo) => {
        await page.setViewportSize(size);
        const errors = await openFixture(page, viewer, scene);
        await expect(page.locator('.ols-phone')).toBeVisible();
        await expectNoHorizontalOverflow(page);
        await expectTouchTargets(page);
        if (scene === 'actions') await expectTargetsInsideViewport(page, '.ols-phone [data-action^="phone-"]');
        expect(errors).toEqual([]);
        await capture(page, `phone-${viewer}-${size.width}-${scene}`, testInfo);
      });
    }
  }
}
