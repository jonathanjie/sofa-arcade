import { tapRace } from './tap-race.mjs';
import { snackStack } from './snack-stack/game.mjs';

export const PARTY_GAMES = Object.freeze([tapRace, snackStack]);

export function getPartyGame(id) {
  return PARTY_GAMES.find(game => game.id === id) ?? null;
}
