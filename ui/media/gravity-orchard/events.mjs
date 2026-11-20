/**
 * Original Gravity Orchard cues, in beats at SCORE.bpm (104).
 * These pure events do not play, deduplicate, throttle, own a clock or save
 * settings. The host adapter applies CUE_POLICY after stable-event-ID dedup.
 */
const cue = rows => Object.freeze(rows.map(([instrument, pitch, beat, duration, level]) => Object.freeze({ instrument, pitch, beat, duration, level })));
const CUES = Object.freeze({
  catch: cue([['pizzicato', 74, 0, .28, .039], ['bell', 81, .14, .28, .021]]),
  reject: cue([['pizzicato', 62, 0, .25, .032], ['pizzicato', 61, .23, .26, .027]]),
  compost: cue([['bass', 50, 0, .45, .037], ['pizzicato', 57, .16, .25, .023]]),
  order: cue([['woodwind', 66, 0, .2, .052], ['woodwind', 69, .22, .2, .057], ['woodwind', 74, .44, .22, .059], ['woodwind', 78, .70, .48, .051], ['pizzicato', 50, .70, .4, .021]]),
  forecast: cue([['bell', 69, 0, .4, .035], ['bell', 74, .55, .45, .039]]),
  'gate-warning': cue([['pizzicato', 57, 0, .18, .027], ['pizzicato', 57, .25, .18, .027], ['pizzicato', 64, .5, .22, .025]]),
  gust: cue([['woodwind', 78, 0, .18, .037], ['woodwind', 76, .20, .18, .032], ['woodwind', 74, .40, .32, .027]]),
  countdown: cue([['bell', 62, 0, .27, .036], ['bass', 50, 0, .18, .012]]),
  'stage-result': cue([['woodwind', 69, 0, .4, .052], ['woodwind', 66, .5, .4, .046], ['woodwind', 74, 1, .85, .055], ['pizzicato', 38, 1, .55, .025], ['bell', 78, 1, .5, .018]]),
  finish: cue([['woodwind', 66, 0, .22, .056], ['woodwind', 69, .25, .22, .060], ['woodwind', 71, .5, .45, .064], ['woodwind', 69, 1, .22, .058], ['woodwind', 66, 1.25, .22, .051], ['woodwind', 74, 1.5, 1.2, .062], ['bass', 38, 1.5, .85, .031], ['pizzicato', 54, 1.5, .5, .018], ['bell', 81, 1.5, .7, .017]]),
});

const ALIASES = Object.freeze({
  full: 'reject',
  'basket-full': 'reject',
  'basket-reject': 'reject',
  'order-complete': 'order',
  'gate-forecast': 'gate-warning',
  'gust-forecast': 'forecast',
  'lala-forecast': 'forecast',
  'gust-start': 'gust',
  'lala-gust': 'gust',
  'stage-complete': 'stage-result',
  celebrate: 'finish',
  celebration: 'finish',
  'final-celebration': 'finish',
});

export const EFFECT_NAMES = Object.freeze(Object.keys(CUES));
// Recommended host policy, not a hidden timer. Higher values mean higher
// priority when a completed recipe coincides with its ingredient's catch.
export const CUE_POLICY = Object.freeze({
  catch: Object.freeze({ cooldownMs: 120, priority: 1 }),
  reject: Object.freeze({ cooldownMs: 180, priority: 1 }),
  compost: Object.freeze({ cooldownMs: 300, priority: 2 }),
  order: Object.freeze({ cooldownMs: 650, priority: 4 }),
  forecast: Object.freeze({ cooldownMs: 850, priority: 5 }),
  'gate-warning': Object.freeze({ cooldownMs: 1000, priority: 5 }),
  gust: Object.freeze({ cooldownMs: 900, priority: 3 }),
  countdown: Object.freeze({ cooldownMs: 700, priority: 5 }),
  'stage-result': Object.freeze({ cooldownMs: 1500, priority: 6 }),
  finish: Object.freeze({ cooldownMs: 2500, priority: 7 }),
});

/** Unknown names—including object-prototype keys—are silent. */
export function eventsForEffect(name) {
  if (typeof name !== 'string') return [];
  const key = Object.hasOwn(ALIASES, name) ? ALIASES[name] : name;
  return (Object.hasOwn(CUES, key) ? CUES[key] : []).map(event => ({ ...event }));
}
