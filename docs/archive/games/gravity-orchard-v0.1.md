> Historical design. The realtime design superseded this proposal on 21 November 2026 at `6c6eb93`.

# Gravity Orchard — provisional PRD and design

**Status:** design draft; not implemented. **Catalog ID:** `gravity-orchard`. **Mode:** tactical rivalry. **Target:** 15–20 minutes. **Branch:** `feature/gravity-orchard`.

Read [parallel development](../../PARALLEL_DEVELOPMENT.md) first. This is the recommended first new game to integrate because all gameplay information is public.

## Experience and core idea

Jon and Lydia tend a peculiar orchard inside a rotating garden box. Plant a seedling, tilt gravity, and watch ripe fruit tumble toward the baskets around the edge. A seedling planted now ripens on the other player's turn, so every move creates both an opportunity and a threat.

The fun comes from seeing an apparent gift to your opponent become a setup for a larger catch after the next tilt. The engine uses grid rules, not a physics simulation; the animation must faithfully illustrate the deterministic landing preview.

## MVP rules

- A **5×5 grid** has one immovable stone at C3. The initial gravity points down. The remaining 24 cells begin empty.
- Each side of the box has basket openings at edge indices **1 and 3**, counting from zero in screen order. All other boundary positions act as walls. North/south indices run left-to-right; east/west indices run top-to-bottom.
- Jon owns north-1, east-1, south-3, and west-3. Lydia owns the other four openings. Each player therefore has four baskets. Show ownership with character badges and patterns, not color alone.
- A visible seed queue contains **20 fruit tokens**: eight apples worth one point, eight pears worth two, and four starfruit worth three, shuffled deterministically. Show the current token and the next two. For the public-only MVP, the full remaining sequence may be available in an optional seed tray; it is not secret information.
- Randomly choose the first player; turns alternate for **20 turns**, ten each. A rematch may offer the same seed with players' basket assignments swapped for a paired comparison.
- On your turn, place the current seedling in any empty non-stone cell, then choose **hold**, **quarter-turn clockwise**, or **quarter-turn counterclockwise** for gravity. Submit these as one action after inspecting the landing preview.
- All seedlings that existed **before** this turn ripen. The newly planted seedling remains rooted for this resolution. Rooted seedlings block falling fruit just like a stone for one turn.
- Ripe fruit moves in the new gravity direction until blocked. It falls out only through an owned basket opening and immediately scores its printed value for that basket's owner, regardless of who planted it.
- If one player catches **two or more fruits in this single resolution**, add a two-point harvest bonus once for that player. Both players can earn a bonus from the same tilt. A bonus counts fruit objects, not their printed values.
- After turn 20, ripen the final seedling and settle once more under the current gravity. Treat this as a separate final resolution with the same bonus rule. Fruit still resting in the box does not score. Highest total wins; equal totals share the win.
- If a future board variant has no empty planting cell, the legal fallback is a tilt-only action, consuming that turn and discarding the queue token visibly. The initial 24-cell/20-token MVP should not reach this branch, but its behavior must be explicit rather than deadlocking.

### Exact settling algorithm

Treat columns or rows as independent lanes along gravity, split by the stone and rooted seedlings. Process the furthest-downstream ripe fruit first, then move toward the upstream end. Each fruit slides to the furthest reachable empty cell or exits through the downstream basket opening. Vacated space is available to the next fruit in that lane during the same resolution. A non-opening boundary stops fruit in its edge cell.

No diagonal movement, bouncing, momentum, or random collisions. Preserve stable fruit IDs in the resolution event list so the renderer can animate the same result. A preview calls the same pure resolver on a copy and cannot consume the real seed queue, advance turns, or change scores.

## Strategic depth and balance hypotheses

The newly planted seed is temporarily a blocker and a future neutral fruit. Placing it can trap another fruit until a profitable tilt, or hand the opponent a convenient catch. Holding gravity can be stronger than rotating if it prevents a harvest bonus. A two-fruit catch may justify surrendering a small fruit elsewhere.

Opening ownership is symmetric in count but the initial gravity/queue may still favor the starter. Test paired seeds with swapped players and opening assignments, and show results as prototype evidence rather than a human balance guarantee. Do not add an arbitrary score handicap until a concrete first-player effect is observed. A starter advantage can be addressed with a paired rematch or altered opening before adding another permanent resource.

## Screens and interaction

**TV:** the garden box fills most of the screen. Fruit carries a shape and value; baskets show owners; a large gravity indicator sits outside the board. The next seeds, scores, and active player form a compact sidebar. Preview uses translucent landing ghosts and a per-player projected score delta; actual scoring animates only after confirmation.

**Phone:** a tappable 5×5 placement grid, a selected seed, three large tilt choices, and Commit. The TV shows the active player's preview because the game is public. The waiting phone can inspect the board but cannot alter that preview. Keep explanations behind a small Help control.

**Tutorial:** plant a seed; see it stay rooted; take the next turn and watch the earlier seed ripen; catch fruit; demonstrate a two-fruit bonus. Use a separate fixture rather than secretly changing a real match to guarantee a lesson.

**Art/motion/music:** hanging planters, wood, leaves, pear-shaped fruit, canvas baskets, and gardener outfits for Jon/Lydia. The box's frame can subtly rotate while the grid remains legible; avoid spinning the entire UI or asking players to rotate phones. Fruit follows the exact grid path with gentle squash on landing. Music uses a light marimba/plucked motif with an authored bass pattern. Reduced motion shows the gravity change and destination highlights without tumbling.

## State and action contract

Own `games/gravity-orchard/` and `ui/games/gravity-orchard/`. Proposed state: `rulesVersion`, `matchId`, `seed`, `turn`, `starter`, `activePlayer`, `gravity`, `cells`, fruit IDs/types/stages, queue/index, basket ownership, scores, last resolution events, and result.

Primary action: `plantAndTilt({ cell: { row, col }, rotation: -1 | 0 | 1 })`. A `tiltOnly` action is legal only when no planting cell exists. Require exact integer coordinates, valid rotation, correct actor, and a playing phase. The entire proposed plan is atomic; clients cannot plant once and tilt twice through retries.

Export a pure `previewTurn(state, actor, action)` returning the resulting public board and score deltas. All state can be projected publicly for v1, so shared deterministic prediction is appropriate after the common interface supports it. Use authoritative revisions and IDs exactly as other games do; animation does not advance a turn.

## Scope and acceptance

MVP: one fixed stone layout, three fruit values, twenty turns, public preview, eight basket openings, harvest bonus, tutorial, results, online/LAN play. Later: more stones/hedges, special fruit, authored challenge boards, and optional paired-seed leagues. Do not begin with continuous rigid-body physics, a board editor, or hidden power cards.

Acceptance criteria:

- Settling terminates and conserves every fruit across planted, rooted, resting, caught, and explicitly discarded categories; score changes match caught IDs and bonuses.
- All four gravities, wall edges, each basket, stone/seedling blockers, packed lanes, chained falls, final ripening, and simultaneous bonuses have hand-checked fixtures.
- The preview and committed result match exactly for every legal action over a seeded sweep.
- Rotation and basket ownership remain consistent after any number of turns; no visual rotation silently changes coordinate interpretation.
- Twenty turns always give each player ten moves and one final flush. Retries cannot duplicate seeds or points.
- A new player can distinguish rooted/ripe fruit and understand where a preview will land from the TV alone.

Open questions: whether unrestricted placement makes the best move too obvious; whether the two-point harvest bonus overwhelms fruit values; whether twenty turns sustain interest. Resolve through a small complete prototype and paired playtests before adding special powers.
