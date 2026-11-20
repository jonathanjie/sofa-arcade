import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { SCORE, eventsForBar } from './score.mjs';
import { eventsForEffect } from './effects.mjs';

const modes = ['play', ...SCORE.scenes];
const effectNames = ['build', 'coin', 'influence', 'street', 'seal', 'reveal', 'stamp', 'festival', 'win', 'tie'];
const instruments = new Set(['woodwind', 'bass', 'pizzicato', 'bell']);
const melody = start => SCORE.bars.slice(start, start + 8).map(bar => bar.melody);
const leadShape = events => events.filter(event => event.instrument === 'woodwind').map(({ pitch, beat, duration }) => ({ pitch, beat, duration }));
function validateEvent(event, limit) {
  assert.deepEqual(Object.keys(event).sort(), ['beat', 'duration', 'instrument', 'level', 'pitch']);
  assert.ok(instruments.has(event.instrument));
  assert.ok(Number.isInteger(event.pitch) && event.pitch >= 36 && event.pitch <= 84);
  assert.ok(Number.isFinite(event.beat) && event.beat >= 0 && event.beat < limit);
  assert.ok(Number.isFinite(event.duration) && event.duration > 0 && event.beat + event.duration <= limit);
  assert.ok(Number.isFinite(event.level) && event.level > 0 && event.level <= .16);
}
function maxLevelSum(events) {
  const points = [...new Set(events.flatMap(event => [event.beat, event.beat + event.duration]))];
  return Math.max(0, ...points.map(beat => events.filter(event => event.beat <= beat && event.beat + event.duration > beat).reduce((sum, event) => sum + event.level, 0)));
}

test('complete AABA composition has exact recurring A sections and an original B', () => {
  assert.equal(SCORE.title, 'Lala Calls the House');
  assert.equal(SCORE.bpm, 100);
  assert.equal(SCORE.beatsPerBar, 4);
  assert.equal(SCORE.form, 'AABA');
  assert.equal(SCORE.bars.length, 32);
  assert.equal(SCORE.bars.length * SCORE.beatsPerBar * 60 / SCORE.bpm, 76.8);
  assert.equal([0, 8, 16, 24].map(index => SCORE.bars[index].section).join(''), 'AABA');
  assert.deepEqual(melody(0), melody(8));
  assert.deepEqual(melody(0), melody(24));
  assert.notDeepEqual(melody(0), melody(16));
  assert.deepEqual(SCORE.bars[0].melody, SCORE.bars[4].melody, 'calling-card returns inside each A');
});

test('authored melody accounts for every beat with explicit breaths and no overlap', () => {
  for (const [index, bar] of SCORE.bars.entries()) {
    let beat = 0;
    assert.ok(bar.melody.some(note => note.pitch === null), `bar ${index} has no breath`);
    for (const note of bar.melody) {
      assert.equal(note.beat, beat, `bar ${index} has a gap/overlap`);
      assert.ok(note.duration > 0 && note.duration <= SCORE.beatsPerBar);
      assert.ok(note.pitch === null || Number.isInteger(note.pitch) && note.pitch >= 62 && note.pitch <= 77);
      assert.ok(note.accent >= .75 && note.accent <= 1.05);
      beat += note.duration;
    }
    assert.equal(beat, 4);
    assert.ok(bar.harmony.tones.length === 3 && bar.harmony.sparse.length === 2);
  }
});

test('B is contrasted by mode, dominant leading tone, tessitura, and note lengths', () => {
  const notes = start => melody(start).flat().filter(note => note.pitch !== null);
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  const a = notes(0);
  const b = notes(16);
  assert.ok(SCORE.bars.slice(16, 24).filter(bar => /Dm|Gm/.test(bar.harmony.name)).length >= 4);
  assert.equal(SCORE.bars[17].harmony.name, 'A7/C#');
  assert.ok(b.some(note => note.pitch === 73), 'C# leading tone establishes D minor');
  assert.ok(a.every(note => note.pitch % 12 !== 1));
  assert.ok(mean(b.map(note => note.duration)) > mean(a.map(note => note.duration)) * 1.12);
  assert.ok(mean(b.map(note => note.pitch)) > mean(a.map(note => note.pitch)) + 3);
  assert.equal(SCORE.bars[16].melody[0].duration, 2);
  assert.equal(SCORE.bars[0].melody[0].pitch, null);
});

test('A cadences resolve C7 to F and all scenes retain breathing space at the loop', () => {
  for (const index of [7, 15, 31]) {
    assert.equal(SCORE.bars[index - 1].harmony.name, 'C7');
    assert.equal(SCORE.bars[index].harmony.name, 'F');
    assert.equal(SCORE.bars[index].melody[0].pitch, 65);
    assert.deepEqual(SCORE.bars[index].melody.at(-1), { pitch: null, beat: 2.5, duration: 1.5, accent: 1 });
    for (const mode of modes) assert.ok(eventsForBar(index, mode).every(event => event.beat + event.duration <= 3));
  }
  assert.equal(SCORE.bars[23].harmony.name, 'C7');
  assert.equal(SCORE.bars[24].harmony.name, 'F');
  assert.equal(SCORE.bars[23].cadence, 'turnaround');
});

test('every arrangement fits the bar and the event vocabulary with safe levels', () => {
  for (const mode of modes) {
    for (let index = 0; index < SCORE.bars.length; index++) {
      const events = eventsForBar(index, mode);
      events.forEach(event => validateEvent(event, SCORE.beatsPerBar));
      assert.deepEqual(events.map(event => event.beat), events.map(event => event.beat).sort((a, b) => a - b));
      assert.ok(maxLevelSum(events) < .4, `${mode} bar ${index} lacks headroom`);
      assert.deepEqual(leadShape(events), leadShape(eventsForBar(index)), 'arrangement changed melody or phrasing');
      const lead = events.filter(event => event.instrument === 'woodwind');
      for (let note = 1; note < lead.length; note++) assert.ok(lead[note - 1].beat + lead[note - 1].duration <= lead[note].beat);
    }
  }
});

test('council is quieter and sparser; terms keep identity; sparkle is restrained', () => {
  const energy = mode => SCORE.bars.flatMap((_, index) => eventsForBar(index, mode)).reduce((sum, event) => sum + event.level * event.duration, 0);
  assert.ok(energy('council') < energy('lobby'));
  assert.ok(energy('lobby') < energy('play'));
  assert.ok(energy('play') < energy('celebrate'));
  for (let index = 0; index < 32; index++) {
    assert.ok(eventsForBar(index, 'council').length < eventsForBar(index).length);
    assert.deepEqual(eventsForBar(index, 'term1'), eventsForBar(index));
  }
  assert.notDeepEqual(eventsForBar(0, 'term1'), eventsForBar(0, 'term2'));
  for (const mode of ['play', 'lobby', 'council', 'term1', 'term2']) {
    assert.ok(SCORE.bars.every((_, index) => eventsForBar(index, mode).every(event => event.instrument !== 'bell')));
  }
  for (const mode of ['term3', 'celebrate']) {
    assert.deepEqual(SCORE.bars.flatMap((_, index) => eventsForBar(index, mode).filter(event => event.instrument === 'bell').map(() => index)), [7, 15, 31]);
  }
});

test('index wrapping and malformed mode/index fallbacks are predictable', () => {
  for (const mode of [...modes, 'unknown', '__proto__', 'toString', null, {}, 7]) {
    assert.deepEqual(eventsForBar(32, mode), eventsForBar(0, mode));
    assert.deepEqual(eventsForBar(-1, mode), eventsForBar(31, mode));
    assert.deepEqual(eventsForBar(-32, mode), eventsForBar(0, mode));
    assert.deepEqual(eventsForBar(4.99, mode), eventsForBar(4, mode));
    assert.deepEqual(eventsForBar(-.1, mode), eventsForBar(31, mode));
  }
  for (const index of [NaN, Infinity, -Infinity, undefined, null, '2', {}, 1n, Symbol('bar')]) assert.deepEqual(eventsForBar(index), eventsForBar(0));
  for (const mode of ['unknown', '__proto__', 'toString', null, {}, 7, Symbol('mode')]) assert.deepEqual(eventsForBar(9, mode), eventsForBar(9));
});

test('score is deeply frozen and callers cannot corrupt later event results', () => {
  const frozen = value => {
    if (value && typeof value === 'object') {
      assert.ok(Object.isFrozen(value));
      Object.values(value).forEach(frozen);
    }
  };
  frozen(SCORE);
  const expected = eventsForBar(0);
  const changed = eventsForBar(0);
  changed[0].pitch = 127;
  changed.pop();
  assert.deepEqual(eventsForBar(0), expected);
  assert.notEqual(eventsForBar(0), eventsForBar(0));
  assert.notEqual(eventsForBar(0)[0], eventsForBar(0)[0]);
});

test('all ten cues use beat units, safe headroom and fresh repeatable data', () => {
  for (const name of effectNames) {
    const events = eventsForEffect(name);
    assert.ok(events.length > 0 && events.length <= 5);
    events.forEach(event => validateEvent(event, 3));
    assert.ok(maxLevelSum(events) <= .16);
    const changed = eventsForEffect(name);
    changed[0].pitch = 0;
    changed.push({});
    assert.deepEqual(eventsForEffect(name), events);
  }
  for (const name of ['missing', '__proto__', 'toString', undefined, null, 4, {}, Symbol('cue')]) assert.deepEqual(eventsForEffect(name), []);
  assert.notEqual(eventsForEffect('missing'), eventsForEffect('missing'));
});

test('runtime score and effects import without browser, I/O, clock or randomness', () => {
  const scoreUrl = new URL('./score.mjs', import.meta.url).href;
  const effectsUrl = new URL('./effects.mjs', import.meta.url).href;
  const script = `
    const forbidden = () => { throw new Error('forbidden runtime dependency'); };
    Math.random = forbidden;
    Date.now = forbidden;
    globalThis.setTimeout = forbidden;
    globalThis.setInterval = forbidden;
    for (const key of ['window', 'document', 'localStorage', 'AudioContext', 'fetch']) {
      Object.defineProperty(globalThis, key, { get: forbidden });
    }
    const { SCORE, eventsForBar } = await import(${JSON.stringify(scoreUrl)});
    const { eventsForEffect } = await import(${JSON.stringify(effectsUrl)});
    for (const mode of SCORE.scenes) for (let bar = 0; bar < 32; bar++) eventsForBar(bar, mode);
    eventsForEffect('stamp');
  `;
  assert.doesNotThrow(() => execFileSync(process.execPath, ['--input-type=module', '-e', script], { timeout: 10000 }));
});


test('retained audio evidence matches the exact authored sources and encoded previews', async () => {
  const report = JSON.parse(await readFile(new URL('./audio-evidence/render-report.json', import.meta.url), 'utf8'));
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  for (const [key, path] of [['score', './score.mjs'], ['effects', './effects.mjs'], ['renderer', './audio-preview.mjs']]) {
    assert.equal(digest(await readFile(new URL(path, import.meta.url))), report.sourceSha256[key], `${key} changed: regenerate audio evidence`);
  }
  assert.deepEqual(Object.keys(report.modes).sort(), [...modes].sort());
  assert.deepEqual(Object.keys(report.effects).sort(), [...effectNames].sort());
  for (const entry of [...Object.values(report.modes), ...Object.values(report.effects)]) {
    for (const setting of ['sourceMix', 'volume100', 'defaultVolume45']) {
      assert.equal(entry[setting].clippedSamples, 0);
      assert.equal(entry[setting].nonFiniteSamples, 0);
      assert.ok(entry[setting].peak < .6 && entry[setting].rms > 0);
    }
  }
  assert.equal(report.scoreSeconds, 76.8);
  assert.equal(report.previewVolume, 1);
  assert.match(report.auditoryEvaluation, /Not performed/);
  assert.deepEqual(Object.keys(report.encodedPreviews).sort(), ['civic-effects.mp3', 'lala-calls-the-house-council.mp3', 'lala-calls-the-house-play.mp3']);
  for (const [name, entry] of Object.entries(report.encodedPreviews)) {
    const bytes = await readFile(new URL(`./audio-evidence/${name}`, import.meta.url));
    assert.equal(bytes.length, entry.bytes);
    assert.equal(digest(bytes), entry.sha256);
    assert.equal(entry.decodedMeasurements.clippedSamples, 0);
    assert.equal(entry.decodedMeasurements.nonFiniteSamples, 0);
    assert.ok(entry.decodedMeasurements.peak < .6);
    assert.ok(entry.decodedSeconds > 10);
  }
});
