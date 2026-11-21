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

## Rules v0.3 comparison (`compare.mjs`)

`compare.mjs` runs rules v0.2 and the opt-in rules v0.3 with the same harness and five policies. These are the four original policies plus `politician`, which lobbies, bids hard and, under v0.3, scouts. Policies see projected views only. The v0.2-only policy behaviour is unchanged, and the `heuristics-1` baseline digest above still reproduces.

```sh
node games/odd-laws-society/simulation/compare.mjs --seeds 48
```

Rules v0.3 changes:

- only the winning bid is paid, and a 0–0 council keeps the current law;
- each term deals 8 of 10 designs, one copy each, with 4 face up and a refilling market;
- Scout (1 influence) draws blind into a private reserve of up to 2 cards;
- twelve effect designs are added.

Results, 21 November 2026 (48 seeds, 2,400 games per version, policy `heuristics-v03-1`):

| Measure | v0.2 | v0.3 |
| --- | ---: | ---: |
| Score range | 41–72 | 39–67 |
| Tie rate | 0.29 | 0.08 |
| Mirror-policy tie rate | 1.00 | 0.07 |
| Initial Chair share of decided games | 0.55 | 0.47 |
| Most one-sided pairing | 0.90 | 0.77 |
| Mean bid per council | 0.4–1.3 | 1.3–2.0 |
| Influence left at the end | 4.2–5.5 | 2.1–4.5 |
| Scouts per game | — | 0.1–0.5 |

| Policy | v0.2 win share | v0.3 win share |
| --- | ---: | ---: |
| economy | 0.29 | 0.67 |
| festival | 0.55 | 0.47 |
| civic | 0.40 | 0.42 |
| efficient-building | 0.53 | 0.53 |
| politician | 0.76 | 0.41 |

What this shows:

1. **The single-copy market works as intended.** Identical strategies no longer tie, because the player who moves first takes the only copy. The initial Chair's edge also falls.
2. **Politics was strong in v0.2 when a bot actually played it.** The politician won 76%, because all-pay bids drain the opponent too. Under winner-pays, a losing bid is free, so both players bid more and influence decides less (the politician drops to 41%).
3. **v0.3 has a new outlier: Economy wins 67%, and 70–77% against three policies.** The likely cause is that single copies make the one Corner Shop or Night Market decisive. Tune the income designs before anything else.
4. **Scout and Lobby are still rarely chosen,** and influence is still left over. The reserve may need a cheaper Scout, a free Scout on Lobby, or a reason to spend influence late.

### Staples and no duplicates (rules v0.3, same 48 seeds)

The income designs (Corner Shop in Term I, Night Market in Term II) became **staples**. Each has two copies, face up for its whole term, beside the 4-card row, and staples are never dealt into a deck. Also, nobody can build a design that is already in their own city.

| Measure | v0.3, no staples | Income staples (adopted) | Income and workshop staples |
| --- | ---: | ---: | ---: |
| Tie rate | 0.08 | 0.05 | 0.05 |
| Mirror-policy tie rate | 0.07 | 0.04 | 0.07 |
| Initial Chair share | 0.47 | 0.53 | 0.47 |
| Most one-sided pairing | 0.77 | 0.96 | 0.93 |
| economy win share | 0.67 | 0.52 | 0.55 |
| festival win share | 0.47 | 0.77 | 0.80 |
| civic win share | 0.42 | 0.31 | 0.29 |
| efficient-building win share | 0.53 | 0.43 | 0.48 |
| politician win share | 0.41 | 0.47 | 0.37 |

**Staples fixed Economy, but the outlier moved to Festival.** Economy fell from 0.67 to 0.52. Festival rose to 0.77, and it beats Civic in 96% of decided games. The likely cause is that both players now get income, so both have more coins, and the repeatable Festival (3 coins for 3–4 prestige) becomes the best use of them. The gameplay analysis already flagged this. Adding the workshops as staples did not help. The next change to test is a Festival that scores 1 plus 1 per Culture building, at most 4.

### Tuning round (rules v0.3, same 48 seeds)

Each row adds one change to the row above, except where noted. "Range" is the spread of policy win shares.

| Step | Ties | Initial Chair | Most one-sided pair | Policy win shares | Notes |
| --- | ---: | ---: | ---: | --- | --- |
| Income staples (start) | 0.05 | 0.53 | 0.96 | 0.31–0.77 | Festival 0.77 |
| Festival = 1 + Culture, max 4 | 0.04 | 0.51 | 0.97 | 0.32–0.82 | Festival points fell, but Festival still won |
| (alternatives) 0 + Culture; 1 + Culture, max 3 | 0.04–0.05 | 0.50–0.53 | 0.91–0.94 | up to 0.78–0.80 | The formula was not the cause |
| **Rebuild** | 0.09 | 0.51 | 0.72 | 0.40–0.58 | The real cause was plot hoarding |
| Scout free, once per session | 0.08 | 0.45 | 0.78 | 0.40–0.59 | Scouts rose from about 0 to 1–2 per game |
| **Festival = 2 + Culture, max 4 (adopted)** | 0.08 | 0.47 | 0.69 | 0.42–0.59 | Only Economy vs Festival is above 0.65 |
| (rejected) income cap +1 | 0.09 | 0.47 | 0.68 | 0.41–0.58 | No real effect, so not adopted |

**Why Festival won.** It was not the Festival action. A design count showed that the Festival policy took Term III landmarks 3–5 times as often as its rivals. Other policies filled all nine plots with cheap Term I and II buildings, so the Festival policy alone had space and coins when single-copy landmarks appeared. Rebuild lets anyone replace an early building with a landmark: pay the new cost minus the old printed cost, at least 1. That removed the advantage.

**Adopted v0.3 rules after tuning:**

- winner-pays councils;
- a single-copy refilling market with income staples;
- no duplicate designs in one city;
- Rebuild;
- Scout is free, once per session, for 1 influence;
- Festival scores 2 + 1 per Culture building, at most 4.

All policies win 42–59% of decided games, and ties are 8%. Lobby is still used only by the politician, and 2–4 influence is still left over, so influence remains the weakest system. These remaining gaps are probably as much about the simple bots as about the rules, and they should be checked in human play.
