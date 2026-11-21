/**
 * Seat-mirrored Sofa Kingdoms balance sweep.
 *
 *   node game/simulation/sweep.mjs --rules 4 --rounds 10 --seeds 100 [--no-toys]
 *
 * Every seed is played twice, once with each player starting. The board is
 * point-symmetric and the bot never reads player names, so the two games of a
 * seed differ only in who starts. Results are diagnostics, not human balance.
 */
import { fileURLToPath } from 'node:url';
import { applyAction, createGame, scoreFor } from '../engine.mjs';
import { chooseTurn, POLICY_VERSION } from './policy.mjs';

const CENTRE = { min: 1, max: 3 };
const inCentre = player => player.row >= CENTRE.min && player.row <= CENTRE.max
  && player.col >= CENTRE.min && player.col <= CENTRE.max;

export function playMatch({ seed, rulesVersion, maxRounds, firstPlayer, useToys = true }) {
  let state = createGame({ seed, rulesVersion, maxRounds, firstPlayer });
  const second = firstPlayer === 'jon' ? 'lydia' : 'jon';
  const stats = { sharedCentreRounds: new Set(), pounceCatches: 0, swipeToys: 0, pounceToys: 0, fullBags: 0 };
  while (state.phase === 'playing') {
    const me = state.activePlayer;
    const round = state.round;
    for (const action of chooseTurn(state, { useToys })) {
      if (action.type === 'lure') stats[state.forecast.type === 'pounce' ? 'pounceToys' : 'swipeToys']++;
      const before = state.players[me].bonusPoints || 0;
      state = applyAction(state, me, action);
      if ((state.players[me].bonusPoints || 0) > before) stats.fullBags++;
      if (state.activePlayer !== me || state.phase !== 'playing') break;
    }
    if (state.activePlayer === me && state.phase === 'playing' && state.round === round) {
      state = applyAction(state, me, { type: 'end' });
    }
    if (state.lastEvent?.round === round && state.lastEvent.type === 'pounce') {
      stats.pounceCatches += state.lastEvent.caught.length;
    }
    // Both players in the centre after a turn counts that round once.
    if (inCentre(state.players.jon) && inCentre(state.players.lydia)) stats.sharedCentreRounds.add(round);
  }
  const crumbsLeft = state.tiles.reduce((sum, tile) => sum + tile.crumbs, 0)
    + state.players.jon.carried + state.players.lydia.carried;
  return {
    starterScore: scoreFor(state.players[firstPlayer]),
    secondScore: scoreFor(state.players[second]),
    secondOpeningBonus: state.players[second].openingBonus || 0,
    crumbsLeft,
    sharedCentreRounds: stats.sharedCentreRounds.size,
    pounceCatches: stats.pounceCatches,
    swipeToys: stats.swipeToys,
    pounceToys: stats.pounceToys,
    fullBags: stats.fullBags,
  };
}

function outcome(starter, second) {
  return starter > second ? 'starter' : starter < second ? 'second' : 'tie';
}

export function runSweep({ rulesVersion = 4, maxRounds = 10, seeds = 100, useToys = true } = {}) {
  const games = [];
  for (let index = 0; index < seeds; index++) {
    for (const firstPlayer of ['jon', 'lydia']) {
      games.push(playMatch({ seed: `sk-sweep-${index}`, rulesVersion, maxRounds, firstPlayer, useToys }));
    }
  }
  const count = (list, key) => list.filter(item => item === key).length;
  const mean = values => Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
  const results = games.map(game => outcome(game.starterScore, game.secondScore));
  const withoutOpening = games.map(game => outcome(game.starterScore, game.secondScore - game.secondOpeningBonus));
  const decided = list => count(list, 'starter') + count(list, 'second');
  const starterShare = list => (decided(list) ? Number((count(list, 'starter') / decided(list)).toFixed(3)) : null);
  return {
    policyVersion: POLICY_VERSION, rulesVersion, maxRounds, useToys, games: games.length,
    result: { starter: count(results, 'starter'), second: count(results, 'second'), tie: count(results, 'tie'), starterShareOfDecided: starterShare(results) },
    withoutOpeningPoint: { starter: count(withoutOpening, 'starter'), second: count(withoutOpening, 'second'), tie: count(withoutOpening, 'tie'), starterShareOfDecided: starterShare(withoutOpening) },
    meanScore: mean(games.flatMap(game => [game.starterScore, game.secondScore])),
    scoreRange: [Math.min(...games.flatMap(game => [game.starterScore, game.secondScore])), Math.max(...games.flatMap(game => [game.starterScore, game.secondScore]))],
    meanMargin: mean(games.map(game => Math.abs(game.starterScore - game.secondScore))),
    meanCrumbsLeft: mean(games.map(game => game.crumbsLeft)),
    meanSharedCentreRounds: mean(games.map(game => game.sharedCentreRounds)),
    meanPounceCatches: mean(games.map(game => game.pounceCatches)),
    meanSwipeToys: mean(games.map(game => game.swipeToys)),
    meanPounceToys: mean(games.map(game => game.pounceToys)),
    meanFullBags: mean(games.map(game => game.fullBags)),
  };
}

function readOption(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : Number(process.argv[index + 1]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = runSweep({
    rulesVersion: readOption('rules', 4),
    maxRounds: readOption('rounds', 10),
    seeds: readOption('seeds', 100),
    useToys: !process.argv.includes('--no-toys'),
  });
  console.log(JSON.stringify(report));
}
