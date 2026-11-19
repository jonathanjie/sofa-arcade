import test from 'node:test';
import assert from 'node:assert/strict';
import { SCORE, eventsForBar } from './score.mjs';

test('the score has a stable waltz meter and a complete AABA form', () => {
  assert.equal(SCORE.bpm, 104);
  assert.equal(SCORE.beatsPerBar, 3);
  assert.equal(SCORE.bars.length, 32);
  assert.equal([0, 8, 16, 24].map(index => SCORE.bars[index].section).join(''), 'AABA');
  assert.deepEqual(SCORE.bars.slice(0, 8).map(bar => bar.melody), SCORE.bars.slice(8, 16).map(bar => bar.melody));
  assert.deepEqual(SCORE.bars.slice(0, 8).map(bar => bar.melody), SCORE.bars.slice(24, 32).map(bar => bar.melody));
});

test('every melody bar accounts for all three beats without overlaps; strong beats fit the harmony', () => {
  // A sparse accompaniment may omit a fifth; the melody can still sing it.
  const chordClasses = {
    G: [7, 11, 2], D: [2, 6, 9], C: [0, 4, 7], D7: [2, 6, 9, 0],
    Em: [4, 7, 11], Bm: [11, 2, 6], 'G/B': [7, 11, 2],
    Am: [9, 0, 4], 'Em/G': [4, 7, 11], Am7: [9, 0, 4, 7],
  };
  for (const [index, bar] of SCORE.bars.entries()) {
    let position = 0;
    for (const note of bar.melody) {
      assert.equal(note.beat, position, `gap or overlap in bar ${index + 1}`);
      assert.ok(note.duration > 0 && Number.isFinite(note.duration));
      assert.ok(note.pitch === null || (Number.isInteger(note.pitch) && note.pitch >= 60 && note.pitch <= 81));
      position += note.duration;
    }
    assert.equal(position, 3);
    const first = bar.melody[0].pitch % 12;
    assert.ok(chordClasses[bar.harmony.name].includes(first), `bar ${index + 1} begins outside its chord`);
  }
});

test('menu, play, anticipation, and results all preserve the entire written melody', () => {
  for (let index = 0; index < SCORE.bars.length; index++) {
    const expected = SCORE.bars[index].melody.filter(note => note.pitch !== null).map(({ pitch, beat, duration }) => ({ pitch, beat, duration }));
    for (const mode of ['lobby', 'play', 'mischief', 'celebrate']) {
      const lead = eventsForBar(index, mode).filter(event => event.instrument === 'woodwind').map(({ pitch, beat, duration }) => ({ pitch, beat, duration }));
      assert.deepEqual(lead, expected, `melody changed in ${mode}, bar ${index + 1}`);
    }
  }
});

test('phrases breathe and the accompaniment stays subordinate in an audible register', () => {
  for (let index = 3; index < SCORE.bars.length; index += 4) {
    const end = SCORE.bars[index].melody.at(-1);
    assert.equal(end.pitch, null);
    assert.ok(end.duration >= .5);
  }
  for (let index = 0; index < SCORE.bars.length; index++) {
    const events = eventsForBar(index);
    const bass = events.filter(event => event.instrument === 'bass');
    assert.equal(bass.length, 1);
    assert.equal(bass[0].beat, 0);
    assert.ok(bass[0].pitch >= 43 && bass[0].pitch <= 55);
    const chords = events.filter(event => event.instrument === 'pizzicato');
    assert.deepEqual([...new Set(chords.map(event => event.beat))], [1, 2]);
    assert.ok(chords.every(event => event.level < .04 && event.pitch < 67));
    assert.ok(events.filter(event => event.instrument === 'woodwind').every(event => event.level > .12));
  }
});

test('sparse menu voicings retain chord quality and the dominant-to-tonic cadence', () => {
  const thirds = { G: 11, D: 6, C: 4, D7: 6, Em: 7, Bm: 2, 'G/B': 11, Am: 0, 'Em/G': 7, Am7: 0 };
  for (const bar of SCORE.bars) {
    const notes = [bar.harmony.root, ...bar.harmony.menuTones].map(pitch => pitch % 12);
    assert.ok(notes.includes(thirds[bar.harmony.name]), `${bar.harmony.name} lost its major/minor third`);
    if (bar.harmony.name === 'D7') assert.ok(notes.includes(0), 'dominant seventh must remain audible');
    if (bar.harmony.name === 'G/B') assert.ok(notes.includes(7), 'inversion must retain its G root');
  }
  for (const index of [7, 15, 31]) {
    assert.equal(SCORE.bars[index - 1].harmony.name, 'D7');
    assert.equal(SCORE.bars[index].harmony.name, 'G');
    assert.equal(SCORE.bars[index].melody[0].pitch, 67);
  }
});
