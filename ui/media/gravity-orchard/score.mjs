/**
 * Over the Little Bridge — original Gravity Orchard theme.
 * D major, 4/4, quarter note = 104. A (8) / A (8) / B (8) / A (8).
 *
 * A's F#–A–B–A–F#–E figure is a small, rising handoff, answered by a
 * descending phrase. B opens into longer B-minor phrases, visits F#7/A#,
 * then returns through Em7–A7. Every phrase breathes; the final D cadence
 * leaves the last beat free before the familiar hook returns.
 *
 * Data and event functions only. ui/audio.js owns the clock, instruments,
 * gesture unlock, host/phone rules and independent user preferences.
 */
export { eventsForEffect } from './events.mjs';

const chord = (name, root, fifth, tones) => Object.freeze({ name, root, fifth, tones: Object.freeze(tones) });
const HARMONY = Object.freeze({
  D: chord('D', 38, 45, [54, 57, 62]),
  G: chord('G', 43, 50, [55, 59, 62]),
  DFs: chord('D/F#', 42, 45, [57, 62, 66]),
  A7: chord('A7', 45, 52, [55, 61, 64]),
  Bm: chord('Bm', 47, 54, [54, 59, 62]),
  Fs7As: chord('F#7/A#', 46, 49, [54, 58, 61]),
  BmD: chord('Bm/D', 50, 54, [54, 59, 62]),
  Em: chord('Em', 40, 47, [55, 59, 64]),
  Em7: chord('Em7', 40, 47, [55, 59, 62]),
});

// [MIDI pitch (null is a written breath), beat, duration in beats, accent].
// Written notes and rests tile each bar; pitches are never chosen at random.
const A = [
  ['D', [[66, 0, .75, .94], [69, .75, .25, .86], [71, 1, .5, 1], [69, 1.5, 1, .93], [66, 2.5, .5, .86], [64, 3, .5, .79], [null, 3.5, .5]]],
  ['G', [[67, 0, .5, .9], [66, .5, .5, .85], [64, 1, .5, .8], [62, 1.5, 1.5, .84], [null, 3, 1]]],
  ['DFs', [[66, 0, 1, .92], [69, 1, .5, .96], [66, 1.5, .5, .88], [64, 2, .5, .82], [62, 2.5, .5, .8], [null, 3, 1]]],
  ['A7', [[64, 0, 1, .88], [61, 1, 1, .82], [57, 2, .5, .76], [null, 2.5, 1.5]]],
  ['D', [[66, 0, .75, .94], [69, .75, .25, .86], [71, 1, .5, 1], [69, 1.5, 1, .93], [66, 2.5, .5, .86], [64, 3, .5, .79], [null, 3.5, .5]]],
  ['G', [[71, 0, .75, .96], [74, .75, .75, 1], [71, 1.5, .5, .89], [69, 2, .5, .85], [67, 2.5, .5, .81], [null, 3, 1]]],
  ['A7', [[67, 0, .75, .9], [64, .75, .75, .84], [61, 1.5, .5, .8], [64, 2, .5, .82], [null, 2.5, 1.5]]],
  ['D', [[62, 0, 2.5, .85], [null, 2.5, 1.5]]],
];

const B = [
  ['Bm', [[71, 0, 1.5, .98], [74, 1.5, .5, 1], [73, 2, 1, .9], [null, 3, 1]]],
  ['Fs7As', [[70, 0, 1.5, .95], [73, 1.5, .5, .99], [76, 2, .75, 1], [73, 2.75, .25, .85], [null, 3, 1]]],
  ['BmD', [[74, 0, 1.5, 1], [78, 1.5, .5, 1.02], [76, 2, .5, .93], [74, 2.5, .5, .88], [null, 3, 1]]],
  ['Em', [[71, 0, 1, .94], [67, 1, 1, .87], [64, 2, 1, .8], [null, 3, 1]]],
  ['G', [[74, 0, 1.5, 1], [71, 1.5, .5, .91], [69, 2, .75, .85], [67, 2.75, .25, .8], [null, 3, 1]]],
  ['DFs', [[69, 0, 1, .92], [66, 1, 1, .86], [64, 2, .5, .81], [62, 2.5, .5, .78], [null, 3, 1]]],
  ['Em7', [[67, 0, .5, .88], [71, .5, .5, .96], [69, 1, .75, .9], [67, 1.75, .25, .84], [66, 2, .5, .81], [64, 2.5, .5, .78], [null, 3, 1]]],
  ['A7', [[64, 0, 1, .85], [61, 1, 1, .78], [null, 2, 2]]],
];

const bars = [A, A, B, A].flatMap((section, sectionIndex) => section.map(([harmony, notes], index) => Object.freeze({
  section: sectionIndex === 2 ? 'B' : 'A',
  sectionIndex,
  phrase: index < 4 ? 'handoff' : 'answer',
  cadence: index === 7 ? (sectionIndex === 2 ? 'dominant-turnaround' : 'authentic') : index === 3 ? 'half-phrase' : null,
  harmony: HARMONY[harmony],
  melody: Object.freeze(notes.map(([pitch, beat, duration, accent = 1]) => Object.freeze({ pitch, beat, duration, accent }))),
})));

export const SCORE = Object.freeze({
  title: 'Over the Little Bridge',
  gameId: 'gravity-orchard',
  key: 'D major',
  contrastingKey: 'B minor',
  meter: '4/4',
  bpm: 104,
  beatsPerBar: 4,
  form: 'AABA',
  phraseBars: 4,
  scenes: Object.freeze(['menu', 'practice', 'stage1', 'stage2', 'stage3', 'paused', 'celebrate']),
  bars: Object.freeze(bars),
});

const arrangement = (melody, bass, pluck, slots, secondBass, chime) => Object.freeze({
  melody, bass, pluck, slots: Object.freeze(slots), secondBass, chime,
});
const ARRANGEMENTS = Object.freeze({
  menu: arrangement(.106, .052, .013, [.5, 1.5, 2.5], true, .010),
  practice: arrangement(.079, .040, .009, [1, 2.5], false, 0),
  stage1: arrangement(.104, .056, .014, [.5, 1.5, 2.5], true, .010),
  stage2: arrangement(.101, .059, .014, [.5, 1.5, 2.5, 3.25], true, .009),
  stage3: arrangement(.090, .044, .009, [1, 2.5], true, .014),
  paused: arrangement(.033, .018, 0, [], false, 0),
  celebrate: arrangement(.117, .063, .016, [.5, 1.5, 2.5], true, .018),
});

/**
 * Fresh, beat-based scheduler events. Unknown scenes use the complete menu
 * arrangement. Finite numeric indices are floored and wrapped; all others use
 * bar zero. Scene changes belong at the shared scheduler's four-bar boundaries.
 */
export function eventsForBar(barIndex, scene = 'menu') {
  const cursor = Number.isFinite(barIndex) ? Math.floor(barIndex) : 0;
  const index = ((cursor % SCORE.bars.length) + SCORE.bars.length) % SCORE.bars.length;
  const bar = SCORE.bars[index];
  const settings = typeof scene === 'string' && Object.hasOwn(ARRANGEMENTS, scene) ? ARRANGEMENTS[scene] : ARRANGEMENTS.menu;
  const events = bar.melody.filter(note => note.pitch !== null).map(note => ({
    instrument: 'woodwind', pitch: note.pitch, beat: note.beat,
    duration: note.duration, level: settings.melody * note.accent,
  }));
  events.push({ instrument: 'bass', pitch: bar.harmony.root, beat: 0, duration: .8, level: settings.bass });
  if (settings.secondBass && !bar.cadence) events.push({
    instrument: 'bass', pitch: bar.harmony.fifth, beat: 2, duration: .65, level: settings.bass * .64,
  });
  for (let slot = 0; slot < settings.slots.length; slot++) {
    const beat = settings.slots[slot];
    // No busy accompaniment across a phrase breath, a cadence or loop seam.
    if (bar.cadence && beat >= 2) continue;
    const tones = bar.harmony.tones;
    const pitches = slot % 2 === 0 ? [tones[0], tones[2]] : [tones[1]];
    for (const pitch of pitches) events.push({
      instrument: 'pizzicato', pitch, beat, duration: scene === 'stage2' ? .28 : .42,
      level: settings.pluck * (slot % 2 === 0 ? 1 : .82),
    });
  }
  if (settings.chime && bar.cadence === 'authentic') events.push({
    instrument: 'bell', pitch: 74, beat: 0, duration: 1.1, level: settings.chime,
  });
  // Celebration echoes only the opening gesture, well beneath the main tune.
  if (scene === 'celebrate' && index % 8 === 0) events.push({
    instrument: 'bell', pitch: 78, beat: 0, duration: .5, level: .012,
  });
  return events.sort((left, right) => left.beat - right.beat);
}
