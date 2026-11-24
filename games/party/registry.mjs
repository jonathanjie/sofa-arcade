import { tapRace } from './tap-race.mjs';
import { tugOfYarn } from './tug-of-yarn/game.mjs';

export const PARTY_GAMES = Object.freeze([tapRace, tugOfYarn]);

export function getPartyGame(id) {
  return PARTY_GAMES.find(game => game.id === id) ?? null;
}
