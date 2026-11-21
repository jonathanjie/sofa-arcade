/**
 * A deterministic Sofa Kingdoms bot for balance sweeps. It is not an optimal
 * player and does not model people; it exists to find gross rule problems.
 *
 * Each turn it tries every sequence of up to two legal actions, including toys,
 * and scores the position after this round's Lala event:
 *   10 × (my score − opponent score) + (my trip value − opponent trip value).
 * A trip value estimates the next collect-and-bank trip each player can finish.
 * The score is the average of two views: after this round's Lala event, and
 * after the following event too (if nobody moved). The second view lets the bot
 * value rules v4 toys, which change the next round's event.
 *
 * Under rules v4 the bot searches from its own projected view, so it never sees
 * the opponent's sealed toy. A v4 toy costs no action, so the bot chooses "no
 * toy" or one toy, and then its two actions.
 */
import {
  applyAction, legalActions, previewForecast, projectState, scoreFor, upcomingForecasts, BAG_CAPACITY, FULL_BAG_BONUS,
} from '../engine.mjs';

export const POLICY_VERSION = 'trip-planner-3';

const POINT_WEIGHT = 10;
// Value of one action, used to compare short and long trips. About 10 points
// over 20 actions is a strong solo route, so one action is worth about half a
// point (5 on the ×10 scale). A lower value lets the bot accept longer trips.
const ACTION_COST = 3;
// The trip planner looks at the nearest few crumb tiles only, to stay fast.
const TILES_CONSIDERED = 8;
const STOPS_PER_TRIP = 3;

const other = id => (id === 'jon' ? 'lydia' : 'jon');
const distance = (a, b) => Math.abs(a.row - b.row) + Math.abs(a.col - b.col);

/**
 * Returns the board after this round's Lala event. If the event already ran
 * (the second mover just finished, or the game ended), the state is returned
 * unchanged. Every candidate is judged at this same moment, so the first and
 * second mover use the same view. The earlier bot let the second mover also
 * preview the next round's event, which skewed results by turn order.
 */
function afterLala(state, decisionRound) {
  if (state.phase !== 'playing' || state.round > decisionRound) return state;
  const preview = previewForecast(state);
  const players = structuredClone(state.players);
  for (const id of Object.keys(players)) {
    Object.assign(players[id], preview.players[id]);
    if (preview.caught.includes(id)) players[id].carried = 0;
  }
  return { ...state, tiles: preview.tiles, players };
}

/** Best value of one collect-and-bank trip that fits in the actions left. */
export function tripValue(player, tiles, actionsLeft, fullBagBonus = true) {
  const home = player.home;
  let best = 0;
  if (player.carried > 0) {
    const cost = distance(player, home) + 1;
    if (cost <= actionsLeft) best = bankValue(player.carried, fullBagBonus) - cost * ACTION_COST;
  }
  if (player.carried >= BAG_CAPACITY) return best;
  const candidates = tiles
    .filter(tile => tile.crumbs > 0)
    .sort((a, b) => distance(player, a) - distance(player, b) || a.row - b.row || a.col - b.col)
    .slice(0, TILES_CONSIDERED);

  const search = (position, carried, used, visited, depth) => {
    for (const tile of candidates) {
      if (visited.includes(tile)) continue;
      const collected = Math.min(tile.crumbs, BAG_CAPACITY - carried);
      const reachCost = used + distance(position, tile) + 1;
      const totalCost = reachCost + distance(tile, home) + 1;
      if (totalCost > actionsLeft) continue;
      const nowCarried = carried + collected;
      best = Math.max(best, bankValue(nowCarried, fullBagBonus) - totalCost * ACTION_COST);
      if (depth + 1 < STOPS_PER_TRIP && nowCarried < BAG_CAPACITY) {
        search(tile, nowCarried, reachCost, [...visited, tile], depth + 1);
      }
    }
  };
  search(player, player.carried, 0, [], 0);
  return best;
}

function bankValue(crumbs, fullBagBonus) {
  const bonus = fullBagBonus && crumbs === BAG_CAPACITY ? FULL_BAG_BONUS : 0;
  return (crumbs + bonus) * POINT_WEIGHT;
}

/** The board after the event that follows this round's event, if nobody moves. */
function afterFollowingEvent(state, view, decisionRound) {
  if (view.phase !== 'playing') return view;
  const resolved = state.round > decisionRound;
  let following = resolved ? state.forecast : upcomingForecasts(state, 1)[0];
  if (!following) return view;
  // Before the reveal, the bot still knows its own sealed toy.
  const ownToy = !resolved && state.sealedToys?.[state.decidingPlayer];
  if (ownToy) following = { ...following, ...ownToy };
  const preview = previewForecast({ ...view, forecast: following });
  const players = structuredClone(view.players);
  for (const id of Object.keys(players)) {
    Object.assign(players[id], preview.players[id]);
    if (preview.caught.includes(id)) players[id].carried = 0;
  }
  return { ...view, tiles: preview.tiles, players };
}

function evaluate(state, me, decisionRound, actionsLeft) {
  const now = afterLala(state, decisionRound);
  return (positionValue(now, me, actionsLeft) + positionValue(afterFollowingEvent(state, now, decisionRound), me, actionsLeft)) / 2;
}

function positionValue(view, me, actionsLeft) {
  const opponent = other(me);
  const scoreGap = scoreFor(view.players[me]) - scoreFor(view.players[opponent]);
  if (view.phase === 'finished') return scoreGap * POINT_WEIGHT;
  const fullBagBonus = view.version >= 2;
  return scoreGap * POINT_WEIGHT
    + tripValue(view.players[me], view.tiles, actionsLeft[me], fullBagBonus)
    - tripValue(view.players[opponent], view.tiles, actionsLeft[opponent], fullBagBonus);
}

/**
 * Returns the action sequence (one or two actions) for the active player.
 * `useToys: false` removes toy actions, to measure what toys contribute.
 */
export function chooseTurn(trueState, { useToys = true } = {}) {
  const me = trueState.activePlayer;
  // Search only what this player may know. decidingPlayer lets the evaluation
  // find this player's own sealed toy.
  const state = { ...projectState(trueState, me), decidingPlayer: me };
  const decisionRound = state.round;
  const roundsAfterThis = state.maxRounds - state.round;
  // The opponent still acts this round when I move first.
  const actionsLeft = {
    [me]: roundsAfterThis * 2,
    [other(me)]: (roundsAfterThis + (state.turnInRound === 0 ? 1 : 0)) * 2,
  };
  let best = null;
  const consider = (sequence, result) => {
    const finished = result.activePlayer === me && result.phase === 'playing'
      ? applyAction(result, me, { type: 'end' })
      : result;
    const value = evaluate(finished, me, decisionRound, actionsLeft);
    if (!best || value > best.value) best = { value, sequence };
  };
  const sealedToys = state.version >= 4;
  const isToy = action => action.type === 'lure';
  const options = current => legalActions(current, me)
    .filter(action => (useToys && !sealedToys) || !isToy(action));
  const toyChoices = useToys && sealedToys ? [null, ...legalActions(state, me).filter(isToy)] : [null];
  for (const toy of toyChoices) {
    const start = toy ? { ...applyAction(state, me, toy), decidingPlayer: me } : state;
    const prefix = toy ? [toy] : [];
    for (const first of options(start)) {
      const afterFirst = { ...applyAction(start, me, first), decidingPlayer: me };
      if (afterFirst.activePlayer !== me || afterFirst.phase !== 'playing') {
        consider([...prefix, first], afterFirst);
        continue;
      }
      for (const second of options(afterFirst)) {
        consider([...prefix, first, second], { ...applyAction(afterFirst, me, second), decidingPlayer: me });
      }
    }
  }
  return best.sequence;
}
