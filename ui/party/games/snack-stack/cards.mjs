// Shared cues and timing geometry. The host keeps scores and answers private.
export const CARDS = Object.freeze([
  { id: 'exact-seven', instruction: 'Tap exactly 7 times', control: 'tap', visual: 'seven' },
  { id: 'quick-taps', instruction: 'Tap as fast as you can', control: 'tap', visual: 'burst' },
  { id: 'hold-three', instruction: 'Hold for exactly 3 seconds', control: 'hold', visual: 'timer' },
  { id: 'green-zone', instruction: 'Release in the green zone', control: 'hold', visual: 'bar' },
  { id: 'shake-pepper', instruction: 'Shake or tap the pepper', control: 'shake', visual: 'pepper' },
  { id: 'level-picture', instruction: 'Make the picture hang level', control: 'tilt', visual: 'picture' },
  { id: 'trace-crack', instruction: 'Trace the zigzag', control: 'trace', visual: 'crack' },
  { id: 'follow-arrow', instruction: 'Swipe where the arrow points', control: 'swipe', visual: 'arrow' },
  { id: 'cheese-wheel', instruction: 'Stop the wheel on cheese', control: 'stop', visual: 'wheel' },
  { id: 'count-mice', instruction: 'Count the mice', control: 'number', visual: 'mice' },
  { id: 'lala-lookout', instruction: 'Tap only when Lala looks away', control: 'tap', visual: 'lookout' },
  { id: 'odd-snack', instruction: 'Pick the odd snack', control: 'choice', visual: 'snacks' },
]);

export const PREVIEW_MS = 1500;
export const PLAY_MS = 5000;
export const GRACE_MS = 250;
export const SLOT_MS = 9000;
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
