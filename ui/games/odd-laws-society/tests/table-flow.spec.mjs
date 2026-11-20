import { test, expect } from '@playwright/test';
import { openFixture, snapshot, action } from './browser-helpers.mjs';

test('three iframe contexts synchronize the public actor and project the two private commitments separately', async ({ page }) => {
  await page.goto('/?table=1&scene=actions');
  const host = page.frameLocator('iframe[data-seat="host"]');
  const jon = page.frameLocator('iframe[data-seat="jon"]');
  const lydia = page.frameLocator('iframe[data-seat="lydia"]');
  await expect(jon.locator('.ols-phone-turn')).toContainText('Your city, your move.');
  await expect(lydia.locator('.ols-phone-turn')).toContainText('Jon is making a move.');
  await expect(host.locator('.ols-tv-session')).toContainText("Jon's turn");
  await page.getByLabel('Fixture scene', { exact: true }).selectOption('council');
  await expect(jon.locator('.ols-phone-council')).toBeVisible();
  await expect(lydia.locator('.ols-phone-council')).toBeVisible();
  const publicBefore = await host.locator('.ols-tv-purse').allTextContents();
  await jon.locator('[data-action="phone-law"][data-choice-id="small-shop-supremacy"]').click();
  await jon.locator('[data-action="phone-bid"][data-bid="1"]').click();
  await expect(host.locator('[data-envelope="jon"]')).toContainText('Choosing privately');
  await jon.locator('[data-action="phone-seal"]').click();
  await expect(jon.locator('.ols-phone-locked')).toContainText('Small-Shop Supremacy');
  await expect(host.locator('[data-envelope="jon"]')).toContainText('Sealed');
  expect(await host.locator('.ols-tv-purse').allTextContents()).toEqual(publicBefore);
  const lydiaFrame = page.frames().find(frame => frame.url().includes('viewer=lydia'));
  expect(await lydiaFrame.evaluate(() => window.fixture.snapshot().state.council.ownCommitment)).toBeNull();
  await lydia.locator('[data-action="phone-law"][data-choice-id="honest-wages"]').click();
  await lydia.locator('[data-action="phone-seal"]').click();
  await expect(host.locator('.ols-tv-revealed-votes [data-envelope]')).toHaveCount(2);
  await expect(host.locator('.ols-tv-reveal')).toContainText('1 paid');
  await expect(host.locator('.ols-tv-reveal')).toContainText('0 paid');
  await expect(lydia.locator('.ols-phone-turn')).toContainText('Your city, your move.');
  await expect(jon.locator('.ols-phone-turn')).toContainText('Lydia is making a move.');
});

test('one rendered fixture reaches six councils, eighteen phone actions, income transitions and a tied result', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openFixture(page, 'jon', 'council');
  for (let session = 1; session <= 6; session++) {
    await expect(page.locator('.ols-phone-council')).toBeVisible();
    expect((await snapshot(page)).state.session).toBe(session);
    await action(page, 'phone-seal').click();
    await expect(page.locator('.ols-phone-locked')).toBeVisible();
    await page.evaluate(() => window.fixture.actAs('lydia', { type: 'commitCouncil', choiceId: 'keep', bid: 0 }));
    for (let turn = 0; turn < 6; turn++) {
      const before = await snapshot(page);
      expect(before.state.actionIndex).toBe(turn);
      if (before.state.activePlayer === 'jon') await action(page, 'phone-work').click();
      else await page.evaluate(() => window.fixture.actAs('lydia', { type: 'work' }));
      await expect.poll(async () => (await snapshot(page)).state.phaseId).not.toBe(before.state.phaseId);
    }
  }
  const end = await snapshot(page);
  expect(end.state.stage).toBe('finished');
  expect(end.state.result).toEqual({ winner: 'tie', scores: { jon: 4, lydia: 4 } });
  expect(end.state.players.jon.coins).toBe(73);
  expect(end.state.players.lydia.coins).toBe(73);
  await expect(page.locator('.ols-phone-results')).toContainText('A shared triumph.');
  const commands = await page.evaluate(() => window.fixture.commands);
  expect(commands.filter(command => command.type === 'work')).toHaveLength(18);
  expect(commands.filter(command => command.type === 'commitCouncil')).toHaveLength(6);
});
