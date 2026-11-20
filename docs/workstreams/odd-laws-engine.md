# WS1 — Odd Laws Society rules engine

## Handoff status and scope

**Engine component ready for integration.** The immutable tested head and remote CI results are recorded in [PR #4](https://github.com/jonathanjie/sofa-arcade/pull/4). Whole-product registration, TV/phone integration, Tauri packaging, and human playtesting remain separate gates.

- Branch: `feature/odd-laws-engine`.
- Base: `e34b0015399cb9791b175987adf1fab1b542565a`, verified against remote `main` on 20 November 2026 before editing.
- Isolated clone; authored changes only in `games/odd-laws-society/**`, `.github/workflows/ws1-engine.yml`, and this report.
- Rules source: the complete city-building specification in `docs/games/odd-laws-society.md`, version `0.2`, and `docs/LOCAL_IMPLEMENTATION_CONTRACT.md` v1. The old movement prototype was not used.
- No costs, caps, thresholds, catalogs, initiative rules, or scoring values were tuned.
- Registry/catalog status, server, UI, shared manifests/locks, PRD, other reports, and generated release assets are unchanged. No merge or deployment was performed.

Three disjoint tasks implemented catalog/authority, public previews/projection/fixtures, and adversarial tests/simulation. The primary session integrated their work and added independent boundary tests. Separate read-only cross-reviews checked the authority against the PRD and the public helpers/projections against the contract.

## Rules implemented

All six sessions, three finite terms, 18 two-copy designs, 12 agenda laws, two persistent law slots, nine-plot cities, and Build/Work/Lobby/Festival are implemented. The Chair schedule is `A,B | B,A | A,B`; the non-Chair acts first each session.

Council commitments are immutable and all-pay. Both deductions, reveal, law adoption, and first city turn happen atomically on the second commitment. Public influence remains unchanged after the first lock. There are no automatic votes, refunds, timeouts, or extra rounds.

Pre-action discount selection, first-successful-Build timing, non-stacking workshops, one-time capped influence grants, capped established income, Festival limits, irreversible placement, horizontal streets, simultaneous session-end Civic awards, treasury conversion, and shared victories follow the PRD. Work remains legal with exhausted markets, full cities, zero coins, and capped influence.

Transitions are deterministic, JSON-serializable, and non-mutating. Randomness is used only for seeded setup. Each city turn has a distinct phase ID; rejected actions do not advance it.

## Adapter and exports

```js
import { engine } from './games/odd-laws-society/engine.mjs';

const state = engine.create({ seed: 'setup-seed', matchId: 'fresh-authority-issued-id' });
const next = engine.apply(state, authenticatedPlayerId, engine.normalizeAction(rawAction));
const view = engine.project(next, authenticatedViewer);
```

| Export from `engine.mjs` | Contract |
| --- | --- |
| `engine` | Frozen adapter with `gameId`, `playerIds`, `create`, `apply`, `normalizeAction`, `actionKey`, `project`, `canRebaseAction` |
| `GAME_ID`, `RULES_VERSION`, `PLAYER_IDS` | `odd-laws-society`, `0.2`, frozen `['jon','lydia']` |
| `create({seed, matchId, options?})` | Complete authority state; no random/time fallback |
| `apply(fullState, authenticatedPlayerId, action)` | Validated new state; also normalizes internally |
| `normalizeAction(rawAction)` | Exact known fields/enums, bounded IDs/bids/plots, canonical property order and signed zero |
| `actionKey(action)` | Stable JSON identity including every meaningful normalized field |
| `project(fullState, viewer)` | Fresh allowlisted view; also exported from `projection.mjs` |
| `canRebaseAction(fullState, authenticatedPlayerId, action)` | Only a legal unsubmitted commitment in this exact still-open council |
| `chairForSession(fullState, session = fullState.session)` | Scheduled Chair for sessions 1–6 |
| `legalActions(fullState, authenticatedPlayerId)` | All legal normalized commands; authority/testing only |
| `RuleError` | Safe code-bearing error with `{name,code,message}` JSON; also exported from `errors.mjs` |

`errors.mjs` additionally exports `fail(code, message)`.

`seed` is a string of 1–256 characters. `matchId` is 1–128 ASCII letters, digits, `_`, or `-`. **The adapter must issue a fresh match ID for each start/rematch independently of the seed.** Explicit identity permits deterministic replay; the engine cannot know whether an adapter reused an ID across separately stored matches.

The only setup options are `firstChair: 'jon'|'lydia'` and `agenda`, a complete six-entry agenda containing all twelve distinct laws in their proper category/session. These support teaching and mirrored experiments without changing numerical rules. Unknown fields, incomplete/sparse agendas, accessor properties, and invalid overrides reject safely.

```text
<matchId>:s<session>:council
<matchId>:s<session>:action:<index 0–5>
<matchId>:s6:finished
```

Both commitments share one council phase. Each successful city action consumes its own phase. Old-match/session/turn, malformed, and future-phase commands fail. A full match has 43 lifecycle phases and 48 accepted transitions: twelve commitments and 36 city actions.

## Runtime files and browser API

| Purpose | Exact repository-relative files |
| --- | --- |
| Browser-safe rules | `games/odd-laws-society/catalog.mjs`, `games/odd-laws-society/preview.mjs`, `games/odd-laws-society/errors.mjs` |
| Authority-only additions | `games/odd-laws-society/engine.mjs`, `games/odd-laws-society/projection.mjs` |
| Optional frontend development fixtures | `games/odd-laws-society/fixtures/projected/index.mjs` and explicitly selected JSON files listed below |
| Exclude from gameplay runtime/serving | `games/odd-laws-society/tests/**`, `games/odd-laws-society/simulation/**`, full-state recipes, reports |

The host engine requires the three public files plus the two authority files. Browser imports terminate at catalog data and safe errors; they include no authority, private fixtures, Node modules, or network services. There are no external runtime dependencies.

`catalog.mjs` exports deeply frozen `BUILDINGS`, `LAWS`, and `GUILDS`, using the exact contract fields and explicit data effect objects. Neutral defaults are state IDs, not extra agenda cards.

`preview.mjs` exports these exact shapes:

```js
buildQuote(view, playerId, designId)
// {allowed, reason, printedCost, cost,
//  discount:{amount,sourceId}, influenceGain, prestige}
streetOutcome(view, playerId, row, col, designId)
// {canPlace, reason, completes, qualifies, prestige}
civicAward(view, playerId, lawId = view.activeLaws.civic)
// integer 0..2
```

Additional pure public helpers: `scoreBreakdown(view, playerId)`, `incomeBonus(view, playerId)`, and `festivalBonus(view, playerId)`. Known-design quote amounts remain available when Build is disallowed. Discounts report actual reduction, with a stable law preference. Street preview is hypothetical regardless of turn, funds, or stock. These helpers never commit state.

Projected score contains `buildings, streets, festivals, civic, treasury, total`. **During play, `total` includes potential treasury.** Secured prestige starts at zero, even though four starting coins make `treasury = 1` and `total = 1`. Display the sum of the first four categories as the live score and label treasury separately.

## Privacy and adapter responsibilities

Full-state council is `{category,optionIds,budgets,commitments}`; projected council is only `{category,optionIds,ready,ownCommitment}`. Outside council both are null. Projection reconstructs nested public values from explicit allowlists and returns independent snapshots.

Viewer shapes are exactly `{role:'public'}`, `{role:'host'}`, or `{role:'player',playerId:'jon'|'lydia'}`. The caller must derive the viewer from verified credentials. Host authority reveals no additional vote information. Only the authenticated seat receives its own commitment. `lastCouncil` contains a completed reveal, never the pending one. No pending-content event/history log is exported.

`canRebaseAction` checks normalization, actor, exact match/council phase, unsubmitted status, offered choice, fixed opening budget, and bid legality. All city actions and closed/replaced councils return false.

The room adapter owns action IDs, revisions, duplicate-response replay, authentication, bounded CAS retries, and **future-revision rejection**. Revisions/action IDs deliberately are not engine action fields. Calling `apply` twice rejects a locked/stale command; a known identical transport retry must use the room idempotency record and safely projected response without paying again.

## Canonical frontend fixtures

`fixtures/projected/index.mjs` exports deeply frozen `PROJECTED_FIXTURES`, `FIXTURE_NAMES`, and `getProjectedFixture(name, role = 'tv')`, which returns a fresh snapshot. Each JSON holds `{tv,jon,lydia}` for a synthetic example; real room responses must send only the authenticated projection.

| File under `games/odd-laws-society/fixtures/projected/` | Scenario |
| --- | --- |
| `council-unsubmitted.json` | Both seats uncommitted |
| `council-jon-locked.json` | Jon sees his lock; TV/Lydia see readiness only |
| `council-lydia-locked.json` | Opposite arrival order and own-lock role |
| `council-revealed.json` | Both choices and payments appear together |
| `ordinary-turn.json` | First purchase complete, next actor active |
| `late-full-city.json` | Session 5, both cities full with six street points |
| `finished-tie.json` | Complete legal six-session match ending 50–50 |

Full-state recipes/generation live only in `tests/fixture-source.mjs` and `tests/generate-fixtures.mjs`. Every scenario is reached through legal actions without patching resources/cities/scores. `--check` makes no writes and verifies exact content, filenames, and absence of unexpected generated JSON/modules. See `fixtures/README.md` for usage.

## Verification and independent review

Local verification used **Node 24.22.3**. The owned workflow runs the full WS1 suite, fixture drift check, and smoke sweep on **Node 22 and 24**. Root `npm test` is unchanged and does not discover WS1, so the new workflow invokes its suites explicitly.

| Command | Result |
| --- | --- |
| `node --test games/odd-laws-society/tests/*.test.mjs` | **95 passed, 0 failed** |
| `node games/odd-laws-society/tests/generate-fixtures.mjs --check` | Seven scenarios/eight generated files verified |
| `node games/odd-laws-society/simulation/sweep.mjs --smoke` | 64 matches / 3,072 transitions |
| `node games/odd-laws-society/simulation/sweep.mjs --seeds 24` | 768 matches / 36,864 transitions; output matched `simulation/baseline-24.json` byte for byte |
| `npm test` | All **66 existing** game/room/LAN/controller/audio tests passed |
| `npm run build` | Existing production framework build passed; no generated tracked changes |
| `git diff --check` | Passed; final path review confirmed WS1-only changes |

The build reused an installed dependency tree whose lockfile exactly matched this checkout. No root dependencies changed. This is an existing-product regression check, not evidence of Odd Laws UI integration. WS1 itself needs no dependency installation.

Reproducible evidence is in `tests/*.test.mjs`, the legal fixture recipes, `simulation/baseline-24.json`, `simulation/README.md`, and `.github/workflows/ws1-engine.yml`. Remote CI is attached to the immutable head named in PR #4. Publication used the connected GitHub app after direct Git lacked CLI credentials; remote and locally tested Git tree IDs were verified equal.

Tests cover the worked opening, complete matches, every initial council choice/bid combination in both arrival orders, budgets 0–6, both Chairs, all 36 Economy/Civic pairs, illegal actions, exact caps, duplicates, full/exhausted markets, workshop timing, malformed/stale phases, and safe retry eligibility. Serialized privacy checks vary only the opponent's sealed choice and compare TV/host/opponent views, errors, quotes, legal actions, and rebase decisions.

Independent review adds **2,268** price/payment/influence combinations and all **64 guild triples** at every horizontal row/placement position. Review caught a sparse-agenda validation defect; repaired validation rejects malformed/accessor arrays before reading getters. Further tests verify Lydia's distinct-choice tied bids and a sixth-action Build crossing a Civic threshold before income, with prior awards preserved after law replacement. Cross-review found no remaining rule or projection defect.

## Policy sweep findings and unresolved balance

The dependency-free harness compares `economy`, `festival`, `civic`, and `efficient-building`. Each seed has one public agenda; distinct policies swap seats and both initial Chairs are tested. Numerical ledgers must swap exactly under mirrors. Both council choices are made from frozen authorized projections before either is submitted. Independent audits cover payments, revealed commands, law adoption, income, capped gains, stock, permanence, scoring, and phases.

| Policy | Player appearances | Mean score | Mean Builds | Mean Festivals |
| --- | ---: | ---: | ---: | ---: |
| Economy | 384 | 59.000 | 9.000 | 3.031 |
| Festival | 384 | 60.193 | 6.922 | 5.349 |
| Civic | 384 | 57.089 | 9.000 | 2.516 |
| Efficient building | 384 | 59.740 | 9.000 | 2.958 |

Full 24-seed digest:

```text
88b0d3c82d304555d983fe511ba7840370138a718fd5dc890e44aea089d7dcb0
```

Two-seed smoke digest:

```text
6ba8fac45275d40f837d74fabf5c2cc667bb20b972cbc89b0e0c300f008a9e46
```

Scores were **41–70**, exceeding the PRD's provisional upper range. No distinct-policy pairing exceeded its 65% investigation threshold at 24 seeds; one did in the tiny smoke, illustrating why that alone cannot establish dominance. The initial Chair won 318, lost 240, and tied 210 under these heuristics. Mirrors are correlated and do not support a statistical fairness claim.

All policies selected **zero Lobby actions**. Civic obtained influence from construction; deliberate Lobby-heavy political play remains unexplored by this baseline. Building policies often filled cities in session 5, some in session 4, then used several Work turns. Human tests should examine whether those turns feel like chosen tempo or forced filler, plus early income, Festival efficiency, opening-Chair privileges, and late law incentives.

These are diagnostics, not demonstrated human balance. No human matches, teaching times, Mac/physical-phone tests, or TV sessions are fabricated. No rules changed in response. The simulation README documents commands, APIs, sampling, ledgers, output fields, limitations, and versioning.

## Integration requests and remaining gates

1. **WS2:** issue fresh match IDs, authenticate roles, use the adapter's normalization/identity/projection, reject future revisions, and bound council-only CAS reevaluation. Project every HTTP/SSE/GET/join/start/rematch/success/retry/error/reconnect path; never expose stored pending command history.
2. **WS3:** inject only public catalog/preview helpers and projected state. Use the role fixtures, label potential treasury separately, and fence commands to the shared council or individual city-turn phase.
3. **WS5/WS6:** package all five host files and serve only the three browser-safe rules files. Explicitly allowlist any selected development fixture; exclude authority/tests/simulation from browser serving. WS6 owns registration/status, shared preparation/LAN/ZIP serving lists, generated modules, and desktop runtime-manifest additions after handoffs.
4. **WS6:** preserve component PRs and pin reviewed heads, then complete a real engine-backed TV/two-controller match with HTTP/SSE privacy, retries/reconnect/rematch, persistence, offline packaging, and existing-game regression. WS1 is testable independently of the final UI.
5. **Product acceptance:** complete the PRD's real mirrored human matches and teaching/pacing checks before calling balance validated or the game playable.

No unresolved WS1 implementation gate remains. The outstanding items are platform/product integration and observed play, not a request to merge or deploy.
