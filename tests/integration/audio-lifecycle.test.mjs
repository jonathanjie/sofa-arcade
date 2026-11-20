import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadOddLaws } from '../../ui/collection-load.mjs';

/** Capture scheduled notes and graph lifetimes, not an implementation snapshot. */
function audioEnvironment() {
  const storage = new Map();
  const contexts = [];
  const intervals = new Set();
  const parameter = () => ({
    value: 0, events: [],
    cancelScheduledValues() {},
    setTargetAtTime(value, at, duration) { this.events.push({ value, at, duration }); },
    setValueAtTime(value, at) { this.events.push({ value, at }); },
    exponentialRampToValueAtTime(value, at) { assert.ok(value > 0, 'Web Audio exponential targets must be positive'); this.events.push({ value, at }); },
  });
  const node = () => ({ connect() {}, disconnect() {}, gain: parameter(), frequency: parameter() });
  class Context {
    constructor() {
      this.currentTime = 0;
      this.state = 'suspended';
      this.destination = {};
      this.oscillators = [];
      contexts.push(this);
    }
    createGain() { return node(); }
    createDynamicsCompressor() {
      return { ...node(), threshold: parameter(), knee: parameter(), ratio: parameter(), attack: parameter(), release: parameter() };
    }
    createDelay() { return { ...node(), delayTime: parameter() }; }
    createBiquadFilter() { return node(); }
    createPeriodicWave() { return {}; }
    createOscillator() {
      const source = { ...node(), starts: [], stops: [], setPeriodicWave() {},
        start(at) { this.starts.push(at); }, stop(at) { this.stops.push(at); } };
      this.oscillators.push(source);
      return source;
    }
    async resume() { this.state = 'running'; this.onstatechange?.(); }
    async suspend() { this.state = 'suspended'; this.onstatechange?.(); }
    async close() { this.state = 'closed'; this.onstatechange?.(); }
  }
  const window = Object.assign(new EventTarget(), {
    AudioContext: Context,
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
  });
  const document = Object.assign(new EventTarget(), { hidden: false });
  return { window, document, storage, contexts, intervals };
}

test('collection scores share one graph and clock, respect host/phone preferences, and survive relaunch', async t => {
  const env = audioEnvironment();
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  globalThis.window = env.window;
  globalThis.document = env.document;
  t.mock.method(globalThis, 'setInterval', fn => { const handle = { fn }; env.intervals.add(handle); return handle; });
  t.mock.method(globalThis, 'clearInterval', handle => env.intervals.delete(handle));
  const { audio } = await import(`../../ui/audio.js?integration=${Date.now()}`);
  t.after(() => {
    audio.dispose();
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
  });
  const modes = [];
  const custom = {
    SCORE: { title: 'Council test theme', bpm: 120, beatsPerBar: 4, bars: [{}, {}, {}, {}] },
    eventsForBar(index, mode) {
      modes.push({ index, mode });
      return [
        { instrument: 'woodwind', pitch: 69, beat: 0, duration: 2, level: .1 },
        { instrument: 'woodwind', pitch: 60, beat: 1, duration: 1, level: 0 },
        { instrument: 'bell', pitch: 60, beat: 2, duration: 1, level: 0 },
      ];
    },
    eventsForEffect(name) {
      return name === 'seal' ? [{ instrument: 'pizzicato', pitch: 60, beat: .5, duration: .5, level: .1 }] : [];
    },
  };

  audio.setContext({ role: 'host', view: 'game' });
  audio.setScore('odd-laws-society', custom);
  audio.setScene('council');
  assert.equal(env.contexts.length, 0, 'loading a game must not open audio before a gesture');
  await audio.unlock();
  const context = env.contexts[0];
  assert.equal(env.contexts.length, 1);
  assert.equal(env.intervals.size, 1);
  assert.equal(audio.getSettings().trackTitle, custom.SCORE.title);
  assert.equal(modes[0].mode, 'council');
  assert.equal(context.oscillators[0].frequency.events[0].value, 440);
  assert.equal(context.oscillators.length, 1, 'zero-level notes are silent rests, not invalid exponential ramps');
  const beforeEffect = context.oscillators.length;
  audio.effect('seal');
  assert.equal(context.oscillators.length, beforeEffect + 1);
  assert.equal(context.oscillators.at(-1).starts[0], .26, 'effect onset uses the active score beat length');

  audio.setMusic(false);
  assert.equal(env.intervals.size, 0);
  audio.setEffects(false);
  const muted = context.oscillators.length;
  audio.effect('seal');
  assert.equal(context.oscillators.length, muted);
  audio.setVolume(.27);
  audio.setScore('sofa-kingdoms');
  assert.notEqual(audio.getSettings().trackTitle, custom.SCORE.title);
  assert.equal(audio.getSettings().music, false, 'switching games preserves the player setting');
  audio.setMusic(true);
  assert.equal(env.intervals.size, 1);
  const sofaVoices = [...context.oscillators];
  audio.setScore('odd-laws-society', custom);
  assert.equal(env.intervals.size, 1, 'changing games replaces the single scheduler');
  assert.equal(env.contexts.length, 1, 'changing games keeps one AudioContext');
  assert.equal(sofaVoices.every(source => source.stops.length >= 2), true, 'old scheduled notes are stopped');

  audio.setContext({ role: 'player', view: 'game' });
  assert.equal(env.intervals.size, 0, 'a phone never plays the host soundtrack');
  assert.equal(audio.getSettings().effects, false, 'phones start quiet independently of host music');
  const quietPhone = context.oscillators.length;
  audio.effect('seal');
  assert.equal(context.oscillators.length, quietPhone);
  audio.setEffects(true);
  audio.effect('seal');
  assert.equal(context.oscillators.length, quietPhone + 1);
  assert.equal(env.intervals.size, 0, 'optional phone effects do not turn on music');

  audio.setContext({ role: 'host', view: 'game' });
  assert.equal(audio.getSettings().effects, false, 'host and phone effects retain separate values');
  env.document.hidden = true;
  env.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(env.intervals.size, 0);
  assert.equal(context.state, 'suspended');
  env.document.hidden = false;
  env.document.dispatchEvent(new Event('visibilitychange'));
  await Promise.resolve();
  assert.equal(env.intervals.size, 1);
  audio.setContext({ role: null, view: 'collection' });
  assert.equal(env.intervals.size, 0, 'a game score cannot leak into the collection; the shell must select its menu score');
  const saved = JSON.parse(env.storage.get('sofa-arcade-audio-v1'));
  assert.deepEqual(saved, { music: true, effects: false, phoneEffects: true, volume: .27 });

  audio.dispose();
  const restored = (await import(`../../ui/audio.js?integration=relaunch-${Date.now()}`)).audio;
  assert.equal(restored.getSettings().volume, .27);
  assert.equal(restored.getSettings().effects, false);
  restored.setContext({ role: 'player' });
  assert.equal(restored.getSettings().effects, true);
  assert.equal(env.contexts.length, 1, 'relaunch does not play without another gesture');
  restored.dispose();
});

test('the delivered WS4 score loads through the collection adapter and plays a complete 100 BPM loop', async t => {
  const modules = await loadOddLaws({
    origin: 'http://127.0.0.1:4177',
    importer(path) {
      const publicRules = /^\/games\/odd-laws-society\/(catalog|preview)\.mjs$/.test(path);
      return import(new URL(`../../${publicRules ? '' : 'ui'}${path}`, import.meta.url));
    },
    async fetcher(url) {
      assert.equal(url, 'http://127.0.0.1:4177/assets/odd-laws-society/manifest.json');
      return new Response(await readFile(new URL('../../public/assets/odd-laws-society/manifest.json', import.meta.url)));
    },
  });
  assert.equal(modules.mediaAvailable, true);
  assert.equal(modules.assets.manifestUrl, 'http://127.0.0.1:4177/assets/odd-laws-society/manifest.json');
  assert.equal(modules.score.SCORE.title, 'Lala Calls the House');
  assert.equal(modules.score.SCORE.bpm, 100);
  assert.equal(modules.score.SCORE.beatsPerBar, 4);
  assert.equal(modules.score.SCORE.bars.length, 32);
  assert.equal(typeof modules.createTutorial, 'function');
  assert.equal(typeof modules.rules.buildQuote, 'function');

  const env = audioEnvironment();
  const originalWindow = globalThis.window, originalDocument = globalThis.document;
  globalThis.window = env.window;
  globalThis.document = env.document;
  t.mock.method(globalThis, 'setInterval', fn => { const handle = { fn }; env.intervals.add(handle); return handle; });
  t.mock.method(globalThis, 'clearInterval', handle => env.intervals.delete(handle));
  const { audio } = await import(`../../ui/audio.js?integration=ws4-${Date.now()}`);
  t.after(() => {
    audio.dispose();
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
  });
  const calls = [];
  const score = {
    ...modules.score,
    eventsForBar(index, scene) { calls.push({ index, scene }); return modules.score.eventsForBar(index, scene); },
  };
  const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} ≠ ${expected}`);
  function checkVoices(voices, events, at) {
    let index = 0;
    for (const note of events) {
      const voice = voices[index++];
      const onset = at + note.beat * .6, duration = note.duration * .6;
      assert.ok(voice, `Missing ${note.instrument} note at beat ${note.beat}`);
      near(voice.frequency.events[0].value, 440 * 2 ** ((note.pitch - 69) / 12), 'authored pitch');
      near(voice.starts[0], onset, 'beat-based onset');
      near(voice.stops[0], onset + duration + .035, 'authored note duration and shared release');
      if (note.instrument === 'bell') {
        const harmonic = voices[index++];
        near(harmonic.frequency.events[0].value, voice.frequency.events[0].value * 2, 'shared bell overtone');
        near(harmonic.starts[0], onset, 'bell onset');
      }
    }
    assert.equal(index, voices.length, 'one authored score plus its shared bell timbre, without another soundtrack');
  }

  audio.setContext({ role: 'host', view: 'game', phase: 'playing' });
  audio.setScore('odd-laws-society', score);
  audio.setScene('council');
  assert.equal(env.contexts.length, 0, 'real score loading is silent before a user gesture');
  await audio.unlock();
  const context = env.contexts[0];
  assert.equal(env.intervals.size, 1);
  checkVoices(context.oscillators, modules.score.eventsForBar(0, 'council'), .045);
  const sceneChanges = new Map([[1, 'term1'], [5, 'term2'], [9, 'term3'], [13, 'celebrate'], [29, 'lobby']]);
  const sceneAt = bar => bar < 4 ? 'council' : bar < 8 ? 'term1' : bar < 12 ? 'term2' : bar < 16 ? 'term3' : bar < 32 ? 'celebrate' : 'lobby';
  for (let bar = 1; bar <= 32; bar++) {
    if (sceneChanges.has(bar)) audio.setScene(sceneChanges.get(bar));
    const before = context.oscillators.length;
    const at = .045 + bar * 2.4;
    context.currentTime = at - .1;
    for (const interval of env.intervals) interval.fn();
    assert.deepEqual(calls.at(-1), { index: bar % 32, scene: sceneAt(bar) });
    assert.equal(calls.length, bar + 1, 'no missed bars or duplicate scheduler');
    checkVoices(context.oscillators.slice(before), modules.score.eventsForBar(bar % 32, sceneAt(bar)), at);
  }
  assert.equal(calls[32].index, 0, 'the authored 32-bar loop returns after 76.8 seconds');
  assert.equal(env.contexts.length, 1);
  assert.equal(env.intervals.size, 1);

  audio.setMusic(false);
  audio.setEffects(false);
  audio.setVolume(.27);
  assert.equal(env.intervals.size, 0);
  audio.setContext({ role: 'player', view: 'game' });
  const quiet = context.oscillators.length;
  for (const name of ['build', 'coin', 'influence', 'street', 'seal', 'reveal', 'stamp', 'festival', 'win', 'tie']) audio.effect(name);
  assert.equal(context.oscillators.length, quiet, 'a controller starts quiet for the real effect vocabulary');
  audio.setEffects(true);
  for (const name of ['build', 'coin', 'influence', 'street', 'seal', 'reveal', 'stamp', 'festival', 'win', 'tie']) {
    const before = context.oscillators.length;
    audio.effect(name);
    checkVoices(context.oscillators.slice(before), modules.score.eventsForEffect(name), context.currentTime + .01);
  }
  const afterCues = context.oscillators.length;
  audio.effect('move');
  assert.equal(context.oscillators.length, afterCues, 'unknown Odd Laws effect names remain silent');
  audio.setMusic(true);
  assert.equal(env.intervals.size, 0, 'even saved music-on preference cannot start a phone soundtrack');
  audio.setContext({ role: 'host', view: 'game' });
  assert.equal(audio.getSettings().effects, false, 'host effects retain their independent saved control');
  assert.equal(env.intervals.size, 1);
  const oldVoices = [...context.oscillators];
  audio.setScore('sofa-kingdoms');
  assert.equal(env.contexts.length, 1);
  assert.equal(env.intervals.size, 1);
  assert.ok(oldVoices.every(voice => voice.stops.length >= 2), 'returning to Sofa Kingdoms silences the old composed score');
  audio.setContext({ role: null, view: 'collection' });
  assert.equal(env.intervals.size, 0);
  assert.deepEqual(JSON.parse(env.storage.get('sofa-arcade-audio-v1')), { music: true, effects: false, phoneEffects: true, volume: .27 });
});

test('the built-in menu score unlocks once, keeps its full composed loop, and switches through one graph and clock', async t => {
  const menu = await import('../../ui/media/sofa-menu/score.mjs');
  const sofa = await import('../../ui/score.mjs');
  const oddScore = await import('../../ui/media/odd-laws-society/score.mjs');
  const oddEffects = await import('../../ui/media/odd-laws-society/effects.mjs');
  const odd = { ...oddScore, ...oddEffects };
  assert.equal(menu.SCORE.title, 'Make Yourself at Home');
  assert.equal(menu.SCORE.bpm, 92);
  assert.equal(menu.SCORE.beatsPerBar, 3);
  assert.equal(menu.SCORE.bars.length, 32);

  const env = audioEnvironment();
  const originalWindow = globalThis.window, originalDocument = globalThis.document;
  globalThis.window = env.window;
  globalThis.document = env.document;
  let clockStarts = 0;
  t.mock.method(globalThis, 'setInterval', fn => {
    clockStarts++;
    const handle = { fn };
    env.intervals.add(handle);
    assert.ok(env.intervals.size <= 1, 'there must never be overlapping soundtrack clocks');
    return handle;
  });
  t.mock.method(globalThis, 'clearInterval', handle => env.intervals.delete(handle));
  const { audio } = await import(`../../ui/audio.js?integration=menu-${Date.now()}`);
  t.after(() => {
    audio.dispose();
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
  });
  const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} ≠ ${expected}`);
  function checkVoices(voices, events, at, bpm) {
    let cursor = 0;
    for (const note of events.filter(event => event.level > 0)) {
      const voice = voices[cursor++];
      const onset = at + note.beat * 60 / bpm, duration = note.duration * 60 / bpm;
      assert.ok(voice, `Missing ${note.instrument} note at beat ${note.beat}`);
      near(voice.frequency.events[0].value, 440 * 2 ** ((note.pitch - 69) / 12), 'authored pitch');
      near(voice.starts[0], onset, 'authored beat onset');
      near(voice.stops[0], onset + duration + .035, 'authored duration with shared release');
      if (note.instrument === 'bell') {
        const harmonic = voices[cursor++];
        assert.ok(harmonic, 'a bell retains the shared quiet upper partial');
        near(harmonic.frequency.events[0].value, voice.frequency.events[0].value * 2, 'bell upper partial');
        near(harmonic.starts[0], onset, 'bell onset');
      }
    }
    assert.equal(cursor, voices.length, 'exactly the authored events and existing bell partials are scheduled');
  }

  audio.setScore('sofa-menu');
  audio.setContext({ role: null, view: 'collection' });
  assert.equal(audio.getSettings().trackTitle, menu.SCORE.title);
  assert.equal(audio.getSettings().canPlayMusic, true);
  assert.equal(env.contexts.length, 0, 'preparing the collection is silent before a gesture');
  assert.equal(env.intervals.size, 0);
  await audio.unlock();
  const context = env.contexts[0];
  assert.equal(env.contexts.length, 1);
  assert.equal(env.intervals.size, 1);
  checkVoices(context.oscillators, menu.eventsForBar(0), .045, menu.SCORE.bpm);
  const firstClock = [...env.intervals][0];
  const firstVoices = context.oscillators.length;
  for (let render = 0; render < 12; render++) {
    audio.setScore('sofa-menu');
    audio.setContext({ role: null, view: 'collection' });
    audio.setScene('lobby');
  }
  assert.equal(clockStarts, 1, 'repeat renders do not restart the musical phrase');
  assert.equal([...env.intervals][0], firstClock);
  assert.equal(context.oscillators.length, firstVoices, 'repeat renders do not replay the opening notes');

  const barSeconds = 60 / menu.SCORE.bpm * menu.SCORE.beatsPerBar;
  for (let bar = 1; bar <= menu.SCORE.bars.length; bar++) {
    const before = context.oscillators.length;
    const at = .045 + bar * barSeconds;
    context.currentTime = at - .1;
    firstClock.fn();
    checkVoices(context.oscillators.slice(before), menu.eventsForBar(bar % 32), at, menu.SCORE.bpm);
  }
  assert.equal(clockStarts, 1, 'a complete AABA loop and its return keep the same clock');

  const route = (id, module, view, expectedTitle) => {
    const old = [...context.oscillators];
    audio.setContext({ role: null, view });
    audio.setScore(id, module);
    assert.equal(audio.getSettings().trackTitle, expectedTitle);
    assert.equal(env.contexts.length, 1, 'navigation reuses the unlocked graph');
    assert.equal(env.intervals.size, 1, 'only the destination soundtrack has a clock');
    assert.ok(old.every(voice => voice.stops.length >= 2), 'old scheduled notes are stopped at a score change');
  };
  route('sofa-kingdoms', null, 'detail', sofa.SCORE.title);
  audio.setContext({ role: 'host', view: 'game', phase: 'playing' });
  route('sofa-menu', null, 'collection', menu.SCORE.title);
  route('odd-laws-society', odd, 'detail', odd.SCORE.title);
  audio.setContext({ role: 'host', view: 'game', phase: 'playing' });
  audio.setScene('council');
  route('sofa-menu', null, 'collection', menu.SCORE.title);

  // A menu cue is still written in menu beats when a click has just selected
  // a game with a different tempo. Music remains off throughout this check.
  audio.setMusic(false);
  for (const [id, module] of [['sofa-menu', null], ['sofa-kingdoms', null], ['odd-laws-society', odd]]) {
    audio.setContext({ role: null, view: id === 'sofa-menu' ? 'collection' : 'detail' });
    audio.setScore(id, module);
    for (const name of ['menu-select', 'menu-back', 'menu-confirm']) {
      const before = context.oscillators.length;
      audio.effect(name);
      checkVoices(context.oscillators.slice(before), menu.eventsForEffect(name), context.currentTime + .01, menu.SCORE.bpm);
    }
    const beforeUnknown = context.oscillators.length;
    audio.effect('menu-not-a-cue');
    assert.equal(context.oscillators.length, beforeUnknown, 'an unknown menu effect is silent on every soundtrack');
    assert.equal(env.intervals.size, 0, 'effects do not start a muted soundtrack');
  }
  audio.setScore('sofa-menu');
  audio.setContext({ role: null, view: 'collection' });
  const unknown = context.oscillators.length;
  audio.effect('not-a-real-effect');
  assert.equal(context.oscillators.length, unknown, 'menu unknown names never fall through to a game effect');

  audio.setEffects(false);
  const mutedEffects = context.oscillators.length;
  for (const cue of ['menu-select', 'menu-back', 'menu-confirm']) audio.effect(cue);
  assert.equal(context.oscillators.length, mutedEffects);
  audio.setMusic(true);
  assert.equal(env.intervals.size, 1, 'music runs independently when effects are off');
  audio.setVolume(0);
  assert.equal(env.intervals.size, 0, 'zero volume stops scheduling rather than generating inaudible music');
  audio.setEffects(true);
  const zeroVolume = context.oscillators.length;
  audio.effect('menu-confirm');
  assert.equal(context.oscillators.length, zeroVolume);
  audio.setVolume(.27);
  audio.setEffects(false);
  assert.equal(env.intervals.size, 1);

  env.document.hidden = true;
  env.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(env.intervals.size, 0);
  assert.equal(context.state, 'suspended');
  const hiddenVoices = context.oscillators.length;
  audio.effect('menu-confirm');
  assert.equal(context.oscillators.length, hiddenVoices);
  env.document.hidden = false;
  env.document.dispatchEvent(new Event('visibilitychange'));
  await Promise.resolve();
  assert.equal(context.state, 'running');
  assert.equal(env.intervals.size, 1, 'visibility return restores only one menu clock');

  // The shell retains player intent on Join and on a phone's collection exit.
  // Even saved music-on never authorizes a soundtrack in that player context.
  audio.setContext({ role: 'player', view: 'join' });
  assert.equal(env.intervals.size, 0);
  assert.equal(audio.getSettings().effects, false);
  const phoneVoices = context.oscillators.length;
  await audio.unlock();
  for (const cue of ['menu-select', 'menu-back', 'menu-confirm']) audio.effect(cue);
  audio.setContext({ role: 'player', view: 'collection' });
  audio.setScore('sofa-menu');
  assert.equal(audio.getSettings().canPlayMusic, false);
  assert.equal(env.intervals.size, 0);
  assert.equal(context.oscillators.length, phoneVoices, 'join and phone-menu gestures stay quiet by default');
  audio.setEffects(true);
  audio.effect('menu-select');
  assert.ok(context.oscillators.length > phoneVoices, 'phone effects require a deliberate opt-in');
  assert.equal(env.intervals.size, 0, 'opting into phone effects never enables menu music');
  audio.setContext({ role: 'host', view: 'collection' });
  assert.equal(audio.getSettings().effects, false, 'phone effects do not change the host preference');
  assert.equal(env.intervals.size, 1);
  const saved = { music: true, effects: false, phoneEffects: true, volume: .27 };
  assert.deepEqual(JSON.parse(env.storage.get('sofa-arcade-audio-v1')), saved);

  audio.dispose();
  assert.equal(env.intervals.size, 0);
  assert.equal(context.state, 'closed');
  const restored = (await import(`../../ui/audio.js?integration=menu-reload-${Date.now()}`)).audio;
  t.after(() => restored.dispose());
  restored.setScore('sofa-menu');
  restored.setContext({ role: null, view: 'collection' });
  assert.equal(env.contexts.length, 1, 'reloading preferences does not create a new graph without a gesture');
  assert.equal(restored.getSettings().volume, saved.volume);
  assert.equal(restored.getSettings().music, saved.music);
  assert.equal(restored.getSettings().effects, saved.effects);
  assert.equal(restored.getSettings().unlocked, false);
  restored.setContext({ role: 'player', view: 'collection' });
  assert.equal(restored.getSettings().effects, saved.phoneEffects);
  assert.equal(restored.getSettings().canPlayMusic, false);
});
