import * as sofa from '../game/engine.mjs';
import { engine as oddLaws } from './odd-laws-society/engine.mjs';
import { SOFA_GAME_ID, ODD_LAWS_GAME_ID, getGame } from './catalog.mjs';

/** Room infrastructure is shared; each playable game supplies its own rule engine. */
const engines = new Map([[SOFA_GAME_ID, Object.freeze({
  playerIds: sofa.PLAYER_IDS,
  create: options => sofa.createGame({ ...options, maxRounds: 10 }),
  apply: sofa.applyAction,
})], [ODD_LAWS_GAME_ID, oddLaws]]);

export function getGameEngine(id = SOFA_GAME_ID) {
  return getGame(id)?.status === 'playable' ? engines.get(id) || null : null;
}
