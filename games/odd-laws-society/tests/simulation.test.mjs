import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { engine } from '../engine.mjs';
import { POLICY_IDS, chooseCouncil, chooseCityAction } from '../simulation/policies.mjs';
import { runMatch, runSweep } from '../simulation/sweep.mjs';
import { fresh, action, council, frozen, clone } from './helpers.mjs';

test('four heuristic approaches finish fully audited matches and both commitment arrival orders agree', () => {
  for (const policyId of POLICY_IDS) {
    const parameters = { seed: 'policy-order', firstChair: 'lydia', matchId: `policy-${policyId}`, policies: { jon: policyId, lydia: 'efficient-building' } };
    const first = runMatch(parameters);
    const reversed = runMatch({ ...parameters, arrivalOrder: ['lydia', 'jon'] });
    assert.deepEqual(first.ledgers, reversed.ledgers);
    assert.deepEqual(first.result, reversed.result);
    assert.equal(first.transitions, 48);
    for (const seat of ['jon', 'lydia']) {
      const ledger = first.ledgers[seat];
      assert.equal(Object.values(ledger.actions).reduce((a, b) => a + b, 0), 18);
      assert.equal(ledger.bids.length, 6);
      assert.equal(ledger.coins.end, 4 + ledger.coins.income + ledger.coins.work - ledger.coins.builds - ledger.coins.festivals);
      assert.equal(ledger.influence.end, 2 + ledger.influence.income + ledger.influence.lobby + ledger.influence.builds - ledger.influence.bids);
    }
  }
});

test('mirrored sweep is reproducible with complete pairings and no unbalanced seat/Chair sampling', {
  skip: process.env.SOFA_EXHAUSTIVE !== '1' && 'Full pairing table runs in test:exhaustive',
}, () => {
  const first = runSweep({ seeds: 1 });
  const repeated = runSweep({ seeds: 1 });
  assert.deepEqual(first, repeated);
  assert.equal(first.games, 32);
  assert.equal(first.transitions, 1536);
  assert.equal(first.comparisons.length, 10);
  assert.match(first.digest, /^[0-9a-f]{64}$/);
  assert.equal(first.openingChairResults.wins + first.openingChairResults.losses + first.ties, first.games);
  for (const pair of first.comparisons) assert.equal(pair.games, pair.policies[0] === pair.policies[1] ? 2 : 4);
  for (const policy of Object.values(first.policies)) assert.equal(policy.games, 16);
  assert.match(first.caveat, /no human balance or playtest claim/i);
});

test('policy council choice is invariant to the opponent’s hidden bid and accepts only projected inputs', () => {
  const start = fresh();
  for (const policyId of POLICY_IDS) {
    let baseline;
    for (const choiceId of start.council.optionIds) for (let bid = 0; bid <= 2; bid += 1) {
      const locked = engine.apply(start, 'jon', action(start, 'commitCouncil', { choiceId, bid }));
      const view = frozen(engine.project(locked, { role: 'player', playerId: 'lydia' }));
      const choice = chooseCouncil(view, 'lydia', policyId);
      if (!baseline) baseline = choice;
      else assert.deepEqual(choice, baseline);
    }
    const turn = engine.project(council(start), { role: 'player', playerId: 'lydia' });
    const snapshot = clone(turn);
    const chosen = chooseCityAction(frozen(turn), 'lydia', policyId);
    assert.equal(chosen.phaseId, turn.phaseId);
    assert.deepEqual(turn, snapshot);
  }
});

test('policy code imports only public helpers, and rejects unknown policies/bad sweep sizes', async () => {
  const source = await readFile(new URL('../simulation/policies.mjs', import.meta.url), 'utf8');
  assert.ok(!/from\s*['"][^'"]*(?:engine|projection|fixture-source)/.test(source));
  assert.ok(!/Math\.random\s*\(/.test(source));
  for (const seeds of [0, -1, 1.5, 1001, NaN, '1']) assert.throws(() => runSweep({ seeds }));
  assert.throws(() => chooseCouncil(engine.project(fresh(), { role: 'player', playerId: 'jon' }), 'jon', 'unknown-policy'));
});
