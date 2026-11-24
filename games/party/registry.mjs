import { tapRace } from './tap-race.mjs';

export const PARTY_GAMES = Object.freeze([tapRace]);

export function getPartyGame(id) {
  return PARTY_GAMES.find(game => game.id === id) ?? null;
}
