/** Room for One More • chamber two-step • G major, with a middle strain in C. */
export { eventsForEffect } from './effects.mjs';

// Concert pitch, middle C = 60. Times below are in quarter-note beats.
const [E2, G2, A2, B2] = [40, 43, 45, 47];
const [C3, Cs3, D3, Eb3, E3, F3, G3, A3, B3] = [48, 49, 50, 51, 52, 53, 55, 57, 59];
const [C4, D4, E4, F4, Fs4, G4, A4, B4, C5, D5, E5, F5] =
  [60, 62, 64, 65, 66, 67, 69, 71, 72, 74, 76, 77];

// Each row is [pitch, onset, sounding length, optional dynamic multiplier].
// Shortening the dotted eighth leaves just enough space for the sixteenth to speak.
function skip(opening, flick, landing) {
  return [[opening, 0, .6875, .97], [flick, .75, .25, .91], [landing, 1, .8125, 1]];
}

function reply(first, low, last) {
  return [[first, 0, .5], [low, .75, .25, .85], [last, 1, .75, .92]];
}

function settle(pitch, length = 1.25) {
  return [[pitch, 0, length, .90]];
}

function anchor(pitch) {
  return [[pitch, 0, 1.5]];
}

function walk(first, next, beat = 1) {
  return [[first, 0, beat - .125], [next, beat, 1.875 - beat, .78]];
}

function pluck(beat, ...pitches) {
  return pitches.map(pitch => [pitch, beat, .375]);
}

function bar(harmony, melody, bass, pizzicato = [], bell = []) {
  return { harmony, melody, bass, pizzicato, bell };
}

// The opening two bars are one gesture. The leap back to D is answered by E.
// The downbeat pluck in bar 1 resolves the last bar's seventh across the loop.
const invitation = [
  bar('G',     skip(G4, B4, A4),       anchor(G2), pluck(0, B3)),
  bar('G/B',   reply(G4, D4, E4),      walk(B2, D3, .75), pluck(.5, G3, D4)),
  bar('Am7/C', [[E4, 0, .5], [A4, .5, .375], [G4, 1, .8125]],
                                       walk(C3, A2), pluck(.5, A3, E4)),
  bar('D',     settle(Fs4, 1.375),
                                       anchor(D3), pluck(.5, A3)),
  bar('G',     skip(G4, B4, A4),       walk(G2, B2, 1.5), pluck(.5, D4)),
  bar('C',     reply(G4, E4, D4),      walk(C3, E3), pluck(.5, G3, C4)),
  bar('D7',    [[D4, 0, .5], [E4, .5, .375, .84], [Fs4, 1, .875]],
                                       anchor(D3), pluck(1, A3, C4)),
  bar('G',     settle(G4),             anchor(G2), pluck(0, B3)),
];

const higherAnswer = [
  bar('Em',    skip(B4, D5, C5),       walk(E2, B2, .75), pluck(.5, G3, B3)),
  bar('G/B',   reply(B4, G4, A4),      walk(B2, D3), pluck(1.5, G3, B3)),
  bar('A7/C#', [[A4, 0, .5], [E4, .5, .5, .85], [Fs4, 1, .375], [G4, 1.5, .5]],
                                       anchor(Cs3), pluck(.5, E3, A3)),
  bar('D',     settle(Fs4, 1.375),     anchor(D3), pluck(0, A3, D4)),
  bar('G/B',   [[G4, 0, .75], [B4, .75, .25], [D5, 1, .875]],
                                       walk(B2, G2), pluck(.5, D4)),
  bar('Am/C',  skip(C5, B4, A4),       walk(C3, E3, 1.5), pluck(.5, A3, E4)),
  bar('D7',    [[A4, 0, .875], [Fs4, 1, .875]],
                                       anchor(D3), pluck(1, A3, C4)),
  bar('G',     settle(G4),             anchor(G2), pluck(0, B3)),
];

// The low, soft bell now has a tune. It enters in the reed's gaps and keeps
// its own attacks, including across the longer notes at the two C cadences.
const middle = [
  bar('Em',    [[G4, 0, 1.125], [E4, 1.25, .5]],
                                       walk(E2, G2), [], [[B3, .75, .5], [G3, 1.5, .375]]),
  bar('Am7',   [[E4, 0, .5], [A4, .75, .625], [G4, 1.5, .375]],
                                       walk(A2, C3, 1.5), pluck(.5, C4), [[A3, .25, .5], [C4, 1.25, .625]]),
  bar('Dm7/F', [[F4, 0, .875], [E4, 1, .375, .84], [F4, 1.5, .375]],
                                       walk(F3, D3), pluck(.5, A3), [[D4, .5, .5], [C4, 1.5, .375]]),
  bar('G',     [[A4, 0, .5], [G4, .5, .375], [B4, 1, .6875]],
                                       anchor(G2), pluck(.5, D4), [[B3, 0, .625], [C4, .75, .375], [D4, 1.25, .5]]),
  bar('C',     [[C5, 0, 1.25], [G4, 1.5, .375]],
                                       walk(C3, E3), pluck(.5, G3), [[E4, .5, .75], [D4, 1.5, .375]]),
  bar('F/A',   skip(F4, A4, G4),       anchor(A2), pluck(.5, F3), [[C4, .5, .5], [A3, 1.25, .625]]),
  bar('G7',    [[D5, 0, .5], [C5, .5, .375], [B4, 1, .875]],
                                       anchor(G2), pluck(1, F3), [[G3, .5, .5], [D4, 1.25, .625]]),
  bar('C',     settle(C5, 1.375),      anchor(C3), pluck(0, E3), [[C4, 0, .875], [G3, 1, .5]]),

  bar('C/E',   skip(C5, E5, D5),       walk(E3, C3, .75), [], [[G3, .25, .5], [C4, 1.25, .625]]),
  bar('Dm7',   reply(D5, B4, C5),      walk(D3, A2), pluck(.5, A3), [[D4, .5, .75], [F4, 1.5, .375]]),
  bar('G',     settle(B4, 1.75),       anchor(G2), [], [[D4, .25, .625], [A3, 1, .375], [G3, 1.5, .375]]),
  bar('Am',    [[C5, 0, 1], [E5, 1, .5], [D5, 1.5, .375]],
                                       walk(A2, C3), pluck(.5, E4), [[A3, .5, .75], [C4, 1.5, .375]]),
  bar('F',     [[C5, 0, .75], [A4, .75, .375], [C5, 1.5, .5]],
                                       anchor(F3), pluck(.5, A3), [[C4, .25, .625], [F4, 1, .875]]),
  bar('Dm/F',  [[D5, 0, .75], [E5, .75, .5], [F5, 1.25, .75, 1.07]],
                                       walk(F3, D3, 1.25), pluck(.5, A3), [[D4, 0, .625], [C4, .75, .25], [B3, 1, .25], [A3, 1.25, .625]]),
  bar('G7',    [[E5, 0, .5], [D5, .5, .625], [B4, 1.25, .625]],
                                       anchor(G2), pluck(1, F3), [[G3, .5, .75], [D4, 1.5, .375]]),
  bar('C',     settle(C5),             anchor(C3), pluck(0, E3), [[C4, 0, .875]]),
];

// First hear the opening over the old tonic, C. The 4–3 over D in bar 34
// restores F sharp, so that the third statement of the call feels like home.
const homecoming = [
  bar('C/E',   skip(G4, B4, A4),       anchor(E3), pluck(.5, C4)),
  bar('D7',    [[G4, 0, .75], [Fs4, .75, 1]],
                                       anchor(D3), pluck(.75, A3, C4)),
  bar('G',     [[G4, 0, .875], [A4, 1, .375], [B4, 1.5, .375]],
                                       walk(G2, B2, 1.5), pluck(0, B3)),
  bar('D',     [[A4, 0, .875], [Fs4, 1, .625]],
                                       anchor(D3), pluck(.5, A3)),
  bar('G',     skip(G4, B4, A4),       anchor(G2)),
  bar('C',     reply(G4, D4, E4),      anchor(C3), pluck(.5, G3)),
  bar('D7',    [[D4, 0, .75], [E4, .75, .25], [Fs4, 1, .875]],
                                       anchor(D3), pluck(1, A3, C4)),
  bar('G',     settle(G4),             anchor(G2), pluck(0, B3)),
];

const tag = [
  bar('G/B',   [[G4, 0, 1.5], [B4, 1.5, .5, .92]], anchor(B2), pluck(.75, D4)),
  bar('C/E',   [[A4, 0, .875], [G4, 1, .875]],     anchor(E3), pluck(.75, C4)),
  bar('Cm/Eb', settle(G4, 1.75),                     anchor(Eb3), pluck(.75, C4)),
  bar('G/D',   [[B4, 0, .5], [A4, .5, .375], [G4, 1, .875]],
                                       anchor(D3), pluck(1, B3)),
  bar('D7',    settle(Fs4, 1.75),      anchor(D3), pluck(0, A3, C4)),
  bar('G',     settle(G4),             anchor(G2), pluck(0, B3)),
  bar('Am7/C', [[E4, 0, .75], [A4, .75, .25], [G4, 1, .875]],
                                       walk(C3, A2, 1.5), pluck(.5, E4)),
  bar('D7',    [[Fs4, 0, .625], [A4, .75, .25], [Fs4, 1.25, .625, .88]],
                                       anchor(D3), pluck(1.25, A3, C4)),
];

function freezeLine(rows) {
  return Object.freeze(rows.map(([pitch, beat, duration, accent = 1]) =>
    Object.freeze({ pitch, beat, duration, accent })));
}

const bars = [];
for (const [section, strain] of [['A', invitation], ['A′', higherAnswer], ['B', middle], ['A″', homecoming], ['Tag', tag]]) {
  for (const { harmony, melody, bass, pizzicato, bell } of strain) {
    bars.push(Object.freeze({
      section, harmony, melody: freezeLine(melody), bass: freezeLine(bass),
      pizzicato: freezeLine(pizzicato), bell: freezeLine(bell),
    }));
  }
}

export const SCORE = Object.freeze({
  title: 'Room for One More', key: 'G major', contrastingKey: 'C major', meter: '2/4',
  bpm: 96, beatsPerBar: 2, phraseBars: 4, form: 'A A′ B A″ Tag',
  scenes: Object.freeze(['menu', 'lobby']), bars: Object.freeze(bars),
});

/** The collection and lobby share one arrangement. Every call returns fresh events. */
export function eventsForBar(index, mode = 'play') {
  void mode;
  const cursor = Number.isFinite(index) ? Math.floor(index) : 0;
  const measure = SCORE.bars[((cursor % bars.length) + bars.length) % bars.length];
  const events = [];
  for (const [line, instrument, gain] of [
    [measure.melody, 'woodwind', .125], [measure.bass, 'bass', .078],
    [measure.pizzicato, 'pizzicato', .030], [measure.bell, 'bell', .041],
  ]) {
    for (const { pitch, beat, duration, accent } of line) {
      events.push({ instrument, pitch, beat, duration, level: gain * accent });
    }
  }
  return events.sort((left, right) => left.beat - right.beat);
}
