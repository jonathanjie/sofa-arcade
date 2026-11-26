/** Actual browser clients over insecure HTTP. Test-only; never serve this file. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, request as httpRequest } from 'node:http';
import { getGame } from '../games/catalog.mjs';
import { startLanServer } from './lan.mjs';
import { createPrivateApi, createPrivateEngine, openRoom, assertNoAuthoritySecrets } from './room-platform-fixture.mjs';

test('three isolated browser contexts use projected clients on ordinary HTTP with stable retries', { timeout: 60_000 }, async t => {
  // Install Playwright outside root dependencies, or point to an available runtime.
  const { chromium } = await import(process.env.SOFA_PLAYWRIGHT_MODULE || 'playwright');
  const host = await startLanServer({ host: '0.0.0.0', port: 0, databasePath: ':memory:', heartbeatMs: 100,
    roomApi: createPrivateApi(createPrivateEngine({ sessions: 1 })) });
  t.after(() => host.close());
  const origin = host.urls[0]?.replace(/\/$/, '');
  assert.ok(origin, 'A non-loopback interface is required to exercise insecure HTTP browser behavior.');
  const request = async (route, { body, token } = {}) => {
    return new Promise((resolve, reject) => {
      const message = httpRequest(host.origin + route, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Host: new URL(origin).host, ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body === undefined ? {} : { Origin: origin, 'Content-Type': 'application/json' }) },
      }, response => {
        const chunks = [];
        response.on('data', value => chunks.push(value));
        response.on('error', reject);
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          try { resolve({ status: response.statusCode, text, body: JSON.parse(text) }); } catch (error) { reject(error); }
        });
      });
      message.on('error', reject);
      message.end(body === undefined ? undefined : JSON.stringify(body));
    });
  };
  const live = await openRoom(request);
  const browser = await chromium.launch({ headless: true,
    ...(process.env.SOFA_CHROMIUM_EXECUTABLE ? { executablePath: process.env.SOFA_CHROMIUM_EXECUTABLE } : {}),
    args: ['--no-proxy-server'] });
  t.after(() => browser.close());
  const pages = {};
  const errors = [];
  const requestUrls = [];
  for (const viewer of ['host', 'jon', 'lydia']) {
    const context = await browser.newContext({ viewport: viewer === 'host' ? { width: 1280, height: 720 } : { width: 390, height: 844 } });
    const page = await context.newPage();
    pages[viewer] = page;
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', event => requestUrls.push(event.url()));
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    assert.deepEqual(await page.evaluate(() => ({ secure: isSecureContext, randomUUID: typeof crypto.randomUUID,
      randomValues: typeof crypto.getRandomValues })), { secure: false, randomUUID: 'undefined', randomValues: 'function' });
    await page.evaluate(async ({ code, token, playerId }) => {
      const { createRoomClient } = await import('/room-client.mjs');
      const { subscribeRoom } = await import('/transport.mjs');
      const state = { room: null, snapshots: [], statuses: [], postBodies: [], loseNextReply: false, stop: null, client: null };
      const onRoom = room => { state.room = room; state.snapshots.push(structuredClone(room)); };
      const onStatus = value => state.statuses.push(value);
      const fetcher = async (url, options) => {
        const isAction = options?.method === 'POST' && url.endsWith('/action');
        if (isAction) state.postBodies.push(options.body);
        const response = await fetch(url, options);
        if (isAction && response.ok && state.loseNextReply) {
          state.loseNextReply = false;
          await response.text();
          throw new Error('Simulated response loss after a real committed request.');
        }
        return response;
      };
      const initial = await fetch(`/api/rooms/${code}`, { headers: { Authorization: `Bearer ${token}` } }).then(response => response.json());
      if (playerId) state.client = createRoomClient({ code, token, playerId, initialRoom: initial, fetcher,
        onRoom, onStatus, retryMs: 5, requestTimeoutMs: 2500 });
      else onRoom(initial);
      state.start = () => { state.stop = subscribeRoom({ code, token, onRoom: state.client ? state.client.receive : onRoom,
        onStatus, retryMs: 5, idleTimeoutMs: 3000 }); };
      state.start();
      window.ws2 = state;
    }, { code: live.code, token: viewer === 'host' ? live.hostToken : live.tokens[viewer], playerId: viewer === 'host' ? null : viewer });
  }
  const waitForRevision = revision => Promise.all(Object.values(pages).map(page => page.waitForFunction(
    expected => window.ws2.room?.revision >= expected, revision)));
  const take = (page, type, fields = {}) => page.evaluate(async ({ type, fields }) => {
    const room = window.ws2.room;
    return window.ws2.client.submit({ type, matchId: room.state.matchId, phaseId: room.state.phaseId, ...fields });
  }, { type, fields });

  await waitForRevision(live.game.revision);
  const first = await take(pages.jon, 'commitCouncil', { choiceId: 'keep', bid: 1 });
  await waitForRevision(first.revision);
  for (const [viewer, page] of Object.entries(pages)) {
    const snapshot = await page.evaluate(() => window.ws2.room);
    assert.deepEqual(snapshot.state.council.ownCommitment, viewer === 'jon' ? { choiceId: 'keep', bid: 1 } : null);
    assert.equal(snapshot.state.players.jon.influence, 2);
    assert.equal(snapshot.state.players.lydia.influence, 2);
    const serialized = JSON.stringify(await page.evaluate(() => window.ws2.snapshots));
    assertNoAuthoritySecrets(serialized, [live.hostToken, ...Object.values(live.tokens)]);
    if (viewer !== 'jon') assert.ok(!serialized.includes('"bid":'), `${viewer} sees readiness only`);
  }

  // Restore only this phone's locked vote through authenticated GET and a new SSE.
  const recovered = await pages.jon.evaluate(async () => {
    window.ws2.stop();
    const room = await window.ws2.client.reconnect();
    window.ws2.start();
    return room;
  });
  assert.deepEqual(recovered.state.council.ownCommitment, { choiceId: 'keep', bid: 1 });
  let current = await take(pages.lydia, 'commitCouncil', { choiceId: 'keep', bid: 2 });
  await waitForRevision(current.revision);
  assert.equal(current.state.players.jon.influence, 1);
  assert.equal(current.state.players.lydia.influence, 0);
  assert.deepEqual(current.state.lastCouncil.choices, { jon: { choiceId: 'keep', bid: 1 }, lydia: { choiceId: 'keep', bid: 2 } });

  let winningActor;
  let oldAction;
  while (current.phase === 'playing') {
    const actor = current.state.activePlayer;
    if (current.state.actionIndex === 5) {
      winningActor = actor;
      oldAction = { type: 'work', matchId: current.state.matchId, phaseId: current.state.phaseId };
      await pages[actor].evaluate(() => { window.ws2.loseNextReply = true; });
    }
    current = await take(pages[actor], 'work');
    await waitForRevision(current.revision);
  }
  assert.equal(current.revision, live.game.revision + 8, 'two commitments and six city actions, exactly once');
  const sent = await pages[winningActor].evaluate(() => window.ws2.postBodies.slice(-2));
  assert.equal(sent.length, 2);
  assert.equal(sent[0], sent[1], 'the lost winning response retries the identical ID, revision and action');
  assert.match(JSON.parse(sent[0]).actionId, /^[a-f0-9]{48}$/);

  const rematch = await request(`/api/rooms/${live.code}/rematch`, { token: live.hostToken, body: {} });
  assert.equal(rematch.status, 200);
  await waitForRevision(rematch.body.revision);
  const stale = await pages[winningActor].evaluate(async action => {
    const before = window.ws2.postBodies.length;
    try { await window.ws2.client.submit(action); return { accepted: true }; }
    catch (error) { return { code: error.code, posts: window.ws2.postBodies.length - before }; }
  }, oldAction);
  assert.deepEqual(stale, { code: 'stale_match', posts: 0 });
  for (const page of Object.values(pages)) {
    const data = await page.evaluate(() => ({ room: window.ws2.room, statuses: window.ws2.statuses }));
    assert.equal(data.room.state.council.ownCommitment, null);
    assert.ok(data.statuses.some(value => value.state === 'connected'));
    assert.ok(data.statuses.every(value => ['connecting', 'connected', 'reconnecting', 'offline', 'error'].includes(value.state)));
    await page.evaluate(() => { window.ws2.stop(); window.ws2.client?.dispose(); });
  }
  assert.deepEqual(errors, []);
  for (const token of [live.hostToken, ...Object.values(live.tokens)]) assert.ok(!requestUrls.some(url => url.includes(token)));
  t.diagnostic('Chromium: three isolated contexts, non-loopback insecure HTTP, projected snapshots, lock reconnect, complete fixture match, lost-response identity, rematch fencing.');
  t.diagnostic('This is a same-machine browser/protocol test; no physical Wi-Fi, TV, native Tauri, or production Odd Laws UI is exercised.');
});

test('a distinct loopback origin cannot frame the LAN game, and direct navigation permits browser writes', async t => {
  const { chromium } = await import(process.env.SOFA_PLAYWRIGHT_MODULE || 'playwright');
  const host = await startLanServer({ host: '127.0.0.1', port: 0, databasePath: ':memory:' });
  t.after(() => host.close());
  const frameOrigin = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><iframe title="Game" src="${host.origin}/"></iframe>`);
  });
  frameOrigin.listen(0, '127.0.0.1');
  await once(frameOrigin, 'listening');
  t.after(() => new Promise(resolve => frameOrigin.close(resolve)));
  const browser = await chromium.launch({ headless: true,
    ...(process.env.SOFA_CHROMIUM_EXECUTABLE ? { executablePath: process.env.SOFA_CHROMIUM_EXECUTABLE } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const messages = [];
  page.on('console', message => messages.push(message.text()));
  await page.goto(`http://127.0.0.1:${frameOrigin.address().port}`);
  assert.ok(page.frames().every(frame => frame.url() !== host.origin + '/'));
  assert.ok(messages.some(message => message.includes('frame-ancestors')));
  await page.goto(host.origin);
  const status = await page.evaluate(async () => {
    const response = await fetch('/api/rooms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    return response.status;
  });
  assert.equal(status, 201);
});

test('all playable LAN games show their TV and both controllers under the document CSP', async t => {
  const { chromium } = await import(process.env.SOFA_PLAYWRIGHT_MODULE || 'playwright');
  const host = await startLanServer({ port: 0, databasePath: ':memory:' });
  t.after(() => host.close());
  const origin = new URL(host.urls[0]).origin;
  const browser = await chromium.launch({ executablePath: process.env.SOFA_CHROMIUM_EXECUTABLE,
    args: ['--no-proxy-server'] });
  t.after(() => browser.close());

  for (const [game, board, controller] of [
    ['sofa-kingdoms', '.board-shell', '.clean-controller'],
    ['odd-laws-society', '.ols-shell-tv', '.ols-shell-phone'],
    ['gravity-orchard', '.go-tv-header', '[data-go3="phone"]'],
  ]) {
    await t.test(game, async t => {
      const violations = [];
      async function screen() {
        const page = await browser.newPage();
        t.after(() => page.close());
        page.on('console', message => {
          if (/content.security.policy/i.test(message.text())) violations.push(message.text());
        });
        await page.exposeFunction('recordCspViolation', directive => violations.push(directive));
        await page.addInitScript(() => document.addEventListener('securitypolicyviolation',
          event => window.recordCspViolation(event.effectiveDirective)));
        return page;
      }
      const tv = await screen();
      await tv.goto(origin + '/?game=' + game);
      await tv.locator('[data-action="create"]').click();
      await tv.locator('#room-qr svg').waitFor();
      const room = new URL(tv.url()).searchParams.get('room');
      assert.ok(room);
      const phones = await Promise.all(['jon', 'lydia'].map(async seat => {
        const page = await screen();
        await page.goto(origin + '/?join=' + room);
        await page.locator('[data-action="claim"][data-player="' + seat + '"]').click();
        return page;
      }));
      await tv.locator('[data-action="start"]').click();
      await tv.locator(board).waitFor();
      if (game === 'sofa-kingdoms') {
        await tv.locator('html.generated-art').waitFor({ state: 'attached' });
      }
      for (let reload = 0; reload < 3; reload++) {
        await Promise.all(phones.map(async phone => {
          await phone.locator(controller).waitFor();
          await phone.reload({ waitUntil: 'domcontentloaded' });
        }));
      }
      await Promise.all(phones.map(phone => phone.locator(controller).waitFor()));
      assert.deepEqual(violations, []);
    });
  }
});

test('an unavailable room returns to code entry and room history restores the correct screen', async t => {
  const { chromium } = await import(process.env.SOFA_PLAYWRIGHT_MODULE || 'playwright');
  const host = await startLanServer({ host: '127.0.0.1', port: 0, databasePath: ':memory:' });
  const browser = await chromium.launch({ executablePath: process.env.SOFA_CHROMIUM_EXECUTABLE });
  t.after(async () => { await browser.close(); await host.close(); });
  const page = await browser.newPage();
  let releaseModule;
  const moduleGate = new Promise(resolve => { releaseModule = resolve; });
  await page.route('**/app.js*', async route => {
    await moduleGate;
    await route.continue();
  });
  await page.goto(host.origin + '/?room=ZZZZZZ', { waitUntil: 'commit' });
  try {
    await page.locator('#startup[role="status"]').waitFor();
  } finally {
    releaseModule();
  }
  await page.locator('#room-input').waitFor();
  assert.equal(await page.locator('[data-action="claim"]').count(), 0);
  assert.ok(await page.locator('#room-input').evaluate(input => input === document.activeElement));

  await page.goto(host.origin + '/?game=sofa-kingdoms');
  await page.locator('[data-action="create"]').click();
  await page.locator('.room-code').waitFor();
  const roomUrl = page.url();
  await page.locator('.brand').click();
  await page.locator('[data-action="leave"]').click();
  await page.locator('.arcade-home').waitFor();
  await page.goBack();
  await page.locator('.room-code').waitFor();
  assert.equal(page.url(), roomUrl);
  assert.match(await page.title(), /Lobby/);
  await page.goForward();
  await page.locator('.arcade-home').waitFor();
  assert.equal(await page.title(), 'Sofa Arcade — Games for two');
});

async function openShelf(t, options = {}) {
  const { chromium } = await import(process.env.SOFA_PLAYWRIGHT_MODULE || 'playwright');
  const host = await startLanServer({ host: '127.0.0.1', port: 0, databasePath: ':memory:' });
  t.after(() => host.close());
  const browser = await chromium.launch({ executablePath: process.env.SOFA_CHROMIUM_EXECUTABLE });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1480, height: 1000 }, ...options });
  page.setDefaultTimeout(10_000);
  return { page, origin: host.origin };
}

function shelfTab(page, name) {
  return page.getByRole('tab', { name, exact: true });
}

const twoPlayerGames = ['sofa-kingdoms', 'gravity-orchard', 'odd-laws-society'];
const partyGames = ['tap-race', 'dont-wake-lala', 'dust-bunny-sumo', 'wall-of-paddles', 'tug-of-yarn', 'snack-stack', 'whiteout-drift', 'balloon-bop', 'wobble-tower', 'timber-rush', 'head-hop'];

async function assertShelfTab(page, name, otherName) {
  const selected = shelfTab(page, name);
  const other = shelfTab(page, otherName);
  await page.waitForFunction(tabName => [...document.querySelectorAll('[role="tab"]')].some(
    tab => tab.textContent.trim().includes(tabName) && tab.getAttribute('aria-selected') === 'true'), name);
  assert.equal(await selected.getAttribute('aria-selected'), 'true');
  assert.equal(await selected.getAttribute('tabindex'), '0');
  assert.equal(await other.getAttribute('aria-selected'), 'false');
  assert.equal(await other.getAttribute('tabindex'), '-1');
  const panel = page.getByRole('tabpanel', { name, exact: true });
  assert.equal(await panel.count(), 1);
  assert.equal(await panel.getAttribute('id'), await selected.getAttribute('aria-controls'));
  assert.equal(await panel.getAttribute('aria-labelledby'), await selected.getAttribute('id'));
  assert.equal(await page.getByRole('tabpanel').count(), 1, 'Only the selected panel is exposed');
  return panel;
}

async function assertSlide(page, gameId) {
  const slide = page.locator('.featured-game[aria-hidden="false"]');
  assert.equal(await slide.count(), 1, 'Exactly one slide is exposed');
  assert.equal(await slide.getAttribute('aria-roledescription'), 'slide');
  assert.ok(await slide.getAttribute('aria-label') || await slide.getAttribute('aria-labelledby'));
  assert.equal(await slide.locator('h2').textContent(), getGame(gameId).title);
  assert.equal(await slide.locator('.featured-copy > p').textContent(), getGame(gameId).description);
  assert.equal(await slide.locator('[data-action="open-game"]').getAttribute('data-game'), gameId, 'Feature copy and action agree');
  for (const inactive of await page.locator('.featured-game[aria-hidden="true"]').all()) {
    assert.equal(await inactive.evaluate(element => element.inert), true, 'Inactive slide actions are not keyboard targets');
  }
  return slide;
}

test('shelf mode tabs use roving focus, filter cards and preserve browser history', async t => {
  const { page, origin } = await openShelf(t, { reducedMotion: 'reduce' });
  await page.goto(origin);
  await page.getByRole('tablist').waitFor();
  const twoPlayer = await assertShelfTab(page, '2 player', 'Party');
  assert.deepEqual(await twoPlayer.locator('.game-card').evaluateAll(cards => cards.map(card => card.dataset.game)),
    [...twoPlayerGames, 'borrowed-minutes', 'afterglow-market', 'last-ninety-seconds', 'footprints-at-midnight']);
  await assertSlide(page, 'sofa-kingdoms');
  assert.ok(await page.getByRole('button', { name: 'Join a room', exact: true }).isVisible());

  await shelfTab(page, '2 player').focus();
  await page.keyboard.press('ArrowRight');
  const party = await assertShelfTab(page, 'Party', '2 player');
  assert.equal(await shelfTab(page, 'Party').evaluate(tab => tab === document.activeElement), true);
  assert.equal(new URL(page.url()).hash, '#party');
  assert.deepEqual(await party.locator('.game-card').evaluateAll(cards => cards.map(card => card.dataset.game)), partyGames);
  await assertSlide(page, 'tap-race');
  const join = page.locator('.shelf-intro').getByRole('link', { name: 'Join a party', exact: true });
  assert.equal(await join.getAttribute('href'), '/?party=join');
  assert.equal(await page.getByRole('button', { name: 'Join a room', exact: true }).count(), 0);

  await page.keyboard.press('Home');
  await assertShelfTab(page, '2 player', 'Party');
  await page.keyboard.press('End');
  await assertShelfTab(page, 'Party', '2 player');
  await page.keyboard.press('ArrowLeft');
  await assertShelfTab(page, '2 player', 'Party');
  await page.goBack();
  await assertShelfTab(page, 'Party', '2 player');
  await page.reload();
  await assertShelfTab(page, 'Party', '2 player');
  await page.goForward();
  await assertShelfTab(page, '2 player', 'Party');
  await page.goto(origin + '/#unknown-mode');
  await assertShelfTab(page, '2 player', 'Party');
  await page.goto(origin + '/#party');
  await join.click();
  await page.getByRole('button', { name: 'Find party', exact: true }).waitFor();
  await page.getByRole('link', { name: /Game shelf/ }).click();
  await assertShelfTab(page, 'Party', '2 player');
  for (const gameId of partyGames) {
    await page.locator(`.game-card[data-game="${gameId}"]`).click();
    assert.equal(await page.locator('.concept-detail h1').textContent(), getGame(gameId).title);
    const host = page.getByRole('link', { name: 'Host on the TV', exact: true });
    assert.equal(await host.getAttribute('href'), `/?party=host&game=${gameId}`);
    await page.getByRole('button', { name: 'All games', exact: true }).click();
    await assertShelfTab(page, 'Party', '2 player');
  }
});

test('featured slideshow pauses for hover, focus, page visibility and reduced motion', async t => {
  const { page, origin } = await openShelf(t);
  await page.clock.install();
  await page.goto(origin);
  const carousel = page.getByRole('region', { name: 'Featured games', exact: true });
  await carousel.waitFor();
  assert.equal(await carousel.getAttribute('aria-roledescription'), 'carousel');
  const announcement = carousel.locator('[aria-live]');
  const dots = carousel.locator('.carousel-dot');
  assert.deepEqual(await dots.evaluateAll(elements => elements.map(dot => dot.getAttribute('aria-label'))),
    ['Show Sofa Kingdoms', 'Show Gravity Orchard', 'Show The Odd Laws Society']);
  assert.deepEqual(await carousel.locator('.featured-image > img').evaluateAll(images => images.map(
    image => [image.getAttribute('loading') ?? 'eager', image.hasAttribute('alt') && image.alt.length > 0])), [
    ['eager', true], ['lazy', true], ['lazy', true],
  ]);
  await assertSlide(page, 'sofa-kingdoms');
  const heroHeight = (await carousel.locator('.featured-slides').boundingBox()).height;
  assert.equal(await announcement.getAttribute('aria-live'), 'off');
  await page.clock.fastForward(7300);
  await assertSlide(page, 'gravity-orchard');
  assert.equal(await announcement.getAttribute('aria-live'), 'off', 'Autoplay does not announce slides');
  assert.equal((await carousel.locator('.featured-slides').boundingBox()).height, heroHeight);

  await page.locator('.featured-game[aria-hidden="false"] .featured-image').hover();
  await page.clock.fastForward(8000);
  await assertSlide(page, 'gravity-orchard');
  await page.mouse.move(1, 1);
  await page.clock.fastForward(8000);
  await assertSlide(page, 'odd-laws-society');
  assert.equal((await carousel.locator('.featured-slides').boundingBox()).height, heroHeight);

  const sofa = carousel.getByRole('button', { name: 'Show Sofa Kingdoms', exact: true });
  await sofa.focus();
  await page.clock.fastForward(8000);
  await assertSlide(page, 'odd-laws-society');
  await sofa.press('Enter');
  await assertSlide(page, 'sofa-kingdoms');
  assert.equal(await sofa.getAttribute('aria-current'), 'true');
  assert.equal(await announcement.getAttribute('aria-live'), 'polite');
  assert.match(await announcement.textContent(), /Sofa Kingdoms/);
  await shelfTab(page, '2 player').focus();

  // Headless Chromium does not reliably background tabs. Change the visibility
  // properties and dispatch the same event as a real tab switch.
  await page.evaluate(() => {
    Object.defineProperties(document, {
      hidden: { value: true, configurable: true },
      visibilityState: { value: 'hidden', configurable: true },
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.fastForward(8000);
  await assertSlide(page, 'sofa-kingdoms');
  await page.evaluate(() => {
    delete document.hidden;
    delete document.visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.fastForward(8000);
  await assertSlide(page, 'gravity-orchard');
  assert.equal(await announcement.getAttribute('aria-live'), 'off');

  await carousel.getByRole('button', { name: 'Pause slideshow', exact: true }).click();
  await page.mouse.move(1, 1);
  await shelfTab(page, '2 player').focus();
  await page.clock.fastForward(8000);
  await assertSlide(page, 'gravity-orchard');
  await carousel.getByRole('button', { name: 'Start slideshow', exact: true }).click();
  await page.mouse.move(1, 1);
  await shelfTab(page, '2 player').focus();
  await page.clock.fastForward(8000);
  await assertSlide(page, 'odd-laws-society');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await carousel.locator('.carousel-rotation').waitFor({ state: 'hidden' });
  await page.clock.fastForward(15_000);
  await assertSlide(page, 'odd-laws-society');
  await sofa.click();
  const still = await assertSlide(page, 'sofa-kingdoms');
  const durations = await still.evaluate(element => getComputedStyle(element).transitionDuration.split(',').map(parseFloat));
  assert.ok(durations.every(duration => duration === 0), 'Reduced motion disables the crossfade');
  await page.mouse.move(1, 1);
  await shelfTab(page, '2 player').focus();
  await page.clock.fastForward(15_000);
  await assertSlide(page, 'sofa-kingdoms');
});

test('a phone can swipe a party hero and select its matching game', async t => {
  const { page, origin } = await openShelf(t, {
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce',
  });
  await page.goto(origin + '/#party');
  await shelfTab(page, 'Party').waitFor();
  await assertSlide(page, 'tap-race');
  const art = page.locator('.featured-game[aria-hidden="false"] .featured-image');
  await art.scrollIntoViewIfNeeded();
  const bounds = await art.boundingBox();
  const y = bounds.y + bounds.height / 2;
  const left = bounds.x + bounds.width * 0.2;
  const right = bounds.x + bounds.width * 0.8;
  const touch = await page.context().newCDPSession(page);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: right, y }] });
  for (let step = 1; step <= 6; step++) {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: right + (left - right) * step / 6, y }] });
  }
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const second = await assertSlide(page, 'dont-wake-lala');
  // The swipe above uses real touch input. Linux headless Chromium does not
  // synthesize a click after a later synthesized tap, so select with a click.
  await second.locator('[data-action="open-game"]').click();
  // Wait for the detail page: before it opens, the hero and the shelf card both show this title.
  try {
    await page.getByRole('heading', { level: 1, name: "Don't Wake Lala", exact: true }).waitFor();
  } catch (error) {
    // Record what the phone shows so a CI-only failure can be diagnosed.
    const shown = await page.evaluate(() => ({
      url: location.href,
      headings: [...document.querySelectorAll('h1, h2')].map(h => `${h.tagName} ${h.textContent} hidden=${Boolean(h.closest('[aria-hidden="true"], [inert]'))}`),
      active: document.activeElement?.outerHTML.slice(0, 160),
    }));
    error.message += '\n' + JSON.stringify(shown, null, 2);
    throw error;
  }
  await page.getByRole('link', { name: 'Host on the TV' }).waitFor();
});

test('hosted shelf retains party games as local-only without exposing party creation', async t => {
  const { page, origin } = await openShelf(t, { reducedMotion: 'reduce' });
  // Serve the same collection document without capability metadata injected by
  // the local host. This exercises the hosted UI path without starting a Worker.
  await page.route(url => url.origin === origin && url.pathname === '/', async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace(/<meta name="sofa-(?:transport|party|join-origin|gravity-orchard)" content="[^"]*">/g, '');
    await route.fulfill({ response, body });
  });
  await page.goto(origin + '/#party');
  const panel = await assertShelfTab(page, 'Party', '2 player');
  assert.equal(await panel.locator('.game-card').count(), partyGames.length);
  for (const card of await panel.locator('.game-card').all()) {
    assert.match(await card.textContent(), /Local host only/);
  }
  const slide = await assertSlide(page, 'tap-race');
  assert.match(await slide.textContent(), /Local host only/);
  assert.equal(await page.getByRole('button', { name: 'Join a party', exact: true }).isDisabled(), true);
  await slide.locator('[data-action="open-game"]').click();
  assert.equal(await page.getByRole('link', { name: 'Host on the TV' }).count(), 0);
  assert.match(await page.locator('.concept-detail').textContent(), /Local host only/);
});
