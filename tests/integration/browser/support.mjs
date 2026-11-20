/** Real-browser acceptance support. No browser or room state is mocked here. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

export const checkout = fileURLToPath(new URL('../../../', import.meta.url));
export const runtimeRoot = path.resolve(process.env.SOFA_ACCEPTANCE_ROOT || checkout);
export const evidenceRoot = path.resolve(process.env.SOFA_EVIDENCE_DIR || path.join(checkout, 'tests/integration/evidence'));
const require = createRequire(import.meta.url);
const privateValues = new Set();
const redact = value => {
  let text = String(value);
  for (const token of privateValues) text = text.split(token).join('[REDACTED]');
  return text.replace(/Bearer\s+[A-Za-z0-9_-]{24,128}/g, 'Bearer [REDACTED]');
};

export async function acceptanceSession(label) {
  const { chromium } = require(process.env.SOFA_PLAYWRIGHT_MODULE || 'playwright');
  const temp = await mkdtemp(path.join(tmpdir(), `sofa-${label}-`));
  const { startLanServer } = await import(pathToFileURL(path.join(runtimeRoot, 'server/lan.mjs')).href);
  let server = await startLanServer({ root: runtimeRoot, databasePath: path.join(temp, 'rooms.sqlite'), host: '127.0.0.1', port: 0, heartbeatMs: 200 });
  const port = server.port;
  const origin = server.origin;
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.SOFA_CHROMIUM ? { executablePath: process.env.SOFA_CHROMIUM } : {}),
      args: ['--no-sandbox'],
    });
  } catch (error) {
    await server.close();
    await rm(temp, { recursive: true, force: true });
    throw error;
  }
  const pages = [];
  const externalRequests = [];
  const errors = [];
  const failedResponses = [];
  const screenshots = [];
  const checks = [];
  await mkdir(evidenceRoot, { recursive: true });
  const evidence = {
    suite: label,
    environment: { platform: process.platform, architecture: process.arch, node: process.version, browser: browser.version() },
    methodology: 'Three isolated Chromium browser contexts talking to one real Node/SQLite/HTTP/SSE server on loopback. External HTTP(S) requests are blocked and recorded. This is not physical phone, home Wi-Fi, casting, WKWebView, or native app evidence.',
    startedAt: new Date().toISOString(),
    commit: (() => { try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim(); } catch { return null; } })(),
    dirtyPaths: (() => { try { return execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: checkout, encoding: 'utf8' }).trim().split('\n').filter(Boolean); } catch { return []; } })(),
    checks, screenshots, externalRequests, errors, failedResponses,
  };
  return {
    browser, origin, evidence,
    protectCredential(token) { if (typeof token === 'string' && token) privateValues.add(token); },
    async page(name, viewport, options = {}) {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce', ...options });
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) {
          externalRequests.push({ page: name, url: url.origin + url.pathname });
          return route.abort('blockedbyclient');
        }
        return route.continue();
      });
      const page = await context.newPage();
      page.setDefaultTimeout(12_000);
      page.on('pageerror', error => errors.push({ page: name, message: redact(error.message) }));
      page.on('response', response => {
        if (response.status() >= 400 && !response.url().includes('/api/')) {
          const url = new URL(response.url());
          failedResponses.push({ page: name, status: response.status(), path: url.pathname });
        }
      });
      pages.push({ name, page, context });
      return page;
    },
    async screenshot(page, name) {
      await page.evaluate(() => document.fonts?.ready);
      const filename = `${label}-${name}.png`;
      await page.screenshot({ path: path.join(evidenceRoot, filename), fullPage: true, animations: 'disabled', mask: [...privateValues].map(token => page.getByText(token, { exact: false })) });
      screenshots.push({ file: filename, viewport: page.viewportSize() });
    },
    check(name, detail = true) { checks.push({ name, result: 'passed', detail }); },
    async room(code, token) {
      if (token) privateValues.add(token);
      const response = await fetch(`${origin}/api/rooms/${code}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      assert.equal(response.status, 200, `Read room ${response.status}`);
      return response.json();
    },
    async restartServer() {
      await server.close();
      server = await startLanServer({ root: runtimeRoot, databasePath: path.join(temp, 'rooms.sqlite'), host: '127.0.0.1', port, heartbeatMs: 200 });
    },
    async finish(error = null) {
      evidence.finishedAt = new Date().toISOString();
      evidence.result = error ? 'failed' : 'passed';
      if (error) {
        evidence.failure = { message: redact(error.message), stack: redact(error.stack) };
        for (const { name, page } of pages) {
          try { await this.screenshot(page, `failure-${name}`); } catch {}
        }
      }
      await writeFile(path.join(evidenceRoot, `${label}.json`), redact(JSON.stringify(evidence, null, 2)) + '\n');
      await browser.close();
      await server.close();
      await rm(temp, { recursive: true, force: true });
    },
  };
}

export async function waitUntil(fn, description, timeout = 12_000) {
  const until = performance.now() + timeout;
  while (performance.now() < until) {
    const result = await fn();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  throw new Error(`Timed out: ${description}`);
}

export async function noHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.ok(dimensions.scrollWidth <= dimensions.width + 1, `Horizontal overflow: ${JSON.stringify(dimensions)}`);
}

export async function credentials(page, code, role) {
  const value = await page.evaluate(({ code, role }) => {
    const saved = JSON.parse(localStorage.getItem('sofa-room:' + code) || '{}');
    return role === 'host' ? saved.hostToken : saved.playerTokens?.[role];
  }, { code, role });
  if (typeof value === 'string' && value) privateValues.add(value);
  return value;
}

export async function closeDialog(page) {
  const close = page.locator('[data-action="close-modal"]');
  if (await close.count()) await close.first().click();
}
