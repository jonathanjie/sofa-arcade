// Shared cues and timing geometry. The host keeps scores and answers private.
export const CARDS = Object.freeze([
  { id: 'exact-seven', name: 'Seven taps', score: 'Exactly seven scores best', instruction: 'Tap exactly 7 times', control: 'tap', visual: 'seven' },
  { id: 'quick-taps', name: 'Quick taps', score: 'More taps earn more points', instruction: 'Tap as fast as you can', control: 'tap', visual: 'burst' },
  { id: 'hold-three', name: 'Three-second hold', score: 'Closest to 3.0 seconds wins', instruction: 'Hold for 3 seconds, then let go', control: 'hold', visual: 'timer' },
  { id: 'green-zone', name: 'Green zone', score: 'Aim for the middle of the green zone', instruction: 'Hold, then release in the green zone', control: 'hold', visual: 'bar' },
  { id: 'shake-pepper', name: 'Pepper shaker', score: 'Six quick shakes or taps score best', instruction: 'Shake or tap the pepper', control: 'shake', visual: 'pepper' },
  { id: 'level-picture', name: 'Crooked picture', score: 'Keep it level for a moment', instruction: 'Tilt or drag until the picture is level', control: 'tilt', visual: 'picture' },
  { id: 'trace-crack', name: 'Cracker trail', score: 'Touch all four corners in one stroke', instruction: 'Trace the zigzag', control: 'trace', visual: 'crack' },
  { id: 'follow-arrow', name: 'Follow the arrow', score: 'Match the TV arrow quickly', instruction: 'Swipe where the arrow points', control: 'swipe', visual: 'arrow' },
  { id: 'cheese-wheel', name: 'Cheese wheel', score: 'Aim for the middle of the cheese', instruction: 'Stop the wheel on cheese', control: 'stop', visual: 'wheel' },
  { id: 'count-mice', name: 'Count the mice', score: 'Pick the correct number quickly', instruction: 'Count the TV mice, then tap the number', control: 'number', visual: 'mice' },
  { id: 'lala-lookout', name: 'Lala lookout', score: 'Five safe taps score best', instruction: 'Tap only when Lala looks away', control: 'tap', visual: 'lookout' },
  { id: 'odd-snack', name: 'Odd one out', score: 'Pick the correct square quickly', instruction: 'Tap the number of the odd snack', control: 'choice', visual: 'snacks' },
]);

export const PREVIEW_MS = 4500;
export const SHORT_MS = 2000;
export const INTRO_MS = 3500;
export const INTRO = '12 tiny challenges. 5 seconds each. Fastest and most accurate climb the stack.';
export const PLAY_MS = 5000;
export const GRACE_MS = 250;
export const SLOT_MS = PREVIEW_MS + PLAY_MS + GRACE_MS + 2250;
export const END_PLAY_MS = PREVIEW_MS + PLAY_MS;
export const REVEAL_MS = END_PLAY_MS + GRACE_MS;

export const ARROWS = ['↑', '→', '↓', '←'];
export const TRACE = [[12, 23], [34, 71], [57, 29], [80, 76]];
export const GREEN_CENTRE = 72;
export const PICTURE_ANGLE = [62, -62, 75, -75];
export const EXACT_TAP_TARGET = 7;
export const LALA_TAPS = 5;
export const PEPPER_TAPS = 6;
export const QUICK_TAP_TARGET = 32;

export const greenHalfWidth = (difficulty = 0) => 12 - difficulty;
export const cheeseHalfWidth = (difficulty = 0) => 14 - difficulty * 2;

export function slotPhase(elapsed) {
  if (elapsed < 0) return 'intro';
  if (elapsed < PREVIEW_MS) return 'preview';
  if (elapsed < END_PLAY_MS) return 'play';
  if (elapsed < REVEAL_MS) return 'check';
  return 'score';
}

export function greenPosition(ms, variant) {
  const cycle = (Math.max(0, ms) * (1 + variant / 16) + 280) % 2200;
  return 100 * (1 - Math.abs(cycle / 1100 - 1));
}

export function cheeseAngle(ms, variant) {
  return (84 + variant * 61 + Math.max(0, ms) * (0.16 + variant * 0.008)) % 360;
}

export function lalaLooks(ms, variant, difficulty = 0) {
  return (Math.max(0, ms) + variant * 185) % 1650 < 650 + difficulty * 50;
}

// Coordinates are percentages of the example control. Examples use a fixed
// variant so a demonstration never gives away the upcoming TV answer.
export function exampleGesture(visual, elapsed, reduced) {
  const ms = reduced ? [0, 1500, 3150][Math.min(2, Math.floor(Math.max(0, elapsed) / 1500))] : Math.max(0, elapsed);
  let x = 50;
  let y = 55;
  let angle = 0;
  let caption = 'Tap';
  let time = ms;
  const tap = Math.abs(Math.sin(ms * Math.PI / 410));
  switch (visual) {
    case 'crack': {
      const progress = Math.min(3, ms / 1000);
      const index = Math.min(2, Math.floor(progress));
      const part = progress - index;
      x = TRACE[index][0] + (TRACE[index + 1][0] - TRACE[index][0]) * part;
      y = TRACE[index][1] + (TRACE[index + 1][1] - TRACE[index][1]) * part;
      caption = 'One stroke';
      time = progress * 500;
      break;
    }
    case 'arrow':
      y = 78 - 55 * Math.min(1, ms / 1700);
      caption = 'Swipe up';
      break;
    case 'picture':
      angle = 18 * (1 - Math.min(1, ms / 2200));
      x -= 20 * (1 - angle / 18);
      caption = 'Level';
      break;
    case 'pepper':
      angle = 9 * Math.sin(ms / 110);
      caption = 'Shake or tap';
      break;
    case 'timer':
      time = Math.min(ms, 3000);
      y += ms >= 3000 ? 13 : 0;
      caption = ms >= 3000 ? 'Release' : 'Hold';
      break;
    case 'bar':
      time = Math.min(ms / 3, 512);
      caption = time >= 512 ? 'Release' : 'Hold';
      break;
    case 'wheel':
      time = Math.min(ms, 1725);
      caption = time >= 1725 ? 'Stop!' : 'Wait';
      break;
    case 'mice':
      x = 25;
      y = 16;
      caption = 'Tap 3';
      break;
    case 'snacks':
      x = 25;
      y = 25;
      caption = 'Tap 1';
      break;
    case 'lookout':
      caption = lalaLooks(ms, 0) ? 'Wait' : 'Tap';
      y += caption === 'Tap' ? tap * 9 : 15;
      break;
    case 'seven':
      time = Math.min(6, Math.floor(ms / 410)) * 160;
      caption = String(Math.min(7, 1 + Math.floor(ms / 410))) + ' / 7';
      y += ms < 2870 ? tap * 10 : 12;
      break;
    case 'burst':
      y += Math.abs(Math.sin(ms / 100)) * 10;
      caption = 'Keep tapping';
      break;
  }
  return { x, y, angle, time, caption };
}
