# Footprints at Midnight — provisional PRD and design

**Status:** design draft; not implemented. **Catalog ID:** `footprints-at-midnight`. **Mode:** asymmetric hidden movement. **Target:** 20–30 minutes for two legs. **Branch:** `feature/footprints-at-midnight`.

Read [parallel development](../PARALLEL_DEVELOPMENT.md). This game must remain planned until authenticated state projection covers every API response and LAN stream. The current public Sofa Kingdoms snapshot cannot be reused unchanged.

## Experience and core idea

One player guides a secret midnight wanderer through a little moonlit garden; the other follows the rustles and footprints. The TV is a common map of known evidence, while the wanderer's phone knows where they really are.

Roles swap for the second leg so both players get to be clever in each direction. The tone is hide-and-seek, with Lala sneaking between planters and a gentle lantern-bearing tracker. Catching a character ends a leg; there is no violence, elimination from the evening, or dexterity requirement.

## Map and roles

- The MVP garden is a **6×6 orthogonal grid**, A1–F6. All cells are traversable; hedges block four edges: C2–C3, D4–D5, B3–C3, and D4–E4. Treat edges as undirected. The graph remains connected.
- Four snack stashes sit at C1, F3, D6, and A4. Four exits are the corner squares. The tracker starts at C3.
- The wanderer privately chooses one corner as their starting location before round one. The TV shows that setup is complete but not the chosen corner.
- Randomly assign first-leg roles to Jon/Lydia, then swap them for leg two. Use the same public map and token counts. Leg two has a fresh private start and blank trail, not a replay of the first player's route.
- A leg lasts at most **twelve rounds**. Every round the wanderer acts first, then the tracker receives two actions. This is an intentional role-specific order, compensated by swapping roles for the full match rather than pretending the roles have equal actions.

## Wanderer rules

Choose one action each round:

- **Step:** move across one unblocked edge.
- **Wait:** stay in place.
- **Dash:** traverse two legal edges, spending one of two dash tokens for the leg. Submit both intermediate and final cells so path legality is verifiable. Crossing a stash or exit without ending there does not collect or escape.

Ending movement on an unvisited stash automatically collects it and rings a public bell at that stash. Collecting the same stash again does nothing. The wanderer must visit **two distinct stashes**, then end a later move at any corner **other than their starting corner** to escape. “Later” means the escape check cannot occur on the same action that first reaches the second stash; in this map stashes and corners are already distinct, but preserve the rule for future layouts.

The wanderer has **one Cover token**. On a round divisible by three, they may spend it with their normal move to wash away that round's scheduled footprint. The TV shows that the trail was washed away. It does not suppress a stash bell, and it cannot be spent on a round with no scheduled footprint.

The wanderer sees their exact position, own full route, visited stashes, tokens, the tracker, and all public evidence. They never receive hidden tracker intentions because the tracker has no simultaneous sealed plan in v1.

## Tracker rules

After the wanderer moves and public clues resolve, the tracker takes two actions, choosing Move, Search, or End turn:

- **Move:** traverse one unblocked edge. Walking through or onto the wanderer's square does not automatically catch them; the wanderer may be concealed in the scenery.
- **Search:** choose the tracker's current square or one orthogonally adjacent cell connected by an unblocked edge. A search reports Found or Empty for that exact square at that moment. It does not scan a whole row or reveal distance.
- **End turn:** discard remaining actions.

A successful search immediately catches the wanderer and ends the leg. A miss consumes one action and produces a public, round-labelled search marker. Old empty markers remain evidence of a past time, not permanent guarantees that a square is empty. The tracker can move then search, search twice, or move twice.

## Clue timing and leg ending

At the end of the wanderer's action in rounds **3, 6, 9, and 12**, publish their exact **end position from two rounds earlier**. Thus round 3 reveals the end of round 1, and round 6 reveals the end of round 4. Mark the evidence with the round it refers to, not merely when it appeared. A Cover token replaces only that scheduled reveal with “Trail washed away.”

Stash bells reveal the stash reached on the current move. Public dash-token count may decrease, revealing that a dash was used, but the path remains private. Public cover usage and collected-stash count are visible. Search results refer to the wanderer's current location. Keep these evidence types visually distinct.

Check escape after the wanderer's action and required public clue events; a valid escape ends the leg before the tracker acts. Otherwise resolve the tracker's turn. If round twelve ends without an escape, the tracker holds the garden and the leg ends. Successful capture ends immediately. No future clue is revealed simply because the UI advances an animation.

After a leg ends, reveal its route and permit a short step-through replay. Clear it before the next leg. Role-swap setup requires both phones to acknowledge their new roles so one person is not handed a secret screen without context.

## Match scoring and strategic choices

Each player earns a score for the leg in which they were the wanderer:

- Three points per distinct stash visited, capped at two scoring stashes.
- Six additional points for escaping.
- One additional point per unused round when escaping: `12 - escapeRound`.

Capture or timeout earns only the visited-stash points. After both legs, higher wanderer score wins; equal scores share the win. Show the narrative outcome and route alongside the number so the comparison is intelligible. This is a provisional paired-performance rule, not a proven balance formula.

The wanderer weighs a fast visible stash route against a quieter detour. Dashes create distance but consume a finite resource and announce that a longer move was possible. Cover may deny a crucial late clue, but an early use can prevent the tracker from narrowing the initial corner. The tracker combines old positions, legal reachability, bells, and precisely timed misses; spending both actions on movement sacrifices immediate searches.

## Screens, tutorial, and presentation

**TV:** public garden, tracker pawn, collected-stash bells, exit markers, round, public token counts, and time-stamped evidence. **Never display the current hidden pawn, unrevealed path, or an animation from its hidden origin.** A neutral rustle can show that the wanderer finished their turn without indicating location.

**Wanderer phone:** private map with exact position, legal step/dash choices, Cover when eligible, and Commit. Give a clear private-screen label. **Tracker phone:** public map, large movement controls, and a Search selection mode highlighting eligible cells. Neither phone needs a permanent rulebook.

An optional public deduction overlay can mark user-selected possible squares. It is a personal annotation, not a server hint secretly computed from the real hidden position. Do not automatically remove candidates using information the tracker has not earned.

**Tutorial:** a small scripted garden teaches a hidden move, a delayed footprint, a search miss, and capture. Let the learner swap roles in the tutorial. Do not expose real-match secrets to teach a rule.

**Art/motion/music:** muted blue-green garden, paper lantern pools, hedges, tiny wet footprints, Lala's tail on the private wanderer view, and a cozy detective costume for the tracker. Animate only public movement on the TV. A quiet composed pizzicato/woodwind motif supports suspense without a loud countdown. Reduced motion keeps location/evidence changes instantaneous and clearly labelled.

## Technical design and privacy contract

Own `games/footprints-at-midnight/` and `ui/games/footprints-at-midnight/`. Full state includes `rulesVersion`, `matchId`, map ID/graph, leg/round/stage, role assignment, hidden start/current position/route, tracker position/actions, dash/cover tokens, stashes visited, pending next-leg acknowledgements, public clue log, search log, and leg/match result.

Actions: `chooseStart({ cornerId })`, `wander({ path, cover: boolean })` with a zero-edge path for Wait, `trackMove({ cell })`, `search({ cell })`, `endTrackTurn`, and `acknowledgeRole({ leg })`. The server validates actor role, path length/edges, token cost, phase, and current match/leg. A client cannot request a search as the wanderer or supply its own Found result.

Host/public/tracker projections contain **only** the tracker position, public map/evidence, permitted counters, and ready state. Wanderer projection adds their own secrets. After leg finish, the authorized public replay is a separately constructed revealed route. Do not include a private random seed that reconstructs the start or route. Do not send hidden coordinates in legal-action errors, stale-response payloads, DOM attributes, SSE events, telemetry, or debug logs.

The tracker can preview a legal move locally because its destination is public. It cannot predict a search result from a full secret state. The wanderer can preview its own path but must wait for authoritative acceptance before consuming tokens or revealing public events. Retain stable action IDs, match/leg identity, and explicit rules-version compatibility.

## Scope and acceptance

MVP: one connected map, two role-swapped legs, four stashes, twelve rounds, step/wait/two dashes, one Cover, delayed footprints, exact-cell searches, route replay, tutorial, results. Later: alternate maps, cosmetic roles, carefully bounded decoys, and authored deduction challenges. Do not start with live GPS, real-time pursuit, invisibility timers, or arbitrary user-written clues.

Acceptance criteria:

- Graph fixtures verify every blocked edge, all start corners, legal dash paths, and a possible two-stash escape from each corner. This proves possibility, not fair difficulty.
- Round-3/6/9/12 clues reveal the correct historical positions; Cover suppresses exactly one scheduled clue and never a stash bell.
- Capture, timeout, escape, same-square non-capture movement, search misses, token exhaustion, and role swaps have deterministic replays.
- Both players receive exactly one wanderer leg; scoring uses the actual escape round and caps scoring stashes at two.
- Serialized public/host/tracker responses for GET, start, action, retry, reconnect, and streams contain no hidden state. The final replay reveals only after the leg actually ends.
- Rejoining restores the correct role and private view without replaying an action or leaking the other leg's current route.
- Two people can use old footprints without mistaking them for the current location; a spectator watching only the TV cannot infer the hidden pawn from animations or highlight updates.

Open questions: whether the small garden is too easy to sweep, whether current stash bells expose too much, whether early escape bonuses dominate exploration, and whether twelve rounds feel long. Use complete paired matches and record role-specific outcomes before adding a score handicap or extra hiding powers.
