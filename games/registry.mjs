import * as sofa from '../game/engine.mjs';
import { engine as oddLaws } from './odd-laws-society/engine.mjs';
import { RuleError } from './odd-laws-society/errors.mjs';
import { SOFA_GAME_ID, ODD_LAWS_GAME_ID, getGame } from './catalog.mjs';

// The component engine uses typed uppercase codes; the room platform owns the
// fixed public messages for these lowercase codes. Never copy engine text or
// diagnostics into a translated error, and never guess at an unknown code.
const oddLawsRoomCodes = Object.freeze({
  INVALID_ACTION: 'invalid_action',
  INVALID_CHOICE: 'invalid_choice',
  INVALID_BID: 'invalid_bid',
  COUNCIL_ALREADY_COMMITTED: 'already_committed',
  NOT_YOUR_TURN: 'not_your_turn',
  INSUFFICIENT_COINS: 'insufficient_coins',
  NOT_AVAILABLE: 'no_stock',
  PLOT_OCCUPIED: 'plot_occupied',
  FESTIVAL_USED: 'festival_used',
  STALE_MATCH: 'stale_match',
  STALE_PHASE: 'stale_phase',
  GAME_FINISHED: 'game_finished',
  // Rules v0.3 Scout.
  RESERVE_FULL: 'reserve_full',
  INSUFFICIENT_INFLUENCE: 'insufficient_influence',
  DUPLICATE_DESIGN: 'duplicate_design',
  SCOUT_USED: 'scout_used',
});

function withRoomRuleCodes(method) {
  return (...args) => {
    try { return method(...args); }
    catch (error) {
      if (!(error instanceof RuleError) || !Object.hasOwn(oddLawsRoomCodes, error.code)) throw error;
      throw new RuleError(oddLawsRoomCodes[error.code], 'Choose a valid action for the current board.');
    }
  };
}

/** Server-only candidate seam. Exporting it does not enable a planned game. */
export const oddLawsRoomEngine = Object.freeze({
  ...oddLaws,
  normalizeAction: withRoomRuleCodes(oddLaws.normalizeAction),
  actionKey: withRoomRuleCodes(oddLaws.actionKey),
  apply: withRoomRuleCodes(oddLaws.apply),
});

/** Marker for the local realtime authority. No private simulation is browser/Worker wired. */
export const gravityOrchardRoomEngine = Object.freeze({
  playerIds: Object.freeze(['jon', 'lydia']), realtime: true,
});

/** Room infrastructure is shared; each playable game supplies its own rule engine. */
const engines = new Map([[SOFA_GAME_ID, Object.freeze({
  playerIds: sofa.PLAYER_IDS,
  create: options => sofa.createGame({ ...options, maxRounds: 10 }),
  apply: sofa.applyAction,
})], [ODD_LAWS_GAME_ID, oddLawsRoomEngine], ['gravity-orchard', gravityOrchardRoomEngine]]);

export function getGameEngine(id = SOFA_GAME_ID) {
  return getGame(id)?.status === 'playable' ? engines.get(id) || null : null;
}
