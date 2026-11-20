/**
 * Original Sofa Arcade score, played locally with Web Audio.
 * No recordings, downloads, third-party tracks, or recurring audio requests.
 * A short look-ahead scheduler keeps the musical clock independent of rendering.
 */
import { SCORE, eventsForBar } from './score.mjs?v=3';

const defaultSoundtrack = Object.freeze({ id: 'sofa-kingdoms', score: SCORE, eventsForBar, eventsForEffect: null });
let soundtrack = defaultSoundtrack;

const STORAGE_KEY = 'sofa-arcade-audio-v1';
const clamp = (number, min, max) => Math.min(max, Math.max(min, number));
const browser = typeof window !== 'undefined' ? window : null;
const page = typeof document !== 'undefined' ? document : null;
const AudioConstructor = browser?.AudioContext || browser?.webkitAudioContext;
let saved = {};
try { saved = JSON.parse(browser?.localStorage?.getItem(STORAGE_KEY) || '{}') || {}; } catch {}
const preferences = {
  music: typeof saved.music === 'boolean' ? saved.music : true,
  effects: typeof saved.effects === 'boolean' ? saved.effects : true,
  phoneEffects: typeof saved.phoneEffects === 'boolean' ? saved.phoneEffects : false,
  volume: Number.isFinite(saved.volume) ? clamp(saved.volume, 0, 1) : 0.45,
};
const scene = { role: null, view: 'collection', phase: null, forecastType: null, round: 1, maxRounds: 10, scoreScene: 'lobby' };
const listeners = new Set();
const voices = new Set();
let context = null;
let master = null;
let musicBus = null;
let effectsBus = null;
let woodwindWave = null;
let delaySend = null;
let timer = null;
let nextBarTime = 0;
let barCursor = 0;
let lastScheduledBar = 0;
let phraseMode = 'lobby';
let unlocked = false;
let notifying = false;
let resumePromise = null;
let disposed = false;

// The composition is a fixed, authored score; scene changes only alter the
// supporting arrangement at four-bar phrase boundaries. Its tempo never jumps.
const beatSeconds = () => 60 / soundtrack.score.bpm;
const barSeconds = () => beatSeconds() * soundtrack.score.beatsPerBar;
const musicViews = new Set(['detail', 'lobby', 'game', 'tutorial', 'practice']);
const midi = pitch => 440 * Math.pow(2, (pitch - 69) / 12);
const phone = () => scene.role === 'player';
const canPlayMusic = () => !phone() && musicViews.has(scene.view);
const effectsEnabled = () => phone() ? preferences.phoneEffects : preferences.effects;
const musicEnabled = () => preferences.music && preferences.volume > 0 && canPlayMusic() && !page?.hidden;
const running = () => context?.state === 'running' && unlocked && !disposed;

function remember() {
  try { browser?.localStorage?.setItem(STORAGE_KEY, JSON.stringify(preferences)); } catch {}
}

function notify() {
  if (notifying) return;
  notifying = true;
  queueMicrotask(() => {
    notifying = false;
    const settings = audio.getSettings();
    listeners.forEach(listener => { try { listener(settings); } catch {} });
  });
}

function ramp(parameter, value, duration = 0.045) {
  if (!parameter || !context) return;
  const time = context.currentTime;
  parameter.cancelScheduledValues(time);
  parameter.setTargetAtTime(value, time, duration / 3);
}

function buildGraph() {
  if (context || !AudioConstructor || disposed) return !!context;
  try {
    context = new AudioConstructor({ latencyHint: 'interactive' });
    master = context.createGain();
    master.gain.value = preferences.volume;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 14;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.012;
    compressor.release.value = 0.2;
    master.connect(compressor);
    compressor.connect(context.destination);
    musicBus = context.createGain();
    musicBus.gain.value = 0;
    effectsBus = context.createGain();
    effectsBus.gain.value = effectsEnabled() ? 0.75 : 0;
    musicBus.connect(master);
    effectsBus.connect(master);

    // A short, very quiet room reflection adds space without a second melody.
    const delay = context.createDelay(0.6);
    delay.delayTime.value = 0.075;
    const feedback = context.createGain();
    feedback.gain.value = 0.1;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2400;
    delaySend = context.createGain();
    delaySend.gain.value = 0.07;
    delaySend.connect(delay);
    delay.connect(filter);
    filter.connect(musicBus);
    filter.connect(feedback);
    feedback.connect(delay);

    // One rounded wooden-flute voice, not a stack of equally loud plinks.
    // A mostly fundamental tone with gentle odd harmonics gives it a soft reed.
    if (context.createPeriodicWave) {
      woodwindWave = context.createPeriodicWave(
        new Float32Array(8),
        new Float32Array([0, 1, .14, .19, .045, .035, .01, .015]),
      );
    }
    context.onstatechange = () => {
      if (disposed) return;
      if (context.state === 'running') {
        unlocked = true;
        sync();
      } else {
        stopClock();
      }
      notify();
    };
    return true;
  } catch {
    context = null;
    notify();
    return false;
  }
}

function attach(source, envelope, extraNodes, kind, at, duration) {
  const voice = { source, envelope, nodes: extraNodes, kind };
  voices.add(voice);
  source.onended = () => {
    voices.delete(voice);
    try { source.disconnect(); envelope.disconnect(); extraNodes.forEach(node => node.disconnect()); } catch {}
  };
  source.start(at);
  source.stop(at + duration);
}

function tone(pitch, at, duration, level, instrument = 'bell', kind = 'music') {
  // Authored zero-level events are rests. Web Audio exponential ramps cannot
  // target zero, and a rest does not need an oscillator or a scheduler voice.
  if (!context || !Number.isFinite(pitch) || !Number.isFinite(level) || level <= 0) return;
  const source = context.createOscillator();
  const envelope = context.createGain();
  const filter = context.createBiquadFilter();
  const isLead = instrument === 'woodwind';
  const isBass = instrument === 'bass';
  const frequency = midi(pitch);
  source.frequency.setValueAtTime(frequency, at);
  source.type = isLead || isBass || instrument === 'pizzicato' ? 'triangle' : 'sine';
  if (isLead && woodwindWave) source.setPeriodicWave(woodwindWave);
  filter.type = 'lowpass';
  filter.frequency.value = isBass ? 1200 : isLead ? 3100 : instrument === 'pizzicato' ? 1900 : 4200;
  const attack = isLead ? Math.min(.045, duration * .18) : .014;
  envelope.gain.setValueAtTime(0.0001, at);
  envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), at + attack);
  if (isLead) {
    // Authored note lengths are audible: a gentle attack, a stable breath, then
    // a short release. Long notes actually sing instead of immediately decaying.
    const bodyAt = Math.min(duration * .4, .15);
    const releaseAt = Math.max(bodyAt + .01, duration - .085);
    envelope.gain.exponentialRampToValueAtTime(level * .88, at + bodyAt);
    envelope.gain.setValueAtTime(level * .88, at + releaseAt);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration + .015);
  } else {
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  }
  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(kind === 'music' ? musicBus : effectsBus);
  if (kind === 'music' && isLead) envelope.connect(delaySend);
  attach(source, envelope, [filter], kind, at, duration + .035);

  // The sparkle is reserved for short gameplay effects, never the soundtrack.
  if (instrument === 'bell') {
    const harmonic = context.createOscillator();
    const gain = context.createGain();
    harmonic.type = 'sine';
    harmonic.frequency.setValueAtTime(frequency * 2, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level * .18, at + .01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + Math.min(duration, .18));
    harmonic.connect(gain);
    gain.connect(kind === 'music' ? musicBus : effectsBus);
    attach(harmonic, gain, [], kind, at, Math.min(duration, .2) + .02);
  }
}

function stopVoices(kind) {
  if (!context) return;
  voices.forEach(voice => {
    if (kind && voice.kind !== kind) return;
    try {
      voice.envelope.gain.cancelScheduledValues(context.currentTime);
      voice.envelope.gain.setTargetAtTime(0.0001, context.currentTime, 0.008);
      voice.source.stop(context.currentTime + 0.04);
    } catch {}
  });
}

function stopClock() {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
    // Resuming begins a whole phrase, never the second half of a melody note.
    barCursor = Math.floor(lastScheduledBar / 4) * 4;
  }
  nextBarTime = 0;
  ramp(musicBus?.gain, 0);
  stopVoices('music');
}

function arrangement() {
  if (soundtrack.id !== 'sofa-kingdoms') return scene.scoreScene;
  if (scene.phase === 'finished') return 'celebrate';
  if (scene.forecastType === 'pounce' || scene.round >= scene.maxRounds - 1) return 'mischief';
  if (scene.view === 'lobby' || scene.view === 'detail') return 'lobby';
  return 'play';
}

function scheduleBar(index, at) {
  // Scene changes wait for the next question or answer. Melody and tempo stay
  // intact while only the accompaniment's voicing, articulation, and level vary.
  if (index % 4 === 0) phraseMode = arrangement();
  for (const note of soundtrack.eventsForBar(index, phraseMode)) {
    tone(note.pitch, at + note.beat * beatSeconds(),
      note.duration * beatSeconds(), note.level, note.instrument);
  }
  lastScheduledBar = index;
}

function tick() {
  if (!running() || !musicEnabled()) { stopClock(); return; }
  if (nextBarTime < context.currentTime - .15) {
    // After a long main-thread stall, restart a complete phrase without firing a
    // backlog of missed notes at once. Ordinary rendering never touches tempo.
    nextBarTime = context.currentTime + .045;
    barCursor = Math.floor(barCursor / 4) * 4;
  }
  if (nextBarTime < context.currentTime + .18) {
    scheduleBar(barCursor, nextBarTime);
    nextBarTime += barSeconds();
    barCursor = (barCursor + 1) % soundtrack.score.bars.length;
  }
}

function sync() {
  if (!context || disposed) return;
  ramp(master?.gain, page?.hidden ? 0 : preferences.volume);
  ramp(effectsBus?.gain, effectsEnabled() && !page?.hidden ? 0.75 : 0);
  if (running() && musicEnabled()) {
    ramp(musicBus?.gain, 0.7, 0.16);
    if (timer === null) {
      nextBarTime = context.currentTime + 0.045;
      tick();
      timer = setInterval(tick, 45);
    }
  } else stopClock();
}

function resume() {
  if (!context || disposed || page?.hidden) return Promise.resolve(false);
  if (context.state === 'running') {
    unlocked = true;
    sync();
    return Promise.resolve(true);
  }
  if (resumePromise) return resumePromise;
  try {
    resumePromise = context.resume().then(() => {
      unlocked = context.state === 'running';
      sync();
      notify();
      return unlocked;
    }).catch(() => false).finally(() => { resumePromise = null; });
    return resumePromise;
  } catch { return Promise.resolve(false); }
}

function effect(type = 'move') {
  if (!running() || !effectsEnabled() || preferences.volume <= 0 || page?.hidden) return;
  const at = context.currentTime + 0.01;
  if (soundtrack.eventsForEffect) {
    for (const note of soundtrack.eventsForEffect(type)) {
      tone(note.pitch, at + note.beat * beatSeconds(), note.duration * beatSeconds(), note.level, note.instrument, 'effect');
    }
    return;
  }
  const sounds = {
    move: [[72, 0, 0.11, 0.055]],
    collect: [[79, 0, 0.16, 0.1], [84, 0.075, 0.23, 0.08]],
    bank: [[72, 0, 0.22, 0.11], [76, 0.085, 0.25, 0.10], [79, 0.17, 0.38, 0.12], [84, 0.255, 0.5, 0.07]],
    join: [[67, 0, 0.2, 0.09], [72, 0.10, 0.35, 0.11]],
    lure: [[79, 0, 0.14, 0.07], [76, 0.07, 0.14, 0.07], [81, 0.14, 0.28, 0.09]],
    cat: [[48, 0, 0.25, 0.12], [43, 0.13, 0.37, 0.10]],
    win: [[72, 0, 0.3, 0.11], [76, 0.15, 0.3, 0.10], [79, 0.3, 0.4, 0.11], [84, 0.50, 0.8, 0.12]],
    error: [[60, 0, 0.13, 0.05], [59, 0.11, 0.14, 0.045]],
  };
  (sounds[type] || sounds.move).forEach(([pitch, offset, duration, level]) => tone(pitch, at + offset, duration, level, type === 'cat' ? 'bass' : 'bell', 'effect'));
}

function onVisibility() {
  if (!context || disposed) return;
  if (page?.hidden) {
    stopClock();
    stopVoices();
    ramp(master.gain, 0, 0.025);
    // A suspended context consumes no sound-processing work in a hidden tab.
    try { context.suspend().catch(() => {}); } catch {}
  } else if (unlocked) {
    resume();
  }
}

export const audio = Object.freeze({
  /** Call directly inside a pointer/keyboard gesture, before awaiting network work. */
  unlock() {
    if (!buildGraph()) return Promise.resolve(false);
    return resume();
  },
  setContext(next = {}) {
    const wasPhone = phone();
    Object.keys(scene).forEach(key => { if (Object.hasOwn(next, key)) scene[key] = next[key]; });
    if (wasPhone !== phone()) stopVoices('effect');
    sync();
  },
  /** Switch the score on the existing graph/clock; never open another audio context. */
  setScore(id, module = null) {
    let next = defaultSoundtrack;
    if (id !== 'sofa-kingdoms') {
      const score = module?.SCORE;
      if (typeof id !== 'string' || !score || !Number.isFinite(score.bpm) || score.bpm <= 0 ||
          !Number.isFinite(score.beatsPerBar) || score.beatsPerBar <= 0 || !Array.isArray(score.bars) ||
          !score.bars.length || typeof module.eventsForBar !== 'function') {
        throw new TypeError('A complete authored score is required.');
      }
      next = { id, score, eventsForBar: module.eventsForBar, eventsForEffect: typeof module.eventsForEffect === 'function' ? module.eventsForEffect : null };
    }
    if (soundtrack.id === next.id && soundtrack.score === next.score) return;
    stopClock();
    stopVoices('effect');
    soundtrack = next;
    barCursor = 0;
    lastScheduledBar = 0;
    scene.scoreScene = 'lobby';
    phraseMode = arrangement();
    sync();
    notify();
  },
  setScene(value) {
    if (!['lobby', 'council', 'term1', 'term2', 'term3', 'celebrate'].includes(value)) return;
    scene.scoreScene = value;
  },
  setMusic(enabled) {
    preferences.music = !!enabled;
    remember();
    sync();
    notify();
  },
  setEffects(enabled) {
    preferences[phone() ? 'phoneEffects' : 'effects'] = !!enabled;
    if (!enabled) stopVoices('effect');
    remember();
    sync();
    notify();
  },
  setVolume(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    preferences.volume = clamp(numeric, 0, 1);
    remember();
    sync();
    notify();
  },
  effect,
  getSettings() {
    return {
      trackTitle: soundtrack.score.title,
      music: preferences.music,
      effects: effectsEnabled(),
      volume: preferences.volume,
      unlocked: unlocked && context?.state === 'running',
      supported: !!AudioConstructor,
      canPlayMusic: canPlayMusic(),
    };
  },
  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  dispose() {
    disposed = true;
    stopClock();
    stopVoices();
    listeners.clear();
    page?.removeEventListener('visibilitychange', onVisibility);
    browser?.removeEventListener('pagehide', onPageHide);
    browser?.removeEventListener('pageshow', onPageShow);
    try { context?.close().catch(() => {}); } catch {}
  },
});

function onPageHide() {
  stopClock();
  stopVoices();
  try { context?.suspend().catch(() => {}); } catch {}
}
function onPageShow() { if (unlocked && !page?.hidden) resume(); }
page?.addEventListener('visibilitychange', onVisibility);
browser?.addEventListener('pagehide', onPageHide);
browser?.addEventListener('pageshow', onPageShow);
