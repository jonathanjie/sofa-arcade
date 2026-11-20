/** Runs inside the actual macOS WKWebView, not Chromium or a fixture page. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { evidenceDir, hostStatus, joinBoth, request, saveEvidence } from '../../../desktop/tests/native/helpers.mjs';
import { choosePublicAction, phaseAction } from '../fixtures/odd-laws-policy.mjs';
import * as rules from '../../../games/odd-laws-society/preview.mjs';

// The desktop owns its pinned WebDriver dependencies; root has no second copy.
const requireDesktop = createRequire(new URL('../../../desktop/package.json', import.meta.url));
const { browser, $ } = await import(pathToFileURL(requireDesktop.resolve('@wdio/globals')).href);
const phase = process.env.SOFA_INTEGRATION_NATIVE_PHASE;
const fixture = process.env.SOFA_INTEGRATION_NATIVE_FIXTURE;
const screenshot = name => browser.saveScreenshot(path.join(evidenceDir, `integration-native-${name}.png`));
const names = { jon: 'Jon', lydia: 'Lydia' };

async function mainWindow() {
  await browser.waitUntil(async () => (await browser.getWindowHandles()).includes('main'), { timeout: 25_000, timeoutMsg: 'Actual native main WKWebView did not open' });
  await browser.switchToWindow('main');
  await browser.waitUntil(async () => /^http:\/\/127\.0\.0\.1:\d+\//.test(await browser.getUrl()), { timeoutMsg: 'Native main window did not navigate to its ready host' });
  return hostStatus(value => value.state === 'ready');
}

/** Return only a host-projected envelope; the credential stays inside WK storage. */
async function nativeRoom(code) {
  const result = await browser.executeAsync((code, done) => {
    let token;
    try { token = JSON.parse(localStorage.getItem('sofa-room:' + code) || '{}').hostToken; } catch {}
    if (typeof token !== 'string' || !token) { done({ ok: false, reason: 'Missing saved native host credential' }); return; }
    fetch(`/api/rooms/${code}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async response => ({ ok: response.ok, status: response.status, room: await response.json() }))
      .then(done, () => done({ ok: false, reason: 'Native host projection request failed' }));
  }, code);
  assert.equal(result.ok, true, result.reason || `Native host projection HTTP ${result.status}`);
  assert.equal(result.room.hostToken, undefined);
  assert.equal(result.room.playerToken, undefined);
  return result.room;
}

async function boardAt(room) {
  await $('.ols-tv').waitForDisplayed();
  const state = room.state;
  await browser.waitUntil(() => browser.execute(expected => {
    const root = document.querySelector('.ols-tv');
    if (Number(root?.querySelector('.ols-tv-session-number')?.textContent.trim().split('/')[0]) !== expected.session) return false;
    for (const id of ['jon', 'lydia']) {
      const borough = root.querySelector(`.ols-tv-borough[data-player-id="${id}"]`);
      for (const key of ['coins', 'influence']) if (Number(borough?.querySelector(`[data-resource="${key}"] strong`)?.textContent) !== expected.players[id][key]) return false;
      const city = [...borough.querySelectorAll('.ols-city-grid [data-instance-id]')].map(node => node.dataset.instanceId).sort();
      if (JSON.stringify(city) !== JSON.stringify(expected.players[id].city.filter(Boolean).map(plot => plot.instanceId).sort())) return false;
    }
    if (expected.stage === 'council') return ['jon', 'lydia'].every(id => root.querySelector(`.ols-tv-ballot[data-envelope="${id}"]`)?.classList.contains('is-sealed') === expected.council.ready[id]);
    return root.querySelector('.ols-tv-borough.is-active')?.dataset.playerId === expected.activePlayer;
  }, state), { timeout: 10_000, timeoutMsg: 'WKWebView did not render the authoritative Odd Laws projection' });
}

async function verifyNativeModulesAndMedia(room) {
  const result = await browser.executeAsync(async (publicView, done) => {
    try {
      const [view, catalog, previews, client, score] = await Promise.all([
        import('/games/odd-laws-society/index.mjs'), import('/games/odd-laws-society/catalog.mjs'),
        import('/games/odd-laws-society/preview.mjs'), import('/room-client.mjs'), import('/media/odd-laws-society/score.mjs'),
      ]);
      const manifestUrl = new URL('/assets/odd-laws-society/manifest.json', location.origin);
      const response = await fetch(manifestUrl);
      if (!response.ok) throw new Error('Native media manifest unavailable');
      const manifest = await response.json();
      const entries = [];
      const visit = value => {
        if (!value || typeof value !== 'object') return;
        if (typeof value.src === 'string') entries.push(value);
        for (const item of Object.values(value)) visit(item);
      };
      visit(manifest);
      const unique = new Map();
      for (const entry of entries) {
        const url = new URL(entry.src, manifestUrl);
        if (url.origin !== location.origin || !url.pathname.startsWith('/assets/odd-laws-society/')) throw new Error('Native media references an external or escaped URL');
        if (entry.status !== 'final' || !Number.isSafeInteger(entry.width) || !Number.isSafeInteger(entry.height) || !entry.alt) throw new Error('Native release media lacks final dimensions or alternative text');
        unique.set(url.href, entry);
      }
      for (const [url, entry] of unique) {
        const image = new Image();
        image.src = url;
        await image.decode();
        if (image.naturalWidth !== entry.width || image.naturalHeight !== entry.height) throw new Error('Native decoded media dimensions disagree with manifest');
      }
      const quote = previews.buildQuote(publicView, 'jon', publicView.market[0].designId);
      const external = performance.getEntriesByType('resource').map(entry => new URL(entry.name, location.href)).filter(url => ['http:', 'https:'].includes(url.protocol) && url.origin !== location.origin).map(url => url.origin + url.pathname);
      done({
        ok: true, moduleTypes: [typeof view.mount, typeof previews.buildQuote, typeof previews.streetOutcome, typeof previews.civicAward, typeof client.createRoomClient, typeof score.eventsForBar],
        schemaVersion: manifest.schemaVersion, gameId: manifest.gameId,
        buildings: Object.keys(manifest.buildings || {}).sort(), laws: Object.keys(manifest.laws || {}).sort(),
        expectedBuildings: catalog.BUILDINGS.map(item => item.id).sort(), expectedLaws: catalog.LAWS.map(item => item.id).sort(),
        requiredEntries: entries.length, decodedImages: unique.size, quoteCost: quote.cost,
        scoreTitle: score.SCORE.title, scoreEvents: score.eventsForBar(0, 'council').length,
        characterMedia: [...document.querySelectorAll('.ols [data-character] img[data-ols-media]')].filter(image => image.complete && image.naturalWidth > 0).length,
        externalRequests: external,
        viewport: { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth },
      });
    } catch (error) { done({ ok: false, reason: error.message }); }
  }, room.state);
  assert.equal(result.ok, true, result.reason);
  assert.ok(result.moduleTypes.every(type => type === 'function'));
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.gameId, 'odd-laws-society');
  assert.deepEqual(result.buildings, result.expectedBuildings);
  assert.deepEqual(result.laws, result.expectedLaws);
  assert.ok(result.requiredEntries >= 54 && result.decodedImages > 0, 'Every required media leaf is delivered and decoded in WKWebView');
  assert.ok(result.characterMedia >= 3, 'Both borough portraits and Lala use decoded delivered artwork');
  assert.ok(Number.isFinite(result.quoteCost) && result.quoteCost >= 1);
  assert.ok(result.scoreEvents > 0 && typeof result.scoreTitle === 'string');
  assert.deepEqual(result.externalRequests, []);
  assert.ok(result.viewport.scrollWidth <= result.viewport.width + 1, 'Native TV board has no horizontal document overflow');
  return result;
}

describe(`WS6 integrated real WKWebView (${phase})`, () => {
  it('loads the combined local runtime and restores a saved Odd Laws host through bare root', async function () {
    this.timeout(180_000);
    const status = await mainWindow();
    const origin = `http://127.0.0.1:${status.port}`;
    assert.equal(await browser.execute(() => typeof window.__TAURI__ !== 'undefined'), false, 'Game content has no global native API');
    if (phase === 'exited') {
      const saved = JSON.parse(await readFile(fixture, 'utf8'));
      assert.equal(origin, saved.origin);
      assert.notEqual(status.parentPid, saved.relaunchParentPid, 'Collection exit is checked in another native process');
      await $('.arcade-home').waitForDisplayed();
      await browser.url(origin + '/');
      await $('.arcade-home').waitForDisplayed();
      assert.equal(new URL(await browser.getUrl()).search, '');
      assert.equal(await $('.ols-tv').isExisting(), false);
      await screenshot('exited-collection');
      await saveEvidence('integration-native-exited.json', { passed: true, nativePidChanged: true, explicitExitClearedSavedSession: true, freshRootRemainsCollection: true });
      return;
    }
    if (phase === 'relaunch') {
      const saved = JSON.parse(await readFile(fixture, 'utf8'));
      assert.equal(origin, saved.origin);
      assert.notEqual(status.parentPid, saved.parentPid, 'Restore must happen in a distinct native application process');
      // No room query or credential is supplied to the new native document.
      await browser.url(origin + '/');
      await boardAt(saved.room);
      const url = new URL(await browser.getUrl());
      assert.equal(url.searchParams.get('room'), saved.code);
      assert.equal(url.searchParams.has('join'), false);
      const room = await nativeRoom(saved.code);
      assert.equal(room.revision, saved.room.revision);
      assert.deepEqual(room.state, saved.room.state);
      assert.equal(await browser.execute(() => localStorage.getItem('sofa-native-integration-marker')), saved.marker);
      await screenshot('root-restored-odd-laws');
      await $('.ols-toolbar [data-action="exit"]').click();
      await $('.arcade-home').waitForDisplayed();
      assert.equal(await browser.execute(() => JSON.parse(localStorage.getItem('sofa-last-local-session-v1') || 'null')), null);
      assert.equal(await browser.execute(() => document.querySelectorAll('link[data-odd-laws-style]').length), 0);
      await writeFile(fixture, JSON.stringify({ ...saved, relaunchParentPid: status.parentPid }, null, 2) + '\n', { mode: 0o600 });
      await saveEvidence('integration-native-relaunch.json', { passed: true, nativePidChanged: true, stableOrigin: true, bareRootRestoredHostRole: true, savedCredentialReusedInWKWebView: true, sqliteStateRestored: true, explicitExitDisposesView: true });
      return;
    }
    assert.equal(phase, 'first');
    await $('.arcade-home').waitForDisplayed();
    await $('[data-action="open-game"][data-game="odd-laws-society"]').click();
    await $('.odd-laws-detail [data-action="create"]').waitForDisplayed();
    await $('.odd-laws-detail [data-action="create"]').click();
    await $('.room-code').waitForDisplayed();
    const code = (await $('.room-code').getText()).trim();
    assert.match(code, /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    const tokens = await joinBoth(origin, code);
    await browser.waitUntil(async () => await $('[data-action="start"]').isEnabled());
    await $('[data-action="start"]').click();
    await $('.ols-tv').waitForDisplayed();
    let room = await nativeRoom(code);
    await boardAt(room);
    assert.equal(room.state.gameId, 'odd-laws-society');
    assert.equal(room.state.council.ownCommitment, null);
    const media = await verifyNativeModulesAndMedia(room);
    await screenshot('odd-laws-council');
    const initial = room;
    for (const id of ['jon', 'lydia']) {
      const vote = phaseAction(initial.state, 'commitCouncil', { choiceId: initial.state.council.optionIds[id === 'jon' ? 0 : 1], bid: id === 'jon' ? 1 : 0 });
      await request(origin, `/api/rooms/${code}/action`, { token: tokens[id], body: { revision: room.revision, actionId: crypto.randomUUID(), action: vote } });
      room = await nativeRoom(code);
      if (id === 'jon') {
        assert.equal(room.state.council.ownCommitment, null, 'Native TV host never receives the phone vote');
        assert.equal(room.state.players.jon.influence, initial.state.players.jon.influence);
        await boardAt(room);
        await screenshot('sealed-public-tv');
      }
    }
    await boardAt(room);
    assert.equal(room.state.stage, 'actions');
    assert.equal(room.state.players.jon.influence, initial.state.players.jon.influence - 1);
    const actor = room.state.activePlayer;
    const action = choosePublicAction(room.state, actor, rules, 'rich');
    assert.equal(action.type, 'build');
    await request(origin, `/api/rooms/${code}/action`, { token: tokens[actor], body: { revision: room.revision, actionId: crypto.randomUUID(), action } });
    room = await nativeRoom(code);
    await boardAt(room);
    assert.equal(room.state.players[actor].city.filter(Boolean).length, 1);
    await $(`.ols-tv-borough[data-player-id="${actor}"] .ols-plot-built`).click();
    await $('.ols-drawer').waitForDisplayed();
    assert.match(await $('.ols-inspect-quotes').getText(), new RegExp(`${names[actor]}.*price`, 'is'));
    await $('[data-action="close-drawer"]').click();
    await screenshot('odd-laws-built-city');
    const marker = crypto.randomUUID();
    await browser.execute(marker => localStorage.setItem('sofa-native-integration-marker', marker), marker);
    await writeFile(fixture, JSON.stringify({ code, origin, parentPid: status.parentPid, marker, room }, null, 2) + '\n', { mode: 0o600 });
    await saveEvidence('integration-native-first.json', {
      passed: true, collectionCreateThroughNativeUI: true, authenticatedHttpPhoneSeats: 2,
      actualOddLawsCouncilAndBuildRendered: true, nativeHostSealedProjectionPrivate: true,
      publicHelpersAndInspector: true, media,
    });
  });
});
