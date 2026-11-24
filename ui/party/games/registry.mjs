import { mountTapRaceTv } from './tap-race/tv.mjs';
import { mountTapRacePhone } from './tap-race/phone.mjs';
import { mountSnackStackTv } from './snack-stack/tv.mjs';
import { mountSnackStackPhone } from './snack-stack/phone.mjs';

const views = new Map([
  ['tap-race', { mountTv: mountTapRaceTv, mountPhone: mountTapRacePhone }],
  ['snack-stack', { mountTv: mountSnackStackTv, mountPhone: mountSnackStackPhone }],
]);

export function partyGameView(id) {
  return views.get(id);
}
