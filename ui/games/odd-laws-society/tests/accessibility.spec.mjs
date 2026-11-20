import { test, expect } from '@playwright/test';
import { openFixture, action } from './browser-helpers.mjs';

test('a connected live region survives renders and announces turns, reveal and income', async ({ page }) => {
  await openFixture(page, 'jon', 'actions');
  const live = page.locator('[data-announcement]');
  const original = await live.elementHandle();
  await expect(live).toContainText("Jon's turn");
  await action(page, 'phone-work').click();
  await expect(live).toContainText("Lydia's turn");
  expect(await page.evaluate(node => node.isConnected && node === document.querySelector('[data-announcement]'), original)).toBe(true);
  await page.evaluate(() => window.fixture.setScene('council'));
  await page.evaluate(() => window.fixture.actAs('jon', { type: 'commitCouncil', choiceId: 'keep', bid: 0 }));
  await page.evaluate(() => window.fixture.actAs('lydia', { type: 'commitCouncil', choiceId: 'keep', bid: 0 }));
  await expect(live).toContainText('Both council votes revealed.');
  await page.evaluate(() => window.fixture.setScene('income'));
  await expect(live).toContainText('Income received.');
  await expect(live).toContainText('Session 2. Council.');
  expect(await page.evaluate(node => node.isConnected && node === document.querySelector('[data-announcement]'), original)).toBe(true);
});

test('inspecting a future catalog card supports Back and Escape with visible keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFixture(page, 'jon', 'actions');
  await action(page, 'open-catalog').click();
  const design = action(page, 'inspect-building', '[data-design-id="grand-bazaar"]');
  await design.click();
  await expect(page.getByRole('dialog')).toContainText('District inspection');
  await expect(page.getByRole('dialog')).toContainText('Not in the current market');
  await action(page, 'back-drawer').click();
  await expect(page.getByRole('dialog')).toContainText('District almanac');
  await expect(design).toBeFocused();
  expect(await design.evaluate(node => {
    const card = node.getBoundingClientRect();
    const body = node.closest('.ols-drawer-body').getBoundingClientRect();
    return card.top < body.bottom && card.bottom > body.top;
  })).toBe(true);
  await design.press('Enter');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toContainText('District almanac');
  await expect(design).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(action(page, 'open-catalog')).toBeFocused();
});

test('keyboard navigation keeps focus in each phone Build panel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFixture(page, 'jon', 'actions');
  await action(page, 'phone-build').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.ols-phone-market h2')).toBeFocused();
  await page.keyboard.press('Tab');
  const firstDesign = action(page, 'phone-design').first();
  await expect(firstDesign).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.ols-phone-placement h2')).toBeFocused();
  await action(page, 'phone-market').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.ols-phone-market h2')).toBeFocused();
  await action(page, 'phone-back').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.ols-phone-turn h2')).toBeFocused();
  expect(await page.evaluate(() => window.fixture.commands)).toEqual([]);
});
