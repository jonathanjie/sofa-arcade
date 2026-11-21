#!/usr/bin/env node
/**
 * Compares rules v0.2 and v0.3 with the same harness and the same five policies.
 *
 *   node games/odd-laws-society/simulation/compare.mjs --seeds 24
 *
 * Every unordered policy pair (including self-pairs) plays under both initial
 * Chairs; distinct pairs also swap seats. Policies receive projected views only,
 * so they never see a sealed bid, the hidden deck or the opponent's reserve.
 * The authoritative sweep with full accounting audits for v0.2 is sweep.mjs.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { engine, legalActions, V03_STAPLES } from '../engine.mjs';
import { V03_POLICY_IDS, V03_POLICY_VERSION, chooseCouncil, chooseCityAction } from './policies.mjs';

const seats = ['jon', 'lydia'];
const viewerFor = seat => ({ role: 'player', playerId: seat });

function newLedger() {
  return {
    actions: { build: 0, work: 0, lobby: 0, festival: 0, scout: 0 },
    bids: 0, paid: 0, councilWins: 0, finalInfluence: 0, score: null,
  };
}

/**
 * v0.3 only: every card is in exactly one place. A staple has two copies; any
 * other design has one. No city holds two copies of a design.
 */
function auditCards(state) {
  if (state.rulesVersion !== '0.3') return;
  const cards = [
    ...state.market.flatMap(stack => Array(stack.remaining).fill(stack.designId)), ...state.deck,
    ...seats.flatMap(seat => state.players[seat].reserve),
    ...seats.flatMap(seat => state.players[seat].city.filter(Boolean).map(card => card.designId)),
  ];
  const counts = new Map();
  for (const designId of cards) counts.set(designId, (counts.get(designId) ?? 0) + 1);
  const dealtSoFar = new Set(state.termDecks.slice(0, state.term).flat());
  for (const [designId, count] of counts) {
    const staple = V03_STAPLES.includes(designId);
    assert.ok(count <= (staple ? 2 : 1), `${designId} appears ${count} times`);
    assert.ok(staple || dealtSoFar.has(designId), 'An undealt design appeared');
  }
  for (const seat of seats) {
    const own = state.players[seat].city.filter(Boolean).map(card => card.designId);
    assert.equal(new Set(own).size, own.length, 'A city holds two copies of one design');
  }
}

export function runMatch({ seed, rulesVersion, firstChair, policies }) {
  let state = engine.create({ seed, matchId: `cmp-${seed}`, options: { firstChair, rulesVersion } });
  const ledgers = { jon: newLedger(), lydia: newLedger() };
  while (state.phase === 'playing') {
    if (state.stage === 'council') {
      // Both decisions are made before either is submitted.
      const choices = Object.fromEntries(seats.map(seat => [seat, chooseCouncil(engine.project(state, viewerFor(seat)), seat, policies[seat])]));
      for (const seat of seats) {
        ledgers[seat].bids += choices[seat].bid;
        state = engine.apply(state, seat, choices[seat]);
      }
      const council = state.lastCouncil;
      for (const seat of seats) {
        const paid = council.paid ? council.paid[seat] : council.choices[seat].bid;
        ledgers[seat].paid += paid;
      }
      const winner = council.choices.jon.bid === council.choices.lydia.bid ? state.chair
        : council.choices.jon.bid > council.choices.lydia.bid ? 'jon' : 'lydia';
      if (council.choices[winner].bid > 0) ledgers[winner].councilWins += 1;
    } else {
      const seat = state.activePlayer;
      const action = chooseCityAction(engine.project(state, viewerFor(seat)), seat, policies[seat]);
      assert.ok(legalActions(state, seat).some(legal => JSON.stringify(legal) === JSON.stringify(action)), 'Policy chose an illegal action');
      ledgers[seat].actions[action.type] += 1;
      state = engine.apply(state, seat, action);
    }
    auditCards(state);
  }
  for (const seat of seats) {
    ledgers[seat].score = { ...state.players[seat].score };
    ledgers[seat].finalInfluence = state.players[seat].influence;
  }
  return { winner: state.result.winner, ledgers };
}

function pairings() {
  const list = [];
  for (let a = 0; a < V03_POLICY_IDS.length; a += 1) {
    for (let b = a; b < V03_POLICY_IDS.length; b += 1) list.push([V03_POLICY_IDS[a], V03_POLICY_IDS[b]]);
  }
  return list;
}

export function runComparison({ seeds = 24, rulesVersion }) {
  const perPolicy = Object.fromEntries(V03_POLICY_IDS.map(id => [id, { games: 0, wins: 0, ties: 0, losses: 0, totals: newLedger(), scoreSum: 0 }]));
  const pairs = new Map();
  const chair = { wins: 0, losses: 0, ties: 0 };
  let games = 0, ties = 0, selfGames = 0, selfTies = 0;
  const scores = [];
  for (let index = 0; index < seeds; index += 1) {
    const seed = `cmp-${index}`;
    for (const [a, b] of pairings()) {
      const seatings = a === b ? [[a, b]] : [[a, b], [b, a]];
      for (const firstChair of seats) {
        for (const [jonPolicy, lydiaPolicy] of seatings) {
          const policies = { jon: jonPolicy, lydia: lydiaPolicy };
          const { winner, ledgers } = runMatch({ seed, rulesVersion, firstChair, policies });
          games += 1;
          if (winner === 'tie') ties += 1;
          if (a === b) { selfGames += 1; if (winner === 'tie') selfTies += 1; }
          else if (winner === 'tie') chair.ties += 1;
          else if (winner === firstChair) chair.wins += 1;
          else chair.losses += 1;
          for (const seat of seats) {
            const stats = perPolicy[policies[seat]];
            const ledger = ledgers[seat];
            stats.games += 1;
            if (winner === 'tie') stats.ties += 1; else if (winner === seat) stats.wins += 1; else stats.losses += 1;
            for (const key of Object.keys(ledger.actions)) stats.totals.actions[key] += ledger.actions[key];
            for (const key of ['bids', 'paid', 'councilWins', 'finalInfluence']) stats.totals[key] += ledger[key];
            stats.scoreSum += ledger.score.total;
            stats.totals.score = stats.totals.score ?? { buildings: 0, streets: 0, festivals: 0, civic: 0, treasury: 0 };
            for (const key of Object.keys(stats.totals.score)) stats.totals.score[key] += ledger.score[key];
            scores.push(ledger.score.total);
          }
          if (a !== b) {
            const key = `${a} vs ${b}`;
            const pair = pairs.get(key) ?? { games: 0, firstWins: 0, secondWins: 0, ties: 0 };
            pair.games += 1;
            const aSeat = jonPolicy === a ? 'jon' : 'lydia';
            if (winner === 'tie') pair.ties += 1; else if (winner === aSeat) pair.firstWins += 1; else pair.secondWins += 1;
            pairs.set(key, pair);
          }
        }
      }
    }
  }
  const round = value => Number(value.toFixed(2));
  const policies = Object.fromEntries(Object.entries(perPolicy).map(([id, stats]) => [id, {
    winRateOfDecided: round(stats.wins / Math.max(1, stats.wins + stats.losses)),
    meanScore: round(stats.scoreSum / stats.games),
    meanActions: Object.fromEntries(Object.entries(stats.totals.actions).map(([key, value]) => [key, round(value / stats.games)])),
    meanBid: round(stats.totals.bids / stats.games / 6),
    meanInfluencePaid: round(stats.totals.paid / stats.games),
    meanCouncilWins: round(stats.totals.councilWins / stats.games),
    meanFinalInfluence: round(stats.totals.finalInfluence / stats.games),
    meanScoreParts: Object.fromEntries(Object.entries(stats.totals.score).map(([key, value]) => [key, round(value / stats.games)])),
  }]));
  const pairRates = Object.fromEntries([...pairs].map(([key, pair]) => [key, round(pair.firstWins / Math.max(1, pair.firstWins + pair.secondWins))]));
  return {
    rulesVersion, policyVersion: V03_POLICY_VERSION, seeds, games,
    scoreRange: [Math.min(...scores), Math.max(...scores)],
    tieRate: round(ties / games),
    mirrorTieRate: round(selfTies / selfGames),
    initialChair: { ...chair, shareOfDecided: round(chair.wins / Math.max(1, chair.wins + chair.losses)) },
    maxPairWinRate: Math.max(...Object.values(pairRates).map(rate => Math.max(rate, 1 - rate))),
    policies, pairRates,
  };
}

function readOption(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const seeds = Number(readOption('seeds', 24));
  const versions = readOption('rules', 'both') === 'both' ? ['0.2', '0.3'] : [readOption('rules')];
  console.log(JSON.stringify(versions.map(rulesVersion => runComparison({ seeds, rulesVersion }))));
}
