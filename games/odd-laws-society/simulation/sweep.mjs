#!/usr/bin/env node
/** Node-only reproducible integrity/policy sweep. Never ship this authority harness to browsers. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { engine } from '../engine.mjs';
import { BUILDINGS } from '../catalog.mjs';
import { buildQuote } from '../preview.mjs';
import { POLICY_IDS, POLICY_VERSION, chooseCouncil, chooseCityAction } from './policies.mjs';

const seats = ['jon', 'lydia'];
const byId = new Map(BUILDINGS.map(design => [design.id, design]));
const other = seat => seat === 'jon' ? 'lydia' : 'jon';
const clone = value => JSON.parse(JSON.stringify(value));
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}
const countAbility = (player, type) => player.city.filter(Boolean).reduce((sum, card) => sum + (byId.get(card.designId).ability?.type === type ? byId.get(card.designId).ability.amount : 0), 0);
const qualifies = row => row.every(Boolean) && [1, 3].includes(new Set(row.map(card => byId.get(card.designId).guild)).size);
function independentBuildCost(state, seat, designId) {
  const player = state.players[seat], design = byId.get(designId);
  const subsidizedGuild = { 'small-shop-supremacy': 'commerce', 'workshop-week': 'craft', 'public-grants': 'civic', 'everything-is-art': 'culture' }[state.activeLaws.economy];
  const first = player.buildsThisSession === 0;
  const lawDiscount = subsidizedGuild === design.guild || (state.activeLaws.economy === 'open-tender' && first) ? 2 : 0;
  const workshop = first && player.city.some(card => card && ['button-workshop', 'clockwork-studio'].includes(card.designId)) ? 1 : 0;
  return Math.max(1, design.cost - Math.max(lawDiscount, workshop));
}
function independentCivic(player, lawId) {
  const guild = { 'shop-local': 'commerce', 'industrial-pride': 'craft', 'public-service-day': 'civic', 'mandatory-applause': 'culture' }[lawId];
  const cards = player.city.filter(Boolean).map(card => byId.get(card.designId));
  if (guild) {
    const count = cards.filter(card => card.guild === guild).length;
    return count >= 4 ? 2 : count >= 2 ? 1 : 0;
  }
  if (lawId === 'diversity-parade') {
    const size = new Set(cards.map(card => card.guild)).size;
    return size === 4 ? 2 : size === 3 ? 1 : 0;
  }
  if (lawId === 'fashionable-streets') return Math.min(2, [0, 1, 2].filter(row => qualifies(player.city.slice(row * 3, row * 3 + 3))).length);
  assert.equal(lawId, 'civic-neutral');
  return 0;
}
function newLedger() {
  return {
    coins: { initial: 4, income: 0, work: 0, builds: 0, festivals: 0, end: 4 },
    influence: { initial: 2, income: 0, lobby: 0, builds: 0, bids: 0, end: 2 },
    actions: { build: 0, work: 0, lobby: 0, festival: 0 },
    score: { buildings: 0, streets: 0, festivals: 0, civic: 0, treasury: 1, total: 1 },
    bids: [], councilWins: 0, firstFullSession: null, fullCityWork: 0, buildings: {},
  };
}

function auditState(state, ledgers) {
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state, 'State must be JSON serializable without loss');
  const instances = [], counts = new Map();
  for (const seat of seats) {
    const player = state.players[seat], ledger = ledgers[seat];
    assert.ok(Number.isSafeInteger(player.coins) && player.coins >= 0);
    assert.ok(Number.isInteger(player.influence) && player.influence >= 0 && player.influence <= 6);
    assert.equal(player.city.length, 9);
    assert.equal(player.coins, 4 + ledger.coins.income + ledger.coins.work - ledger.coins.builds - ledger.coins.festivals, 'Money source/spend conservation');
    assert.equal(player.influence, 2 + ledger.influence.income + ledger.influence.lobby + ledger.influence.builds - ledger.influence.bids, 'Influence source/spend conservation');
    let printed = 0, streets = 0;
    for (const card of player.city.filter(Boolean)) {
      assert.ok(byId.has(card.designId));
      printed += byId.get(card.designId).prestige;
      instances.push(card.instanceId);
      counts.set(card.designId, (counts.get(card.designId) ?? 0) + 1);
    }
    for (let row = 0; row < 3; row += 1) {
      const cityRow = player.city.slice(row * 3, row * 3 + 3);
      assert.equal(player.streetEvaluated[row], cityRow.every(Boolean));
      if (qualifies(cityRow)) streets += 2;
    }
    assert.equal(player.score.buildings, printed, 'Printed prestige counts once');
    assert.equal(player.score.streets, streets, 'Each qualifying horizontal street awards once');
    assert.equal(player.score.festivals, ledger.score.festivals);
    assert.equal(player.score.civic, ledger.score.civic);
    assert.equal(player.score.treasury, Math.min(4, Math.floor(player.coins / 3)));
    assert.equal(player.score.total, printed + streets + ledger.score.festivals + ledger.score.civic + player.score.treasury);
    assert.ok(player.score.streets <= 6 && player.score.civic <= 10 && player.score.festivals <= 24);
    assert.ok(player.buildsThisSession >= 0 && player.buildsThisSession <= 3);
    if (player.city.every(Boolean) && ledger.firstFullSession === null) ledger.firstFullSession = state.session;
    ledger.coins.end = player.coins;
    ledger.influence.end = player.influence;
  }
  assert.equal(instances.length, new Set(instances).size, 'Every physical card instance is globally unique');
  for (const count of counts.values()) assert.ok(count <= 2, 'No design has more than two purchased copies');
  for (const stack of state.market) {
    assert.equal(byId.get(stack.designId).term, state.term);
    assert.equal(stack.remaining + (counts.get(stack.designId) ?? 0), 2, 'Current term public stock is conserved');
  }
}

function auditTransition(before, after, seat, action, ledgers) {
  const ledger = ledgers[seat], player = before.players[seat];
  if (action.type === 'commitCouncil') {
    assert.equal(before.phaseId, action.phaseId);
    if (after.stage === 'actions') {
      const choices = clone(before.council.commitments);
      choices[seat] = { choiceId: action.choiceId, bid: action.bid };
      assert.deepEqual(after.lastCouncil.choices, choices, 'Revealed commitments must equal the submitted commands');
      for (const id of seats) {
        const bid = choices[id].bid;
        ledgers[id].influence.bids += bid;
        ledgers[id].bids.push(bid);
      }
      const winner = choices.jon.bid === choices.lydia.bid ? before.chair : choices.jon.bid > choices.lydia.bid ? 'jon' : 'lydia';
      const category = before.council.category;
      const adopted = choices[winner].choiceId === 'keep' ? before.activeLaws[category] : choices[winner].choiceId;
      assert.deepEqual(after.activeLaws, { ...before.activeLaws, [category]: adopted });
      assert.equal(after.lastCouncil.adoptedLawId, adopted);
      ledgers[winner].councilWins += 1;
    } else {
      assert.equal(after.phaseId, before.phaseId);
      assert.deepEqual(after.council.commitments[seat], { choiceId: action.choiceId, bid: action.bid });
      assert.equal(after.council.commitments[other(seat)], null);
      for (const id of seats) assert.equal(before.players[id].influence, after.players[id].influence, 'First sealed bid cannot deduct publicly');
    }
  } else {
    ledger.actions[action.type] += 1;
    assert.notEqual(after.phaseId, before.phaseId, 'Each successful city action consumes its individual phase');
    if (action.type === 'build') {
      const cost = independentBuildCost(before, seat, action.designId);
      assert.equal(buildQuote(before, seat, action.designId).cost, cost, 'Public quote agrees with independent rule arithmetic');
      ledger.coins.builds += cost;
      if (after.players[seat].city.every(Boolean) && ledger.firstFullSession === null) ledger.firstFullSession = before.session;
      const ability = byId.get(action.designId).ability;
      if (ability?.type === 'influenceOnBuild') ledger.influence.builds += Math.min(ability.amount, 6 - player.influence);
    } else if (action.type === 'work') {
      ledger.coins.work += before.activeLaws.economy === 'honest-wages' ? 4 : 3;
      if (player.city.every(Boolean)) ledger.fullCityWork += 1;
    } else if (action.type === 'lobby') ledger.influence.lobby += Math.min(2, 6 - player.influence);
    else if (action.type === 'festival') {
      assert.equal(player.festivalUsed, false);
      ledger.coins.festivals += 3;
      ledger.score.festivals += 3 + Math.min(1, countAbility(player, 'festivalBonus'));
    } else assert.fail('Unknown audited action');
    if (before.actionIndex === 5) {
      // Final cities after the last Build, before income. Income never affects this award.
      for (const id of seats) ledgers[id].score.civic += independentCivic(after.players[id], before.activeLaws.civic);
      if (before.session < 6) {
        assert.equal(after.session, before.session + 1);
        for (const id of seats) {
          ledgers[id].coins.income += 3 + Math.min(2, countAbility(after.players[id], 'income'));
          const previousInfluence = id === seat && action.type === 'build' && byId.get(action.designId).ability?.type === 'influenceOnBuild'
            ? Math.min(6, before.players[id].influence + byId.get(action.designId).ability.amount)
            : id === seat && action.type === 'lobby' ? Math.min(6, before.players[id].influence + 2) : before.players[id].influence;
          ledgers[id].influence.income += Math.min(1, 6 - previousInfluence);
        }
      } else assert.equal(after.stage, 'finished');
    }
  }
  for (const id of seats) for (let index = 0; index < 9; index += 1) {
    if (before.players[id].city[index]) assert.deepEqual(after.players[id].city[index], before.players[id].city[index], 'Placed districts never move or change');
  }
  auditState(after, ledgers);
}

export function runMatch({ seed, firstChair = 'jon', policies = { jon: 'economy', lydia: 'festival' }, matchId = 'policy-match', arrivalOrder = ['jon', 'lydia'] }) {
  assert.deepEqual([...arrivalOrder].sort(), ['jon', 'lydia']);
  for (const seat of seats) assert.ok(POLICY_IDS.includes(policies[seat]));
  let state = engine.create({ seed, matchId, options: { firstChair } });
  const agenda = clone(state.agenda), ledgers = { jon: newLedger(), lydia: newLedger() }, trace = [];
  const seenPhases = new Set([state.phaseId]);
  auditState(state, ledgers);
  function submit(seat, chosen) {
    const before = state;
    const prior = JSON.stringify(before);
    state = engine.apply(freeze(before), seat, freeze(chosen));
    assert.equal(JSON.stringify(before), prior, 'Authority transition cannot mutate input');
    trace.push({ seat, action: chosen });
    assert.ok(trace.length <= 48, 'Exactly six sessions, no unbounded action loop');
    if (state.phaseId !== before.phaseId) {
      assert.ok(!seenPhases.has(state.phaseId), 'No phase can reopen');
      seenPhases.add(state.phaseId);
    }
    auditTransition(before, state, seat, chosen, ledgers);
  }
  while (state.phase === 'playing') {
    if (state.stage === 'council') {
      // Compute both choices from pre-submission authorized projections. Policy code
      // never sees the full state, fixed private budgets or the other's pending bid.
      const choices = Object.fromEntries(seats.map(seat => [seat, chooseCouncil(freeze(engine.project(state, { role: 'player', playerId: seat })), seat, policies[seat])]));
      for (const seat of arrivalOrder) submit(seat, choices[seat]);
    } else {
      const seat = state.activePlayer;
      submit(seat, chooseCityAction(freeze(engine.project(state, { role: 'player', playerId: seat })), seat, policies[seat]));
    }
  }
  assert.equal(trace.length, 48);
  assert.equal(seenPhases.size, 43);
  for (const seat of seats) {
    assert.equal(Object.values(ledgers[seat].actions).reduce((sum, count) => sum + count, 0), 18);
    assert.equal(ledgers[seat].bids.length, 6);
    ledgers[seat].score = clone(state.players[seat].score);
    for (const card of state.players[seat].city.filter(Boolean)) ledgers[seat].buildings[card.designId] = (ledgers[seat].buildings[card.designId] ?? 0) + 1;
  }
  const scores = state.result.scores;
  assert.equal(state.result.winner, scores.jon === scores.lydia ? 'tie' : scores.jon > scores.lydia ? 'jon' : 'lydia');
  return { seed, firstChair, policies: { ...policies }, agenda, result: clone(state.result), ledgers, transitions: trace.length, traceDigest: createHash('sha256').update(JSON.stringify(trace)).digest('hex') };
}

function newAggregate() {
  return { games: 0, wins: 0, ties: 0, losses: 0, scores: [], actions: { build: 0, work: 0, lobby: 0, festival: 0 }, score: { buildings: 0, streets: 0, festivals: 0, civic: 0, treasury: 0 }, coins: { income: 0, work: 0, builds: 0, festivals: 0, end: 0 }, influence: { income: 0, lobby: 0, builds: 0, bids: 0, end: 0 }, bidHistogram: [0, 0, 0, 0], councilWins: 0, fullBySession: {}, fullCityWork: 0 };
}
function accumulate(aggregate, ledger, outcome) {
  aggregate.games += 1;
  aggregate[outcome] += 1;
  aggregate.scores.push(ledger.score.total);
  for (const category of ['actions', 'score', 'coins', 'influence']) for (const key of Object.keys(aggregate[category])) aggregate[category][key] += ledger[category][key];
  for (const bid of ledger.bids) aggregate.bidHistogram[bid] += 1;
  aggregate.councilWins += ledger.councilWins;
  aggregate.fullCityWork += ledger.fullCityWork;
  if (ledger.firstFullSession !== null) aggregate.fullBySession[ledger.firstFullSession] = (aggregate.fullBySession[ledger.firstFullSession] ?? 0) + 1;
}
const rounded = value => Math.round(value * 1000) / 1000;
function summarizeAggregate(aggregate) {
  const { scores, ...rest } = aggregate;
  const means = {};
  for (const category of ['actions', 'score', 'coins', 'influence']) means[category] = Object.fromEntries(Object.entries(aggregate[category]).map(([key, total]) => [key, rounded(total / aggregate.games)]));
  return { ...rest, scoreRange: { min: Math.min(...scores), mean: rounded(scores.reduce((a, b) => a + b, 0) / scores.length), max: Math.max(...scores) }, means };
}

export function runSweep({ seeds = 24 } = {}) {
  if (!Number.isInteger(seeds) || seeds < 1 || seeds > 1000) throw new Error('Seeds must be an integer from 1 to 1000.');
  const aggregates = Object.fromEntries(POLICY_IDS.map(id => [id, newAggregate()]));
  const comparisons = [], digest = createHash('sha256');
  let matchCount = 0, ties = 0, firstChairWins = 0, secondChairWins = 0, minScore = Infinity, maxScore = -Infinity;
  for (let seedIndex = 0; seedIndex < seeds; seedIndex += 1) {
    const seed = `ws1-policy-${seedIndex}`;
    let commonAgenda;
    for (let left = 0; left < POLICY_IDS.length; left += 1) for (let right = left; right < POLICY_IDS.length; right += 1) {
      const a = POLICY_IDS[left], b = POLICY_IDS[right];
      const assignments = a === b ? [{ jon: a, lydia: b }] : [{ jon: a, lydia: b }, { jon: b, lydia: a }];
      let pair = comparisons.find(item => item.policies[0] === a && item.policies[1] === b);
      if (!pair) { pair = { policies: [a, b], games: 0, firstPolicyWins: 0, secondPolicyWins: 0, ties: 0, marginSum: 0 }; comparisons.push(pair); }
      const mirrored = [];
      for (let assignment = 0; assignment < assignments.length; assignment += 1) for (const firstChair of seats) {
        const result = runMatch({ seed, firstChair, policies: assignments[assignment], matchId: `sweep-${seedIndex}-${left}-${right}-${assignment}-${firstChair}` });
        if (!commonAgenda) commonAgenda = result.agenda;
        else assert.deepEqual(result.agenda, commonAgenda, 'Mirrored games must retain identical public agendas');
        mirrored.push(result);
        matchCount += 1;
        pair.games += 1;
        const winner = result.result.winner;
        if (winner === 'tie') { ties += 1; pair.ties += 1; }
        else {
          if (winner === firstChair) firstChairWins += 1; else secondChairWins += 1;
          if (a === b ? winner === 'jon' : assignments[assignment][winner] === a) pair.firstPolicyWins += 1; else pair.secondPolicyWins += 1;
        }
        const aSeat = assignments[assignment].jon === a ? 'jon' : 'lydia';
        pair.marginSum += result.result.scores[aSeat] - result.result.scores[other(aSeat)];
        for (const seat of seats) {
          accumulate(aggregates[assignments[assignment][seat]], result.ledgers[seat], winner === 'tie' ? 'ties' : winner === seat ? 'wins' : 'losses');
          minScore = Math.min(minScore, result.result.scores[seat]);
          maxScore = Math.max(maxScore, result.result.scores[seat]);
        }
        digest.update(JSON.stringify(result));
      }
      // Matching policy positions and opposite Chairs must swap all numerical ledgers,
      // proving the harness has no literal Jon/Lydia preference hidden in tie breaks.
      const mirrorPairs = a === b ? [[mirrored[0], mirrored[1]]] : [[mirrored[0], mirrored[3]], [mirrored[1], mirrored[2]]];
      for (const [one, two] of mirrorPairs) {
        assert.deepEqual(one.ledgers.jon, two.ledgers.lydia, 'Policy mirror must preserve the swapped Jon ledger');
        assert.deepEqual(one.ledgers.lydia, two.ledgers.jon, 'Policy mirror must preserve the swapped Lydia ledger');
      }
    }
  }
  const matrix = comparisons.map(({ marginSum, ...pair }) => ({ ...pair, firstPolicyWinRate: rounded(pair.firstPolicyWins / pair.games), meanFirstPolicyMargin: rounded(marginSum / pair.games) }));
  const outliers = matrix.filter(pair => pair.policies[0] !== pair.policies[1] && Math.max(pair.firstPolicyWins, pair.secondPolicyWins) / pair.games > 0.65)
    .map(pair => ({ type: 'policy-win-rate-above-investigation-threshold', policies: pair.policies, leadingPolicy: pair.firstPolicyWins > pair.secondPolicyWins ? pair.policies[0] : pair.policies[1], winRate: rounded(Math.max(pair.firstPolicyWins, pair.secondPolicyWins) / pair.games), games: pair.games }));
  if (minScore < 35 || maxScore > 60) outliers.push({ type: 'outside-provisional-score-range', observed: { min: minScore, max: maxScore }, provisional: { min: 35, max: 60 } });
  return {
    schemaVersion: 1, rulesVersion: '0.2', policyVersion: POLICY_VERSION, seeds, games: matchCount,
    transitions: matchCount * 48, seedPattern: 'ws1-policy-{0..seeds-1}',
    mirrorMethod: 'Every unordered policy pair, both seat assignments for distinct policies, both initial Chairs; common agenda per seed; swapped numerical ledgers asserted.',
    policyInputs: 'Authenticated projected view only; both council choices computed before either commit.',
    caveat: 'Deterministic heuristic diagnostics only. Mirrored games are correlated, policies are incomplete, thresholds are investigation flags, and no human balance or playtest claim is made. No rules were tuned.',
    scoreRange: { min: minScore, max: maxScore }, ties, openingChairResults: { wins: firstChairWins, losses: secondChairWins, ties },
    policies: Object.fromEntries(POLICY_IDS.map(id => [id, summarizeAggregate(aggregates[id])])), comparisons: matrix, outliers,
    digest: digest.digest('hex'),
  };
}

function parseArguments(args) {
  let seeds = 24, output = null, smoke = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--smoke') smoke = true;
    else if (args[index] === '--seeds') { seeds = Number(args[++index]); if (!Number.isInteger(seeds) || seeds < 1 || seeds > 1000) throw new Error('Invalid --seeds value.'); }
    else if (args[index] === '--output') { output = args[++index]; if (!output || output.startsWith('--')) throw new Error('Missing --output path.'); }
    else throw new Error('Supported arguments: --smoke, --seeds N, --output path.');
  }
  return { seeds: smoke ? 2 : seeds, output };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { seeds, output } = parseArguments(process.argv.slice(2));
    const summary = runSweep({ seeds });
    const text = `${JSON.stringify(summary, null, 2)}\n`;
    if (output) await writeFile(output, text, 'utf8');
    process.stdout.write(text);
  } catch (error) {
    process.stderr.write(`Policy sweep failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
