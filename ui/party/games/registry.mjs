import { mountTapRaceTv } from './tap-race/tv.mjs';
import { mountTapRacePhone } from './tap-race/phone.mjs';

const views = new Map([
  ['tap-race', { mountTv: mountTapRaceTv, mountPhone: mountTapRacePhone }],
]);

export function partyGameView(id) {
  return views.get(id);
}
