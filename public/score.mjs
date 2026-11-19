/**
 * Lala's Little Waltz — an original miniature for a wooden flute and pizzicato.
 * G major, 3/4, quarter note = 104. Form: A (8) / A (8) / B (8) / A (8).
 *
 * A's dotted-quarter / eighth / quarter motif asks a four-bar question ending
 * on the dominant, then answers with a four-bar tonic cadence. It is repeated
 * intact so there is a tune to recognise. B visits the relative minor, climbs,
 * and descends back to the dominant before the familiar theme returns.
 *
 * Every onset, duration, and breath is written below. Menu and game play the
 * SAME melody. Accompaniment is strictly a bass on 1 and quiet chords on 2/3;
 * there is no independent arpeggio, random note choice, or extra lead layer.
 */
const HARMONIES = {
  G:   { name: 'G',     root: 43, tones: [55, 59, 62], menuTones: [59, 62] },
  D:   { name: 'D',     root: 50, tones: [54, 57, 62], menuTones: [54, 57] },
  C:   { name: 'C',     root: 48, tones: [55, 60, 64], menuTones: [60, 64] },
  D7:  { name: 'D7',    root: 50, tones: [54, 60, 62], menuTones: [54, 60] },
  Em:  { name: 'Em',    root: 52, tones: [55, 59, 64], menuTones: [55, 59] },
  Bm:  { name: 'Bm',    root: 47, tones: [54, 59, 62], menuTones: [59, 62] },
  GB:  { name: 'G/B',   root: 47, tones: [55, 59, 62], menuTones: [55, 62] },
  Am:  { name: 'Am',    root: 45, tones: [57, 60, 64], menuTones: [60, 64] },
  EmG: { name: 'Em/G',  root: 43, tones: [55, 59, 64], menuTones: [59, 64] },
  Am7: { name: 'Am7',   root: 45, tones: [55, 60, 64], menuTones: [55, 60] },
};

// Note tuples are [MIDI pitch (null = breath), onset in beats, duration, accent].
// Accents shape a single phrase, rather than making each new note equally loud.
const A = [
  ['G',  [[71,0,1.5,1], [74,1.5,.5,.88], [71,2,.75,.91], [null,2.75,.25]]],
  ['D',  [[69,0,1.5,.95], [71,1.5,.5,.83], [69,2,.75,.86], [null,2.75,.25]]],
  ['C',  [[67,0,1,.92], [64,1,.5,.80], [67,1.5,.5,.86], [69,2,.75,.90], [null,2.75,.25]]],
  ['D7', [[66,0,2,.88], [null,2,1]]], // half cadence: a question, then a breath
  ['G',  [[71,0,1.5,1], [74,1.5,.5,.88], [71,2,.75,.91], [null,2.75,.25]]],
  ['C',  [[72,0,1.5,1.02], [76,1.5,.5,.90], [72,2,.75,.91], [null,2.75,.25]]],
  ['D7', [[69,0,1,.94], [66,1,1,.85], [69,2,.75,.86], [null,2.75,.25]]],
  ['G',  [[67,0,2.25,.88], [null,2.25,.75]]], // tonic answer, with space to settle
];
const B = [
  ['Em',  [[76,0,2,1.02], [71,2,.75,.88], [null,2.75,.25]]],
  ['Bm',  [[74,0,1.5,.99], [78,1.5,.5,.89], [74,2,.75,.91], [null,2.75,.25]]],
  ['C',   [[76,0,1,1], [74,1,.5,.89], [72,1.5,.5,.85], [71,2,.75,.87], [null,2.75,.25]]],
  ['GB',  [[74,0,2,.91], [null,2,1]]],
  ['Am',  [[72,0,2,.95], [69,2,.75,.86], [null,2.75,.25]]],
  ['EmG', [[71,0,1,.93], [67,1,1,.85], [64,2,.75,.81], [null,2.75,.25]]],
  ['Am7', [[69,0,1,.95], [71,1,.5,.85], [72,1.5,.5,.90], [69,2,.75,.85], [null,2.75,.25]]],
  ['D7',  [[66,0,2,.91], [69,2,.5,.82], [null,2.5,.5]]],
];

const bars = [A, A, B, A].flatMap((section, sectionIndex) => section.map(([harmony, notes], index) => Object.freeze({
  section: sectionIndex === 2 ? 'B' : 'A',
  phrase: index < 4 ? 'question' : 'answer',
  harmony: Object.freeze({
    ...HARMONIES[harmony],
    tones: Object.freeze([...HARMONIES[harmony].tones]),
    menuTones: Object.freeze([...HARMONIES[harmony].menuTones]),
  }),
  melody: Object.freeze(notes.map(([pitch, beat, duration, accent = 1]) => Object.freeze({ pitch, beat, duration, accent }))),
})));

export const SCORE = Object.freeze({
  title: 'Lala’s Little Waltz',
  key: 'G major',
  meter: '3/4',
  bpm: 104,
  beatsPerBar: 3,
  form: 'AABA',
  bars: Object.freeze(bars),
});

/** Pure arrangement: the lead score is identical in every mode. */
export function eventsForBar(index, mode = 'play') {
  const bar = SCORE.bars[((index % SCORE.bars.length) + SCORE.bars.length) % SCORE.bars.length];
  const menu = mode === 'lobby';
  const leadLevel = mode === 'celebrate' ? .165 : menu ? .145 : .155;
  const accompaniment = mode === 'mischief' ? 1.07 : menu ? .71 : 1;
  const events = bar.melody.filter(note => note.pitch !== null).map(note => ({
    instrument: 'woodwind', pitch: note.pitch, beat: note.beat,
    duration: note.duration, level: leadLevel * note.accent,
  }));
  events.push({ instrument: 'bass', pitch: bar.harmony.root, beat: 0, duration: .88, level: .105 * accompaniment });
  [1, 2].forEach(beat => {
    // The menu uses a quiet two-note voicing; the bass supplies its missing root.
    const voicing = menu ? bar.harmony.menuTones : bar.harmony.tones;
    voicing.forEach(pitch => events.push({
      instrument: 'pizzicato', pitch, beat,
      duration: mode === 'mischief' ? .46 : .55,
      level: .029 * accompaniment * (beat === 2 ? .84 : 1),
    }));
  });
  return events.sort((a, b) => a.beat - b.beat);
}
