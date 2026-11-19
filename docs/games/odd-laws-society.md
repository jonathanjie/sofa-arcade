# The Odd Laws Society — provisional PRD and design

**Status:** design draft; not implemented. **Catalog ID:** `odd-laws-society`. **Mode:** playful tactical rivalry. **Target:** 20–25 minutes. **Branch:** `feature/odd-laws-society`.

Read [parallel development](../PARALLEL_DEVELOPMENT.md). This game is public information and can follow Gravity Orchard through the shared registration gate.

## Experience and core idea

The living-room council has given Jon and Lydia the power to rewrite the rules. Cross a little board collecting prestige stars, but first propose the law that would make your current position much more convenient. Your partner can spend a scarce objection to force a different law.

The comedy should come from understandable combinations—“Corners are suddenly fashionable” plus “Corner ferries are now legal”—rather than random exceptions or long legal text. All laws are prewritten, bounded templates with deterministic effects. The MVP does not accept arbitrary rules, executable expressions, or AI-generated mechanics.

## Board and match rules

- A public **5×5 board**, no blocked cells. Jon starts at A5 and Lydia at E1. Pawns may share or pass through a square; there is no capture or elimination.
- There are **six rounds**, with two actions per player each round. Randomize the initial starter and alternate the starter each round. Each player therefore receives twelve actions and proposes three laws.
- An action is Move according to the active movement law, Collect one prestige star from your current square, or Pass. A square holds at most one star. Pass always remains legal.
- Each star normally gives one point and is removed when collected. There is no carried inventory or banking step.
- Start with eight stars at A1, E5, C1, C5, A3, E3, B2, and D4. At the start of rounds three and five, add stars to the first four empty cells in that round's pre-shuffled public refill list; do not displace a pawn or existing star. The refill list includes every cell exactly once and is available in a collapsible forecast. Cells occupied by pawns remain eligible.
- The game ends after both turns in round six. Highest prestige wins; equal scores share the crown. There are no additional points for position or unused objections.

## A round's law-making phase

Before either player moves, reveal three law cards from the public shuffled law deck. The round starter proposes one of them. The other player can accept it or spend one of their **two objections for the match** to reject it and choose either of the other two offered cards instead. That replacement is final; there is no second veto or negotiation loop.

There are two active law slots: **Movement** and **Scoring**. The adopted card replaces the current card in its own category. The other slot stays in force. The starting laws are “Move one orthogonal square” and “One point per star.” Discard the unchosen offers and any displaced catalogue law after adoption; the two starting defaults are not deck cards. Refill the deck from discarded inactive cards in deterministic order/shuffle when necessary, excluding the two active cards. Each offer must contain three distinct inactive cards.

The proposed law takes effect for **both** players before either turn. It remains in its slot until replaced. Show a before/after movement preview and the specific squares affected by a scoring law while choosing; do not force players to mentally reconstruct a rule stack.

## Initial law catalogue

Movement cards replace the complete movement rule; scoring cards modify only a Collect action. Do not stack multiple cards within the same category.

| Movement law | Exact allowed move |
| --- | --- |
| Open Roads | One or two squares in a straight orthogonal line |
| Diagonal Permits | One orthogonal or diagonal square |
| Roundabout Borders | One orthogonal square, wrapping to the opposite edge |
| Knight for a Day | A chess-knight displacement: two on one axis and one on the other |
| Long Strides | Exactly two squares in a straight orthogonal line; no wrapping |
| Corner Ferry | The basic one-square orthogonal move, or from one corner to any other corner |

| Scoring law | Exact effect when collecting one star |
| --- | --- |
| Fashionable Corners | One bonus point if the star is in a corner |
| Friendly Neighbours | One bonus point if the other pawn is orthogonally adjacent |
| Peace and Quiet | One bonus point if the other pawn is neither on this square nor orthogonally adjacent |
| Centre Stage | One bonus point if the square is in row 3 or column C; the centre still gives only one bonus |
| Public Generosity | The collector receives two points; the other player receives one |
| Help the Underdog | One bonus point if the collector had strictly fewer points immediately before this action |

Check legal movement against board bounds and the active movement template. There are no path obstacles. Distances and adjacency are computed on the visible grid; Roundabout Borders affects legal moves only, not scoring adjacency. Public Generosity is a replacement score effect, not an extra two points on top of the base. Each other scoring law adds at most one point to the base.

## Strategic choices

Players can adopt a movement rule that opens a distant star, or change the scoring rule before the opponent exploits it. Spending an objection now may prevent an immediate large gain but leave no answer to a better combination later. Keeping an unfavorable law temporarily can be correct if changing it also helps the other player more.

Because every rule is public and bounded, the preview can show exactly where both players could move under an offered law. Avoid a stronger hidden card hand in the first version; the shared legal situation is the central puzzle.

## Screens, tutorial, and creative direction

**TV:** large board, scores and objection tokens, two concise active-law cards, current order, and the law market only during the proposal phase. During a turn, the active player's legal destination squares are subtly marked. Collect previews show the concrete point change for both players when relevant.

**Phone:** during law-making, choose among three cards or Accept/Object; selecting Object expands only the two alternatives. During a turn, show destination selection, Collect, and Pass. An optional “Why?” disclosure explains an unusual legal move or bonus. Keep the full law catalogue in Help.

**Tutorial:** a short scripted fixture teaches base movement and collection, adopts Corner Ferry, then Fashionable Corners, and demonstrates one objection. The tutorial must illustrate that the same adopted law helps either player.

**Art/motion/music:** a tiny civic hall made from stationery, stamped rule cards, warm wood, mischievous ceremonial outfits, and Lala as an easily distracted chaircat. A new law stamps onto its slot; affected squares briefly react. Use a composed chamber-comedy motif—clarinet-like lead and pizzicato—not a fanfare on every button. Reduced motion substitutes a stamp highlight for card sweeps.

## State and actions

Own `games/odd-laws-society/` and `ui/games/odd-laws-society/`. State includes `rulesVersion`, `matchId`, seed, round/stage, starter/active player, actions remaining, pawn positions, stars/refill lists, scores, objection counts, active law IDs, deck/discard/offers, proposed card, and result.

Action families: `proposeLaw({ cardId })`, `acceptLaw`, `objectAndChoose({ cardId })`, `move({ row, col })`, `collect`, and `pass`. The same actor does not have authority in every stage: proposer, responder, and turn player are explicit state fields. Normalize the exact selected card/destination for retry identity. All state is public, so deterministic previews and public-state prediction are allowed after integration.

Law functions are pure data-driven dispatch over known IDs. Apply movement legality, then resource removal, then score calculation using the pre-action scores/positions, then turn advancement. No scoring hook may recursively trigger another collect or movement action.

## Scope and acceptance

MVP: the fixed board, twelve laws, six rounds, two objections each, deterministic refills, complete tutorial/results, online/LAN play. Later: authored board variants, team co-op challenges, more carefully tested templates, and a law drafting mode. Do not begin with free-text law creation or unlimited rule stacking.

Acceptance criteria:

- Every movement law works at corners, edges, and centre; every movement/scoring pairing completes legal turns without recursion or deadlock.
- Reference fixtures verify each scoring law, shared-square adjacency, tied scores, Public Generosity, and both underdog cases.
- A player without objections cannot reject a proposal; a veto is spent once, adoption affects both players, and stale law commands cannot act during movement.
- Deck/refill behavior cannot offer duplicate/active cards, duplicate a star, or accidentally change an existing offer during reconnection.
- Every legal turn has Pass, all six rounds finish, and each player gets equal actions/proposals.
- The TV and phone preview agree with the committed point/movement result. Two players can explain the two active laws without opening the full rulebook.

Balance questions: whether unrestricted diagonal/knight movement dominates basic alternatives, whether a late objection matters too much, and whether the refill gives an avoidable first-player advantage. Use paired seeds and actual play before changing the number of categories or adding modifiers.
