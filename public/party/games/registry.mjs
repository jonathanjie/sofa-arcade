import { mountTapRaceTv } from './tap-race/tv.mjs';
import { mountTapRacePhone } from './tap-race/phone.mjs';
import { mountWallOfPaddlesTv } from './wall-of-paddles/tv.mjs';
import { mountWallOfPaddlesPhone } from './wall-of-paddles/phone.mjs';

import { mountDontWakeLalaTv } from './dont-wake-lala/tv.mjs';
import { mountDontWakeLalaPhone } from './dont-wake-lala/phone.mjs';

const views = new Map([
  ['dont-wake-lala', { mountTv: mountDontWakeLalaTv, mountPhone: mountDontWakeLalaPhone }],
  ['tap-race', { mountTv: mountTapRaceTv, mountPhone: mountTapRacePhone }],
  ['wall-of-paddles', { mountTv: mountWallOfPaddlesTv, mountPhone: mountWallOfPaddlesPhone }],
]);

export function partyGameView(id) {
  return views.get(id);
}
