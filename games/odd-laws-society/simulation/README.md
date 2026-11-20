# Reproducible policy sweep

This is a Node-only diagnostic harness for rules v0.2. It compares four deliberately small heuristics: early economy investment, Festivals, Civic buildings/political bids, and efficient construction. These are imperfect bot policies, not claims about optimal or human play. No game costs, caps, thresholds, or other rules were tuned from these results.

## Commands

From the repository root, using Node 22.13 or newer:

```sh
node games/odd-laws-society/simulation/sweep.mjs --smoke
node games/odd-laws-society/simulation/sweep.mjs --seeds 24
node games/odd-laws-society/simulation/sweep.mjs --seeds 24 --output games/odd-laws-society/simulation/baseline-24.json
node --test games/odd-laws-society/tests/simulation.test.mjs
```

`--smoke` uses two seeds (64 matches); the default and `--seeds 24` use 24 seeds (768 matches). `--seeds` accepts an integer from 1 to 1000. `--output` saves the same JSON also printed to stdout. No dependencies, network access, timestamp, wall-clock randomness, or external model calls are used. Importing the CLI module does not run a sweep.

Exports:

- `policies.mjs`: immutable `POLICY_IDS`, `POLICY_VERSION`, `chooseCouncil(view, seat, policyId)`, and `chooseCityAction(view, seat, policyId)`.
- `sweep.mjs`: `runMatch({ seed, firstChair, policies, matchId, arrivalOrder })` and `runSweep({ seeds })`. `runMatch` returns agenda, outcome, per-seat source/spend/score/action/bid/building ledgers, 48-transition count, and a deterministic action-trace digest. `runSweep` returns the aggregate report.

## Sampling and privacy

Each seed is `ws1-policy-N`. The public agenda is identical under both initial Chairs. Every unordered policy pair is run under both initial Chairs; distinct policies also swap seats. Self-pairs have two runs per seed and distinct pairs four, totaling 32 matches per seed. The harness asserts that a seat swap combined with a Chair swap produces exactly swapped numerical ledgers. It also tests both council arrival orders independently.

Policies receive frozen authenticated player projections and import only public catalog/preview modules. Both council choices are computed before either is submitted. Policy tie-breaking uses action type/design/plot, never literal seat names, match IDs, or hidden commitments. The authoritative harness can inspect full state for auditing; policy code cannot.

The mirrors are intentionally correlated. They control seat/Chair differences, and must not be counted as independent observations for statistical confidence. These heuristics do no adversarial search, model no promises or bluffs, and only approximate the value of future purchases and laws. Self-pair ties are useful symmetry checks, not fairness evidence.

## Audits on every transition

The harness independently accounts for coins and influence from setup through the final score, including capped gains, first-Build discounts, all-pay bids, and exactly five automatic incomes. Build payment expectations use literal v0.2 law/workshop arithmetic and are also compared with the public quote. Reveal choices must match the submitted commands and only the appropriate law slot may change. Civic awards use a separate implementation of the six PRD thresholds.

It checks 18 city actions and six commitments per player, 48 total transitions, 43 distinct lifecycle phases, JSON round trips, nonmutation, permanent placement, global instance uniqueness, at most two copies of each design, current-term stock conservation, score decomposition, street/Festival/Civic/Treasury caps, and the winning/tied result. A failed audit terminates the command with a nonzero status. Test cases outside the sweep separately cover adversarial inputs, empty markets/full cities, caps, all law pairs, sealed data, malformed/stale phases, and exact catalog data.

## Recorded baseline

`baseline-24.json` was generated with Node 24.22.3, unchanged rules v0.2 and policy version `heuristics-1`. It contains **768 completed matches and 36,864 transitions**, with deterministic digest:

```text
88b0d3c82d304555d983fe511ba7840370138a718fd5dc890e44aea089d7dcb0
```

The digest covers complete per-match outcomes/ledgers and action-trace digests in deterministic order. Any intentional rule or policy change should receive its own version and regenerated evidence; do not merely replace this digest to conceal a regression.

| Policy | Player appearances | Mean final score | Mean Builds | Mean Festivals | Mean influence spent on bids |
| --- | ---: | ---: | ---: | ---: | ---: |
| Economy | 384 | 59.000 | 9.000 | 3.031 | 3.286 |
| Festival | 384 | 60.193 | 6.922 | 5.349 | 3.109 |
| Civic | 384 | 57.089 | 9.000 | 2.516 | 7.708 |
| Efficient building | 384 | 59.740 | 9.000 | 2.958 | 2.943 |

Observed scores ranged from **41 to 70**. The upper end exceeds the PRD's explicitly provisional 35–60 range and is reported as an investigation flag. No distinct-policy pairing exceeded the PRD's 65% win-rate investigation threshold in this 24-seed run; the two-seed smoke did cross that threshold for one pairing, showing why a tiny diagnostic sweep cannot establish dominance. The report emits flags without changing any rule or failing a valid rules run solely for a balance hypothesis.

The initial Chair won 318 matches, lost 240, and tied 210 under this policy set. That asymmetry deserves investigation with broader policies and human mirrored games. The sample does not establish an advantage for Jon or Lydia: seats are mirrored, and the initial Chair varies.

All four policies selected zero Lobby actions in this baseline. The Civic policy obtained influence from construction and spent more of it, but this run does **not** explore Lobby-heavy political play. Many building policies filled nine slots in session 5, with some in session 4; the Festival policy usually left room. Read `fullBySession`, `fullCityWork`, bid histograms, score components, and source/spend totals in the JSON when selecting future cases. Exact Lobby behavior is exercised in the rules/adversarial suites.

No human playtests, observed teaching times, physical phone/TV sessions, or balance validation are represented by these files.
