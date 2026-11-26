import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startLanServer } from '../../server/lan.mjs';
import { startFixture } from '../games/gravity-orchard/phone/fixture/server.mjs';

async function openArcade(t) {
  const host = await startLanServer({ host: '127.0.0.1', port: 0, databasePath: ':memory:' });
  const browser = await chromium.launch({
    executablePath: process.env.SOFA_CHROMIUM_EXECUTABLE,
    args: ['--no-proxy-server', '--disable-gpu'],
  });
  t.after(async () => {
    await browser.close();
    await host.close();
  });
  const phone = await browser.newPage({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  });
  phone.setDefaultTimeout(30_000);
  return { origin: host.origin, browser, phone };
}

test('a rejected room leaves the attempted code selected and offers no seats', { timeout: 120_000 }, async t => {
  const { origin, phone } = await openArcade(t);
  await phone.goto(origin, { waitUntil: 'domcontentloaded' });
  await phone.getByRole('button', { name: 'Join a room', exact: true }).evaluate(button => button.click());
  const input = phone.getByRole('textbox', { name: 'Room code' });
  const cases = [
    ['ZZZZZZ', /That room could not be found/],
    ['ABC234', /This room has expired/],
    ['ABC235', /Check your connection/],
  ];
  await phone.route(url => url.pathname === '/api/rooms/ABC234', route => route.fulfill({
    status: 410, json: { error: 'This room has expired. Start a new game on the TV.', code: 'room_expired' },
  }));
  await phone.route(url => url.pathname === '/api/rooms/ABC235', route => route.abort('internetdisconnected'));
  const missingStatuses = [];
  phone.on('response', response => {
    if (new URL(response.url()).pathname === '/api/rooms/ZZZZZZ') missingStatuses.push(response.status());
  });
  for (const [code, message] of cases) {
    await input.fill(code.toLowerCase());
    await input.press('Tab');
    const submit = phone.getByRole('button', { name: 'Find room', exact: true });
    assert.ok(await submit.evaluate(el => el.matches(':focus-visible')));
    await submit.press('Enter');
    await phone.getByRole('alert').filter({ hasText: message }).waitFor();
    assert.equal(await phone.locator('[data-action="claim"]').count(), 0);
    assert.equal(await phone.getByText('Room connected', { exact: true }).filter({ visible: true }).count(), 0);
    assert.equal(await input.inputValue(), code);
    assert.deepEqual(await input.evaluate(el => [document.activeElement === el, el.selectionStart, el.selectionEnd]),
      [true, 0, 6]);
  }
  assert.deepEqual(missingStatuses, [200]);
});

test('collection shows both hero actions on phones and keeps planned games on the two-player shelf', async t => {
  const { origin, phone } = await openArcade(t);
  await phone.emulateMedia({ reducedMotion: 'reduce' });
  await phone.goto(origin);
  for (const [width, height] of [[390, 844], [320, 568]]) {
    await phone.setViewportSize({ width, height });
    const play = phone.getByRole('button', { name: 'Play Sofa Kingdoms', exact: true });
    const learn = phone.locator('.featured-game[aria-hidden="false"]').getByRole('button', { name: 'Learn with Lala', exact: true });
    for (const bounds of [await play.boundingBox(), await learn.boundingBox()]) {
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
      assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= height);
    }
  }
  await phone.setViewportSize({ width: 1920, height: 1080 });
  const plan = phone.getByRole('tabpanel', { name: '2 player', exact: true }).getByRole('heading', { name: 'Borrowed Minutes' });
  await plan.scrollIntoViewIfNeeded();
  const bounds = await plan.boundingBox();
  assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 1080);
});

async function press(page, action) {
  await page.locator(`[data-action="${action}"]`).first().evaluate(button => button.click());
}

async function prepareCouncil(t, beforeStart = async () => {}) {
  const { origin, browser, phone } = await openArcade(t);
  const tv = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const lydia = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const created = await tv.request.post(origin + '/api/rooms', { data: { gameId: 'odd-laws-society' }, headers: { Origin: origin } });
  assert.equal(created.status(), 201, await created.text());
  const { code, hostToken } = await created.json();
  await tv.addInitScript(({ code, hostToken }) => {
    localStorage.setItem('sofa-room:' + code, JSON.stringify({ hostToken }));
  }, { code, hostToken });
  const getPlayer = async (page, playerId) => {
    const clientId = crypto.randomUUID();
    const joined = await page.request.post(origin + '/api/rooms/' + code + '/join', {
      data: { playerId, clientId }, headers: { Origin: origin },
    });
    assert.ok(joined.ok(), await joined.text());
    const { playerToken } = await joined.json();
    await page.addInitScript(({ code, playerId, playerToken }) => {
      localStorage.setItem('sofa-room:' + code, JSON.stringify({ playerTokens: { [playerId]: playerToken } }));
    }, { code, playerId, playerToken });
  };
  await Promise.all([getPlayer(phone, 'jon'), getPlayer(lydia, 'lydia')]);
  await beforeStart({ tv, phone });
  const started = await tv.request.post(origin + '/api/rooms/' + code + '/start', {
    data: {}, headers: { Origin: origin, Authorization: 'Bearer ' + hostToken },
  });
  assert.ok(started.ok(), await started.text());
  await Promise.all([
    tv.goto(origin + '/?room=' + code, { waitUntil: 'domcontentloaded' }),
    phone.goto(origin + '/?join=' + code + '&seat=jon', { waitUntil: 'domcontentloaded' }),
    lydia.goto(origin + '/?join=' + code + '&seat=lydia', { waitUntil: 'domcontentloaded' }),
  ]);
  return { tv, phone };
}

async function position(page, selector) {
  return page.evaluate(selector => {
    const rect = document.querySelector(selector)?.getBoundingClientRect();
    return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
  }, selector);
}

test('Odd Laws shows the council at its styled position on the first paint', { timeout: 120_000 }, async t => {
  const checks = [];
  const { promise: releaseStyles, resolve: allowStyles } = Promise.withResolvers();
  try {
    await prepareCouncil(t, async ({ tv, phone }) => {
      for (const [page, file, selector] of [
        [tv, 'tv.css', '.ols-tv-board'],
        [phone, 'phone.css', '.ols-phone-council'],
      ]) {
        const { promise: requested, resolve: markRequested } = Promise.withResolvers();
        await page.route(`**/odd-laws-society/${file}`, async route => {
          markRequested();
          await releaseStyles;
          await route.continue();
        });
        checks.push({ page, selector, requested });
      }
    });
    await Promise.all(checks.map(check => check.requested));
    for (const check of checks) check.pending = await position(check.page, check.selector);
    allowStyles();
    for (const { page, selector, pending } of checks) {
      const target = page.locator(selector);
      await target.waitFor();
      await page.waitForFunction(() => [...document.querySelectorAll('link[data-odd-laws-style]')].every(link => link.sheet));
      const first = await position(page, selector);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const settled = await position(page, selector);
      t.diagnostic(`${selector} CSS pending ${JSON.stringify(pending)}, first ${JSON.stringify(first)}, settled ${JSON.stringify(settled)}`);
      assert.equal(pending, null, 'The loading view stays on screen while CSS is pending');
      assert.deepEqual(first, settled);
    }
  } finally {
    allowStyles();
  }
});

test('a failed council stylesheet offers a working retry', { timeout: 120_000 }, async t => {
  const { tv } = await prepareCouncil(t, async ({ tv }) => {
    await tv.route('**/odd-laws-society/tv.css', route => route.abort(), { times: 1 });
  });
  await tv.getByRole('alert').filter({ hasText: 'The council styles could not load.' }).waitFor();
  const retry = tv.getByRole('button', { name: 'Try again' });
  await retry.press('Enter');
  await tv.locator('.ols-tv-board').waitFor();
});

test('reduced motion preserves the Odd Laws vote draft and drawer focus', { timeout: 120_000 }, async t => {
  const { phone } = await prepareCouncil(t);
  const law = phone.locator('[data-action="phone-law"]:not([data-choice-id="keep"])').first();
  const bid = phone.locator('[data-action="phone-bid"][data-bid="1"]');
  await law.evaluate(button => button.click());
  await bid.evaluate(button => button.click());
  await press(phone, 'open-city');
  const close = phone.locator('[role="dialog"] [data-action="close-drawer"]');
  await close.focus();
  await phone.emulateMedia({ reducedMotion: 'reduce' });
  await phone.locator('.ols-reduced-motion').waitFor();
  assert.equal(await close.isVisible(), true, 'The My city drawer remains open');
  assert.equal(await close.evaluate(button => document.activeElement === button), true);
  await close.evaluate(button => button.click());
  assert.equal(await law.getAttribute('aria-pressed'), 'true');
  assert.equal(await bid.getAttribute('aria-pressed'), 'true');
  assert.match(await phone.locator('[data-action="phone-seal"]').textContent(), /Seal vote · 1 influence/);
});

test('the Orchard Ready button holds its position through reconnect', { timeout: 120_000 }, async t => {
  const fixture = await startFixture();
  const browser = await chromium.launch({
    executablePath: process.env.SOFA_CHROMIUM_EXECUTABLE,
    args: ['--no-proxy-server', '--disable-gpu'],
  });
  t.after(async () => {
    await browser.close();
    await fixture.close();
  });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  });
  await page.goto(fixture.url + '?scenario=insecure&mode=controller', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-go3="touch-mode"]').evaluate(button => button.click());
  const ready = '[data-go3="ready"]';
  await page.getByRole('button', { name: 'Ready', exact: true }).waitFor();
  assert.equal(await page.locator(ready).isEnabled(), true);
  for (const [width, height] of [[390, 844], [320, 568], [844, 390]]) {
    await page.setViewportSize({ width, height });
    const before = await position(page, ready);
    assert.ok(before.y >= 0 && before.y + before.height <= height);
    for (const state of ['connecting', 'reconnecting', 'error', 'connected']) {
      await page.evaluate(value => window.go3Fixture.setConnection(value), state);
      assert.deepEqual(await position(page, ready), before, `${width}×${height} · ${state}`);
      assert.equal(await page.locator(ready).isDisabled(), state !== 'connected');
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('[data-go3="phone"]').getAttribute('data-mode'), 'touch');
  await page.getByRole('button', { name: 'Ready', exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Cancel ready', exact: true }).waitFor();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  assert.ok(await page.getByRole('button', { name: 'Cancel ready', exact: true }).isVisible());
  assert.match(await page.locator('[data-go3="self-ready"]').textContent(), /Ready ✓/);
  await page.getByRole('button', { name: 'Cancel ready' }).press('Enter');
  await page.getByRole('button', { name: 'Ready', exact: true }).waitFor();
  assert.match(await page.locator('[data-go3="self-ready"]').textContent(), /Not ready/);
  await page.evaluate(() => window.go3Fixture.peerReady());
  assert.match(await page.locator('[data-go3="partner-ready"]').textContent(), /Ready ✓/);
  const redundantWrites = await page.evaluate(() => {
    const observer = new MutationObserver(() => {});
    observer.observe(document.querySelector('[data-go3="ready-panel"]'), {
      attributes: true, childList: true, characterData: true, subtree: true,
    });
    window.go3Fixture.patchView({});
    const writes = observer.takeRecords().length;
    observer.disconnect();
    return writes;
  });
  assert.equal(redundantWrites, 0, 'An unchanged snapshot leaves the ready controls untouched');

  await page.evaluate(() => window.go3Fixture.setPhase('playing'));
  const pad = page.locator('[data-go3="joystick"]');
  await pad.focus();
  assert.ok(await pad.evaluate(el => {
    const style = getComputedStyle(el);
    const outlineTop = el.getBoundingClientRect().top - parseFloat(style.outlineOffset) - parseFloat(style.outlineWidth);
    return el.matches(':focus-visible') && outlineTop >= el.previousElementSibling.getBoundingClientRect().bottom;
  }), 'The keyboard focus ring clears the steering heading');
});
