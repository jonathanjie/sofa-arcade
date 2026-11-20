import { expect } from '@playwright/test';

export async function openFixture(page, viewer = 'host', scene = 'actions', extra = '') {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(`/?viewer=${viewer}&scene=${scene}${extra}`);
  await page.waitForFunction(() => Boolean(window.fixture));
  await expect(page.locator('.ols')).toBeVisible();
  return pageErrors;
}

export async function snapshot(page) {
  return page.evaluate(() => window.fixture.snapshot());
}

export async function setScene(page, scene) {
  await page.evaluate(value => window.fixture.setScene(value), scene);
}

export function action(page, name, extra = '') {
  return page.locator(`[data-action="${name}"]${extra}`);
}

export async function expectNoHorizontalOverflow(page) {
  const width = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(width.content, JSON.stringify(width)).toBeLessThanOrEqual(width.viewport + 1);
}

export async function expectTargetsInsideViewport(page, selector) {
  const rectangles = await page.locator(selector).evaluateAll(elements => elements
    .filter(element => element.getClientRects().length && !element.closest('[hidden]'))
    .map(element => {
      const r = element.getBoundingClientRect();
      return { text: element.textContent.trim().slice(0, 80), left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    }));
  const viewport = page.viewportSize();
  for (const rectangle of rectangles) {
    expect(rectangle.left, rectangle.text).toBeGreaterThanOrEqual(-1);
    expect(rectangle.right, rectangle.text).toBeLessThanOrEqual(viewport.width + 1);
    expect(rectangle.top, rectangle.text).toBeGreaterThanOrEqual(-1);
    expect(rectangle.bottom, rectangle.text).toBeLessThanOrEqual(viewport.height + 1);
  }
}

export async function expectTouchTargets(page, selector = '.ols button') {
  const undersized = await page.locator(selector).evaluateAll(elements => elements
    .filter(element => element.getClientRects().length && !element.disabled)
    .map(element => ({ element, r: element.getBoundingClientRect() }))
    .filter(({ r }) => r.width < 43.5 || r.height < 43.5)
    .map(({ element, r }) => ({ label: element.getAttribute('aria-label') || element.textContent.trim(), width: r.width, height: r.height })));
  expect(undersized).toEqual([]);
}
