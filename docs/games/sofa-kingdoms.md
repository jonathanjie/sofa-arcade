# Sofa Kingdoms rules and compatibility

The board is 5×5 and all-walkable. A match lasts ten rounds, with two actions per player per round. Players move one square, collect into a five-crumb bag, bank at their fixed home, spend a toy, or end early. Homes are Jon at A5 and Lydia at E1.

Normal room and practice matches have engine `version: 3`:

- `firstPlayer` is drawn from an independent deterministic seed stream; normal hosted and practice games supply fresh seeds. The initial second player receives `openingBonus: 1`, the starter receives zero. This is a one-time secured point, not an extra crumb or action. `SECOND_PLAYER_BONUS` is the tuning constant; equal win rates have not been established.
- `roundStarter(state, round)` alternates relative to `firstPlayer`; v1/v2 games keep their historical Jon-first parity. The tutorial passes `firstPlayer: 'jon'` for repeatable lessons. Invalid explicit overrides are rejected.
- Carried crumbs do not score. Banked crumbs score one point each; banking a full five-crumb bag also awards **two bonus points**.
- Each player starts with two toys. Banking at least three crumbs restores **one used toy**, capped at two.
- One action and one toy can select any row or column and either direction for the current swipe. Choosing the unchanged forecast is invalid. Pounces and naps cannot be redirected.
- `banked` remains the conserved physical crumb count. `bonusPoints` records delivery bonuses and `openingBonus` records the one-time second-player allowance. `scoreFor(player)` adds all three for display/scoring.
- `upcomingForecasts(state, count = 1)` accepts a count of zero, one or two. It returns deterministic future events as `{ round, ...forecast }` through the final round, with an empty list outside active play. V3 toys change only the current forecast.

Existing version 1 states retain their original scoring, non-replenishing toys, and same-axis/same-direction redirection through match completion. Version 2 states keep delivery bonuses, recharging toys, and expanded steering, with Jon as their initial starter and no opening point. Starting a new match creates version 3. Keep these compatibility paths when changing rules.

Lala resolves after both players' turns. A swipe moves the selected tiles, crumbs, and occupants one square with edge wrapping; home positions stay fixed. A pounce affects the center and four orthogonal neighbours, **not diagonals**. Caught players drop every carried crumb onto their current tile and return home, retaining banked points. A nap leaves the board unchanged. Nobody is eliminated; equal final scores share the crown.

Turn order alternates relative to the initial draw: **drawn starter → other player → Lala**, then **other player → drawn starter → Lala**. After Lala acts, the player who ended the previous round starts the next one with two fresh actions. The UI shows the actual round order and announces the scheduled starter even when `activePlayer` stays the same. Legacy games and the pinned tutorial use Jon as the initial starter.

Swipes use a continuous amber lane, highlighted coordinate, and direction cues. Pounces use a coral five-cell cross and a center target. Landing previews stay optional; the forecast card also shows the following round's event.

Steering idempotency keys include explicit `axis` and `direction` while preserving omitted fields for older index-only requests. Do not infer omitted fields from the current forecast when computing retry identity: a later action may have changed it.

Rules v4 are an opt-in engine prototype with sealed toys. The legacy Sofa Kingdoms room adapter returns the full board. Keep v4 opt-in until the room projects each viewer’s state, accepts the sealed actions, and both the TV and phone screens support them.
