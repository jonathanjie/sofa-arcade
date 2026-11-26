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

import { mountPhone as balloonPhone } from './balloon-bop/phone.mjs';
import { mountTv as balloonTv, resultSummary as balloonResultSummary } from './balloon-bop/tv.mjs';

import { mountTv as wobbleMountTv, resultSummary as wobbleResultSummary } from './wobble-tower/tv.mjs';
import { mountPhone as wobbleMountPhone } from './wobble-tower/phone.mjs';

import { mountTimberTv } from './timber-rush/tv.mjs';
import { mountTimberPhone } from './timber-rush/phone.mjs';

import { mountTv as hopTv, instruction } from './head-hop/tv.mjs';
import { mountPhone as hopPhone } from './head-hop/phone.mjs';

const views = new Map([
  ['head-hop', { mountTv: hopTv, mountPhone: hopPhone, playHint: instruction }],
  ['timber-rush', { mountTv: mountTimberTv, mountPhone: mountTimberPhone, playHint: 'Tap the side clear of the lowest branch.' }],
  ['wobble-tower', { mountTv: wobbleMountTv, mountPhone: wobbleMountPhone, resultSummary: wobbleResultSummary, playHint: 'Tap when the plank lines up with the tower.' }],
  ['balloon-bop', { mountPhone: balloonPhone, mountTv: balloonTv, resultSummary: balloonResultSummary, playHint: 'Tap a spot to hop there and bop the balloon.' }],
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
