import { test, expect } from '@playwright/test';
import { openFixture, snapshot, setScene, action, expectNoHorizontalOverflow, expectTouchTargets } from './browser-helpers.mjs';

test('phone drafts stay local until Seal, then dispatch exactly the normalized private command', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext({ viewport: { width: 360, height: 800 } }), browser.newContext(), browser.newContext({ viewport: { width: 390, height: 844 } })]);
  const [jon, tv, lydia] = await Promise.all(contexts.map(context => context.newPage()));
  try {
    await Promise.all([openFixture(jon, 'jon', 'council'), openFixture(tv, 'host', 'council'), openFixture(lydia, 'lydia', 'council')]);
    const before = await snapshot(jon);
    const tvBefore = await tv.locator('.ols-tv').innerHTML();
    const lydiaBefore = await lydia.locator('.ols-phone').innerHTML();
    await action(jon, 'phone-law', '[data-choice-id="honest-wages"]').click();
    await action(jon, 'phone-bid', '[data-bid="2"]').click();
    await expect(action(jon, 'phone-bid', '[data-bid="3"]')).toHaveAttribute('aria-disabled', 'true');
    expect(await jon.evaluate(() => window.fixture.commands)).toEqual([]);
    expect(await snapshot(jon)).toEqual(before);
    expect(await tv.locator('.ols-tv').innerHTML()).toBe(tvBefore);
    expect(await lydia.locator('.ols-phone').innerHTML()).toBe(lydiaBefore);
    await expect(jon.locator('.ols-phone-all-pay')).toContainText('Both bids are spent');
    await action(jon, 'phone-seal').click();
    await expect(jon.locator('.ols-phone-locked')).toBeVisible();
    const commands = await jon.evaluate(() => window.fixture.commands);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual({ type: 'commitCouncil', matchId: before.state.matchId, phaseId: before.state.phaseId, choiceId: 'honest-wages', bid: 2 });
    const locked = await snapshot(jon);
    expect(locked.state.council.ownCommitment).toEqual({ choiceId: 'honest-wages', bid: 2 });
    expect(locked.state.players.jon.influence).toBe(before.state.players.jon.influence);
    expect(locked.state.players.lydia.influence).toBe(before.state.players.lydia.influence);
    await expect(jon.locator('.ols-phone-locked')).toContainText('Waiting for Lydia');
    const events = await jon.evaluate(() => window.fixture.events);
    const renderedEvents = events.map(event => typeof event === 'string' ? event : JSON.stringify(event));
    expect(renderedEvents.findIndex(event => event.includes('unlock'))).toBeGreaterThanOrEqual(0);
    expect(renderedEvents.findIndex(event => event.includes('unlock'))).toBeLessThan(renderedEvents.findIndex(event => event.includes('dispatch')));
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

test('Build selects a design and plot privately, previews exact law cost and confirms once', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFixture(page, 'jon', 'actions');
  const before = await snapshot(page);
  await action(page, 'phone-build').click();
  await action(page, 'phone-design', '[data-design-id="public-library"]').click();
  await action(page, 'phone-plot', '[data-row="0"][data-col="2"]').click();
  expect(await page.evaluate(() => window.fixture.commands)).toEqual([]);
  await expect(page.locator('.ols-phone')).toContainText('Public Library');
  await expect(action(page, 'phone-confirm-build')).toContainText('2');
  await expectTouchTargets(page, '.ols-phone button');
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('phone-390-build.png'), animations: 'disabled' });
  await action(page, 'phone-confirm-build').click();
  await expect.poll(() => page.evaluate(() => window.fixture.commands.length)).toBe(1);
  const commands = await page.evaluate(() => window.fixture.commands);
  expect(commands[0]).toEqual({ type: 'build', matchId: before.state.matchId, phaseId: before.state.phaseId, designId: 'public-library', row: 0, col: 2 });
  const after = await snapshot(page);
  expect(after.state.players.jon.coins).toBe(before.state.players.jon.coins - 2);
  expect(after.state.players.jon.influence).toBe(6);
  expect(after.state.players.jon.city[2].designId).toBe('public-library');
  expect(after.state.players.jon.score.streets).toBe(before.state.players.jon.score.streets + 2);
  expect(after.state.phaseId).not.toBe(before.state.phaseId);
});

for (const type of ['work', 'lobby', 'festival']) {
  test(`${type} dispatches current phase and displays its committed result`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await openFixture(page, 'lydia', 'actions');
    const before = await snapshot(page);
    await action(page, `phone-${type}`).click();
    await expect.poll(() => page.evaluate(() => window.fixture.commands.length)).toBe(1);
    const commands = await page.evaluate(() => window.fixture.commands);
    expect(commands[0]).toEqual({ type, matchId: before.state.matchId, phaseId: before.state.phaseId });
    const after = await snapshot(page);
    if (type === 'work') expect(after.state.players.lydia.coins).toBe(before.state.players.lydia.coins + 3);
    if (type === 'lobby') expect(after.state.players.lydia.influence).toBe(Math.min(6, before.state.players.lydia.influence + 2));
    if (type === 'festival') {
      expect(after.state.players.lydia.coins).toBe(before.state.players.lydia.coins - 3);
      expect(after.state.players.lydia.score.festivals).toBe(before.state.players.lydia.score.festivals + 4);
      expect(after.state.players.lydia.festivalUsed).toBe(true);
    }
  });
}

for (const scene of ['full', 'exhausted']) {
  test(`${scene} gives a build reason and still permits Work`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await openFixture(page, 'jon', scene);
    await action(page, 'phone-build').click();
    expect(await page.evaluate(() => window.fixture.commands)).toEqual([]);
    await expect(page.locator('.ols-phone')).toContainText(scene === 'full' ? /full/i : /exhausted/i);
    if (await action(page, 'phone-back').count()) await action(page, 'phone-back').click();
    await action(page, 'phone-work').click();
    await expect.poll(() => page.evaluate(() => window.fixture.commands.length)).toBe(1);
    expect((await page.evaluate(() => window.fixture.commands))[0].type).toBe('work');
  });
}

test('unavailable Festival and capped Lobby explain their exact effect', async ({ page }) => {
  await openFixture(page, 'jon', 'full');
  await expect(action(page, 'phone-festival')).toHaveAttribute('aria-disabled', 'true');
  await action(page, 'phone-festival').click({ force: true });
  expect(await page.evaluate(() => window.fixture.commands)).toEqual([]);
  await expect(page.locator('.ols')).toContainText(/already held/i);
  await expect(action(page, 'phone-lobby')).toContainText('0');
  await action(page, 'phone-lobby').click();
  expect((await page.evaluate(() => window.fixture.commands))[0].type).toBe('lobby');
});

test('failed dispatch preserves the turn, shows a safe error and can be retried by a new gesture', async ({ page }) => {
  await openFixture(page, 'jon', 'actions');
  const before = await snapshot(page);
  await page.evaluate(() => window.fixture.rejectNext('The room is temporarily unavailable.'));
  await action(page, 'phone-work').click();
  await expect(page.locator('.ols')).toContainText('The room is temporarily unavailable.');
  expect((await snapshot(page)).state.phaseId).toBe(before.state.phaseId);
  await action(page, 'phone-work').click();
  await expect.poll(async () => (await snapshot(page)).state.phaseId).not.toBe(before.state.phaseId);
});

test('offline and reconnecting states do not accept commands; reconnect restores input', async ({ page }) => {
  await openFixture(page, 'jon', 'actions');
  for (const state of ['offline', 'reconnecting']) {
    await page.evaluate(value => window.fixture.setConnection({ state: value, message: 'Waiting for the local host.' }), state);
    await action(page, 'phone-work').click({ force: true });
    expect(await page.evaluate(() => window.fixture.commands)).toEqual([]);
    await expect(page.locator('.ols')).toContainText('Waiting for the local host.');
  }
  await page.evaluate(() => window.fixture.setConnection({ state: 'connected' }));
  await action(page, 'phone-work').click();
  await expect.poll(() => page.evaluate(() => window.fixture.commands.length)).toBe(1);
});

test('older snapshots cannot roll back the UI and repeated snapshots do not repeat rewards', async ({ page }) => {
  await openFixture(page, 'jon', 'actions');
  const old = await snapshot(page);
  await action(page, 'phone-work').click();
  const current = await snapshot(page);
  await page.evaluate(room => window.fixture.update(room), current);
  const soundCount = await page.evaluate(() => window.fixture.events.filter(event => JSON.stringify(event).includes('effect')).length);
  await page.evaluate(room => { window.fixture.update(room); window.fixture.update(room); }, current);
  expect(await page.evaluate(() => window.fixture.events.filter(event => JSON.stringify(event).includes('effect')).length)).toBe(soundCount);
  const rendered = await page.locator('.ols-phone').innerHTML();
  await page.evaluate(room => window.fixture.update(room), old);
  expect(await page.locator('.ols-phone').innerHTML()).toBe(rendered);
});

test('disposing during a pending response prevents detached updates and allows a clean remount', async ({ page }) => {
  await openFixture(page, 'jon', 'actions');
  await page.evaluate(() => window.fixture.holdNext());
  await action(page, 'phone-work').click();
  await page.evaluate(() => window.fixture.dispose());
  await expect(page.locator('.ols-phone')).toHaveCount(0);
  await page.evaluate(() => window.fixture.releaseNext());
  await page.waitForTimeout(50);
  await expect(page.locator('.ols-phone')).toHaveCount(0);
  await page.evaluate(() => window.fixture.remount());
  await expect(page.locator('.ols-phone')).toBeVisible();
});

test('Help, full agenda and catalog stay optional and keyboard focus returns after Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFixture(page, 'jon', 'actions');
  for (const name of ['open-help', 'open-agenda', 'open-catalog']) {
    const trigger = action(page, name).first();
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement.closest('[role="dialog"]')))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
});

test('media failure and offline assets preserve playable vector fallbacks', async ({ page, context }, testInfo) => {
  const externalRequests = [];
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:4183/') && !request.url().startsWith('data:')) externalRequests.push(request.url());
  });
  await page.route('**/*', route => route.request().resourceType() === 'image' ? route.abort() : route.continue());
  await openFixture(page, 'jon', 'actions', '&media=broken');
  await context.setOffline(true);
  await action(page, 'phone-build').click();
  await action(page, 'phone-design', '[data-design-id="public-library"]').click();
  await expect(page.locator('.ols-phone svg').first()).toBeVisible();
  await expect(action(page, 'phone-plot', '[data-row="0"][data-col="2"]')).toBeVisible();
  expect(externalRequests).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('phone-offline-fallback.png'), animations: 'disabled' });
});

test('reduced motion removes travelling animation without delaying legal input', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openFixture(page, 'jon', 'actions');
  await action(page, 'phone-work').click();
  await expect.poll(() => page.evaluate(() => window.fixture.commands.length)).toBe(1);
  const animations = await page.locator('.ols').evaluate(root => root.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').map(animation => animation.effect.getTiming().duration));
  expect(animations.every(duration => typeof duration === 'number' && duration <= 200)).toBe(true);
});
