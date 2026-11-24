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
  await phone.locator('[data-action="join-menu"]').evaluate(button => button.click());
  await phone.locator('#room-input').fill('zzzzzz');
  await phone.locator('#join-form button').evaluate(button => button.click());
  await phone.getByRole('alert').waitFor();
  assert.equal(await phone.locator('[data-action="claim"]').count(), 0);
  assert.equal(await phone.getByText('Room connected', { exact: true }).filter({ visible: true }).count(), 0);
  const input = phone.locator('#room-input');
  assert.equal(await input.inputValue(), 'ZZZZZZ');
  assert.deepEqual(await input.evaluate(el => [document.activeElement === el, el.selectionStart, el.selectionEnd]),
    [true, 0, 6]);
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
  await page.goto(fixture.url + '?scenario=insecure', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-go3="touch-mode"]').evaluate(button => button.click());
  const ready = '[data-go3="ready"]';
  await page.locator(ready + ':enabled').waitFor();
  const before = await position(page, ready);
  for (const state of ['reconnecting', 'connected']) {
    await page.evaluate(value => window.go3Fixture.setConnection(value), state);
    const after = await position(page, ready);
    t.diagnostic(`${state}: Ready top ${before.y} → ${after.y} CSS px`);
    assert.deepEqual(after, before);
    assert.equal(await page.locator(ready).isDisabled(), state === 'reconnecting');
    assert.ok(after.y + after.height <= 844);
  }
});
