import { tapRace } from './tap-race.mjs';
import { wallOfPaddles } from './wall-of-paddles/round.mjs';

export const PARTY_GAMES = Object.freeze([tapRace, wallOfPaddles]);

export function getPartyGame(id) {
  return PARTY_GAMES.find(game => game.id === id) ?? null;
}
