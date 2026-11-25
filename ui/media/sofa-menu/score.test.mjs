import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { SCORE, eventsForBar, eventsForEffect } from './score.mjs';
import { eventsForEffect as directEffects } from './effects.mjs';
import { createOfflineRenderer } from './offline-render.mjs';

const cueNames = ['menu-select', 'menu-back', 'menu-confirm'];
const bars = SCORE.bars.map((_, index) => eventsForBar(index));
const loopSeconds = bars.length * SCORE.beatsPerBar * 60 / SCORE.bpm;

function part(barNumber, instrument) {
  return bars[barNumber - 1].filter(note => note.instrument === instrument);
}

function pitches(barNumber, instrument = 'woodwind') {
  return part(barNumber, instrument).map(note => note.pitch);
}

function validateEvents(events, beats) {
  let previousBeat = 0;
  for (const note of events) {
    assert.deepEqual(Object.keys(note).sort(), ['beat', 'duration', 'instrument', 'level', 'pitch']);
    assert.ok(['woodwind', 'bass', 'pizzicato', 'bell'].includes(note.instrument));
    assert.ok(Number.isInteger(note.pitch) && note.pitch >= 0 && note.pitch <= 127);
    assert.ok(Number.isFinite(note.beat) && note.beat >= previousBeat);
    assert.ok(Number.isFinite(note.duration) && note.duration > 0 && note.beat + note.duration <= beats);
    assert.ok(Number.isFinite(note.level) && note.level > 0 && note.level <= .14);
    previousBeat = note.beat;
  }
}

test('the menu two-step in G has 48 bars and makes a 60-second loop', () => {
  assert.equal(SCORE.title, 'Room for One More');
  assert.equal(SCORE.key, 'G major');
  assert.equal(SCORE.contrastingKey, 'C major');
  assert.equal(SCORE.meter, '2/4');
  assert.equal(SCORE.beatsPerBar, 2);
  assert.equal(SCORE.bpm, 96);
  assert.equal(bars.length, 48);
  assert.equal(loopSeconds, 60);
  assert.deepEqual(SCORE.bars.map(bar => bar.section), [
    ...Array(8).fill('A'), ...Array(8).fill('A′'), ...Array(16).fill('B'),
    ...Array(8).fill('A″'), ...Array(8).fill('Tag'),
  ]);
});

test('the two-bar invitation has its own rhythm, and the bridge reaches its summit once', () => {
  assert.deepEqual(pitches(1), [67, 71, 69]);
  assert.deepEqual(pitches(2), [67, 62, 64]);
  assert.deepEqual(part(1, 'woodwind').map(note => note.beat), [0, .75, 1]);
  // Scale-degree sequence: the skip and its answer start a diatonic third higher.
  assert.deepEqual(pitches(9), [71, 74, 72]);
  assert.deepEqual(pitches(10), [71, 67, 69]);
  const rhythm = number => part(number, 'woodwind').map(note => note.beat);
  for (const opening of [1, 2]) {
    assert.deepEqual(rhythm(opening + 8), rhythm(opening));
    assert.deepEqual(pitches(opening + 36), pitches(opening));
    assert.deepEqual(rhythm(opening + 36), rhythm(opening));
  }
  // The tag doubles the spaces between the three attacks of bar 1.
  assert.deepEqual([...pitches(41), pitches(42)[0]], pitches(1));
  assert.equal(part(41, 'woodwind')[1].beat, 2 * part(1, 'woodwind')[1].beat);
  const lead = bars.flatMap((_, index) => part(index + 1, 'woodwind').map(note => ({
    ...note,
    barNumber: index + 1,
  })));
  const steps = lead.filter((note, i) => {
    const interval = Math.abs(note.pitch - lead[(i + 1) % lead.length].pitch);
    return interval === 1 || interval === 2;
  });
  assert.ok(steps.length > lead.length / 2, 'steps predominate in the solo line');
  assert.equal(Math.min(...lead.map(note => note.pitch)), 62);
  const highest = Math.max(...lead.map(note => note.pitch));
  assert.equal(highest, 77);
  assert.deepEqual(lead.filter(note => note.pitch === highest).map(note => note.barNumber), [30]);
});

test('every event stays inside its bar and voice register, with headroom for the cues', () => {
  const registers = { woodwind: [62, 77], bass: [40, 53], pizzicato: [52, 64], bell: [55, 65] };
  for (const [index, events] of bars.entries()) {
    validateEvents(events, SCORE.beatsPerBar);
    for (const note of events) {
      const [low, high] = registers[note.instrument];
      assert.ok(note.pitch >= low && note.pitch <= high, `bar ${index + 1}: ${note.instrument} ${note.pitch}`);
    }
    for (const instrument of ['woodwind', 'bass']) {
      const notes = part(index + 1, instrument);
      assert.ok(notes.length > 0, `missing ${instrument} in bar ${index + 1}`);
      for (const [n, next] of notes.slice(1).entries()) {
        assert.ok(notes[n].beat + notes[n].duration <= next.beat, `overlap in ${instrument} bar ${index + 1}`);
      }
    }
    for (const onset of new Set(events.map(note => note.beat))) {
      const sounding = events.filter(note => note.beat <= onset && onset < note.beat + note.duration);
      assert.ok(sounding.reduce((sum, note) => sum + note.level, 0) < .3);
    }
  }
});

// A perfect twelfth is still a fifth for this purpose. Contrary and oblique
// motion are legal. Compare the last pair to the first as well as adjacent pairs.
function checkOuterMotion(from, to) {
  const fromClass = (from.lead - from.bass) % 12;
  const toClass = (to.lead - to.bass) % 12;
  const similarMotion = (to.lead - from.lead) * (to.bass - from.bass) > 0;
  const parallel = similarMotion && fromClass === toClass && (toClass === 0 || toClass === 7);
  assert.ok(!parallel, `parallel ${toClass === 0 ? 'octaves' : 'fifths'}: ` +
    `${from.where} (${from.lead}/${from.bass}) → ${to.where} (${to.lead}/${to.bass})`);
}

test('the sounding outer voices avoid parallel fifths and octaves at every attack through the wrap', () => {
  const pairs = [];
  for (const [index, events] of bars.entries()) {
    const outer = events.filter(note => note.instrument === 'woodwind' || note.instrument === 'bass');
    for (const beat of new Set(outer.map(note => note.beat))) {
      const active = outer.filter(note => note.beat <= beat && beat < note.beat + note.duration);
      const lead = active.find(note => note.instrument === 'woodwind');
      const bass = active.find(note => note.instrument === 'bass');
      if (lead && bass) pairs.push({ lead: lead.pitch, bass: bass.pitch, where: `bar ${index + 1} beat ${beat + 1}` });
    }
  }
  assert.ok(pairs.length >= bars.length, 'expected at least 48 sounding outer intervals');
  for (const [i, from] of pairs.entries()) checkOuterMotion(from, pairs[(i + 1) % pairs.length]);
});

test('bar lines keep independent outer motion, including across breaths', () => {
  let contraryOrOblique = 0;
  for (let from = 1; from <= bars.length; from++) {
    const to = from % bars.length + 1;
    const end = { lead: pitches(from).at(-1), bass: pitches(from, 'bass').at(-1), where: `end of bar ${from}` };
    const start = { lead: pitches(to)[0], bass: pitches(to, 'bass')[0], where: `start of bar ${to}` };
    checkOuterMotion(end, start);
    // Check the accented skeleton as well, so an ornament cannot mask octave
    // doubling or parallel fifths on successive downbeats.
    checkOuterMotion(
      { lead: pitches(from)[0], bass: pitches(from, 'bass')[0], where: `start of bar ${from}` },
      start,
    );
    if ((start.lead - end.lead) * (start.bass - end.bass) <= 0) contraryOrOblique++;
  }
  assert.ok(contraryOrOblique > bars.length / 2, 'most bass moves should complement the tune at the bar line');
});

test('the authentic cadences resolve the local leading tone and the root-position dominant', () => {
  // One-based bar numbers. 48 resolves across the loop. C has B natural as its
  // leading tone. G has F-sharp, including the return from the bridge.
  for (const [dominant, tonicClass] of [[7, 7], [15, 7], [23, 0], [31, 0], [39, 7], [45, 7], [48, 7]]) {
    const tonic = dominant % bars.length + 1;
    const label = `cadence in bars ${dominant}–${tonic}`;
    assert.equal(pitches(dominant, 'bass')[0] % 12, (tonicClass + 7) % 12, label);
    assert.equal(pitches(tonic, 'bass')[0] % 12, tonicClass, label);
    const arrival = pitches(tonic)[0];
    assert.equal(arrival % 12, tonicClass, label);
    assert.equal(pitches(dominant).at(-1), arrival - 1, label);
  }
});

test('the applied dominant, chordal sevenths and borrowed iv resolve in their written voices', () => {
  // A7/C♯ to D: its raised third in the bass and its soprano seventh converge.
  assert.deepEqual([pitches(11, 'bass').at(-1), pitches(12, 'bass')[0]], [49, 50]);
  assert.deepEqual([pitches(11).at(-1), pitches(12)[0]], [67, 66]);
  for (const [number, resolution] of [[3, 66], [18, 65], [47, 66]]) {
    assert.deepEqual([pitches(number).at(-1), pitches(number + 1)[0]], [67, resolution], `Am7 in bar ${number}`);
  }
  // The low bell, rather than the tune, carries the Dm7/F seventh to B3.
  assert.deepEqual([pitches(19, 'bell').at(-1), pitches(20, 'bell')[0]], [60, 59]);
  // Dm7 to G: the seventh in the woodwind descends C5 to B4.
  assert.deepEqual([pitches(26).at(-1), pitches(27)[0]], [72, 71]);
  // C major to C minor to G/D: E–E♭–D in the bass against a common G.
  assert.deepEqual([42, 43, 44].map(number => pitches(number, 'bass')[0]), [52, 51, 50]);
  assert.deepEqual([42, 43].map(number => pitches(number).at(-1)), [67, 67]);
  // The plucked upper member of each dyad carries the seventh to the third.
  const pluckedSevenths = [
    [7, 60, 59], [15, 60, 59], [23, 53, 52], [31, 53, 52],
    [34, 60, 59], [39, 60, 59], [45, 60, 59], [48, 60, 59],
  ];
  for (const [number, seventh, third] of pluckedSevenths) {
    const dominant = part(number, 'pizzicato');
    const arrival = number % bars.length + 1;
    const tonic = part(arrival, 'pizzicato');
    assert.ok(dominant.some(note => note.beat === dominant.at(-1).beat && note.pitch === seventh), `bar ${number}`);
    assert.ok(tonic.some(note => note.beat === tonic[0].beat && note.pitch === third), `bar ${arrival}`);
  }
});

test('the bridge adds an independent low bell line and releases it for the return', () => {
  for (let number = 1; number <= bars.length; number++) {
    assert.equal(part(number, 'bell').length > 0, number >= 17 && number <= 32, `bar ${number}`);
  }
  const bridgeBells = bars.slice(16, 32).flatMap(events => events.filter(note => note.instrument === 'bell'));
  assert.ok(new Set(bridgeBells.map(note => note.pitch)).size >= 5, 'a melodic part');
  const independentAttacks = bars.slice(16, 32).flatMap(events => events.filter(note =>
    note.instrument === 'bell' && !events.some(lead => lead.instrument === 'woodwind' && lead.beat === note.beat)));
  assert.ok(independentAttacks.length >= 8, 'the counterline has its own rhythm');
});

test('menu arrangements share safe fallback and wrap semantics and return fresh events', () => {
  for (const [index, events] of bars.entries()) {
    for (const mode of ['menu', 'lobby', 'play', 'unknown', '__proto__', 'toString', null, {}, Symbol('mode')]) {
      assert.deepEqual(eventsForBar(index, mode), events);
    }
  }
  assert.deepEqual(eventsForBar(bars.length), bars[0]);
  assert.deepEqual(eventsForBar(-1), bars.at(-1));
  assert.deepEqual(eventsForBar(-.1), bars.at(-1));
  assert.deepEqual(eventsForBar(4.9), bars[4]);
  for (const index of [NaN, Infinity, -Infinity, '2', null, undefined, {}, 1n, Symbol('index')]) {
    assert.deepEqual(eventsForBar(index), bars[0]);
  }
  function assertFrozen(value) {
    if (value && typeof value === 'object') {
      assert.ok(Object.isFrozen(value));
      Object.values(value).forEach(assertFrozen);
    }
  }
  assertFrozen(SCORE);
  const changed = eventsForBar(0);
  changed[0].pitch = 127;
  changed.pop();
  assert.deepEqual(eventsForBar(0), bars[0]);
});

test('the three navigation cues retain their G-major pitches and unrelated cues stay silent', () => {
  assert.equal(eventsForEffect, directEffects);
  for (const name of cueNames) {
    const cue = eventsForEffect(name);
    assert.ok(cue.length > 0 && cue.length <= 4);
    validateEvents(cue, 1.5);
    assert.ok(cue.every(note => [55, 67, 71, 74].includes(note.pitch)));
    const changed = eventsForEffect(name);
    changed[0].level = 1;
    changed.push({});
    assert.deepEqual(eventsForEffect(name), cue);
  }
  for (const name of [undefined, null, {}, 4, 'unknown', '__proto__', 'toString', Symbol('cue')]) {
    assert.deepEqual(eventsForEffect(name), []);
  }
});

test('runtime modules import and generate events without browser, I/O, randomness or clocks', () => {
  const url = new URL('./score.mjs', import.meta.url).href;
  const script = `
    const forbidden = () => { throw new Error('forbidden runtime dependency'); };
    Math.random = Date.now = globalThis.setTimeout = globalThis.setInterval = forbidden;
    for (const key of ['window', 'document', 'localStorage', 'AudioContext', 'fetch']) {
      Object.defineProperty(globalThis, key, { get: forbidden });
    }
    const { SCORE, eventsForBar, eventsForEffect } = await import(${JSON.stringify(url)});
    for (let bar = 0; bar < SCORE.bars.length; bar++) eventsForBar(bar, 'lobby');
    eventsForEffect('menu-confirm');
  `;
  assert.doesNotThrow(() => execFileSync(process.execPath, ['--input-type=module', '-e', script], { timeout: 10000 }));
});

test('offline renderer is deterministic, tempo-aware and writes a correctly sized WAV', () => {
  const renderer = createOfflineRenderer({ bpm: SCORE.bpm, sampleRate: 16000, tailSeconds: .2 });
  const note = { instrument: 'woodwind', pitch: 67, beat: 0, duration: .5, level: .1, atSeconds: .125 };
  const samples = renderer.render([note], 1);
  assert.deepEqual(samples, renderer.render([note], 1));
  assert.equal(samples.length, 19200);
  assert.equal(renderer.beatSeconds, 60 / SCORE.bpm);
  const { peak } = renderer.measurements(samples);
  assert.ok(peak > 0 && peak < .2);
  const wav = renderer.pcmWav(samples, .7);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(24), 16000);
  assert.equal(wav.readUInt32LE(40), samples.length * 2);
  assert.equal(wav.length, 44 + samples.length * 2);
  assert.throws(() => createOfflineRenderer({ bpm: 0 }), RangeError);
  assert.throws(() => renderer.render([{ ...note, atSeconds: -1 }], 1), RangeError);
});

test('retained previews match the score, signal checks, source digests and encoded files', async () => {
  const report = JSON.parse(await readFile(new URL('./audio-evidence/render-report.json', import.meta.url), 'utf8'));
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  for (const file of ['score.mjs', 'effects.mjs', 'offline-render.mjs', 'audio-preview.mjs']) {
    assert.equal(hash(await readFile(new URL(file, import.meta.url))), report.sourceSha256[file], `regenerate evidence for ${file}`);
  }
  assert.equal(report.title, SCORE.title);
  assert.equal(report.scoreSeconds, loopSeconds);
  assert.equal(report.bpm, SCORE.bpm);
  assert.equal(report.music.eventCount, bars.flat().length);
  assert.deepEqual(Object.keys(report.effects), cueNames);
  for (const entry of [report.music, ...Object.values(report.effects), report.effectsPreview]) {
    for (const gain of ['sourceMix', 'volume100', 'defaultVolume45']) {
      assert.equal(entry[gain].clippedSamples, 0);
      assert.equal(entry[gain].nonFiniteSamples, 0);
      assert.ok(entry[gain].peak > 0 && entry[gain].peak < .6);
    }
  }
  // The prior menu rendered at −26.83 dBFS RMS at this same bus gain.
  assert.ok(Math.abs(report.music.volume100.rmsDbFS - (-26.83)) < 2, 'keep comparable menu loudness');
  assert.match(report.auditoryEvaluation, /No human audition/);
  assert.deepEqual(Object.keys(report.previews), ['room-for-one-more', 'menu-effects']);
  const theme = report.previews['room-for-one-more'];
  assert.equal(theme.decodedSeconds, loopSeconds);
  assert.equal(report.music.loop.frames, loopSeconds * report.sampleRate);
  assert.ok(report.music.loop.maxOpeningError < 1 / 32768);
  assert.ok(report.music.loop.boundaryStep < .0032);
  assert.ok(theme.decodedBoundaryStep < .0032);
  for (const entry of Object.values(report.previews)) {
    const bytes = await readFile(new URL(`./audio-evidence/${entry.file}`, import.meta.url));
    assert.equal(bytes.length, entry.bytes);
    assert.equal(hash(bytes), entry.sha256);
    assert.equal(entry.decodedMeasurements.clippedSamples, 0);
    assert.equal(entry.decodedMeasurements.nonFiniteSamples, 0);
  }
});
