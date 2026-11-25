import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { SCORE, eventsForBar, eventsForEffect } from './score.mjs';
import { EFFECT_NAMES, CUE_POLICY, eventsForEffect as directEffects } from './events.mjs';
import { SCORE as menuScore } from '../sofa-menu/score.mjs';
import { SCORE as kingdomsScore } from '../../score.mjs';
import { SCORE as oddLawsScore } from '../odd-laws-society/score.mjs';

const instruments = new Set(['woodwind', 'bass', 'pizzicato', 'bell']);
const scenes = ['menu', 'practice', 'stage1', 'stage2', 'stage3', 'paused', 'celebrate'];
const phrase = (score, start = 0) => score.bars.slice(start, start + 8).map(bar => bar.melody.map(({ pitch, beat, duration }) => ({ pitch, beat, duration })));
const notes = start => SCORE.bars.slice(start, start + 8).flatMap(bar => bar.melody).filter(note => note.pitch !== null);
const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;
function validateEvents(events, maximumBeat, maximumLevel) {
  let lastBeat = -1;
  for (const event of events) {
    assert.deepEqual(Object.keys(event).sort(), ['beat', 'duration', 'instrument', 'level', 'pitch']);
    assert.ok(instruments.has(event.instrument));
    assert.ok(Number.isInteger(event.pitch) && event.pitch >= 36 && event.pitch <= 84);
    assert.ok(Number.isFinite(event.beat) && event.beat >= 0 && event.beat >= lastBeat);
    assert.ok(Number.isFinite(event.duration) && event.duration >= .1 && event.beat + event.duration <= maximumBeat);
    assert.ok(Number.isFinite(event.level) && event.level > 0 && event.level <= maximumLevel);
    lastBeat = event.beat;
  }
}

test('the original D-major AABA theme returns with a complete hook and answering phrase', () => {
  assert.equal(SCORE.title, 'Over the Little Bridge');
  assert.equal(SCORE.gameId, 'gravity-orchard');
  assert.equal(SCORE.key, 'D major');
  assert.equal(SCORE.contrastingKey, 'B minor');
  assert.equal(SCORE.meter, '4/4');
  assert.equal(SCORE.bpm, 104);
  assert.equal(SCORE.beatsPerBar, 4);
  assert.equal(SCORE.form, 'AABA');
  assert.equal(SCORE.phraseBars, 4);
  assert.equal(SCORE.bars.length, 32);
  assert.deepEqual(SCORE.scenes, scenes);
  assert.equal([0, 8, 16, 24].map(index => SCORE.bars[index].section).join(''), 'AABA');
  assert.deepEqual(phrase(SCORE), phrase(SCORE, 8));
  assert.deepEqual(phrase(SCORE), phrase(SCORE, 24));
  assert.deepEqual(SCORE.bars[0].melody, SCORE.bars[4].melody);
  assert.deepEqual(SCORE.bars[0].melody.filter(note => note.pitch !== null).map(note => note.pitch), [66, 69, 71, 69, 66, 64]);
  assert.notDeepEqual(SCORE.bars[1].melody, SCORE.bars[5].melody, 'the answer expands the invitation');
  for (const existing of [menuScore, kingdomsScore, oddLawsScore]) assert.notDeepEqual(phrase(SCORE), phrase(existing), `not the existing ${existing.title} theme`);
});

test('every melody bar has finite written pitches, accounts for four beats and breathes', () => {
  for (const bar of SCORE.bars) {
    let end = 0;
    for (const note of bar.melody) {
      assert.equal(note.beat, end, 'notes/rests tile the bar without hidden gaps or overlap');
      assert.ok(note.duration > 0 && note.duration <= 4);
      assert.ok(note.pitch === null || (Number.isInteger(note.pitch) && note.pitch >= 57 && note.pitch <= 78));
      assert.ok(note.accent >= .75 && note.accent <= 1.02);
      end += note.duration;
    }
    assert.equal(end, 4);
    assert.equal(bar.melody.at(-1).pitch, null);
    assert.ok(bar.melody.at(-1).duration >= .5);
  }
});

test('B contrasts in register, rhythm and harmony before an authored dominant return', () => {
  const a = notes(0), b = notes(16);
  assert.notDeepEqual(phrase(SCORE), phrase(SCORE, 16));
  assert.equal(SCORE.bars[16].harmony.name, 'Bm');
  assert.equal(SCORE.bars[17].harmony.name, 'F#7/A#');
  assert.ok(b.some(note => note.pitch === 70), 'A# establishes the minor-key dominant');
  assert.ok(a.every(note => note.pitch % 12 !== 10));
  assert.ok(average(b.map(note => note.pitch)) > average(a.map(note => note.pitch)) + 3);
  assert.ok(average(b.map(note => note.duration)) > average(a.map(note => note.duration)) * 1.1);
  assert.deepEqual(SCORE.bars.slice(22, 25).map(bar => bar.harmony.name), ['Em7', 'A7', 'D']);
  assert.equal(SCORE.bars[23].cadence, 'dominant-turnaround');
});

test('cadences and loop endings leave a full beat clear in every scene', () => {
  for (const index of [7, 15, 31]) {
    assert.equal(SCORE.bars[index - 1].harmony.name, 'A7');
    assert.equal(SCORE.bars[index].harmony.name, 'D');
    assert.equal(SCORE.bars[index].melody[0].pitch, 62);
    assert.equal(SCORE.bars[index].melody.at(-1).duration, 1.5);
    for (const scene of scenes) assert.ok(eventsForBar(index, scene).every(event => event.beat + event.duration <= 3));
  }
  for (const scene of scenes) assert.ok(eventsForBar(23, scene).every(event => event.beat + event.duration <= 3));
});

test('all seven arrangements preserve the melody, stay in scheduler bounds and keep accompaniment subordinate', () => {
  const signatures = new Set();
  for (const scene of scenes) {
    const full = [];
    for (let index = 0; index < SCORE.bars.length; index++) {
      const events = eventsForBar(index, scene);
      validateEvents(events, 4, .12);
      full.push(events);
      assert.deepEqual(events.filter(event => event.instrument === 'woodwind').map(({ pitch, beat, duration }) => ({ pitch, beat, duration })), SCORE.bars[index].melody.filter(note => note.pitch !== null).map(({ pitch, beat, duration }) => ({ pitch, beat, duration })));
      const points = [...new Set(events.flatMap(event => [event.beat, event.beat + event.duration]))];
      for (const beat of points) {
        const active = events.filter(event => event.beat <= beat && event.beat + event.duration > beat);
        assert.ok(active.length <= 7, `${scene} bar ${index}: excess musical polyphony`);
        assert.ok(active.reduce((sum, event) => sum + event.level, 0) < .26, 'conservative summed envelope headroom');
      }
      assert.ok(events.filter(event => event.instrument === 'pizzicato').every(event => event.level <= .016 && event.pitch <= 66));
      assert.equal(events.find(event => event.instrument === 'bass').pitch, SCORE.bars[index].harmony.root);
    }
    signatures.add(JSON.stringify(full));
  }
  assert.equal(signatures.size, scenes.length, 'each scene has a deliberate arrangement');
  const energy = scene => SCORE.bars.flatMap((_, index) => eventsForBar(index, scene)).reduce((sum, event) => sum + event.level ** 2 * event.duration, 0);
  assert.ok(energy('paused') < energy('stage1') * .13, 'pause stays appreciably sparse and quiet');
  assert.ok(energy('practice') < energy('stage1') * .65, 'practice leaves extra conversational space');
});

test('unknown scenes and unusual bar indices are safe and deterministic', () => {
  for (const scene of [undefined, null, {}, 2, 'unknown', '__proto__', 'toString', Symbol('scene')]) assert.deepEqual(eventsForBar(4, scene), eventsForBar(4, 'menu'));
  assert.deepEqual(eventsForBar(32), eventsForBar(0));
  assert.deepEqual(eventsForBar(-1), eventsForBar(31));
  assert.deepEqual(eventsForBar(4.8), eventsForBar(4));
  assert.deepEqual(eventsForBar(-.1), eventsForBar(31));
  for (const index of [NaN, Infinity, -Infinity, undefined, null, {}, '3', 2n, Symbol('index')]) assert.deepEqual(eventsForBar(index), eventsForBar(0));
});

test('frozen composition and fresh event results cannot be corrupted by a caller', () => {
  function frozen(value) { if (value && typeof value === 'object') { assert.ok(Object.isFrozen(value)); Object.values(value).forEach(frozen); } }
  frozen(SCORE); frozen(CUE_POLICY); frozen(EFFECT_NAMES);
  for (const scene of scenes) {
    const expected = eventsForBar(0, scene), result = eventsForBar(0, scene);
    result[0].pitch = 127; result[0].level = 1; result.pop();
    assert.deepEqual(eventsForBar(0, scene), expected);
  }
});

test('ten bounded cues cover catches, hazards and results; unknown names remain silent', () => {
  assert.equal(eventsForEffect, directEffects);
  assert.deepEqual(EFFECT_NAMES, ['catch', 'reject', 'compost', 'order', 'forecast', 'gate-warning', 'gust', 'countdown', 'stage-result', 'finish']);
  for (const name of EFFECT_NAMES) {
    const events = eventsForEffect(name);
    assert.ok(events.length > 0 && events.length <= 9);
    validateEvents(events, 3, .065);
    assert.ok(CUE_POLICY[name].cooldownMs >= 120 && CUE_POLICY[name].cooldownMs <= 2500);
    const expected = eventsForEffect(name);
    events[0].level = 1; events.pop();
    assert.deepEqual(eventsForEffect(name), expected);
  }
  for (const name of ['catch', 'reject', 'compost']) {
    const events = eventsForEffect(name);
    assert.ok(events.length <= 2, 'frequent cues are not long jingles');
    assert.ok(Math.max(...events.map(event => event.beat + event.duration)) * 60 / SCORE.bpm < .3);
  }
  for (const name of [undefined, null, {}, 4, 'unknown', '__proto__', 'constructor', 'toString', Symbol('cue')]) assert.deepEqual(eventsForEffect(name), []);
});

test('public gameplay aliases map to the intended cue, while physics chatter is silent', () => {
  for (const [alias, name] of Object.entries({ full: 'reject', 'basket-full': 'reject', 'basket-reject': 'reject', 'order-complete': 'order', 'gate-forecast': 'gate-warning', 'gust-forecast': 'forecast', 'lala-forecast': 'forecast', 'gust-start': 'gust', 'lala-gust': 'gust', 'stage-complete': 'stage-result', celebrate: 'finish', celebration: 'finish', 'final-celebration': 'finish' })) assert.deepEqual(eventsForEffect(alias), eventsForEffect(name));
  for (const name of ['spawn', 'transfer', 'impact', 'collision', 'phase-change']) assert.deepEqual(eventsForEffect(name), []);
  assert.ok(CUE_POLICY.order.priority > CUE_POLICY.catch.priority);
  assert.ok(CUE_POLICY.forecast.priority > CUE_POLICY.catch.priority);
});

test('runtime score and events have no DOM, I/O, clock, randomness or audio lifecycle', () => {
  const url = new URL('./score.mjs', import.meta.url).href;
  const script = `
    const forbidden=()=>{throw new Error('forbidden runtime dependency');};
    Math.random=forbidden;Date.now=forbidden;globalThis.setTimeout=forbidden;globalThis.setInterval=forbidden;
    for(const key of ['window','document','localStorage','AudioContext','OfflineAudioContext','fetch'])Object.defineProperty(globalThis,key,{get:forbidden});
    const {SCORE,eventsForBar,eventsForEffect}=await import(${JSON.stringify(url)});
    for(const scene of SCORE.scenes)for(let bar=0;bar<32;bar++)eventsForBar(bar,scene);
    eventsForEffect('catch');eventsForEffect('finish');
  `;
  assert.doesNotThrow(() => execFileSync(process.execPath, ['--input-type=module', '-e', script], { timeout: 10000 }));
});

test('retained browser captures match the exact score, scheduler, renderer and MP3 files', async () => {
  const report = JSON.parse(await readFile(new URL('./sources/audio/render-report.json', import.meta.url), 'utf8'));
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const repo = new URL('../../../', import.meta.url);
  // The engine imports the shelf, but the capture harness selects Orchard
  // before unlock and requests only Orchard cues. Menu bytes are provenance.
  const inactiveMenuImports = ['ui/media/sofa-menu/score.mjs', 'ui/media/sofa-menu/effects.mjs'];
  for (const [path, digest] of Object.entries(report.sourceSha256)) {
    if (inactiveMenuImports.includes(path)) continue;
    assert.equal(hash(await readFile(new URL(path, repo))), digest, `${path} changed: regenerate audio evidence`);
  }
  assert.equal(report.scoreSeconds, 32 * 4 * 60 / 104);
  assert.deepEqual(Object.keys(report.scenes), scenes);
  assert.deepEqual(Object.keys(report.cues), EFFECT_NAMES);
  assert.match(report.auditoryEvaluation, /No human audition/);
  for (const [scene, capture] of Object.entries(report.scenes)) {
    assert.equal(capture.scheduledBars.length, 64);
    assert.equal(capture.contextsBeforeUnlock, 0); assert.equal(capture.contextsCreated, 1); assert.equal(capture.intervalStarts, 1);
    assert.equal(capture.settings.trackTitle, SCORE.title);
    for (const [ordinal, bar] of capture.scheduledBars.entries()) {
      const index = ordinal % SCORE.bars.length;
      assert.deepEqual(bar, { index, scene, eventCount: eventsForBar(index, scene).length });
    }
    assert.ok(capture.maxConcurrentOscillators <= 24);
    for (const signal of [capture.preCompressor, capture.output]) {
      assert.equal(signal.nonFiniteSamples, 0); assert.equal(signal.clippedSamples, 0);
      assert.ok(signal.peak > 0 && signal.peak < .6);
    }
    assert.equal(capture.loopSeams.length, 1);
    assert.ok(capture.loopSeams[0].preCompressorSampleJump < .0003);
    assert.ok(capture.loopSeams[0].quietTail.peak < .0005);
  }
  assert.equal(report.phoneDefaults.oscillatorCount, 0);
  assert.equal(report.phoneDefaults.output.peak, 0);
  assert.equal(report.phoneDefaults.settings.effects, false);
  assert.equal(report.phoneDefaults.settings.canPlayMusic, false);
  assert.equal(report.sceneTransitions.intervalStarts, 1);
  assert.deepEqual(report.sceneTransitions.scheduledBars.map(bar => bar.index), Array.from({ length: 32 }, (_, index) => index));
  assert.deepEqual(Object.keys(report.previews), ['over-the-little-bridge-stage1', 'over-the-little-bridge-stage3', 'orchard-scene-transitions', 'orchard-cues']);
  for (const entry of Object.values(report.previews)) {
    const bytes = await readFile(new URL(`./sources/audio/previews/${entry.file}`, import.meta.url));
    assert.equal(bytes.length, entry.bytes);
    assert.equal(hash(bytes), entry.sha256);
    assert.equal(entry.decodedMeasurements.nonFiniteSamples, 0);
    assert.equal(entry.decodedMeasurements.clippedSamples, 0);
    assert.ok(entry.decodedMeasurements.peak > 0 && entry.decodedMeasurements.peak < .6);
  }
});
