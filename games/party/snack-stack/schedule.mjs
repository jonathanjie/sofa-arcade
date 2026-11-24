import { PLAY_MS, PREVIEW_MS, SLOT_MS } from '../../../ui/party/games/snack-stack/cards.mjs';
import exactSeven from './challenges/exact-seven.mjs';
import quickTaps from './challenges/quick-taps.mjs';
import holdThree from './challenges/hold-three.mjs';
import greenZone from './challenges/green-zone.mjs';
import shakePepper from './challenges/shake-pepper.mjs';
import levelPicture from './challenges/level-picture.mjs';
import traceCrack from './challenges/trace-crack.mjs';
import followArrow from './challenges/follow-arrow.mjs';
import cheeseWheel from './challenges/cheese-wheel.mjs';
import countMice from './challenges/count-mice.mjs';
import lalaLookout from './challenges/lala-lookout.mjs';
import oddSnack from './challenges/odd-snack.mjs';

export { PLAY_MS, PREVIEW_MS, SLOT_MS };
export const CHALLENGES = Object.freeze([
  exactSeven, quickTaps, holdThree, greenZone, shakePepper, levelPicture,
  traceCrack, followArrow, cheeseWheel, countMice, lalaLookout, oddSnack,
]);

export function makeSchedule(seed) {
  let hash = 2166136261;
  for (const letter of String(seed)) hash = Math.imul(hash ^ letter.codePointAt(0), 16777619);
  let random = (hash >>> 0) || 1;
  function pick(size) {
    random ^= random << 13;
    random ^= random >>> 17;
    random ^= random << 5;
    return (random >>> 0) % size;
  }
  const slots = CHALLENGES.map(({ variants = 1 }, card) => ({ card, variant: pick(variants) }));
  for (let index = slots.length - 1; index > 0; index--) {
    const other = pick(index + 1);
    [slots[index], slots[other]] = [slots[other], slots[index]];
  }
  return slots;
}
