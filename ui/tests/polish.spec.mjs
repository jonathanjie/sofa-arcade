import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startLanServer } from '../../server/lan.mjs';

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
