import { expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const tv = page => page.locator('[data-go-tv]');
export const action = (page, name) => page.locator(`[data-go-action="${name}"]`);
export const tutorialAction = (page, name) => page.locator(`[data-tutorial-action="${name}"]`);
export async function openFixture(page, scene = 'playing') {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/tv/fixtures/?scene=${encodeURIComponent(scene)}&clean=1`);
  await expect.poll(() => page.evaluate(() => Boolean(window.fixture))).toBe(true);
  await expect(tv(page)).toBeVisible();
  expect(errors).toEqual([]);
  return errors;
}
export async function noOverflow(page) {
  const metrics = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width);
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.height);
}
export async function visibleActionsFit(page, selector = '[data-go-action]') {
  const boxes = await page.locator(selector).evaluateAll(elements => elements.filter(el => !el.hidden && getComputedStyle(el).display !== 'none' && el.getClientRects().length).map(el => {
    const r = el.getBoundingClientRect();
    return { action: el.dataset.goAction ?? el.dataset.tutorialAction, x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
  }));
  const viewport = page.viewportSize();
  for (const box of boxes) {
    expect(box.x, `${box.action} left`).toBeGreaterThanOrEqual(0);
    expect(box.y, `${box.action} top`).toBeGreaterThanOrEqual(0);
    expect(box.right, `${box.action} right`).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.bottom, `${box.action} bottom`).toBeLessThanOrEqual(viewport.height + 1);
    expect(box.h, `${box.action} touch height`).toBeGreaterThanOrEqual(39);
  }
}
export async function capture(page, name, testInfo) {
  await page.evaluate(() => document.fonts.ready);
  // Wait for the requested projection to reach the actual SVG, not merely the
  // synchronously updated chrome. This is condition-based and adds no sleep.
  await expect.poll(() => page.evaluate(() => {
    const view = window.fixture?.view?.();
    const scene = document.querySelector('[data-go-scene]');
    if (!view || !scene) return true;
    if (scene.dataset.matchId !== view.matchId || scene.dataset.levelId !== view.levelId) return false;
    const drawn = [...scene.querySelectorAll('[data-fruit-id]')];
    return drawn.length === view.fruits.length && view.fruits.every(fruit => {
      const node = drawn.find(node => node.dataset.fruitId === fruit.id);
      return node && Number(node.dataset.x) === fruit.x && Number(node.dataset.y) === fruit.y;
    });
  })).toBe(true);
  const directory = fileURLToPath(new URL('../fixtures/evidence/', import.meta.url));
  await mkdir(directory, { recursive: true });
  const path = `${directory}${name}.png`;
  await page.screenshot({ path, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}
export async function renderTurn(page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
export async function getFruitPosition(page, id = 'apple-1') {
  return page.locator(`[data-fruit-id="${id}"]`).evaluate(el => ({ transform: el.getAttribute('transform'), x: Number(el.dataset.x), y: Number(el.dataset.y), html: el.outerHTML }));
}
