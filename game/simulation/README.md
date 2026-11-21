# Sofa Kingdoms balance sweep

A Node-only diagnostic for comparing rule versions. The bot is deterministic and imperfect: it does not model people, bluffing or long plans. Use the results to find questions for playtests, not as proof of balance.

```sh
node game/simulation/sweep.mjs --rules 4 --rounds 10 --seeds 200
node game/simulation/sweep.mjs --rules 3 --rounds 10 --seeds 200 --no-toys
```

Each seed is played twice, once with each player starting. The board is point-symmetric and the bot never reads player names, so the pair differs only in who starts. `starterShareOfDecided` is the starter's share of games that did not tie. `withoutOpeningPoint` scores the same games with the v3 opening point removed.

## The bot (`policy.mjs`, version `trip-planner-3`)

Each turn, it tries every sequence of up to two legal actions, including toys. It scores each result as 10 × (score gap) + (its best collect-and-bank trip − the opponent's). It averages two views: after this round's Lala event, and after the following event too.

Under rules v4, the bot searches from `projectState(state, me)`, so it cannot see the opponent's sealed toy. It chooses "no toy" or one toy (which costs no action), then its two actions.

**A fault in the earlier bot.** It judged the second mover's turn after the next round's event as well. That made turn order look important when it was not. This version judges every candidate at the same moment.

## Results, 21 November 2026 (200 seeds, 400 games per row)

| Rules | Rounds | Toys | Starter share | Ties | Starter share, no opening point | Mean score | Margin | Crumbs left | Rounds with both in centre | Pounce catches |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| v3 | 9 | yes | 0.32 | 40 | 0.48 | 8.0 | 3.2 | 15.0 | 0.5 | 0.15 |
| v3 | 10 | yes | 0.48 | 48 | 0.60 | 9.1 | 3.0 | 12.9 | 0.7 | 0.16 |
| v3 | 11 | yes | 0.58 | 33 | 0.69 | 9.8 | 3.1 | 11.8 | 0.7 | 0.12 |
| v4 | 9 | yes | 0.44 | 77 | — | 10.0 | 2.6 | 13.4 | 0.8 | 0.12 |
| v4 | 10 | yes | 0.46 | 46 | — | 11.0 | 3.2 | 11.9 | 0.9 | 0.10 |
| v4 | 11 | yes | 0.43 | 34 | — | 12.0 | 3.7 | 10.3 | 1.0 | 0.09 |
| v3 | 9–11 | no | 0.23–0.31 | 55–77 | 0.50–0.51 | 10.4–12.0 | 1.6–2.2 | 8.2–11.0 | 0.6–0.8 | 0.08–0.15 |
| v4 | 9–11 | no | 0.50–0.51 | 38–57 | — | 10.7–12.7 | 2.5–3.1 | 9.0–12.2 | 1.0–1.3 | 0.04–0.10 |

An earlier v4 draft, where toys changed the current round's event, gave a starter share of only 0.15–0.20. The rows above use open toys that change the next round's event.

### Sealed toys (rules v4, policy `trip-planner-3`)

In rules v4, a toy is slipped secretly, costs no action, and only one can be slipped per player per round. Both toys are revealed at the end of the round. If both players slipped one, they cancel.

| Rounds | Starter share | Ties | Mean score | Margin | Crumbs left | Rounds with both in centre | Pounce catches | Toys per game | Collisions per game |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 9 | 0.53 | 70 | 10.9 | 2.6 | 11.9 | 0.8 | 0.12 | 5.2 | 1.4 |
| 10 | 0.53 | 44 | 11.9 | 2.9 | 10.3 | 0.9 | 0.09 | 5.8 | 1.5 |
| 11 | 0.52 | 37 | 13.0 | 3.3 | 8.5 | 1.1 | 0.08 | 6.3 | 1.5 |

Sealed toys are the fairest version tested. About half of all toys cancel, because the bots slip a free toy almost every time they can. People may find that many cancellations frustrating.

## What this shows

1. **Turn order gives no advantage without toys.** Both rule sets are at 0.50 when toys are off.
2. **Toys that change the current event favour the player who acts last.** The second mover in a round sees where the first mover went, then has the last word on Lala. In v3 this makes the balance depend on game length (0.48 to 0.69 without the opening point). The opening point happens to balance the 10-round game. With v4's valuable centre, the same toy rule made the second player win about 80–85% of decided games.
3. **Rules v4 toys change the next round's event.** Both players then get a full turn to react, and the starter share becomes 0.43–0.46 at every length tested. Making the toys sealed removes the last mover's chance to override, and the starter share becomes 0.52–0.53.
4. **v4 raises scores, full bags and centre contact a little, but misses the engagement targets.** The targets were: 3 or more rounds with both players in the centre, 0.5–1 pounce catches and under 8 crumbs left. The bot avoids visible pounces easily, and people probably will too.
