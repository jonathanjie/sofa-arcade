/**
 * Lala Calls the House — original chamber-comedy miniature for Odd Laws Society.
 * F major, 4/4, quarter note = 100. A (8) / A (8) / B (8) / A (8).
 *
 * The little upbeat A–C–A figure is the calling-card. Its four-bar question ends
 * on C7; its answer resolves to F and leaves a full beat-and-a-half to breathe.
 * B changes to D minor, with an A7/C# dominant, a longer legato opening and a
 * descending sequence. Two C7 bars turn back toward the returning F-major A.
 * All notes, rests and accompaniments are authored; no probabilistic generation.
 * This file is score data only. The shared audio engine owns timing and sound.
 */
const harmony = (name, root, fifth, tones, sparse) => Object.freeze({
  name, root, fifth, tones: Object.freeze(tones), sparse: Object.freeze(sparse),
});
const HARMONIES = Object.freeze({
  F: harmony('F', 41, 48, [53, 57, 60], [57, 60]),
  CE: harmony('C/E', 40, 43, [55, 60, 64], [55, 60]),
  Bb: harmony('Bb', 46, 53, [53, 58, 62], [58, 62]),
  C7: harmony('C7', 48, 43, [52, 58, 60], [52, 58]),
  Dm: harmony('Dm', 38, 45, [53, 57, 62], [53, 57]),
  A7Cs: harmony('A7/C#', 49, 45, [55, 57, 61], [55, 57]),
  DmF: harmony('Dm/F', 41, 45, [50, 57, 62], [50, 57]),
  Gm7: harmony('Gm7', 43, 50, [53, 58, 62], [58, 62]),
  GmBb: harmony('Gm/Bb', 46, 50, [55, 58, 62], [55, 62]),
});

// Each tuple is [MIDI pitch (null = breath), onset, duration, phrase accent].
// Rests are explicit and each bar accounts for exactly four beats.
const A = [
  ['F', [[null, 0, .5], [69, .5, .5, .9], [72, 1, .75, 1], [69, 1.75, .25, .83], [67, 2, .5, .88], [69, 2.5, .5, .91], [65, 3, .75, .85], [null, 3.75, .25]]],
  ['CE', [[67, 0, 1, .95], [64, 1, .5, .83], [67, 1.5, .5, .87], [72, 2, 1.5, .96], [null, 3.5, .5]]],
  ['Bb', [[74, 0, .75, 1], [72, .75, .25, .88], [70, 1, .5, .89], [69, 1.5, .5, .86], [67, 2, .5, .84], [65, 2.5, .5, .82], [62, 3, .5, .79], [null, 3.5, .5]]],
  ['C7', [[64, 0, .5, .87], [67, .5, .5, .91], [70, 1, 1, .96], [67, 2, 1, .84], [null, 3, 1]]],
  ['F', [[null, 0, .5], [69, .5, .5, .9], [72, 1, .75, 1], [69, 1.75, .25, .83], [67, 2, .5, .88], [69, 2.5, .5, .91], [65, 3, .75, .85], [null, 3.75, .25]]],
  ['Dm', [[69, 0, .5, .91], [74, .5, 1.5, 1], [72, 2, .5, .9], [69, 2.5, .5, .86], [65, 3, .5, .81], [null, 3.5, .5]]],
  ['C7', [[74, 0, 1, .98], [70, 1, .5, .9], [67, 1.5, .5, .86], [64, 2, 1, .83], [null, 3, 1]]],
  ['F', [[65, 0, 2.5, .88], [null, 2.5, 1.5]]],
];
const B = [
  ['Dm', [[74, 0, 2, 1], [77, 2, .75, .99], [76, 2.75, .25, .86], [74, 3, .75, .92], [null, 3.75, .25]]],
  ['A7Cs', [[76, 0, 1.5, .98], [73, 1.5, .5, .87], [69, 2, 1.25, .86], [null, 3.25, .75]]],
  ['DmF', [[77, 0, 1, 1.02], [76, 1, .5, .92], [74, 1.5, .5, .9], [72, 2, 1, .88], [69, 3, .75, .82], [null, 3.75, .25]]],
  ['Gm7', [[74, 0, 2, .96], [70, 2, 1.25, .84], [null, 3.25, .75]]],
  ['Bb', [[74, 0, .5, .94], [77, .5, 1.5, 1], [74, 2, 1, .91], [72, 3, .75, .86], [null, 3.75, .25]]],
  ['GmBb', [[70, 0, 1.5, .92], [69, 1.5, .5, .85], [67, 2, 1.25, .82], [null, 3.25, .75]]],
  ['C7', [[67, 0, 1, .87], [70, 1, .5, .92], [72, 1.5, .5, .96], [70, 2, .5, .88], [67, 2.5, .5, .83], [64, 3, .5, .8], [null, 3.5, .5]]],
  ['C7', [[67, 0, 1, .88], [64, 1, 1, .82], [72, 2, 1, .92], [null, 3, 1]]],
];

const bars = [A, A, B, A].flatMap((section, sectionIndex) => section.map(([chord, notes], phraseIndex) => Object.freeze({
  section: sectionIndex === 2 ? 'B' : 'A',
  sectionIndex,
  phrase: phraseIndex < 4 ? 'question' : 'answer',
  harmony: HARMONIES[chord],
  cadence: phraseIndex === 7 ? (sectionIndex === 2 ? 'turnaround' : 'authentic') : phraseIndex === 3 ? 'breath' : null,
  melody: Object.freeze(notes.map(([pitch, beat, duration, accent = 1]) => Object.freeze({ pitch, beat, duration, accent }))),
})));

export const SCORE = Object.freeze({
  title: 'Lala Calls the House',
  key: 'F major',
  contrastingKey: 'D minor',
  meter: '4/4',
  bpm: 100,
  beatsPerBar: 4,
  form: 'AABA',
  phraseBars: 4,
  scenes: Object.freeze(['lobby', 'council', 'term1', 'term2', 'term3', 'celebrate']),
  bars: Object.freeze(bars),
});

const settings = (lead, bass, pizzicato, sparse, secondBass, bell, articulation) => Object.freeze({ lead, bass, pizzicato, sparse, secondBass, bell, articulation });
const ARRANGEMENTS = Object.freeze({
  play: settings(.145, .082, .022, false, true, 0, .42),
  lobby: settings(.128, .062, .017, true, false, 0, .46),
  council: settings(.102, .052, .012, true, false, 0, .5),
  term1: settings(.145, .082, .022, false, true, 0, .42),
  term2: settings(.145, .082, .023, false, true, 0, .5),
  term3: settings(.145, .084, .023, false, true, .018, .5),
  celebrate: settings(.155, .087, .025, false, true, .035, .52),
});

/**
 * Fresh, deterministic events; all timing is in beats at SCORE.bpm.
 * Finite number indices are floored then wrapped (including negative numbers).
 * Other indices start at bar zero. Unknown modes, including non-strings, use play.
 * Arrange only at four-bar phrase boundaries in the shared scheduler.
 */
export function eventsForBar(index, mode = 'play') {
  const cursor = Number.isFinite(index) ? Math.floor(index) : 0;
  const bar = SCORE.bars[((cursor % SCORE.bars.length) + SCORE.bars.length) % SCORE.bars.length];
  const modeName = typeof mode === 'string' && Object.hasOwn(ARRANGEMENTS, mode) ? mode : 'play';
  const arrangement = ARRANGEMENTS[modeName];
  const events = bar.melody.filter(note => note.pitch !== null).map(note => ({
    instrument: 'woodwind', pitch: note.pitch, beat: note.beat,
    duration: note.duration, level: arrangement.lead * note.accent,
  }));
  const add = (instrument, pitch, beat, duration, level) => events.push({ instrument, pitch, beat, duration, level });
  add('bass', bar.harmony.root, 0, modeName === 'council' ? 1.1 : .82, arrangement.bass);
  if (arrangement.secondBass) {
    add('bass', bar.harmony.fifth, 2, .65, arrangement.bass * .72);
  }
  const voicing = arrangement.sparse ? bar.harmony.sparse : bar.harmony.tones;
  const chordBeats = modeName === 'council' ? [2] : [1, 3];
  for (const beat of chordBeats) {
    // Cadence bars leave their final beat entirely clear, including accompaniment.
    if (bar.cadence === 'authentic' && beat === 3) continue;
    for (const pitch of voicing) {
      add('pizzicato', pitch, beat, arrangement.articulation, arrangement.pizzicato * (beat === 3 ? .82 : 1));
    }
  }
  // A single, quiet tonic bell is reserved for whole-section arrivals. It is not
  // an extra melody or a reward played on every game action.
  if (arrangement.bell && bar.cadence === 'authentic') {
    add('bell', 77, 0, 1.25, arrangement.bell);
  }
  return events.sort((left, right) => left.beat - right.beat);
}
