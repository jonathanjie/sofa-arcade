import { mountDustBunnyTv } from './dust-bunny-sumo/tv.mjs';
import { mountDustBunnyPhone } from './dust-bunny-sumo/phone.mjs';
import { mountTapRaceTv } from './tap-race/tv.mjs';
import { mountTapRacePhone } from './tap-race/phone.mjs';
import { mountWallOfPaddlesTv } from './wall-of-paddles/tv.mjs';
import { mountWallOfPaddlesPhone } from './wall-of-paddles/phone.mjs';

import { mountDontWakeLalaTv } from './dont-wake-lala/tv.mjs';
import { mountDontWakeLalaPhone } from './dont-wake-lala/phone.mjs';
import { mountTugOfYarnPhone } from './tug-of-yarn/phone.mjs';
import { mountTugOfYarnTv, tugResultSummary } from './tug-of-yarn/tv.mjs';
import { mountSnackStackTv } from './snack-stack/tv.mjs';
import { mountSnackStackPhone } from './snack-stack/phone.mjs';
import { mountWhiteoutTv, whiteoutPlayHintForMode, whiteoutResultSummary } from './whiteout-drift/tv.mjs';
import { mountWhiteoutPhone } from './whiteout-drift/phone.mjs';

import { mountTv, resultSummary } from './wobble-tower/tv.mjs';
import { mountPhone } from './wobble-tower/phone.mjs';

const views = new Map([
  ['wobble-tower', { mountTv, mountPhone, resultSummary, playHint: 'Tap when the plank lines up with the tower.' }],
  ['dont-wake-lala', { mountTv: mountDontWakeLalaTv, mountPhone: mountDontWakeLalaPhone }],
  ['dust-bunny-sumo', { mountTv: mountDustBunnyTv, mountPhone: mountDustBunnyPhone }],
  ['tap-race', { mountTv: mountTapRaceTv, mountPhone: mountTapRacePhone }],
  ['wall-of-paddles', { mountTv: mountWallOfPaddlesTv, mountPhone: mountWallOfPaddlesPhone }],
  ['tug-of-yarn', {
    mountTv: mountTugOfYarnTv, mountPhone: mountTugOfYarnPhone, roundName: 'match', showRoundTimer: false,
    playHint: 'Tap on the beat. Pull the knot past your line.', resultSummary: tugResultSummary,
  }],
  ['snack-stack', { mountTv: mountSnackStackTv, mountPhone: mountSnackStackPhone }],
  ['whiteout-drift', {
    mountTv: mountWhiteoutTv,
    mountPhone: mountWhiteoutPhone,
    playHint: whiteoutPlayHintForMode('getaway'),
    playHintForMode: whiteoutPlayHintForMode,
    resultSummary: whiteoutResultSummary,
  }],
]);

export function partyGameView(id) {
  return views.get(id);
}
