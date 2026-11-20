import { test, expect } from '@playwright/test';
import { openFixture, snapshot, action, expectNoHorizontalOverflow, expectTargetsInsideViewport } from './browser-helpers.mjs';

const inDialog = (page, name, extra = '') => page.getByRole('dialog').locator(`[data-action="${name}"]${extra}`);
const cityTrigger = page => page.locator('.ols-toolbar [data-action="open-city"]');

async function expectInspectionTargets(page) {
  const targets = await page.locator('.ols-toolbar [data-action="open-city"], .ols-drawer button')
    .evaluateAll(buttons => buttons.filter(button => button.getClientRects().length && button.getAttribute('aria-disabled') !== 'true').map(button => {
      const r = button.getBoundingClientRect();
      return { label: button.getAttribute('aria-label') || button.textContent.trim(), width: r.width, height: r.height };
    }));
  for (const target of targets) {
    expect(target.width, target.label).toBeGreaterThanOrEqual(48);
    expect(target.height, target.label).toBeGreaterThanOrEqual(48);
  }
}

for (const size of [{ width: 360, height: 800 }, { width: 390, height: 844 }]) {
  test(`city inspection preserves council draft, nested Back, and close focus at ${size.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(size);
    const errors = await openFixture(page, 'jon', 'income');
    await action(page, 'phone-law', '[data-choice-id="diversity-parade"]').click();
    await action(page, 'phone-bid', '[data-bid="2"]').click();
    const before = await snapshot(page);
    await cityTrigger(page).focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Jon’s borough');
    await expect(dialog.locator('.ols-city-policy')).toContainText('Diversity Parade');
    await expect(dialog.locator('.ols-city-grid [data-action="inspect-building"]')).toHaveCount(2);
    await expect(dialog.locator('.ols-city-current-laws')).toContainText('Small-Shop Supremacy');
    await expect(dialog.locator('.ols-city-guild-counts > span[data-guild="commerce"] > strong')).toHaveText('1');
    await expectInspectionTargets(page);
    await expectNoHorizontalOverflow(page);
    await expectTargetsInsideViewport(page, '.ols-drawer, .ols-drawer > header, .ols-drawer .ols-city-grid');
    await page.screenshot({ path: testInfo.outputPath(`city-council-${size.width}.png`), animations: 'disabled' });
    const building = inDialog(page, 'inspect-building', '[data-design-id="button-workshop"]');
    // Empty plots are inspect-only placeholders with tabindex=-1, not trap endpoints.
    await inDialog(page, 'close-drawer').focus();
    await page.keyboard.press('Shift+Tab');
    await expect(building).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(inDialog(page, 'close-drawer')).toBeFocused();
    await building.click();
    await expect(dialog.locator('h2')).toHaveText('District inspection');
    await expect(dialog).toContainText('Your first Build each session costs 1 less.');
    await inDialog(page, 'back-drawer').click();
    await expect(dialog.locator('h2')).toHaveText('My city');
    await expect(building).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(cityTrigger(page)).toBeFocused();
    await expect(action(page, 'phone-law', '[data-choice-id="diversity-parade"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(action(page, 'phone-bid', '[data-bid="2"]')).toHaveAttribute('aria-pressed', 'true');
    expect(await snapshot(page)).toEqual(before);
    expect(await page.evaluate(() => window.fixture.commands)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('My city from a building dialog preserves the selected design/plot and restores drawer focus', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openFixture(page, 'jon', 'actions');
  await action(page, 'phone-build').click();
  await action(page, 'phone-design', '[data-design-id="public-library"]').click();
  await action(page, 'phone-plot', '[data-row="0"][data-col="2"]').click();
  const before = await snapshot(page);
  const details = page.locator('.ols-phone-placement [data-action="inspect-building"]');
  await details.click();
  await inDialog(page, 'open-city').click();
  await expect(page.getByRole('dialog')).toContainText('Jon’s borough');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog').locator('h2')).toHaveText('District inspection');
  await expect(inDialog(page, 'open-city')).toBeFocused();
  await inDialog(page, 'close-drawer').click();
  await expect(details).toBeFocused();
  await expect(page.locator('.ols-phone-placement h2')).toHaveText('Public Library');
  await expect(action(page, 'phone-plot', '[data-row="0"][data-col="2"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(action(page, 'phone-confirm-build')).not.toHaveAttribute('aria-disabled', 'true');
  expect(await snapshot(page)).toEqual(before);
  expect(await page.evaluate(() => window.fixture.commands)).toEqual([]);
});

for (const playerId of ['jon', 'lydia']) {
  test(`${playerId} can inspect a sealed vote's city and agenda without unlocking the vote`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFixture(page, playerId, 'income');
    await action(page, 'phone-law', '[data-choice-id="shop-local"]').click();
    await action(page, 'phone-bid', '[data-bid="1"]').click();
    await action(page, 'phone-seal').click();
    await expect(page.locator('.ols-phone-locked')).toBeVisible();
    const before = await snapshot(page);
    await page.locator('.ols-toolbar [data-action="open-agenda"]').click();
    await inDialog(page, 'open-city').click();
    await expect(page.getByRole('dialog').locator('.ols-city-inspection')).toHaveAttribute('data-city-owner', playerId);
    await expect(page.getByRole('dialog').locator('.ols-city-policy')).toContainText('Sealed choice');
    await expect(page.getByRole('dialog').locator('.ols-city-policy')).toContainText('Shop Local');
    await expect(page.getByRole('dialog').locator('[data-action^="phone-"]')).toHaveCount(0);
    await inDialog(page, 'back-drawer').click();
    await expect(page.getByRole('dialog').locator('h2')).toHaveText('The council agenda');
    await expect(inDialog(page, 'open-city')).toBeFocused();
    await inDialog(page, 'close-drawer').click();
    await expect(page.locator('.ols-phone-locked')).toBeVisible();
    await expect(action(page, 'phone-law')).toHaveCount(0);
    await expect(action(page, 'phone-bid')).toHaveCount(0);
    expect(await snapshot(page)).toEqual(before);
    expect(await page.evaluate(() => window.fixture.commands.length)).toBe(1);
    const projected = await page.evaluate(() => [window.fixture.project({ role: 'host' }), window.fixture.project({ role: 'player', playerId: window.fixture.viewer.playerId === 'jon' ? 'lydia' : 'jon' })]);
    expect(projected.map(room => room.state.council.ownCommitment)).toEqual([null, null]);
  });
}

test('waiting and disconnected players retain read-only city inspection', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openFixture(page, 'jon', 'actions');
  const connection = page.locator('.ols-connection-dot');
  await expect(connection).toBeVisible();
  await action(page, 'phone-work').click();
  await expect(page.locator('.ols-phone-turn')).toHaveClass(/waiting/);
  await page.evaluate(() => window.fixture.setConnection({ state: 'offline' }));
  await expect(connection).toBeVisible();
  const before = await snapshot(page);
  await cityTrigger(page).click();
  await expect(page.getByRole('dialog')).toContainText('Jon’s borough');
  await expect(page.getByRole('dialog').locator('.ols-city-grid [data-action="inspect-building"]')).toHaveCount(3);
  await inDialog(page, 'close-drawer').click();
  await expect(page.locator('.ols-phone-turn')).toHaveClass(/waiting/);
  expect(await snapshot(page)).toEqual(before);
  expect(await page.evaluate(() => window.fixture.commands.length)).toBe(1);
  await page.evaluate(() => window.fixture.setConnection({ state: 'connected' }));
  await expect(page.locator('.ols-connection-dot.connected')).toBeVisible();
  await expectTargetsInsideViewport(page, '.ols-toolbar, .ols-toolbar button, .ols-connection-dot');
});

test('open city responds to live snapshots, rejects older snapshots, and clears nested inspection on a new match', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFixture(page, 'jon', 'income');
  await action(page, 'phone-law', '[data-choice-id="diversity-parade"]').click();
  await action(page, 'phone-bid', '[data-bid="2"]').click();
  const old = await snapshot(page);
  await cityTrigger(page).click();
  await expect(page.getByRole('dialog').locator('.ols-city-policy .ols-city-award')).toContainText('+0');
  await page.evaluate(() => {
    const next = window.fixture.snapshot();
    next.revision++;
    next.state.players.jon.city[2] = { instanceId: 'new-civic', designId: 'petition-kiosk' };
    window.fixture.update(next);
  });
  await expect(page.getByRole('dialog').locator('.ols-city-summary')).toContainText('3 / 9 plots');
  await expect(page.getByRole('dialog').locator('.ols-city-policy .ols-city-award')).toContainText('+1');
  await expect(page.getByRole('dialog').locator('.ols-city-guild-counts > span[data-guild="civic"] > strong')).toHaveText('1');
  await page.evaluate(room => window.fixture.update(room), old);
  await expect(page.getByRole('dialog').locator('.ols-city-summary')).toContainText('3 / 9 plots');
  await inDialog(page, 'inspect-building', '[data-design-id="petition-kiosk"]').click();
  await inDialog(page, 'open-city').click();
  await page.evaluate(() => {
    const next = window.fixture.snapshot();
    next.revision++;
    next.state.matchId = 'fresh-feedback-match';
    next.state.phaseId = 'fresh-feedback-match:s2:council';
    next.state.players.jon.city = Array(9).fill(null);
    window.fixture.update(next);
  });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(action(page, 'phone-law', '[data-choice-id="keep"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(action(page, 'phone-bid', '[data-bid="0"]')).toHaveAttribute('aria-pressed', 'true');
  await cityTrigger(page).click();
  await expect(page.getByRole('dialog').locator('.ols-city-summary')).toContainText('0 / 9 plots');
  await expect(inDialog(page, 'back-drawer')).toHaveCount(0);
  expect(await page.evaluate(() => window.fixture.commands)).toEqual([]);
});

for (const size of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
  test(`guild cards are labelled, distinct, and larger at ${size.width}×${size.height}`, async ({ page }, testInfo) => {
    const phone = size.width < 600;
    await page.setViewportSize(size);
    const errors = await openFixture(page, phone ? 'jon' : 'host', 'actions');
    if (phone) await action(page, 'phone-build').click();
    const cards = page.locator(phone ? '.ols-phone-market-card' : '.ols-tv-market-card');
    const badges = await cards.evaluateAll(nodes => nodes.map(card => {
      const badge = card.querySelector('.ols-guild');
      const icon = badge.querySelector('svg').getBoundingClientRect();
      return { guild: card.dataset.guild, label: badge.textContent.trim(), icon: Math.min(icon.width, icon.height),
        tint: getComputedStyle(badge).backgroundColor, cardWidth: card.clientWidth, contentWidth: card.scrollWidth };
    }));
    expect(new Set(badges.map(badge => badge.guild)).size).toBe(4);
    expect(new Set(badges.map(badge => badge.tint)).size).toBe(4);
    for (const badge of badges) {
      expect(badge.label.toLowerCase()).toBe(badge.guild);
      expect(badge.icon).toBeGreaterThanOrEqual(24);
      expect(badge.contentWidth).toBeLessThanOrEqual(badge.cardWidth + 1);
    }
    await expectNoHorizontalOverflow(page);
    if (!phone) {
      await expectTargetsInsideViewport(page, '.ols-tv, .ols-tv-market-card, .ols-tv-active-law');
      await expect(action(page, 'open-city')).toHaveCount(0);
    }
    await page.screenshot({ path: testInfo.outputPath(`guilds-${size.width}.png`), animations: 'disabled' });
    expect(errors).toEqual([]);
  });
}
