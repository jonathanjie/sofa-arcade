/** Actual packaged macOS WKWebView plus two authenticated realtime clients. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { lstat, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { X509Certificate } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';
import { createRealtimeClient } from '../../../ui/realtime/gravity-orchard/index.mjs';
import { createPilot } from '../../../games/gravity-orchard/validation/pilot.mjs';
import { evidenceDir, hostStatus, joinBoth, runFile, saveEvidence } from '../../../desktop/tests/native/helpers.mjs';

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
async function exportTrustThroughSetup(expectedFingerprint) {
  const downloads = path.join(homedir(), 'Downloads');
  const owned = [], exports = [];
  try {
    for (const [format, action, extension] of [['pem', 'export-pem', '.crt'], ['mobileconfig', 'export-apple', '.mobileconfig']]) {
      const before = new Set(await readdir(downloads));
      const button = await $(`.go6-setup [data-action="${action}"]`);
      await button.scrollIntoView({ block: 'center' }); await button.click();
      // Native create_new is visible before write_all/sync has finished. Wait
      // for the real callback and GO6's Blob/download path to settle before
      // counting complete files or parsing their certificate bytes.
      await browser.waitUntil(() => browser.execute(() =>
        document.querySelector('.go6-setup')?.getAttribute('aria-busy') === 'false'
        && document.querySelector('.go6-notice')?.textContent.startsWith('Public certificate exported.')),
      { timeout: 15000, timeoutMsg: 'Actual WKWebView setup must finish its public export without a download error' });
      const created = (await readdir(downloads)).filter(name => !before.has(name) && /^(?:\d+-)?sofa-arcade-/.test(name));
      assert.equal(created.length, 1, 'The settled native setup must export exactly one new public file per action');
      const [filename] = created;
      assert.ok(filename.endsWith(extension), 'The native export must use the requested public format');
      const pathname = path.join(downloads, filename);
      const info = await lstat(pathname);
      assert.equal(info.isSymbolicLink(), false); assert.equal(info.isFile(), true);
      assert.equal(info.nlink, 1); assert.equal(info.mode & 0o777, 0o600);
      const contents = await readFile(pathname, 'utf8');
      assert.doesNotMatch(contents, /PRIVATE KEY|<!ENTITY|file:\/\//i);
      let certificate;
      if (format === 'pem') {
        assert.match(contents, /^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END CERTIFICATE-----\r?\n?$/);
        certificate = new X509Certificate(contents);
      } else {
        // plutil reads the public profile only; no installer or trust command runs.
        await runFile('/usr/bin/plutil', ['-lint', pathname], { timeout: 5000 });
        const types = [...contents.matchAll(/<key>PayloadType<\/key>\s*<string>([^<]+)<\/string>/g)].map(match => match[1]);
        assert.deepEqual(types.sort(), ['Configuration', 'com.apple.security.root']);
        const data = [...contents.matchAll(/<data>([A-Za-z0-9+/=\s]+)<\/data>/g)];
        assert.equal(data.length, 1, 'Apple export contains exactly one public CA payload');
        certificate = new X509Certificate(Buffer.from(data[0][1].replace(/\s/g, ''), 'base64'));
      }
      assert.equal(certificate.fingerprint256, expectedFingerprint);
      assert.equal(certificate.ca, true); assert.equal(certificate.verify(certificate.publicKey), true);
      owned.push(pathname);
      assert.equal(await browser.execute(() => document.querySelector('.go6-setup')?.dataset.state), 'ready');
      await screenshot(`secure-export-${format}`);
      exports.push({ format, bytes: Buffer.byteLength(contents), certificateFingerprint: certificate.fingerprint256, publicCaOnly: true, filesystemMode: '0600' });
    }
    return exports;
  } finally {
    // Delete only files created by this test and verified as this installation's
    // public CA. Never touch pre-existing Downloads files or trust settings.
    for (const pathname of owned) await rm(pathname);
  }
}
async function waitFor(check, message, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await check(); if (value) return value; await delay(50); }
  throw new Error(message);
}
const playerIds = ['jon', 'lydia'];
function publicDiagnostic(snapshot) {
  if (!snapshot) return null;
  const { view } = snapshot;
  // Explicit public fields only: never serialize the room envelope, auth frame,
  // native configuration, seed/checkpoint, or retained controller credentials.
  return { serverSeq: snapshot.serverSeq, matchId: view.matchId, runEpoch: view.runEpoch,
    tick: view.tick, phase: view.phase, stageIndex: view.stageIndex, pauseReason: view.pauseReason,
    timeRemainingTicks: view.timeRemainingTicks, countdownTicks: view.countdownTicks,
    ready: { jon: view.ready.jon, lydia: view.ready.lydia },
    players: Object.fromEntries(playerIds.map(id => [id, { input: { ...view.players[id].input } }])),
    presence: Object.fromEntries(playerIds.map(id => [id, { connected: snapshot.presence[id].connected, inputFresh: snapshot.presence[id].inputFresh }])) };
}
async function controllers(origin, code, tokens) {
  const latest = {}, clients = {}, states = {}, lastActive = {}, history = [], historyKeys = {};
  const connectedAt = Date.now();
  class OwnedSocket extends WebSocket { constructor(url) { super(url, { origin }); } }
  for (const playerId of playerIds) {
    clients[playerId] = createRealtimeClient({ url: origin.replace('http:', 'ws:') + '/api/realtime/gravity-orchard', roomCode: code, token: tokens[playerId], WebSocketImpl: OwnedSocket,
      onSnapshot: snapshot => {
        latest[playerId] = snapshot;
        const { view } = snapshot;
        if (['countdown', 'playing'].includes(view.phase)) lastActive[playerId] = { matchId: view.matchId, runEpoch: view.runEpoch, stageIndex: view.stageIndex };
        const key = JSON.stringify([view.matchId, view.runEpoch, view.stageIndex, view.phase, view.ready.jon, view.ready.lydia]);
        if (historyKeys[playerId] !== key) {
          historyKeys[playerId] = key;
          history.push({ playerId, elapsedMs: Date.now() - connectedAt, ...publicDiagnostic(snapshot) });
          if (history.length > 128) history.shift();
        }
      }, onStatus: status => { states[playerId] = status.state; } });
    clients[playerId].connect();
  }
  await waitFor(() => latest.jon && latest.lydia && states.jon === 'connected' && states.lydia === 'connected', 'Both authenticated native-test controllers must connect');
  const command = async (playerId, kind, payload) => {
    const result = await clients[playerId].sendCommand({ id: crypto.randomUUID(), kind, payload });
    assert.equal(result.accepted, true, `Native controller ${kind} rejected: ${result.code}`); return result;
  };
  return { latest, clients, states, lastActive, command,
    diagnostics: () => ({ states: { ...states }, phaseHistory: structuredClone(history),
      latest: Object.fromEntries(playerIds.map(id => [id, publicDiagnostic(latest[id])])),
      stats: Object.fromEntries(playerIds.map(id => [id, clients[id].getStats()])) }),
    dispose() { for (const client of Object.values(clients)) client.dispose(); } };
}
function freshControllers(control, matchId = control.latest.jon.view.matchId, runEpoch = control.latest.jon.view.runEpoch) {
  return playerIds.every(id => control.states[id] === 'connected'
    && control.latest[id].view.matchId === matchId && control.latest[id].view.runEpoch === runEpoch
    && playerIds.every(seat => control.latest[id].presence[seat].connected && control.latest[id].presence[seat].inputFresh));
}
async function bothReady(control) {
  // GO2 requires current accepted heartbeats before a countdown boundary.
  await waitFor(() => freshControllers(control), 'Both authenticated controllers need fresh heartbeats before ready');
  for (const id of playerIds) await control.command(id, 'ready', { value: true });
}
async function beforeDeadline(deadline, action, message) {
  const remaining = deadline - Date.now();
  assert.ok(remaining > 0, message);
  let timer;
  try {
    return await Promise.race([action(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), remaining); })]);
  } finally { clearTimeout(timer); }
}
async function recoverObservedHostStall(control, recoveries, deadline) {
  const paused = publicDiagnostic(control.latest.jon), observedAt = Date.now();
  assert.equal(paused.pauseReason, 'host-stall', 'An unexpected non-stall pause must fail native acceptance');
  assert.equal(recoveries.length, 0, 'A second observed host-stall must fail native acceptance');
  const priorEpochs = {};
  for (const id of playerIds) {
    const prior = control.lastActive[id];
    assert.equal(prior?.matchId, paused.matchId); assert.equal(prior?.stageIndex, paused.stageIndex);
    assert.ok(paused.runEpoch > prior.runEpoch, 'A host-stall must fence the active epoch');
    priorEpochs[id] = prior.runEpoch;
  }
  const evidence = { reason: paused.pauseReason, stageIndex: paused.stageIndex, priorEpochs,
    pausedRunEpoch: paused.runEpoch, frozenTick: paused.tick, timeRemainingTicks: paused.timeRemainingTicks, readyCommands: [] };
  recoveries.push(evidence);
  const within = action => beforeDeadline(deadline, action, `Native stage ${paused.stageIndex + 1} exceeded its existing deadline during host-stall recovery`);
  const assertFrozen = expectedReady => {
    for (const id of playerIds) {
      const view = control.latest[id].view;
      for (const key of ['matchId', 'runEpoch', 'stageIndex', 'tick', 'timeRemainingTicks', 'pauseReason']) assert.equal(view[key], paused[key], `Paused ${key} must agree across both controllers and stay frozen`);
      assert.equal(view.phase, 'paused'); assert.deepEqual(view.ready, expectedReady);
      for (const seat of playerIds) assert.deepEqual(view.players[seat].input, { x: 0, y: 0, brake: true });
    }
  };
  await within(() => waitFor(() => playerIds.every(id => control.latest[id].view.phase === 'paused' && control.latest[id].view.runEpoch === paused.runEpoch), 'Both controllers must observe the same host-stall epoch'));
  assertFrozen({ jon: false, lydia: false });
  const beforeSeq = Object.fromEntries(playerIds.map(id => [id, control.latest[id].serverSeq]));
  await within(async () => { await visible('.go-tv[data-go-phase="paused"]'); await screenshot('observed-host-stall'); });
  await within(() => waitFor(() => freshControllers(control, paused.matchId, paused.runEpoch)
    && playerIds.every(id => control.latest[id].serverSeq > beforeSeq[id]), 'Paused snapshots must keep arriving with fresh authenticated heartbeats'));
  assertFrozen({ jon: false, lydia: false });
  evidence.frozenAcrossFreshSnapshots = true;
  for (const id of playerIds) assert.deepEqual(control.clients[id].getStats().viewer, { role: 'player', playerId: id });
  await within(() => control.command('jon', 'ready', { value: true }));
  evidence.readyCommands.push({ playerId: 'jon', accepted: true });
  await within(() => waitFor(() => playerIds.every(id => control.latest[id].view.ready.jon), 'Jon readiness must reach both paused views'));
  assertFrozen({ jon: true, lydia: false });
  await within(() => waitFor(() => freshControllers(control, paused.matchId, paused.runEpoch), 'Both controllers must remain fresh before Lydia readies'));
  await within(() => control.command('lydia', 'ready', { value: true }));
  evidence.readyCommands.push({ playerId: 'lydia', accepted: true });
  await within(() => waitFor(() => {
    const view = control.latest.jon.view;
    if (view.phase === 'paused') assert.equal(view.runEpoch, paused.runEpoch, 'A repeated pause during recovery must fail');
    return playerIds.every(id => control.latest[id].view.phase === 'countdown');
  }, 'Both accepted ready commands must start a new countdown'));
  const countdownEpoch = control.latest.jon.view.runEpoch;
  assert.ok(countdownEpoch > paused.runEpoch);
  for (const id of playerIds) {
    const view = control.latest[id].view;
    assert.equal(view.matchId, paused.matchId); assert.equal(view.stageIndex, paused.stageIndex); assert.equal(view.runEpoch, countdownEpoch);
  }
  evidence.countdownRunEpoch = countdownEpoch;
  evidence.observedPauseMs = Date.now() - observedAt;
  await within(() => waitFor(() => {
    for (const id of playerIds) assert.notEqual(control.latest[id].view.phase, 'paused', 'A repeated pause during the resumed countdown must fail');
    return playerIds.every(id => control.latest[id].view.phase === 'playing' && control.latest[id].view.runEpoch === countdownEpoch);
  }, 'Both ready controllers must resume play', 15000));
  evidence.observedResumeMs = Date.now() - observedAt;
}
async function waitForCampaignState(control, check, message, timeout, recoveries) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (control.latest.jon.view.phase === 'paused') await recoverObservedHostStall(control, recoveries, deadline);
    if (Date.now() >= deadline) break;
    if (check()) return;
    await delay(50);
  }
  throw new Error(message);
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
    await $('[data-action="open-game"][data-game="gravity-orchard"]').click();
    const setupButton = await $('[data-action="secure-setup"]');
    await setupButton.scrollIntoView({ block: 'center' }); await setupButton.click();
    await visible('.go6-setup[data-state="needs-setup"]');
    await screenshot('secure-setup');
    await $('.go6-setup [data-action="provision"]').click();
    await visible('.go6-setup[data-state="ready"][aria-busy="false"]');
    // Provision and both exports use the real integrated setup UI and bounded
    // native capability. No trust installer or certificate-warning bypass runs.
    const secure = await secureCall('getStatus');
    assert.equal(secure.status, 'ready'); assert.equal(secure.requiresPhoneTrust, true);
    assert.ok(secure.controllerOrigins.every(raw => new URL(raw).protocol === 'https:'));
    assert.equal(await $('.go6-fingerprint').getText(), secure.certificateFingerprint);
    const publicExports = await exportTrustThroughSetup(secure.certificateFingerprint);
    const closeSetup = await $('.go6-setup [aria-label="Close setup"]');
    await closeSetup.scrollIntoView({ block: 'center' }); await closeSetup.click();
    await browser.waitUntil(() => browser.execute(() => !document.querySelector('.go6-setup') && !document.querySelector('#app')?.inert));
    const createButton = await $('[data-action="create"]');
    await createButton.scrollIntoView({ block: 'center' }); await createButton.click();
    await visible('.room-code');
    const code = await browser.execute(() => document.querySelector('.room-code').textContent.trim());
    const tokens = await joinBoth(origin, code);
    await browser.waitUntil(() => browser.execute(() => document.querySelector('[data-action="start"]')?.disabled === false));
    await $('[data-action="start"]').click(); await visible('.go-tv');
    const control = await controllers(origin, code, tokens);
    const campaignStarted = Date.now(), observedHostStallRecoveries = [];
    let timer;
    try {
      const pilot = createPilot();
      const seenEvents = new Set(), spawnOwners = new Map(), transfers = new Set();
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
        await waitForCampaignState(control, () => control.latest.jon.view.stageIndex === stage && control.latest.jon.view.phase === 'playing', `Native stage ${stage + 1} did not start`, 15000, observedHostStallRecoveries);
        await visible('.go-tv[data-go-phase="playing"]');
        await screenshot(`stage-${stage + 1}`);
        await waitForCampaignState(control, () => ['interlude', 'finished'].includes(control.latest.jon.view.phase), `Native stage ${stage + 1} did not finish`, 115000, observedHostStallRecoveries);
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
      await bothReady(control); await waitForCampaignState(control, () => control.latest.jon.view.phase === 'playing', 'Native rematch did not start', 15000, observedHostStallRecoveries);
      await $('[data-go-action="pause"]').click();
      await visible('.go-tv[data-go-phase="paused"]');
      const paused = await roomInNative(code);
      const marker = crypto.randomUUID();
      await browser.execute(marker => localStorage.setItem('go7-native-marker', marker), marker);
      await writeFile(fixture, JSON.stringify({ code, origin, parentPid: status.parentPid, matchId: paused.state.matchId, runEpoch: paused.state.runEpoch, certificateFingerprint: secure.certificateFingerprint, marker }) + '\n', { mode: 0o600 });
      await screenshot('paused-checkpoint');
      await saveEvidence('go7-native-first.json', { passed: true, kind: 'native-macos-WKWebView', campaignSeconds: (Date.now() - campaignStarted) / 1000, results: finished.results, transfers: [...transfers], decodedAssets: moduleEvidence.decodedAssets, externalRuntimeRequests: moduleEvidence.external, secureSetupViaNativeCapability: true, integratedSetupButtons: true, publicExports, trustInstallationAttempted: false, generalNativePermissionsDenied: true, sameSeedRematch: true, observedHostStallRecoveries, controllerStats: Object.fromEntries(Object.entries(control.clients).map(([id, client]) => [id, client.getStats()])), controllerTimeline: control.diagnostics().phaseHistory });
    } catch (error) {
      // Preserve the actual failing presence/phase before dispose intentionally
      // disconnects the test controllers. The generic WDIO screenshot follows
      // cleanup and cannot diagnose the original transport or pause state.
      const diagnostic = { passed: false, capturedBeforeDisposal: true, elapsedMs: Date.now() - campaignStarted,
        failureName: error.name, observedHostStallRecoveries, ...control.diagnostics() };
      try { await saveEvidence('go7-native-pre-disposal-failure.json', diagnostic); } catch { /* Retain the original acceptance failure. */ }
      try { await screenshot('pre-disposal-failure'); } catch { /* Never fabricate a failed screenshot. */ }
      throw error;
    } finally { clearInterval(timer); control.dispose(); }
  });
});
