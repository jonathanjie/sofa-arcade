/** Real menu/game/phone audio acceptance; observers never replace native audio or timers. */
import assert from 'node:assert/strict';
import { GAME_CATALOG } from '../../../games/catalog.mjs';
import { SCORE as MENU, eventsForEffect } from '../../../ui/media/sofa-menu/score.mjs';
import { SCORE as SOFA } from '../../../ui/score.mjs';
import { SCORE as ODD } from '../../../ui/media/odd-laws-society/score.mjs';
import { acceptanceSession, closeDialog, credentials, waitUntil } from './support.mjs';

const run = await acceptanceSession('menu-audio');
run.evidence.methodology = 'Three isolated Chromium contexts, one TV and two browser phones, using the real LAN server and rendered controls. Thin observers count native AudioContexts, actual oscillator scheduling and the configured 45 ms clock; native methods still execute unchanged. No synthetic audio graph, virtual timers, forced visibility or autoplay policy override. This verifies scheduling and controls, not human auditory quality or physical-device output.';
run.evidence.audioSnapshots = [];
run.evidence.menuCues = [];

async function observeNativeAudio(page) {
  await page.addInitScript(() => {
    const NativeContext = window.AudioContext || window.webkitAudioContext;
    const contexts = [], notes = [], clocks = new Set();
    let clockStarts = 0, maxClocks = 0;
    if (NativeContext) {
      class ObservedContext extends NativeContext {
        constructor(...args) {
          super(...args);
          contexts.push(this);
        }
        createOscillator(...args) {
          const oscillator = super.createOscillator(...args);
          const note = { frequency: null, at: null, stops: [] };
          notes.push(note);
          const setFrequency = oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
          oscillator.frequency.setValueAtTime = (frequency, at) => {
            note.frequency = frequency;
            return setFrequency(frequency, at);
          };
          const start = oscillator.start.bind(oscillator);
          oscillator.start = (...values) => {
            note.at = values[0] ?? this.currentTime;
            return start(...values);
          };
          const stop = oscillator.stop.bind(oscillator);
          oscillator.stop = (...values) => {
            note.stops.push(values[0] ?? this.currentTime);
            return stop(...values);
          };
          return oscillator;
        }
      }
      window.AudioContext = ObservedContext;
      if (window.webkitAudioContext) window.webkitAudioContext = ObservedContext;
    }
    const nativeSetInterval = window.setInterval.bind(window);
    const nativeClearInterval = window.clearInterval.bind(window);
    window.setInterval = (fn, delay, ...args) => {
      const handle = nativeSetInterval(fn, delay, ...args);
      if (delay === 45) {
        clocks.add(handle);
        clockStarts++;
        maxClocks = Math.max(maxClocks, clocks.size);
      }
      return handle;
    };
    window.clearInterval = handle => { clocks.delete(handle); return nativeClearInterval(handle); };
    window.__sofaMenuAudioProbe = {
      snapshot: () => ({
        contexts: contexts.length,
        contextStates: contexts.map(context => context.state),
        clocks: clocks.size,
        activeClockIds: [...clocks],
        clockStarts,
        maxClocks,
        noteCount: notes.length,
      }),
      notesSince: index => notes.slice(index).map(note => ({ ...note, stops: [...note.stops] })),
    };
  });
}

async function snapshot(page) {
  return page.evaluate(async () => {
    // This exact URL is the singleton imported by the running shell.
    const { audio } = await import('/audio.js?v=5');
    return { settings: audio.getSettings(), native: window.__sofaMenuAudioProbe.snapshot() };
  });
}

async function record(page, name) {
  const observed = await snapshot(page);
  assert.ok(observed.native.contexts <= 1, 'one native AudioContext per document');
  assert.ok(observed.native.maxClocks <= 1, 'no overlapping look-ahead clocks');
  run.evidence.audioSnapshots.push({ name, ...observed });
  return observed;
}

async function playing(page, title) {
  await page.bringToFront();
  return waitUntil(async () => {
    const observed = await snapshot(page);
    return observed.settings.trackTitle === title && observed.settings.unlocked && observed.settings.canPlayMusic &&
      observed.native.contexts === 1 && observed.native.clocks === 1 && observed.native.noteCount > 0 && observed;
  }, `One unlocked soundtrack: ${title}`);
}

async function exitToMenu(page) {
  const componentExit = page.locator('.ols-toolbar [data-action="exit"]');
  if (await componentExit.count()) await componentExit.click();
  else await page.locator('[data-action="home"]').first().click();
  const leave = page.locator('[data-action="leave"]');
  if (await leave.count()) await leave.click();
  await page.locator('.arcade-home').waitFor();
}

async function cueFromGesture(page, name, gesture) {
  const before = await snapshot(page);
  assert.equal(before.settings.music, false, 'cue observation isolates effects using the real music control');
  assert.equal(before.settings.effects, true);
  assert.equal(before.native.clocks, 0);
  const expected = eventsForEffect(name).flatMap(note => [
    { frequency: 440 * 2 ** ((note.pitch - 69) / 12), beat: note.beat,
      duration: note.duration * 60 / MENU.bpm + .035 },
    ...(note.instrument === 'bell' ? [{ frequency: 880 * 2 ** ((note.pitch - 69) / 12), beat: note.beat,
      duration: Math.min(note.duration * 60 / MENU.bpm, .2) + .02 }] : []),
  ]);
  assert.ok(expected.length, `The menu cue ${name} is authored`);
  await gesture();
  const notes = await waitUntil(async () => {
    const observed = await page.evaluate(index => window.__sofaMenuAudioProbe.notesSince(index), before.native.noteCount);
    return observed.length >= expected.length && observed;
  }, `${name} schedules its authored native voices`);
  assert.equal(notes.length, expected.length, `${name} has no extra soundtrack or fallback cue`);
  const onset = notes[0].at;
  const near = (actual, expectedValue, label) => assert.ok(Math.abs(actual - expectedValue) < 1e-6, `${name} ${label}: ${actual} ≠ ${expectedValue}`);
  for (let index = 0; index < notes.length; index++) {
    near(notes[index].frequency, expected[index].frequency, 'pitch');
    near(notes[index].at - onset, expected[index].beat * 60 / MENU.bpm, 'onset at menu tempo');
    near(notes[index].stops[0] - notes[index].at, expected[index].duration, 'duration');
  }
  const after = await record(page, name);
  run.evidence.menuCues.push({ name, destinationTrack: after.settings.trackTitle, nativeVoices: notes.length, bpm: MENU.bpm });
}

let failure;
try {
  const tv = await run.page('tv', { width: 1280, height: 720 });
  const jon = await run.page('jon', { width: 360, height: 800 }, { isMobile: true, hasTouch: true });
  const lydia = await run.page('lydia', { width: 390, height: 844 }, { isMobile: true, hasTouch: true });
  for (const page of [tv, jon, lydia]) await observeNativeAudio(page);

  await tv.goto(run.origin);
  await tv.locator('.arcade-home').waitFor();
  const untouched = await record(tv, 'menu-before-gesture');
  assert.equal(untouched.settings.trackTitle, MENU.title);
  assert.equal(untouched.native.contexts, 0);
  assert.equal(untouched.native.clocks, 0);
  assert.equal(untouched.native.noteCount, 0);
  await tv.locator('.shelf-intro h1').click();
  const initial = await playing(tv, MENU.title);
  run.check('A deliberate collection pointer gesture unlocks the original menu melody; initial load creates no graph or notes');

  for (let render = 0; render < 3; render++) {
    await tv.locator('[data-action="audio"]').click();
    await tv.getByRole('dialog', { name: 'Music and sound settings' }).waitFor();
    assert.ok((await tv.locator('.audio-setting').first().innerText()).includes(MENU.title));
    await closeDialog(tv);
  }
  const rendered = await record(tv, 'menu-after-repeated-dialog-renders');
  assert.equal(rendered.native.clockStarts, initial.native.clockStarts);
  assert.deepEqual(rendered.native.activeClockIds, initial.native.activeClockIds);
  run.check('Opening and closing sound controls does not restart the menu phrase or its clock');

  await tv.locator('[data-action="audio"]').click();
  await tv.getByRole('switch', { name: 'Background music', exact: true }).uncheck();
  await cueFromGesture(tv, 'menu-confirm', () => closeDialog(tv));
  const planned = GAME_CATALOG.find(game => game.status === 'planned');
  assert.ok(planned, 'The catalog has a planned detail page to verify');
  await cueFromGesture(tv, 'menu-select', () => tv.locator(`.game-card[data-game="${planned.id}"]`).click());
  assert.equal((await snapshot(tv)).settings.trackTitle, MENU.title, 'a planned game keeps the collection composition');
  await cueFromGesture(tv, 'menu-back', () => exitToMenu(tv));
  await cueFromGesture(tv, 'menu-select', () => tv.locator('.game-card[data-game="sofa-kingdoms"]').click());
  assert.equal((await snapshot(tv)).settings.trackTitle, SOFA.title);
  await cueFromGesture(tv, 'menu-back', () => exitToMenu(tv));
  run.check(`All three menu cues play at ${MENU.bpm} BPM through UI gestures, including selection of a game with a different tempo. Planned details retain the menu theme.`);

  await tv.locator('[data-action="audio"]').click();
  await tv.getByRole('switch', { name: 'Sound effects', exact: true }).uncheck();
  const bothOff = await snapshot(tv);
  await closeDialog(tv);
  await tv.locator(`.game-card[data-game="${planned.id}"]`).click();
  await exitToMenu(tv);
  const mutedNavigation = await record(tv, 'muted-menu-navigation');
  assert.equal(mutedNavigation.native.noteCount, bothOff.native.noteCount, 'muted navigation schedules no effects');
  assert.equal(mutedNavigation.native.clocks, 0);
  await tv.locator('[data-action="audio"]').click();
  await tv.getByRole('switch', { name: 'Background music', exact: true }).check();
  await playing(tv, MENU.title);
  assert.equal(await tv.getByRole('switch', { name: 'Sound effects', exact: true }).isChecked(), false);
  await tv.locator('#volume-slider').press('Home');
  for (let step = 0; step < 27; step++) await tv.locator('#volume-slider').press('ArrowRight');
  assert.equal(await tv.locator('#volume-slider').inputValue(), '27');
  await playing(tv, MENU.title);
  await run.screenshot(tv, 'collection-music-settings');
  await closeDialog(tv);
  run.check('Menu music and effects are independent; music can run with effects off, and volume uses the shared saved setting');

  await tv.reload();
  await tv.locator('.arcade-home').waitFor();
  const restored = await record(tv, 'reloaded-menu-before-new-gesture');
  assert.equal(restored.settings.music, true);
  assert.equal(restored.settings.effects, false);
  assert.equal(restored.settings.volume, .27);
  assert.equal(restored.native.contexts, 0, 'saved music-on is not permission to autoplay a new document');
  await tv.locator('[data-action="audio"]').press('Enter');
  await playing(tv, MENU.title);
  assert.equal(await tv.getByRole('switch', { name: 'Background music', exact: true }).isChecked(), true);
  assert.equal(await tv.getByRole('switch', { name: 'Sound effects', exact: true }).isChecked(), false);
  assert.equal(await tv.locator('#volume-slider').inputValue(), '27');
  await closeDialog(tv);
  run.check('A keyboard gesture unlocks the menu after reload; independent preferences and volume persist');

  await tv.locator('.game-card[data-game="sofa-kingdoms"]').click();
  await playing(tv, SOFA.title);
  await tv.locator('[data-action="practice"]').click();
  await tv.locator('.game-layout').waitFor();
  await playing(tv, SOFA.title);
  await record(tv, 'sofa-kingdoms-practice');
  await tv.locator('[data-action="audio"]').click();
  await run.screenshot(tv, 'sofa-kingdoms-music-settings');
  await closeDialog(tv);
  await exitToMenu(tv);
  await playing(tv, MENU.title);
  await record(tv, 'menu-after-sofa-kingdoms');
  run.check('Collection → Sofa Kingdoms practice → collection replaces the selected score on one native graph and clock');

  // A browsing screen becomes a quiet phone session as soon as Join is chosen.
  await lydia.goto(run.origin);
  await lydia.locator('.arcade-home').waitFor();
  await lydia.locator('[data-action="audio"]').press('Enter');
  await playing(lydia, MENU.title);
  await closeDialog(lydia);
  await lydia.locator('[data-action="join-menu"]').click();
  await lydia.locator('#join-form').waitFor();
  const joinedIntent = await snapshot(lydia);
  assert.equal(joinedIntent.settings.canPlayMusic, false);
  assert.equal(joinedIntent.settings.effects, false);
  assert.equal(joinedIntent.native.clocks, 0);
  await exitToMenu(lydia);
  const quietMenu = await record(lydia, 'join-exit-retains-quiet-menu');
  assert.equal(quietMenu.settings.trackTitle, MENU.title);
  assert.equal(quietMenu.settings.canPlayMusic, false);
  assert.equal(quietMenu.native.clocks, 0);
  assert.equal(quietMenu.native.noteCount, joinedIntent.native.noteCount);
  await lydia.locator(`.game-card[data-game="${planned.id}"]`).click();
  assert.equal((await snapshot(lydia)).native.noteCount, joinedIntent.native.noteCount);
  await exitToMenu(lydia);
  await lydia.getByRole('button', { name: 'Show Sofa Kingdoms', exact: true }).click();
  await lydia.locator('.featured-game[aria-hidden="false"] [data-action="tutorial"]').click();
  await lydia.locator('.tutorial-layout').waitFor();
  const quietTutorial = await record(lydia, 'quiet-menu-tutorial');
  assert.equal(quietTutorial.settings.canPlayMusic, false, 'tutorial host role preserves the originating quiet phone intent');
  assert.equal(quietTutorial.settings.effects, false);
  assert.equal(quietTutorial.native.clocks, 0);
  assert.equal(quietTutorial.native.noteCount, joinedIntent.native.noteCount);
  await lydia.locator('.tutorial-toolbar [data-action="tutorial-exit"]').click();
  await lydia.locator('.arcade-home').waitFor();
  const quietTutorialReturn = await record(lydia, 'quiet-tutorial-return-menu');
  assert.equal(quietTutorialReturn.settings.trackTitle, MENU.title);
  assert.equal(quietTutorialReturn.settings.canPlayMusic, false);
  assert.equal(quietTutorialReturn.native.clocks, 0);
  assert.equal(quietTutorialReturn.native.noteCount, joinedIntent.native.noteCount);
  run.check('Choosing Join stops an already playing menu; collection, planned detail and the shelf tutorial retain quiet phone intent, including the tutorial return');

  await tv.bringToFront();
  await tv.locator('.game-card[data-game="odd-laws-society"]').click();
  await playing(tv, ODD.title);
  await tv.locator('.odd-laws-detail [data-action="create"]').click();
  await tv.locator('.room-code').waitFor();
  const code = (await tv.locator('.room-code').innerText()).trim();
  assert.ok(await credentials(tv, code, 'host'));
  for (const [id, page] of Object.entries({ jon, lydia })) {
    await page.goto(`${run.origin}/?join=${code}&seat=${id}`);
    await page.locator(`[data-action="claim"][data-player="${id}"]`).waitFor();
    const preJoin = await record(page, `${id}-fresh-join`);
    assert.equal(preJoin.native.contexts, 0);
    assert.equal(preJoin.native.noteCount, 0);
    assert.equal(preJoin.settings.canPlayMusic, false);
    await page.locator(`[data-action="claim"][data-player="${id}"]`).click();
    await page.locator('.waiting-scene').waitFor();
    assert.ok(await credentials(page, code, id));
    await page.locator('[data-action="audio"]').click();
    assert.equal(await page.getByRole('switch', { name: 'Background music', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('switch', { name: 'Sound effects', exact: true }).isChecked(), false);
    await closeDialog(page);
    const quiet = await record(page, `${id}-joined-controller`);
    assert.equal(quiet.native.clocks, 0);
    assert.equal(quiet.native.noteCount, 0, 'fresh joined phones produce no default music or effects');
  }
  await tv.bringToFront();
  await tv.locator('[data-action="start"]').click();
  await tv.locator('.ols-tv-council').waitFor();
  await Promise.all([jon, lydia].map(page => page.locator('.ols-phone-council').waitFor()));
  await playing(tv, ODD.title);
  await record(tv, 'odd-laws-council');
  await tv.locator('[data-action="audio"]').click();
  await run.screenshot(tv, 'odd-laws-music-settings');
  await closeDialog(tv);
  await exitToMenu(tv);
  await playing(tv, MENU.title);
  await record(tv, 'menu-after-odd-laws');
  run.check('Collection → Odd Laws lobby/council → collection selects each game’s score with one graph and clock; both real controllers start quiet');

  for (const [id, page] of Object.entries({ jon, lydia })) {
    await exitToMenu(page);
    await page.locator('[data-action="audio"]').click();
    assert.equal(await page.getByRole('switch', { name: 'Background music', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('switch', { name: 'Sound effects', exact: true }).isChecked(), false);
    const afterExit = await record(page, `${id}-controller-exit-menu`);
    assert.equal(afterExit.native.clocks, 0);
    assert.equal(afterExit.native.noteCount, 0, 'a controller exit does not suddenly start a menu soundtrack or back cue');
    if (id === 'jon') await run.screenshot(page, 'phone-quiet-collection');
    await closeDialog(page);
  }
  run.check('Leaving an active phone controller for the collection retains quiet defaults, including menu effects and sound-dialog interactions');
  assert.deepEqual(run.evidence.externalRequests, []);
  assert.deepEqual(run.evidence.failedResponses, []);
  assert.deepEqual(run.evidence.errors, []);
  run.check('All observed music modules, images and UI routes load locally with no external HTTP(S), missing assets or page exceptions');
} catch (error) {
  failure = error;
} finally {
  await run.finish(failure);
}
if (failure) throw failure;
console.log(JSON.stringify({ suite: 'menu-audio', result: 'passed', checks: run.evidence.checks.length, screenshots: run.evidence.screenshots.length }));
