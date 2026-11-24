import { mountDustBunnyTv } from './dust-bunny-sumo/tv.mjs';
import { mountDustBunnyPhone } from './dust-bunny-sumo/phone.mjs';
import { mountTapRaceTv } from './tap-race/tv.mjs';
import { mountTapRacePhone } from './tap-race/phone.mjs';
import { mountWallOfPaddlesTv } from './wall-of-paddles/tv.mjs';
import { mountWallOfPaddlesPhone } from './wall-of-paddles/phone.mjs';

import { mountDontWakeLalaTv } from './dont-wake-lala/tv.mjs';
import { mountDontWakeLalaPhone } from './dont-wake-lala/phone.mjs';

const views = new Map([
  ['dont-wake-lala', { mountTv: mountDontWakeLalaTv, mountPhone: mountDontWakeLalaPhone }],
  ['dust-bunny-sumo', { mountTv: mountDustBunnyTv, mountPhone: mountDustBunnyPhone }],
  ['tap-race', { mountTv: mountTapRaceTv, mountPhone: mountTapRacePhone }],
  ['wall-of-paddles', { mountTv: mountWallOfPaddlesTv, mountPhone: mountWallOfPaddlesPhone }],
]);

export function partyGameView(id) {
  return views.get(id);
}
