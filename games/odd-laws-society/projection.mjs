/** Authority-only projection. Never serve this module or full-state fixtures. */
import { RuleError } from './errors.mjs';
import { scoreBreakdown } from './preview.mjs';

const playerIds = ['jon', 'lydia'];

function assertViewer(viewer) {
  if (!viewer || typeof viewer !== 'object' || Array.isArray(viewer)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(viewer))) {
    throw new RuleError('INVALID_VIEWER', 'A valid authenticated viewer is required.');
  }
  const descriptors = Object.getOwnPropertyDescriptors(viewer);
  const keys = Reflect.ownKeys(viewer);
  if (keys.some(key => typeof key !== 'string' || !descriptors[key].enumerable || !('value' in descriptors[key]))) {
    throw new RuleError('INVALID_VIEWER', 'A valid authenticated viewer is required.');
  }
  const role = viewer.role;
  const expected = role === 'player' ? ['role', 'playerId'] : ['role'];
  if (!['public', 'host', 'player'].includes(role)
      || keys.length !== expected.length || keys.some(key => !expected.includes(key))
      || (role === 'player' && !playerIds.includes(viewer.playerId))) {
    throw new RuleError('INVALID_VIEWER', 'A valid authenticated viewer is required.');
  }
}

function commitmentView(commitment) {
  return commitment ? { choiceId: commitment.choiceId, bid: commitment.bid } : null;
}

/**
 * v0.3 reserves are private: only their owner sees the designs. Everyone sees
 * the count. The TV (host or public viewer) sees no designs.
 */
function reserveView(state, playerId, viewer) {
  if (state.rulesVersion !== '0.3') return {};
  const reserve = state.players[playerId].reserve;
  const own = viewer.role === 'player' && viewer.playerId === playerId;
  return { reserve: own ? reserve.map(designId => designId) : null, reserveCount: reserve.length };
}

function playerView(state, playerId, viewer) {
  const player = state.players[playerId];
  return {
    ...reserveView(state, playerId, viewer),
    coins: player.coins,
    // The fixed pre-council budget is also the public balance until atomic reveal.
    influence: state.stage === 'council' ? state.council.budgets[playerId] : player.influence,
    city: player.city.map(instance => instance ? { instanceId: instance.instanceId, designId: instance.designId } : null),
    streetEvaluated: player.streetEvaluated.map(evaluated => evaluated),
    buildsThisSession: player.buildsThisSession,
    festivalUsed: player.festivalUsed,
    score: scoreBreakdown(state, playerId),
  };
}

/**
 * viewer must be constructed by the authenticated room layer, never request input.
 * Every nested object is rebuilt from an allowlist; pending choices have one exit.
 */
export function project(state, viewer) {
  assertViewer(viewer);
  const pending = state.stage === 'council' ? state.council : null;
  const previous = state.lastCouncil;
  const revealed = previous && (
    previous.session < state.session
    || (previous.session === state.session && state.stage !== 'council')
  ) ? previous : null;
  return {
    schemaVersion: state.schemaVersion,
    gameId: state.gameId,
    rulesVersion: state.rulesVersion,
    matchId: state.matchId,
    phase: state.phase,
    stage: state.stage,
    phaseId: state.phaseId,
    session: state.session,
    term: state.term,
    chair: state.chair,
    chairSchedule: state.chairSchedule.map(playerId => playerId),
    activePlayer: state.activePlayer,
    actionIndex: state.actionIndex,
    actionsRemaining: { jon: state.actionsRemaining.jon, lydia: state.actionsRemaining.lydia },
    activeLaws: { economy: state.activeLaws.economy, civic: state.activeLaws.civic },
    agenda: state.agenda.map(item => ({ session: item.session, category: item.category, lawIds: item.lawIds.map(id => id) })),
    council: pending ? {
      category: pending.category,
      optionIds: pending.optionIds.map(id => id),
      ready: { jon: pending.commitments.jon !== null, lydia: pending.commitments.lydia !== null },
      ownCommitment: viewer.role === 'player' ? commitmentView(pending.commitments[viewer.playerId]) : null,
    } : null,
    market: state.market.map(stack => ({ designId: stack.designId, remaining: stack.remaining })),
    // v0.3: the deck order is hidden; only its size is public.
    ...(state.rulesVersion === '0.3' ? { deckCount: state.deck.length } : {}),
    players: { jon: playerView(state, 'jon', viewer), lydia: playerView(state, 'lydia', viewer) },
    lastCouncil: revealed ? {
      session: revealed.session,
      phaseId: revealed.phaseId,
      choices: { jon: commitmentView(revealed.choices.jon), lydia: commitmentView(revealed.choices.lydia) },
      adoptedLawId: revealed.adoptedLawId,
      category: revealed.category,
      ...(revealed.paid ? { paid: { jon: revealed.paid.jon, lydia: revealed.paid.lydia } } : {}),
    } : null,
    result: state.result ? {
      winner: state.result.winner,
      scores: { jon: state.result.scores.jon, lydia: state.result.scores.lydia },
    } : null,
  };
}
