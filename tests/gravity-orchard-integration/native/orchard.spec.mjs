/** Actual packaged macOS WKWebView plus two authenticated realtime clients. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';
import { createRealtimeClient } from '../../../ui/realtime/gravity-orchard/index.mjs';
import { createPilot } from '../../../games/gravity-orchard/validation/pilot.mjs';
import { evidenceDir, hostStatus, joinBoth, request, saveEvidence } from '../../../desktop/tests/native/helpers.mjs';

const requireDesktop = createRequire(new URL('../../../desktop/package.json', import.meta.url));
const { browser, $ } = await import(pathToFileURL(requireDesktop.resolve('@wdio/globals')).href);
const phase = process.env.SOFA_GO7_NATIVE_PHASE;
const fixture = process.env.SOFA_GO7_NATIVE_FIXTURE;
const screenshot = name => browser.saveScreenshot(path.join(evidenceDir, `go7-native-${name}.png`));

async function visible(selector, timeout = 20000) {
  await browser.waitUntil(() => browser.execute(selector => {
    const element = document.querySelector(selector);
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.top < innerHeight && rect.bottom > 0 && getComputedStyle(element).visibility !== 'hidden';
  }, selector), { timeout, timeoutMsg: `Actual WKWebView did not display ${selector}` });
}
async function mainWindow() {
  await browser.waitUntil(async () => (await browser.getWindowHandles()).includes('main'), { timeout: 25000 });
  await browser.switchToWindow('main');
  await browser.waitUntil(async () => /^http:\/\/127\.0\.0\.1:\d+\//.test(await browser.getUrl()));
  return hostStatus(status => status.state === 'ready');
}
async function roomInNative(code) {
  const result = await browser.executeAsync((code, done) => {
    let token;
    try { token = JSON.parse(localStorage.getItem('sofa-room:' + code) || '{}').hostToken; } catch {}
    if (!token) { done({ ok: false }); return; }
    fetch(`/api/rooms/${code}`, { headers: { Authorization: `Bearer ${token}` } }).then(async response => ({ ok: response.ok, room: await response.json() })).then(done, () => done({ ok: false }));
  }, code);
  assert.equal(result.ok, true, 'Native saved host credential must authorize the existing room');
  assert.equal(result.room.hostToken, undefined); return result.room;
}
async function secureCall(operation, options = {}) {
  const result = await browser.executeAsync((operation, options, done) => {
    if (!window.sofaDesktopSecureLan) { done({ ok: false, code: 'native_bridge_absent' }); return; }
    window.sofaDesktopSecureLan[operation](options).then(value => done({ ok: true, value }), error => done({ ok: false, code: error.code }));
  }, operation, options);
  assert.equal(result.ok, true, `Native secure capability failed: ${result.code}`); return result.value;
}
async function waitFor(check, message, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await check(); if (value) return value; await delay(50); }
  throw new Error(message);
}
async function controllers(origin, code, tokens) {
  const latest = {}, clients = {}, states = {};
  class OwnedSocket extends WebSocket { constructor(url) { super(url, { origin }); } }
  for (const playerId of ['jon', 'lydia']) {
    clients[playerId] = createRealtimeClient({ url: origin.replace('http:', 'ws:') + '/api/realtime/gravity-orchard', roomCode: code, token: tokens[playerId], WebSocketImpl: OwnedSocket,
      onSnapshot: snapshot => { latest[playerId] = snapshot; }, onStatus: status => { states[playerId] = status.state; } });
    clients[playerId].connect();
  }
  await waitFor(() => latest.jon && latest.lydia && states.jon === 'connected' && states.lydia === 'connected', 'Both authenticated native-test controllers must connect');
  const command = async (playerId, kind, payload) => {
    const result = await clients[playerId].sendCommand({ id: crypto.randomUUID(), kind, payload });
    assert.equal(result.accepted, true, `Native controller ${kind} rejected: ${result.code}`); return result;
  };
  return { latest, clients, states, command, dispose() { for (const client of Object.values(clients)) client.dispose(); } };
}
async function bothReady(control) {
  // GO2 requires current accepted heartbeats before a countdown boundary.
  await delay(150);
  for (const id of ['jon', 'lydia']) await control.command(id, 'ready', { value: true });
}

describe(`Gravity Orchard actual native Mac (${phase})`, () => {
  it('runs the integrated game, trusted setup and saved-session lifecycle', async function () {
    this.timeout(420000);
    const status = await mainWindow();
    const origin = `http://127.0.0.1:${status.port}`;
    assert.equal(await browser.execute(() => typeof window.__TAURI__), 'undefined');
    const genericNativeDenied = await browser.executeAsync(done => {
      if (!window.__TAURI_INTERNALS__?.invoke) { done(true); return; }
      window.__TAURI_INTERNALS__.invoke('plugin:window|set_title', { label: 'main', title: 'Unauthorized' }).then(() => done(false), () => done(true));
    });
    assert.equal(genericNativeDenied, true, 'The narrow setup bridge must not grant general native permissions');

    if (phase === 'exited') {
      const saved = JSON.parse(await readFile(fixture, 'utf8'));
      assert.equal(origin, saved.origin); await visible('.arcade-home');
      assert.equal(await browser.execute(() => !!document.querySelector('.go-tv')), false);
      assert.equal((await secureCall('getStatus')).status, 'disabled');
      await screenshot('exited');
      await saveEvidence('go7-native-exited.json', { passed: true, explicitExitSurvivedStaleNativeURL: true, secureDisablePersisted: true });
      return;
    }
    if (phase === 'relaunch') {
      const saved = JSON.parse(await readFile(fixture, 'utf8'));
      assert.equal(origin, saved.origin); assert.notEqual(status.parentPid, saved.parentPid);
      await visible('.go-tv[data-go-phase="paused"]');
      const restored = await roomInNative(saved.code);
      assert.equal(restored.state.matchId, saved.matchId);
      assert.equal(restored.state.phase, 'paused');
      assert.ok(restored.state.runEpoch > saved.runEpoch);
      assert.equal((await secureCall('getStatus')).certificateFingerprint, saved.certificateFingerprint);
      assert.equal((await secureCall('getStatus')).status, 'ready');
      assert.equal(await browser.execute(() => localStorage.getItem('go7-native-marker')), saved.marker);
      await screenshot('relaunch');
      await secureCall('remove', { mode: 'disable' });
      await $('[data-go-action="exit"]').click(); await visible('.arcade-home');
      await screenshot('explicit-exit');
      await saveEvidence('go7-native-relaunch.json', { passed: true, persistentWKStorage: true, pausedRecoveryWithFreshEpoch: true, secureRootAndEnabledPreferencePersisted: true, explicitExit: true });
      return;
    }

    await visible('.arcade-home');
    const initialSecure = await secureCall('getStatus');
    assert.equal(initialSecure.status, 'needs-setup');
    // This uses the same narrow native callback as GO6's setup view. No system
    // trust is installed and no certificate-warning bypass is used.
    const secure = await secureCall('provision', { replaceRoot: false });
    assert.equal(secure.status, 'ready'); assert.equal(secure.requiresPhoneTrust, true);
    assert.ok(secure.controllerOrigins.every(raw => new URL(raw).protocol === 'https:'));
    await $('[data-action="open-game"][data-game="gravity-orchard"]').click();
    await visible('[data-action="create"]'); await $('[data-action="create"]').click();
    await visible('.room-code');
    const code = await browser.execute(() => document.querySelector('.room-code').textContent.trim());
    const tokens = await joinBoth(origin, code);
    await browser.waitUntil(() => browser.execute(() => document.querySelector('[data-action="start"]')?.disabled === false));
    await $('[data-action="start"]').click(); await visible('.go-tv');
    const control = await controllers(origin, code, tokens);
    let timer;
    try {
      const pilot = createPilot();
      const seenEvents = new Set(), spawnOwners = new Map(), transfers = new Set();
      const campaignStarted = Date.now();
      timer = setInterval(() => {
        const view = control.latest.jon?.view;
        if (!view) return;
        const input = pilot.update(view);
        for (const id of ['jon', 'lydia']) control.clients[id].setInput(input[id]);
        for (const event of view.events) if (!seenEvents.has(event.id)) {
          seenEvents.add(event.id);
          if (event.kind === 'spawn') spawnOwners.set(event.entityId, event.playerId);
          if (event.kind === 'catch' && spawnOwners.has(event.entityId) && spawnOwners.get(event.entityId) !== event.playerId) transfers.add(`${spawnOwners.get(event.entityId)}>${event.playerId}`);
        }
      }, 50);
      await bothReady(control);
      for (let stage = 0; stage < 3; stage++) {
        await waitFor(() => control.latest.jon.view.stageIndex === stage && control.latest.jon.view.phase === 'playing', `Native stage ${stage + 1} did not start`, 15000);
        await visible('.go-tv[data-go-phase="playing"]');
        await screenshot(`stage-${stage + 1}`);
        await waitFor(() => ['interlude', 'finished'].includes(control.latest.jon.view.phase), `Native stage ${stage + 1} did not finish`, 115000);
        if (stage < 2) await bothReady(control);
      }
      clearInterval(timer); timer = undefined;
      const finished = control.latest.jon.view;
      assert.equal(finished.phase, 'finished'); assert.equal(finished.results.length, 3);
      assert.ok(finished.results.reduce((sum, result) => sum + result.ordersCompleted, 0) > 0, 'Native campaign must actually fill picnic orders');
      assert.deepEqual([...transfers].sort(), ['jon>lydia', 'lydia>jon']);
      await visible('.go-tv[data-go-phase="finished"]'); await screenshot('results');
      const moduleEvidence = await browser.executeAsync(async done => {
        try {
          const manifest = await (await fetch('/assets/gravity-orchard/manifest.json')).json();
          const assets = Object.values(manifest.assets);
          for (const asset of assets) { const image = new Image(); image.src = asset.src; await image.decode(); if (image.naturalWidth !== asset.width || image.naturalHeight !== asset.height) throw new Error('Native asset dimension mismatch'); }
          const external = performance.getEntriesByType('resource').map(entry => new URL(entry.name, location.href)).filter(url => ['http:', 'https:'].includes(url.protocol) && url.origin !== location.origin).map(url => url.origin + url.pathname);
          done({ ok: true, decodedAssets: assets.length, external });
        } catch (error) { done({ ok: false, reason: error.message }); }
      });
      assert.equal(moduleEvidence.ok, true, moduleEvidence.reason); assert.deepEqual(moduleEvidence.external, []);
      await $('[data-go-action="rematch-same"]').click();
      await waitFor(() => control.latest.jon.view.matchId !== finished.matchId && control.latest.jon.view.phase === 'waiting', 'Native same-seed rematch did not create a fresh identity');
      for (const client of Object.values(control.clients)) client.setInput({ x: 0, y: 0, brake: true });
      await bothReady(control); await waitFor(() => control.latest.jon.view.phase === 'playing', 'Native rematch did not start', 15000);
      await $('[data-go-action="pause"]').click();
      await visible('.go-tv[data-go-phase="paused"]');
      const paused = await roomInNative(code);
      const marker = crypto.randomUUID();
      await browser.execute(marker => localStorage.setItem('go7-native-marker', marker), marker);
      await writeFile(fixture, JSON.stringify({ code, origin, parentPid: status.parentPid, matchId: paused.state.matchId, runEpoch: paused.state.runEpoch, certificateFingerprint: secure.certificateFingerprint, marker }) + '\n', { mode: 0o600 });
      await screenshot('paused-checkpoint');
      await saveEvidence('go7-native-first.json', { passed: true, kind: 'native-macos-WKWebView', campaignSeconds: (Date.now() - campaignStarted) / 1000, results: finished.results, transfers: [...transfers], decodedAssets: moduleEvidence.decodedAssets, externalRuntimeRequests: moduleEvidence.external, secureSetupViaNativeCapability: true, generalNativePermissionsDenied: true, sameSeedRematch: true, controllerStats: Object.fromEntries(Object.entries(control.clients).map(([id, client]) => [id, client.getStats()])) });
    } finally { clearInterval(timer); control.dispose(); }
  });
});
