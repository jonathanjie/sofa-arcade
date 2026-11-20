/**
 * Make Yourself at Home — original welcoming theme for the Sofa Arcade menu.
 * G major, 3/4, quarter note = 92. A (8) / A (8) / B (8) / A (8).
 *
 * A's D–G–B–A–G pickup figure is the invitation; the descending bass and
 * soft waltz accompaniment let it settle. B visits E minor through B7/D#,
 * sings in longer notes above A's register, and returns via D7. Complete
 * phrases and cadences breathe. This data owns no clock or audio lifecycle.
 */
export { eventsForEffect } from './effects.mjs';

const chord = (name, root, tones) => Object.freeze({ name, root, tones: Object.freeze(tones) });
const CHORDS = Object.freeze({
  G: chord('G', 43, [59, 62]),
  DFs: chord('D/F#', 42, [57, 62]),
  CE: chord('C/E', 40, [55, 60]),
  D7: chord('D7', 38, [54, 60]),
  Em7: chord('Em7', 40, [55, 62]),
  Em: chord('Em', 40, [55, 59]),
  B7Ds: chord('B7/D#', 39, [57, 59]),
  EmG: chord('Em/G', 43, [52, 59]),
  Am: chord('Am', 45, [60, 64]),
  C: chord('C', 48, [55, 64]),
  AmC: chord('Am/C', 48, [57, 64]),
});

// Tuples: [MIDI pitch (null is a breath), beat, duration in beats, phrase accent].
// The written rests make every bar exactly three beats, without implied gaps.
const A = [
  ['G', [[62, 0, .5, .8], [67, .5, 1, .93], [71, 1.5, .5, 1], [69, 2, .5, .87], [67, 2.5, .25, .82], [null, 2.75, .25]]],
  ['DFs', [[66, 0, 1.25, .88], [69, 1.25, .25, .83], [74, 1.5, .75, .96], [null, 2.25, .75]]],
  ['CE', [[76, 0, 1, .97], [74, 1, .5, .88], [72, 1.5, .5, .9], [71, 2, .5, .83], [null, 2.5, .5]]],
  ['D7', [[69, 0, .75, .9], [66, .75, .75, .84], [62, 1.5, .75, .78], [null, 2.25, .75]]],
  ['G', [[62, 0, .5, .8], [67, .5, 1, .93], [71, 1.5, .5, 1], [69, 2, .5, .87], [67, 2.5, .25, .82], [null, 2.75, .25]]],
  ['Em7', [[71, 0, .75, .94], [76, .75, .75, .98], [74, 1.5, .5, .88], [71, 2, .75, .85], [null, 2.75, .25]]],
  ['D7', [[72, 0, .75, .92], [69, .75, .75, .86], [66, 1.5, .75, .82], [null, 2.25, .75]]],
  ['G', [[67, 0, 1.75, .85], [null, 1.75, 1.25]]],
];
const B = [
  ['Em', [[76, 0, 1.75, 1], [71, 1.75, .75, .88], [null, 2.5, .5]]],
  ['B7Ds', [[75, 0, 1.25, .97], [78, 1.25, .5, 1], [75, 1.75, .75, .88], [null, 2.5, .5]]],
  ['EmG', [[76, 0, 1.5, .98], [74, 1.5, .5, .88], [71, 2, .5, .85], [null, 2.5, .5]]],
  ['Am', [[72, 0, 1, .92], [76, 1, .75, .98], [72, 1.75, .75, .86], [null, 2.5, .5]]],
  ['C', [[79, 0, 1.5, 1.02], [76, 1.5, .75, .92], [null, 2.25, .75]]],
  ['AmC', [[76, 0, .75, .94], [72, .75, .75, .88], [69, 1.5, .75, .82], [null, 2.25, .75]]],
  ['D7', [[67, 0, .5, .86], [66, .5, .5, .83], [69, 1, .5, .88], [72, 1.5, .5, .93], [69, 2, .5, .84], [null, 2.5, .5]]],
  ['D7', [[66, 0, 1.5, .86], [69, 1.5, .5, .88], [null, 2, 1]]],
];

const bars = [A, A, B, A].flatMap((section, sectionIndex) => section.map(([harmony, notes], index) => Object.freeze({
  section: sectionIndex === 2 ? 'B' : 'A',
  sectionIndex,
  phrase: index < 4 ? 'invitation' : 'answer',
  cadence: index === 7 ? (sectionIndex === 2 ? 'turnaround' : 'authentic') : index === 3 ? 'breath' : null,
  harmony: CHORDS[harmony],
  melody: Object.freeze(notes.map(([pitch, beat, duration, accent = 1]) => Object.freeze({ pitch, beat, duration, accent }))),
})));

export const SCORE = Object.freeze({
  title: 'Make Yourself at Home',
  key: 'G major',
  contrastingKey: 'E minor',
  meter: '3/4',
  bpm: 92,
  beatsPerBar: 3,
  form: 'AABA',
  phraseBars: 4,
  scenes: Object.freeze(['menu', 'lobby']),
  bars: Object.freeze(bars),
});

/**
 * Pure, fresh events in beats at SCORE.bpm. All modes share the menu arrangement:
 * play/menu/lobby are aliases; unknown values safely use the same authored score.
 * Finite numeric indices are floored and wrapped; other values select bar zero.
 */
export function eventsForBar(index, mode = 'play') {
  void mode; // Collection and lobby deliberately share one complete arrangement.
  const cursor = Number.isFinite(index) ? Math.floor(index) : 0;
  const bar = SCORE.bars[((cursor % SCORE.bars.length) + SCORE.bars.length) % SCORE.bars.length];
  const events = bar.melody.filter(note => note.pitch !== null).map(note => ({
    instrument: 'woodwind', pitch: note.pitch, beat: note.beat,
    duration: note.duration, level: .132 * note.accent,
  }));
  events.push({ instrument: 'bass', pitch: bar.harmony.root, beat: 0, duration: .86, level: .076 });
  for (const beat of [1, 2]) {
    // Leave the entire last beat clear at tonic cadences and the B turnaround.
    if ((bar.cadence === 'authentic' || bar.cadence === 'turnaround') && beat === 2) continue;
    for (const pitch of bar.harmony.tones) events.push({
      instrument: 'pizzicato', pitch, beat, duration: .4, level: .018 * (beat === 2 ? .78 : 1),
    });
  }
  // Three very quiet tonic chimes mark the answers; there is no extra bell melody.
  if (bar.cadence === 'authentic') events.push({ instrument: 'bell', pitch: 79, beat: 0, duration: 1, level: .014 });
  return events.sort((left, right) => left.beat - right.beat);
}
