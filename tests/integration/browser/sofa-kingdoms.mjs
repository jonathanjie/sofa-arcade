/** End-to-end regression of the shipped collection and two ordinary browser controllers. */
import assert from 'node:assert/strict';
import { acceptanceSession, credentials, closeDialog, noHorizontalOverflow, waitUntil } from './support.mjs';
import { verifyNavigationRaces } from './navigation-races.mjs';

const run = await acceptanceSession('sofa-kingdoms');
let failure;
try {
  const tv = await run.page('tv', { width: 1920, height: 1080 });
  const jon = await run.page('jon', { width: 360, height: 800 }, { isMobile: true, hasTouch: true });
  const lydia = await run.page('lydia', { width: 390, height: 844 }, { isMobile: true, hasTouch: true });
  const phones = { jon, lydia };
  await tv.goto(run.origin);
  await tv.locator('[data-action="open-game"][data-game="sofa-kingdoms"]').first().click();
  await tv.locator('[data-action="create"]').click();
  await tv.locator('.room-code').waitFor();
  const code = (await tv.locator('.room-code').innerText()).trim();
  const hostToken = await credentials(tv, code, 'host');
  assert.ok(hostToken);
  await Promise.all(Object.entries(phones).map(async ([id, phone]) => {
    await phone.goto(`${run.origin}/?join=${code}&seat=${id}`);
    await phone.locator(`[data-action="claim"][data-player="${id}"]`).click();
    await phone.locator('.waiting-scene').waitFor();
    assert.ok(await credentials(phone, code, id));
  }));
  assert.ok((await credentials(jon, code, 'jon')) !== (await credentials(lydia, code, 'lydia')), 'Separate seats receive distinct credentials');
  run.check('Host and both seats join through the rendered UI with separate storage and credentials');

  // A phone stays silent by default; only the host can enable the soundtrack.
  await jon.locator('[data-action="audio"]').click();
  assert.equal(await jon.getByRole('switch', { name: 'Background music', exact: true }).isDisabled(), true);
  assert.equal(await jon.getByRole('switch', { name: 'Sound effects', exact: true }).isChecked(), false);
  await closeDialog(jon);
  await tv.locator('[data-action="start"]').click();
  await tv.locator('.game-layout').waitFor();
  await Promise.all(Object.values(phones).map(phone => phone.locator('.controller-inputs').waitFor()));
  let room = await run.room(code, hostToken);
  assert.equal(room.state.version, 3);
  assert.equal(room.state.players[room.state.firstPlayer === 'jon' ? 'lydia' : 'jon'].openingBonus, 1);
  run.check('Real v3 engine creates a game with the starting-player allowance');

  for (const [page, name] of [[tv, 'tv-1920x1080'], [jon, 'jon-360x800'], [lydia, 'lydia-390x844']]) {
    await noHorizontalOverflow(page);
    await run.screenshot(page, name);
  }
  await tv.setViewportSize({ width: 1280, height: 720 });
  await noHorizontalOverflow(tv);
  await run.screenshot(tv, 'tv-1280x720');
  for (const phone of Object.values(phones)) {
    // Query and measure in one browser JS turn. An SSE render between resolving
    // handles and measuring them can otherwise turn detached nodes into 0×0.
    const sizes = await phone.evaluate(() => [...document.querySelectorAll('.controller-inputs button, .controller-bottom .button')].map(node => {
      const box = node.getBoundingClientRect(), style = getComputedStyle(node);
      return {
        name: node.getAttribute('aria-label') || node.textContent.trim(),
        width: box.width, height: box.height,
        visible: !!node.getClientRects().length && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0',
      };
    }));
    (run.evidence.phoneTargets ||= []).push({ viewport: phone.viewportSize(), controls: sizes });
    const visible = sizes.filter(size => size.visible);
    assert.equal(visible.length, 7, `Seven primary phone actions must remain visible: ${JSON.stringify(sizes)}`);
    const undersized = visible.filter(size => size.width < 44 || size.height < 44);
    assert.equal(undersized.length, 0, `Visible primary phone actions need 44px targets: ${JSON.stringify(undersized)}`);
    const animations = await phone.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length);
    assert.equal(animations, 0, 'Reduced motion suppresses running browser animations');
  }
  run.check('TV and narrow-phone layouts render without horizontal overflow; reduced motion and primary touch targets');

  // Preference changes happen by real UI gestures, then survive an ordinary reload.
  await tv.bringToFront();
  await tv.locator('[data-action="audio"]').click();
  await waitUntil(async () => /Playing on this screen/.test(await tv.locator('.audio-live-status').innerText()), 'Host audio unlock from gesture');
  await tv.getByRole('switch', { name: 'Background music', exact: true }).uncheck();
  await tv.getByRole('switch', { name: 'Sound effects', exact: true }).uncheck();
  await tv.locator('#volume-slider').press('Home');
  for (let step = 0; step < 27; step++) await tv.locator('#volume-slider').press('ArrowRight');
  const sseFrames = await tv.evaluate(() => window.__sofaAcceptanceSseFrames);
  await waitUntil(async () => (await tv.evaluate(() => window.__sofaAcceptanceSseFrames)) > sseFrames, 'Real SSE heartbeat while volume has focus');
  assert.equal(await tv.locator('#volume-slider').evaluate(node => node === document.activeElement), true, 'SSE heartbeat preserves focused volume control');
  assert.equal(await tv.locator('#volume-slider').inputValue(), '27');
  run.check('A real SSE heartbeat preserves audio-dialog input focus and its chosen value');
  await closeDialog(tv);
  await tv.reload();
  await tv.locator('.game-layout').waitFor();
  await tv.locator('[data-action="audio"]').click();
  assert.equal(await tv.getByRole('switch', { name: 'Background music', exact: true }).isChecked(), false);
  assert.equal(await tv.getByRole('switch', { name: 'Sound effects', exact: true }).isChecked(), false);
  assert.equal(await tv.locator('#volume-slider').inputValue(), '27');
  await closeDialog(tv);
  run.check('Gesture audio unlock and saved independent music/effects/volume preferences');

  // Tutorial replay from a controller must not replace or mutate the live game.
  const beforeTutorial = await run.room(code, hostToken);
  const originalJonToken = await credentials(jon, code, 'jon');
  await jon.locator('[data-action="rules"]').click();
  await jon.locator('[data-action="tutorial"]').click();
  await jon.locator('.tutorial-layout').waitFor();
  await jon.locator('.tutorial-skip').click();
  await jon.locator('.controller-inputs').waitFor();
  assert.equal((await run.room(code, hostToken)).revision, beforeTutorial.revision);
  await jon.locator('[data-action="rules"]').click();
  await jon.locator('[data-action="tutorial"]').click();
  const lesson = number => waitUntil(async () => (await jon.locator('.lesson-label').innerText()) === String(number).padStart(2, '0'), `Tutorial lesson ${number}`);
  await lesson(1);
  await jon.locator('[data-command="move"][data-direction="right"]').click();
  await lesson(2);
  await jon.locator('[data-command="collect"]').click();
  await lesson(3);
  await jon.locator('[data-action="tutorial-continue"]').click();
  await lesson(4);
  await jon.locator('[data-command="move"][data-direction="left"]').click();
  await lesson(5);
  await jon.locator('[data-command="bank"]').click();
  await lesson(6);
  await jon.locator('[data-action="lure"]').click();
  await jon.locator('[data-action="choose-lure"][data-index="0"]').click();
  await lesson(7);
  await jon.locator('[data-action="tutorial-preview"]').click();
  await lesson(8);
  await jon.locator('[data-command="end"]').click();
  await jon.locator('.tutorial-complete').waitFor();
  await run.screenshot(jon, 'tutorial-complete');
  await jon.locator('[data-action="tutorial-restart"]').click();
  await lesson(1);
  await jon.locator('.tutorial-skip').click();
  await jon.locator('.controller-inputs').waitFor();
  assert.equal((await run.room(code, hostToken)).revision, beforeTutorial.revision);
  await jon.reload();
  await jon.locator('.controller-inputs').waitFor();
  assert.ok((await credentials(jon, code, 'jon')) === originalJonToken, 'Phone refresh retains its original credential');
  run.check('All eight tutorial lessons, replay/skip, and phone refresh preserve the authenticated live room');

  await jon.context().setOffline(true);
  await waitUntil(async () => (await jon.locator('.controller-status').innerText()).includes('Reconnecting'), 'Passive phone disconnect is visible');
  await jon.context().setOffline(false);
  await waitUntil(async () => !(await jon.locator('.controller-status').innerText()).includes('Reconnecting'), 'Phone reconnects after the network returns');
  run.check('Passive disconnect and reconnection without losing the seat');

  const firstSeed = room.state.seed;
  let turns = 0;
  while (room.state.phase !== 'finished') {
    const active = phones[room.state.activePlayer];
    await waitUntil(async () => await active.locator('[data-action="game-action"][data-command="end"]').isEnabled(), 'Active controller ready');
    const revision = room.revision;
    await active.locator('[data-action="game-action"][data-command="end"]').click();
    room = await waitUntil(async () => {
      const next = await run.room(code, hostToken);
      return next.revision > revision ? next : null;
    }, 'Authoritative end-turn acknowledgment');
    assert.ok(++turns <= 20);
  }
  assert.equal(turns, 20);
  await tv.locator('[data-action="rematch"]').waitFor();
  await run.screenshot(tv, 'results');
  await tv.locator('[data-action="rematch"]').click();
  await tv.locator('.game-layout').waitFor();
  room = await waitUntil(async () => {
    const next = await run.room(code, hostToken);
    return next.state.phase === 'playing' && next.state.seed !== firstSeed ? next : null;
  }, 'Fresh rematch');
  for (const phone of Object.values(phones)) {
    await waitUntil(async () => (await phone.locator('.controller-inputs').count()) === 1, 'Existing controller joins rematch');
  }
  run.check('A complete ten-round network match and fresh rematch with the same controllers', { turns });

  const saved = structuredClone(room.state);
  await run.restartServer();
  // A native webview starts at the stable root URL, not an old room query.
  // This tests the saved local-session pointer while retaining origin storage.
  await tv.goto(run.origin + '/');
  await tv.locator('.game-layout').waitFor();
  assert.equal(new URL(tv.url()).searchParams.get('room'), code, 'Root launch restores the host room');
  assert.equal(new URL(tv.url()).searchParams.has('join'), false, 'Root launch retains the host role');
  assert.ok((await credentials(tv, code, 'host')) === hostToken, 'Root launch reuses the saved host credential');
  assert.deepEqual((await run.room(code, hostToken)).state, saved);
  run.check('SQLite state and host role recover after local server restart and a fresh root-document launch');

  await tv.locator('[data-action="home"]').click();
  await tv.locator('[data-action="leave"]').click();
  await tv.locator('.arcade-home').waitFor();
  assert.equal(new URL(tv.url()).search, '');
  await tv.goto(run.origin + '/');
  await tv.locator('.arcade-home').waitFor();
  assert.equal(new URL(tv.url()).search, '', 'Explicit exit clears root-launch restoration');
  assert.equal(await tv.locator('.game-layout').count(), 0);
  run.check('Explicit collection exit disposes the match and a fresh root launch stays on the collection');
  await verifyNavigationRaces(run, { tv, jon, lydia });
  assert.deepEqual(run.evidence.externalRequests, []);
  assert.deepEqual(run.evidence.failedResponses, []);
  assert.deepEqual(run.evidence.errors, []);
  run.check('All observed pages/assets run with external HTTP(S) blocked, without console exceptions or missing static assets');
} catch (error) {
  failure = error;
} finally {
  await run.finish(failure);
}
if (failure) throw failure;
console.log(JSON.stringify({ suite: 'sofa-kingdoms', result: 'passed', checks: run.evidence.checks.length, screenshots: run.evidence.screenshots.length }));
