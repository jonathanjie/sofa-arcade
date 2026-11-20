/** Original menu gestures; beat and duration units use the menu score's 92 BPM. */
const cue = rows => Object.freeze(rows.map(([instrument, pitch, beat, duration, level]) => Object.freeze({ instrument, pitch, beat, duration, level })));
const CUES = Object.freeze({
  'menu-select': cue([['pizzicato', 67, 0, .3, .043], ['bell', 71, .17, .26, .022]]),
  'menu-back': cue([['pizzicato', 71, 0, .3, .04], ['pizzicato', 67, .32, .43, .045]]),
  'menu-confirm': cue([['woodwind', 67, 0, .35, .055], ['woodwind', 71, .4, .35, .06], ['woodwind', 74, .85, .65, .062], ['pizzicato', 55, .85, .4, .024]]),
});

/** Unknown effect names are silent; each result is independent and mutable. */
export function eventsForEffect(name) {
  const source = typeof name === 'string' && Object.hasOwn(CUES, name) ? CUES[name] : [];
  return source.map(event => ({ ...event }));
}
