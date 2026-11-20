/** Private teaching copy and fixtures. These are not normal-run configuration. */
export const LESSONS = Object.freeze([
  {
    id: 'centre', short: 'Comfort', title: 'Find your comfortable centre.',
    text: 'Sit back and hold your phone naturally. Recenter remembers that resting angle; small tilts then steer the fruit.',
    touchText: 'A thumb on the steering pad does the same job as tilt. Lift your thumb to stop steering. For tilt, Recenter remembers your comfortable resting angle.',
    prompt: 'Try the centre marker below. Your phone handles its own setup when you return.',
    success: 'That is your neutral position. Recenter on your phone whenever your grip changes; a live run pauses while you adjust.',
  },
  {
    id: 'steer', short: 'Steer', title: 'Two trays. Two gardeners.',
    text: 'Jon steers the left garden. Lydia steers the right. Try the arrows here, then switch gardeners and move the other fruit.',
    prompt: 'Use the arrow buttons or your keyboard. Move one fruit on each tray.',
    success: 'Both gardens have their own steering. Talk about where the fruit should go next.',
  },
  {
    id: 'brake', short: 'Brake', title: 'Hold Brake to steady the fruit.',
    text: 'Brake softens the roll and stops your normal steering force. Keep it held as long as you need, then release to steer again.',
    prompt: 'Hold the large Brake button. On a keyboard, hold Space or Enter while it is focused.',
    success: 'A steady handoff starts with Brake. In a timed run, the clock keeps going while you hold it.',
  },
  {
    id: 'bridge', short: 'Pass', title: 'Meet in the middle.',
    text: 'Fruit crosses the bridge into the other garden. Both trays influence it on the bridge, so agree who is sending and who is receiving.',
    prompt: 'Pass the pear to Lydia. Its matching basket is on her side.',
    success: 'Handoff complete. Lydia can now guide the pear home; Jon can prepare the next fruit.',
  },
  {
    id: 'basket', short: 'Match', title: 'Match the shape on the basket.',
    text: 'Apples and plums go to Jon’s baskets. Pears and starfruit go to Lydia’s. Shapes and labels identify each destination.',
    prompt: 'Choose the fruit that belongs in this pear basket. A wrong fruit bounces back.',
    success: 'A pear belongs in the pear basket. Wrong or full baskets reject fruit without using it up.',
  },
  {
    id: 'recipe', short: 'Orders', title: 'Fill one shared picnic order.',
    text: 'This order needs two apples and one pear. Each basket can hold three fruit. Spare fruit waits for the next order.',
    prompt: 'Deliver the three ingredients one at a time and watch the basket buffers.',
    success: 'Two apples and one pear are used together. The order is complete and the buffers make room for more fruit.',
  },
  {
    id: 'hazards', short: 'Forecast', title: 'Lala always gives you a warning.',
    text: 'The arrow shows where a gust will push, three seconds ahead. Hold Brake to soften it. Striped openings are compost; gates warn before closing.',
    prompt: 'Preview the gust, then hold Brake. A gate waits if fruit is still crossing it.',
    success: 'Braced for the gust. Keep watching its direction, the gate marks and the compost stripes—not just their colours.',
  },
  {
    id: 'pause', short: 'Ready', title: 'Pause together. Return together.',
    text: 'Help, recentering or a lost phone pauses the shared run. Closing Help alone never restarts the fruit.',
    prompt: 'Pause this practice garden. Then make both gardeners ready and watch the three-second countdown.',
    success: 'Both gardeners are ready. In your run, confirm Ready on each phone to continue. Your live garden has stayed separate from this practice.',
  },
]);

export function createLessonState(step = 0) {
  return {
    step, done: false, centred: false,
    selected: 'jon', moved: { jon: false, lydia: false },
    positions: { jon: { x: 235, y: 225 }, lydia: { x: 710, y: 225 } },
    brakeHeld: false, brakeHeldMs: 0, speed: 100, rollX: 160, rollDirection: 1,
    passing: false, passProgress: 0,
    basketAttempt: null, deliveries: 0,
    forecastStarted: false, forecastMs: 0, braced: false,
    paused: false, ready: { jon: false, lydia: false }, resumeMs: null,
  };
}

export const DIRECTIONS = Object.freeze({
  up: Object.freeze({ x: 0, y: -1 }),
  right: Object.freeze({ x: 1, y: 0 }),
  down: Object.freeze({ x: 0, y: 1 }),
  left: Object.freeze({ x: -1, y: 0 }),
});
