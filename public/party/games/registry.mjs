import { mountTapRaceTv } from './tap-race/tv.mjs';
import { mountTapRacePhone } from './tap-race/phone.mjs';
import { mountTugOfYarnPhone } from './tug-of-yarn/phone.mjs';
import { mountTugOfYarnTv } from './tug-of-yarn/tv.mjs';

const views = new Map([
  ['tap-race', { mountTv: mountTapRaceTv, mountPhone: mountTapRacePhone }],
  ['tug-of-yarn', { mountTv: mountTugOfYarnTv, mountPhone: mountTugOfYarnPhone }],
]);

export function partyGameView(id) {
  return views.get(id);
}
