> Historical review of the 21 November 2026 baseline. The later merges that day superseded this snapshot.

# Gameplay analysis — Sofa Kingdoms, Odd Laws Society, Gravity Orchard

**Date:** 21 November 2026. **Sources:** `game/engine.mjs`; `games/odd-laws-society/` and its `simulation/baseline-24.json`; `games/gravity-orchard/` on `feature/gravity-orchard-integration` (draft PR 17) with its route-proof table; the PRDs in `docs/games/`.

**Evidence limits.** All numbers come from bots, not people. The Sofa Kingdoms numbers come from a new greedy two-action bot (`work/sofa-kingdoms-greedy-sim.mjs`, 200–300 seeds per run, ignored by Git). The Odd Laws numbers come from the existing 768-match heuristic sweep. The Gravity Orchard numbers come from the GO1 route-proof pilot. Use them to find questions for playtests, not as final balance results.

> **Correction (same day).** Two Sofa Kingdoms claims below were wrong.
> - The starter advantage without the opening point is a fault in the bot, not in the rules. An independent rerun with the opening point removed gave 8 rounds 197–25, 9 rounds 86–83, 10 rounds 152–34, 11 rounds 84–82 and 12 rounds 141–51 (starter–second). The advantage appears only at even round counts. With no interaction, both players act before every Lala event, so turn order gives no advantage. The opening point therefore corrects nothing and only gives the second player every tie.
> - A fixed route banks about 10 points in 17 actions, so people will score more than the bot's mean of 6.5, and ties will be more common.
>
> See [the design brainstorm](2026-11-21-design-brainstorm.md).

## Summary

| Game | Strongest part | Biggest problem | First change to try |
| --- | --- | --- | --- |
| Sofa Kingdoms | Lala's forecast plus toys gives readable, short plans | Players do not interact, and ties decide the opening point | Put more crumbs in the centre and make crumbs come back |
| Odd Laws Society | A real economy, a shared market and public laws | Politics barely matters, and the initial Chair wins 57% of decided games | Make influence more useful and look at the Chair schedule |
| Gravity Orchard | Real cooperation: every recipe needs both trays | The spawn timer sets the pace, so skill changes little | Make spawns faster for teams that keep up, and add more challenge per stage |

## 1. Sofa Kingdoms

### How it plays

It is a 5×5 board with 10 rounds and 2 actions per player per round, so each player has 20 actions. There are 27 crumbs: 12 mirrored pairs of 2, plus 3 in the centre. Lala's script is fixed: swipes in most rounds, pounces in rounds 3 and 9, and a nap in round 6. Each pounce lands in the centre 3×3. Players see the current round's event before they act.

### Bot results

| Measure | Value |
| --- | --- |
| Mean final score | 6.5 (range 0–10) |
| Crumbs never collected | about 17.5 of 27 per game |
| Pounce catches | about 0.1 per game |
| Full-bag (5-crumb) deliveries | about 1.4 per game, both players together |
| Games decided by 0–1 points | 52–56% |
| With the opening point | second player wins 54–67% of decided games |
| Without the opening point | starter wins 79% of decided games, and 37% of games tie |

I made the bot stronger, and its scores did not change. The limit is in the rules. In 20 actions, a player can clear the four 2-crumb tiles next to their burrow (about 14 actions for 8 crumbs) and has little time left for anything else.

### Findings

1. **It is mostly parallel solitaire.** Each player clears their own corner. The two routes rarely cross. A pounce almost never catches anyone, because it is announced a round ahead, lands only in the centre, and players have no reason to go to the centre. Toys changed the bot results very little.
2. **The opening point is a tiebreaker.** The mirrored board creates many ties (37% without the point). With the point, the second player wins every one of those ties. A 1-point allowance in a game where most players score 6–10 is large: it moves the balance from about 79/21 for the starter to about 46/54.
3. **Half of the crumbs do not matter.** The far-side crumbs and the centre 3 are rarely worth the trip. So the "risky centre" choice the design wants does not happen.
4. **Lala is predictable.** The beat pattern is the same in every match: pounce in rounds 3 and 9, nap in round 6. Experienced players will learn it, and that removes most of the tension.

### Changes to try

- **Make the centre worth the risk:** put about 5 crumbs on (2,2), or let Lala drop 1–2 new crumbs in the centre after each pounce.
- **Make crumbs spread:** each swipe could carry a crumb from a far tile toward the middle. That pulls players toward each other.
- **Make the pounce matter:** let it hit any square except the burrows, or vary the rounds between matches. For example, choose the pounce rounds from {3, 4} and {8, 9}.
- **Replace the opening point** with something that does not decide ties. For example, the second player starts with one extra toy, or ties are broken by banked crumbs.
- **Add a reason to interact:** stealing, or claiming a dropped bag first, gives players a reason to share a lane.

## 2. The Odd Laws Society

### How it plays

There are 6 sessions, each starting with a sealed council and followed by 3 city actions per player: Build, Work, Lobby or Festival. Each player has a 3×3 city and buys from a shared market with 2 copies of each design. Two laws are active at a time: one Economy law and one Civic law. The score is printed prestige, plus streets, Festivals, Civic awards and treasury.

### Bot results (768 matches, 4 policies, seats and Chair mirrored)

| Measure | Value |
| --- | --- |
| Score range | 41–70 (the PRD target is 35–60) |
| Policy win rates in distinct pairings | 40–63%, none above the 65% flag |
| Initial Chair | 318 wins, 240 losses (57% of decided games) |
| Lobby actions | 0 by every policy |
| Mean bid | about 3 influence per match (about 7.7 for the Civic policy); a bid of 3 was never used |
| Influence unspent at the end | about 5 per player |
| Festival points | 12–21 of about 60 |
| Same policy against itself | 48 of 48 ties, every time |

### Findings

1. **Politics is the main idea, but it does not matter enough.** No policy ever lobbies, bids stay at 0–1, and influence is left over at the end. One Civic award is at most 2 points per session, and a subsidy saves 2 coins. Neither is worth an action. Bots are not people, but this matches the PRD's own risk list ("politics is irrelevant").
2. **Almost everything trades at about 1 coin for 1 prestige.** A Festival is 3 coins for 3–4 prestige, a Tea Stall is 2 coins for 2, and the Observatory is 7 coins for 9. When every choice trades at the same rate, decisions become arithmetic, not strategy. The Festival is the best deal and is repeatable, so the Festival policy gets 21 of its 60 points from it.
3. **Two copies of every design weakens the market.** Identical policies always tie, because both players can buy the same building. A player is denied a building only when the opponent buys both copies, and that usually wastes the opponent's money.
4. **The initial Chair has an advantage.** The A,B | B,A | A,B schedule still gives one player first access in two of the three terms. The 57% figure comes from mirrored bot games, so it is a signal to check, not proof.
5. **Cities fill in session 5.** Most building policies fill all nine plots by session 5 (328 of 384 games for Economy) and then have nothing to do but Work. The last session, where the expensive landmarks are, then gives them few choices.

### Changes to try (one at a time, with a new rules version)

- **Make influence worth more:** let a council win also secure 1 prestige, or let losing bids be refunded by half. Raise the Civic award cap to 3.
- **Change the Festival:** make it cost 4 coins, or only score 3 when the player's own city has a Culture building.
- **Make some designs single-copy,** especially the Term III landmarks, so the market becomes a contest.
- **Make prestige per coin vary more:** cheap buildings should be weaker and landmarks stronger, so saving up is a real plan.
- **Fix the Chair asymmetry:** run a sweep with a 3+3 Chair schedule, or give the player with fewer first actions 1 starting influence.
- **Keep late sessions interesting:** add 1–2 "renovate" options, such as replacing a building at a cost, so a full city still has decisions.

## 3. Gravity Orchard (v0.2, PR 17 before the 21 November merge)

### How it plays

It is a real-time co-op game with 3 authored stages of 90 seconds each. Each player tilts their own tray, and fruit crosses a bridge between the trays. Each stage has 4 recipes, and every recipe needs fruit from both sides. A fruit spawns every 3.5 seconds, up to 8 at once. The team earns stars, and there is no score between the players.

### Bot results (GO1 pilot, 8 seeds)

The bot finishes every stage in 2,379–3,110 ticks (40–52 seconds) of the 90 available. Most runs finish at exactly 2,379 ticks, which is the earliest time the 12th fruit can spawn (38.5 seconds) plus the travel time.

### Findings

1. **The spawn timer controls the pace.** A strong team spends most of a stage waiting for fruit. A weak team has 40–50 seconds of spare time. So the difference between a good and an average team is small, and 9 of 9 stars will be easy after a few runs. Time left is "descriptive only", so there is nothing extra to chase.
2. **One tilt moves every fruit in your tray.** This is the real skill test, and the best idea in the game: taking one fruit to its basket can push another toward the compost. It needs physical playtesting with 3–4 fruit in one tray. Fruit pass through each other, which keeps the physics simple but can look odd.
3. **The cooperation is good.** Half of the fruit start on the wrong tray, so a handoff is needed in every bag, and Brake gives the receiving player a way to help. That is real interaction, which Sofa Kingdoms does not have.
4. **There is little content to replay.** There are three fixed stages and each run takes about 5 minutes. Seeds only change the bag order. Hazards (gate, compost, gusts) are mild and fully forecast.
5. **Delay is the main risk.** Phone tilt, then WSS, then the Mac, then a screencast to the TV adds latency. The PRD says this is not measured. The plan to test a one-phone delay prototype first still applies.

### Changes to try

- **Make spawns adapt:** when the team is keeping up, spawn every 2.5 seconds instead of 3.5. Give a bonus recipe or a time-based star when all four are done early.
- **Add a fourth "expert" layer for each stage:** narrower bridges, compost close to the baskets, and gusts without a forecast.
- **Use time left:** give medals or a personal best for the run, so a team that has all 9 stars still has a goal.
- **Make some fruit special,** for example a heavy melon that rolls slowly or a bouncy berry, so players need different tilt control.

## 4. Across the collection

- **The games are good at different things.** Sofa Kingdoms is a quick light duel, Odd Laws is a long strategy game, and Gravity Orchard is a short active co-op game. The collection covers those three styles well.
- **Each game's main idea is weaker in play than on paper.** Sofa Kingdoms' risk from Lala, Odd Laws' politics and Gravity Orchard's time pressure all come out weaker in the bot data. That is the most useful thing to test with people.
- **None of them has been playtested by people.** Every PRD says so. A one-evening session with all three games, timing each game and noting where you pause or are bored, would add more than another bot sweep.
