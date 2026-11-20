import test from 'node:test';
import assert from 'node:assert/strict';

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
    exponentialRampToValueAtTime(value, at) { this.events.push({ value, at }); },
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
      return [{ instrument: 'woodwind', pitch: 69, beat: 0, duration: 2, level: .1 }];
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
  assert.equal(env.intervals.size, 0, 'returning to the collection stops the score');
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
