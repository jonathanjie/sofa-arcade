import { balloonBop } from './balloon-bop/rules.mjs';
import { dontWakeLala } from './dont-wake-lala/rules.mjs';
import { dustBunnySumo } from './dust-bunny-sumo/rules.mjs';
import { headHop } from './head-hop/rules.mjs';
import { paperSkies } from './paper-skies/rules.mjs';
import { snackStack } from './snack-stack/game.mjs';
import { tapRace } from './tap-race.mjs';
import { timberRush } from './timber-rush/rules.mjs';
import { tugOfYarn } from './tug-of-yarn/game.mjs';
import { wallOfPaddles } from './wall-of-paddles/round.mjs';
import { whiteoutDrift } from './whiteout-drift/rules.mjs';

export const PARTY_GAMES = Object.freeze([
  tapRace,
  dontWakeLala,
  dustBunnySumo,
  wallOfPaddles,
  tugOfYarn,
  snackStack,
  whiteoutDrift,
  balloonBop,
  timberRush,
  headHop,
  paperSkies,
]);

export function getPartyGame(id) {
  return PARTY_GAMES.find(game => game.id === id) ?? null;
}
