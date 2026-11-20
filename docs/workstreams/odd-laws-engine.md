# WS1 — Odd Laws Society rules engine

## Scope and checkpoint

- Branch: `feature/odd-laws-engine`.
- Base: `e34b0015399cb9791b175987adf1fab1b542565a`, verified against remote `main` on 20 November 2026.
- Isolated clone; all authored changes are limited to `games/odd-laws-society/**`, `.github/workflows/ws1-engine.yml`, and this report.
- Rules source: the complete city-building specification, `docs/games/odd-laws-society.md` v0.2, with the v1 local implementation contract. Numerical rules are preserved; balance remains unproven.
- Status: complete rules/catalog, previews, authenticated projection, and seven canonical fixture scenarios are implemented and pass the current 89 tests. Policy simulation and final independent review are in progress. This checkpoint is not yet a final handoff claim.

Three disjoint tasks implemented catalog/authority, public previews/projection/fixtures, and adversarial tests/policy simulation. The primary session owns integration, the component workflow, final rule review, verification, and this report. Review has already caught and repaired malformed sparse setup-agenda handling; a regression verifies safe rejection before getter evaluation.

## Integration contract

The public adapter is `engine` from `games/odd-laws-society/engine.mjs`, with `gameId`, `playerIds`, `create`, `apply`, `normalizeAction`, `actionKey`, `project`, and `canRebaseAction`.

Creation requires the authority to supply a fresh `matchId` independently of the setup seed. This keeps deterministic creation and replay while ensuring rematches cannot accept old phase IDs. Teaching/simulation options may pin `firstChair` and a complete valid six-session agenda; they do not alter numerical rules.

Private council state stores fixed opening budgets and sealed commitments. Influence is deducted only when the second commitment resolves the council. Each city turn has a distinct phase ID containing the match, session, and individual action index. The engine exposes no generic history containing pending choices. Duplicate action IDs and revision/CAS management belong to WS2; only a still-legal unsubmitted council commitment may be rebased.

The final report will enumerate exact exports, runtime/browser file lists, fixture paths, test commands and results, policy sweep evidence, and outstanding integration/balance gates.

## Dependencies and handoff requests

- WS2 must generate a fresh match ID for start/rematch, derive player/viewer identity from verified credentials, project every outward response, and retain action-ID idempotency plus bounded revision handling.
- WS3 receives only the projected shape and browser-safe catalog/preview helpers. Canonical fixture snapshots will be supplied under `fixtures/projected/`.
- WS6 owns actual registration, catalog status, shared serving/packaging allowlists, and the final TV/two-controller acceptance. This branch does not modify those files or mark the game playable.
- No deployment or merge is part of WS1.

## Verification record

Checkpoint results on Node 24.22.3:

| Command | Result |
| --- | --- |
| `node --test games/odd-laws-society/tests/*.test.mjs` | 89 passed, 0 failed; simulation tests pending |
| `node games/odd-laws-society/tests/generate-fixtures.mjs --check` | Seven scenarios/eight generated files verified |
| `npm test` | All 66 existing Sofa Kingdoms/room/LAN/controller/audio tests passed |
| `npm run build` | Existing production framework build passed; existing dependency tree matched the checked-in lockfile; no generated tracked changes |
| `git diff --check` | Passed |

The independent review suite exhausts 2,268 price/payment/icon combinations and all 64 guild triples at every horizontal row/placement position, beyond the catalog, accounting, law-pair, privacy, and validation suites. Canonical fixtures come from legal traces and include a complete 50–50 final tie.

The framework build is a regression check; Odd Laws remains deliberately unregistered. No human playtests, physical phone/Mac tests, or whole-product acceptance are claimed.
