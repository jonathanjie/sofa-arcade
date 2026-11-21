import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { browser, $ } from '@wdio/globals';
import { legalActions } from '../../../game/engine.mjs';
import { evidenceDir, hostStatus, joinBoth, listen, request, runFile, saveEvidence } from './helpers.mjs';

const phase = process.env.SOFA_NATIVE_PHASE;
const fixturePath = process.env.SOFA_NATIVE_FIXTURE;
const screenshot = name => browser.saveScreenshot(path.join(evidenceDir, name));
const positionLabel = state => `Jon at ${String.fromCharCode(65 + state.players.jon.col)}${state.players.jon.row + 1}, Lydia at ${String.fromCharCode(65 + state.players.lydia.col)}${state.players.lydia.row + 1}`;

async function waitRendered(selector, { timeout = 15000, scrollIntoView = false } = {}) {
  // The shared UI replaces app.innerHTML when create/start completes and on
  // each SSE snapshot. A cached WebDriver element can become detached between
  // polls without this embedded driver reporting a stale-element error. Query
  // the current WKWebView DOM each time, while still requiring visible pixels.
  await browser.waitUntil(() => browser.execute((query, scroll) => {
    const element = document.querySelector(query);
    if (!element?.isConnected) return false;
    if (scroll) element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.right <= 0 ||
        rect.top >= innerHeight || rect.left >= innerWidth) return false;
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      if (style.display === 'none' || style.visibility === 'hidden' ||
          style.visibility === 'collapse' || Number(style.opacity) === 0) return false;
    }
    return true;
  }, selector, scrollIntoView), { timeout, timeoutMsg: `The current native WKWebView did not visibly render ${selector}` });
}

async function mainWindow() {
  await browser.waitUntil(async () => (await browser.getWindowHandles()).includes('main'),
    { timeout: 25000, timeoutMsg: 'The real native main WKWebView did not open' });
  await browser.switchToWindow('main');
  await browser.waitUntil(async () => /^http:\/\/127\.0\.0\.1:\d+\//.test(await browser.getUrl()),
    { timeoutMsg: 'Native main window did not navigate to the ready loopback host' });
}

async function boardAt(state) {
  const label = positionLabel(state);
  await waitRendered('.board', { timeout: 5000 });
  await browser.waitUntil(() => browser.execute(expected =>
    document.querySelector('.board')?.getAttribute('aria-label')?.includes(expected) || false, label),
    { timeout: 5000, timeoutMsg: 'The native TV board did not render the authoritative positions' });
}

async function ensureNativeAccessDenied() {
  const exposedGlobal = await browser.execute(() => typeof window.__TAURI__ !== 'undefined');
  assert.equal(exposedGlobal, false, 'Game content must not receive the global native Tauri API');
  const denied = await browser.executeAsync(done => {
    if (!window.__TAURI_INTERNALS__?.invoke) { done(true); return; }
    window.__TAURI_INTERNALS__.invoke('plugin:window|set_title', { label: 'main', title: 'Unauthorized title' })
      .then(() => done(false), () => done(true));
  });
  assert.equal(denied, true, 'Loopback game acquired a native window permission');
}

describe(`Sofa Arcade actual native macOS window (${phase})`, () => {
  it('renders the packaged collection and preserves the live host across a real relaunch', async () => {
    await mainWindow();
    const status = await hostStatus(value => value.state === 'ready');
    const origin = `http://127.0.0.1:${status.port}`;
    await ensureNativeAccessDenied();
    if (phase === 'relaunch') {
      const saved = JSON.parse(await readFile(fixturePath, 'utf8'));
      assert.equal(origin, saved.origin);
      assert.notEqual(status.parentPid, saved.parentPid, 'A new native process must perform the relaunch check');
      const marker = await browser.execute(() => localStorage.getItem('sofa-native-acceptance-marker'));
      assert.equal(marker, saved.marker, 'WKWebView localStorage did not survive native process exit');
      // Pass only a public room code to the test driver. The credential stays
      // inside WKWebView localStorage and is used by the ordinary shared UI.
      await browser.url(`${origin}/?room=${saved.code}`);
      await waitRendered('.game-layout');
      const hasHost = await browser.execute(code => {
        try { return typeof JSON.parse(localStorage.getItem('sofa-room:' + code)).hostToken === 'string'; }
        catch { return false; }
      }, saved.code);
      assert.equal(hasHost, true);
      await boardAt(saved.state);
      assert.equal(await $('.controller-shell').isExisting(), false, 'Saved host credentials unexpectedly reopened a phone controller');
      await screenshot('native-relaunch.png');
      await saveEvidence('native-ui-relaunch.json', { passed: true, nativePidChanged: true,
        stableOrigin: true, persistentWKWebViewStorage: true, savedHostCredentialReused: true, authoritativeBoardRestored: true });
      return;
    }

    await waitRendered('.arcade-home');
    assert.match(await $('h1').getText(), /starts on the sofa/i);
    await browser.waitUntil(() => browser.execute(() => {
      const image = document.querySelector('.featured-image img');
      return image?.complete && image.naturalWidth > 0 && document.documentElement.classList.contains('generated-art');
    }), { timeoutMsg: 'Original illustration or character atlas failed to load in WKWebView' });
    await screenshot('native-collection.png');
    await $('[data-action="open-game"][data-game="sofa-kingdoms"]').click();
    await waitRendered('[data-action="create"]', { scrollIntoView: true });
    assert.match(await $('.lan-mode-label').getText(), /Home Wi-Fi/);
    await $('[data-action="create"]').click();
    await waitRendered('.room-code');
    const code = await browser.execute(() => document.querySelector('.room-code')?.textContent.trim());
    assert.match(code, /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    await browser.waitUntil(() => browser.execute(() => !!document.querySelector('#room-qr svg, #room-qr img')),
      { timeoutMsg: 'The packaged game did not render its phone QR code' });
    const joinLinks = await browser.execute(() => Array.from(document.querySelectorAll('.seat-link'), link => link.href));
    assert.equal(joinLinks.length, 2);
    for (const link of joinLinks) {
      const url = new URL(link);
      assert.equal(url.protocol, 'http:');
      assert.equal(url.port, String(status.port));
      assert.equal(url.searchParams.get('join'), code);
      assert.equal([...url.searchParams.keys()].some(key => /token|auth/i.test(key)), false);
    }
    const tokens = await joinBoth(origin, code);
    await browser.waitUntil(() => browser.execute(() => {
      const button = document.querySelector('[data-action="start"]');
      return !!button && !button.disabled;
    }),
      { timeoutMsg: 'Both HTTP phone seats did not become ready on the native host' });
    await waitRendered('[data-action="start"]', { scrollIntoView: true });
    await screenshot('native-lobby.png');
    await $('[data-action="start"]').click();
    await waitRendered('.game-layout');
    const current = (await request(origin, `/api/rooms/${code}`, { token: tokens.jon })).body;
    const actor = current.state.activePlayer;
    const action = legalActions(current.state, actor).find(item => item.type === 'move');
    assert.ok(action);
    const stream = await listen(origin, code, tokens.lydia);
    let applied;
    const before = Date.now();
    try {
      await stream.revision(current.revision);
      applied = (await request(origin, `/api/rooms/${code}/action`, { token: tokens[actor],
        body: { revision: current.revision, actionId: crypto.randomUUID(), action } })).body;
      await stream.revision(applied.revision);
      await boardAt(applied.state);
    } finally { await stream.close(); }
    const elapsedMs = Date.now() - before;
    await screenshot('native-board.png');
    const marker = crypto.randomUUID();
    await browser.execute(value => localStorage.setItem('sofa-native-acceptance-marker', value), marker);
    const hostCredentialSaved = await browser.execute(value => {
      try { return typeof JSON.parse(localStorage.getItem('sofa-room:' + value)).hostToken === 'string'; }
      catch { return false; }
    }, code);
    assert.equal(hostCredentialSaved, true);
    // A crash retires and recreates the native main webview. Confirm that its
    // persistent store and host route survive while only our owned child dies.
    const parent = Number((await runFile('/bin/ps', ['-p', String(status.childPid), '-o', 'ppid='])).stdout.trim());
    assert.equal(parent, status.parentPid, 'Refuse to signal a process not owned by the native app');
    process.kill(status.childPid, 'SIGKILL');
    await hostStatus(value => value.state === 'ready' && value.parentPid === status.parentPid && value.generation > status.generation);
    await mainWindow();
    await waitRendered('.game-layout');
    await boardAt(applied.state);
    assert.equal(await browser.execute(() => localStorage.getItem('sofa-native-acceptance-marker')), marker);
    await screenshot('native-child-recovery.png');
    // This fixture has only public game state and a random non-secret marker.
    await writeFile(fixturePath, JSON.stringify({ code, origin, parentPid: status.parentPid, marker, state: applied.state }, null, 2) + '\n', { mode: 0o600 });
    await saveEvidence('native-ui-first.json', { passed: true, collection: true, illustratedAssetsDecoded: true,
      roomCreatedThroughNativeUI: true, bothSeatsJoined: true, QRRendered: true,
      authoritativeSseAndNativeBoard: true, elapsedMs, nativePermissionsDenied: true,
      nativeChildCrashRecoveredWithPersistentWebviewStorage: true });
  });
});
