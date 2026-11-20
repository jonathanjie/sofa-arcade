import { createGame } from '../../../game/engine.mjs';

/** Persisted-room compatibility fixture, never a browser asset or production setup. */
export function legacySofaState(version) {
  if (![1, 2].includes(version)) throw new Error('Choose a historical Sofa rules version.');
  const state = createGame({ seed: `ws6-legacy-v${version}`, firstPlayer: 'jon', maxRounds: 1 });
  state.version = version;
  delete state.firstPlayer;
  for (const player of Object.values(state.players)) {
    delete player.openingBonus;
    if (version === 1) delete player.bonusPoints;
  }
  Object.assign(state.players.jon, { carried: 5, lures: 1 });
  state.players.lydia.banked = 6;
  state.forecast = { type: 'swipe', axis: 'row', index: 2, direction: 1 };
  return state;
}
