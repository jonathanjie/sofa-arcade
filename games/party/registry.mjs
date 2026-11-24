import { dontWakeLala } from './dont-wake-lala/rules.mjs';
import { dustBunnySumo } from './dust-bunny-sumo/rules.mjs';
import { tapRace } from './tap-race.mjs';
import { tugOfYarn } from './tug-of-yarn/game.mjs';
import { wallOfPaddles } from './wall-of-paddles/round.mjs';

export const PARTY_GAMES = Object.freeze([tapRace, dontWakeLala, dustBunnySumo, wallOfPaddles, tugOfYarn]);

export function getPartyGame(id) {
  return PARTY_GAMES.find(game => game.id === id) ?? null;
}
