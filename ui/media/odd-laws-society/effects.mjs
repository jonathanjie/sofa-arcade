/** Original short civic cues. Beat units use SCORE.bpm (100), never seconds. */
const cue = rows => Object.freeze(rows.map(([instrument, pitch, beat, duration, level]) => Object.freeze({ instrument, pitch, beat, duration, level })));
const CUES = Object.freeze({
  build: cue([['pizzicato', 53, 0, .35, .07], ['pizzicato', 60, .2, .5, .06]]),
  coin: cue([['bell', 77, 0, .28, .055], ['bell', 81, .17, .35, .035]]),
  influence: cue([['woodwind', 69, 0, .4, .055], ['woodwind', 72, .5, .65, .06]]),
  street: cue([['pizzicato', 65, 0, .35, .06], ['pizzicato', 69, .3, .35, .055], ['bell', 72, .6, .6, .045]]),
  seal: cue([['pizzicato', 57, 0, .24, .055]]),
  reveal: cue([['woodwind', 67, 0, .35, .06], ['woodwind', 72, .5, .7, .065]]),
  stamp: cue([['bass', 41, 0, .3, .075], ['pizzicato', 53, .04, .23, .04]]),
  festival: cue([['pizzicato', 65, 0, .4, .06], ['woodwind', 69, .3, .55, .07], ['woodwind', 72, 1, .9, .065]]),
  win: cue([['woodwind', 69, 0, .4, .07], ['woodwind', 72, .5, .65, .075], ['woodwind', 77, 1.3, 1.2, .08], ['pizzicato', 53, 1.3, .6, .04], ['bell', 77, 1.3, .8, .035]]),
  tie: cue([['woodwind', 67, 0, .55, .06], ['woodwind', 65, .75, 1.25, .065], ['pizzicato', 57, .75, .6, .035], ['pizzicato', 60, .75, .6, .035]]),
});

/** Unknown names are silent; each result is a fresh array of fresh event objects. */
export function eventsForEffect(name) {
  const events = typeof name === 'string' && Object.hasOwn(CUES, name) ? CUES[name] : [];
  return events.map(event => ({ ...event }));
}
