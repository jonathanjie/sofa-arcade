import { mountDustBunnyTv } from './dust-bunny-sumo/tv.mjs';
import { mountDustBunnyPhone } from './dust-bunny-sumo/phone.mjs';
import { mountTapRaceTv } from './tap-race/tv.mjs';
import { mountTapRacePhone } from './tap-race/phone.mjs';

const views = new Map([
  ['dust-bunny-sumo', { mountTv: mountDustBunnyTv, mountPhone: mountDustBunnyPhone }],
  ['tap-race', { mountTv: mountTapRaceTv, mountPhone: mountTapRacePhone }],
]);

export function partyGameView(id) {
  return views.get(id);
}
