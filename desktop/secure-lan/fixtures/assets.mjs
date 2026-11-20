// Exact development fixture allowlist. Callers must match URL.pathname exactly.
// Paths are relative to repository root; never concatenate an incoming pathname.
export const SECURE_LAN_FIXTURE_ASSETS = Object.freeze([
  { route: '/secure-lan/setup', file: 'desktop/secure-lan/fixtures/setup.html', type: 'text/html; charset=utf-8' },
  { route: '/secure-lan/index.mjs', file: 'desktop/secure-lan/index.mjs', type: 'text/javascript; charset=utf-8' },
  { route: '/secure-lan/setup.css', file: 'desktop/secure-lan/setup.css', type: 'text/css; charset=utf-8' },
  { route: '/secure-lan/fixture.mjs', file: 'desktop/secure-lan/fixtures/fixture.mjs', type: 'text/javascript; charset=utf-8' },
  { route: '/secure-lan/diagnostic', file: 'desktop/secure-lan/diagnostic.html', type: 'text/html; charset=utf-8' },
  { route: '/secure-lan/diagnostic.mjs', file: 'desktop/secure-lan/diagnostic.mjs', type: 'text/javascript; charset=utf-8' },
  { route: '/secure-lan/diagnostic-page.mjs', file: 'desktop/secure-lan/diagnostic-page.mjs', type: 'text/javascript; charset=utf-8' },
  { route: '/secure-lan/diagnostic.css', file: 'desktop/secure-lan/diagnostic.css', type: 'text/css; charset=utf-8' },
].map(Object.freeze));

export const FIXTURE_ASSETS = Object.freeze(Object.fromEntries(SECURE_LAN_FIXTURE_ASSETS.map(({ route, file }) => [route, file])));
