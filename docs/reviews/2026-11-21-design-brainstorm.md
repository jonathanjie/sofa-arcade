# Design brainstorm — balance, engagement and depth

**Date:** 21 November 2026. **Status:** proposals only. No rules have changed. **Inputs:** [the gameplay analysis](2026-11-21-gameplay-analysis.md) (with its correction), an independent review by a second design advisor, and quick variant simulations of Sofa Kingdoms.

Each proposal gives an exact rule, the problem it fixes, the decision or interaction it adds, its risk, and a cheap test. Change one rules version at a time and keep the old version for saved matches, as the games already do.

## 0. One principle for the collection: the Lala contract

All three games already use the same idea in different forms. Make it explicit and teach it once:

1. **Lala acts on a forecast** that is visible one step ahead: a swipe or pounce, a council stamp, a gust.
2. **Each player has one tool to bend the forecast:** a toy, an influence bid, or Brake.
3. **Lala never eliminates a player.** She sets players back, makes them choose, or takes away an advantage.

This gives each game a shared feel, and it tells the designer where to add tension. When a game feels flat, the forecast is too safe, or the tool to bend it is too weak.

## 1. Sofa Kingdoms

**Problems:** the players rarely interact, about half the crumbs are never worth collecting, Lala's pattern is the same every game, and the opening point mostly decides ties.

### Try first (one package, rules v4)

| # | Rule | Why |
| --- | --- | --- |
| 1 | **Remove the opening point.** Ties are a shared crown, as now. | Turn order gives no advantage (see the correction), so the point only decides ties. |
| 2 | **Move the crumbs to the middle.** Each burrow keeps (3,0) and (4,1), or their mirrors, with 2 each. The four tiles next to the centre get 3 each, the centre gets 5, and one random mirrored pair gets 2 each. Total 29. | The home cluster gives about 4 points in 7 actions. After that, every point is in a shared zone where pounces land, so players compete and must decide when to leave home. |
| 3 | **Vary the pounces and let toys move them.** The first pounce is in round 3 or 4 and the second in round 8 or 9, chosen by seed, with one odd and one even round. A toy can also move a pounce centre 1 square, never onto a burrow. | Players can no longer memorise Lala's pattern. A toy becomes an attack as well as a defence, and the player who acts last holds the threat. |

**Simulation evidence so far (greedy bot, 150 games per variant).** A bigger centre (6 on the centre tile, +1 on each tile next to it) **doubled the rounds where players were within 2 squares** (1.2 to 2.2 per game). It also widened the average margin (2.5 to 4.5 points) and cut ties without the opening point from 37% to 12%. The bot scored less in this variant, because its short lookahead handles a long trip badly. A centre pile dropped in mid-game did not attract the bot. That suggests a contested area must have value from the start, not appear late.

**Prototype result (`feature/sofa-kingdoms-v4`, details in [`game/simulation/README.md`](../../game/simulation/README.md)).** The bot fault is fixed: with toys off, both rule sets give the starter exactly 50%. The real cause of order bias is **toys that change the current event**. They give the second mover in each round the last word on Lala. With v4's valuable centre, that made the second player win 80–85% of decided games. Rules v4 therefore changes item 3: **a toy changes the next round's event**, so both players can react first. The starter share is then 0.43–0.46 at 9–11 rounds. Scores rise to 10–12, with 2.2–2.6 full bags per game. The engagement targets below are **not met yet**: about 1 shared-centre round per game, 0.1 pounce catches, and 10–13 crumbs left.

**Test pass condition:** seat-mirrored sweeps at 9, 10 and 11 rounds:

- the starter wins 45–55% of decided games;
- fewer than 8 crumbs are left per game;
- there are 3 or more rounds per game with both players in the centre 3×3;
- pounces catch a player 0.5–1 times per game.

### More options

- **Sealed toys.** Both phones secretly choose "toy or no toy" (and the target) before Lala acts. Choices are revealed together. This reuses Odd Laws' private-choice support and adds guessing without slowing the game.
- **Caught bags are loot.** The first full-bag delivery that includes dropped crumbs scores +3, not +2. This gives a reason to go after a dropped bag.
- **Bump.** Moving onto the opponent's square costs 1 action and takes 1 carried crumb. This is direct interaction. Its risk is that the player who is behind gets bumped more.
- **Lala's treat refills.** One central tile gains 1 crumb at the end of each round, up to 3. This is a recurring reason to visit the centre, not a single race.

## 2. The Odd Laws Society

**Problems:** politics barely matters (no Lobby, bids of 0–1, influence left unspent), the market has no scarcity (two copies of every design), Festivals are the best repeatable conversion, and building cities fill up by session 5. The initial Chair's 57% is probably a sign of weak politics: with bids at 0, the Chair picks the law for free.

### Try first (rules v0.3)

| # | Rule | Why |
| --- | --- | --- |
| 1 | **Only the winner pays.** Only the winning bid is spent. A 0–0 council keeps the current law. The Chair breaks ties only at bids of 1 or more. | A bid of 1 now beats an opponent who bids nothing, and losing costs nothing, so bidding becomes a bluff about how much each player wants the law. Lobby gets a purpose. This probably also removes the initial Chair's free choice. |
| 2 | **Single-copy landmarks.** Term III has one copy of each landmark. In Terms I and II, the second copy of a design costs 1 more coin. | Building order matters. Taking Work now risks losing a card. Blocking has a price. |
| 3 | **Sponsor dividend.** The player whose bill is enacted secures 1 prestige at each session end while it stays active, in addition to the Civic award. | A law now belongs to someone, so repealing it means something. Influence has a lasting return. |

**Test pass condition (extend the existing sweep):**

- the mean bid is 1.2 or more per council;
- some policy that uses Lobby wins 45% or more;
- unspent influence at the end is under 2;
- the initial Chair is at 47–53%;
- mirror-policy ties are under 30%.

Add a "politician" policy that lobbies; the current four policies never do.

### More options

- **Festival scales with Culture:** a Festival scores 1, plus 1 per Culture building in your city, up to 4. It becomes the reward for a Culture city, not a general converter. Target: Festivals give 5–15 points.
- **Higher Civic stakes:** awards pay 0/1/3 instead of 0/1/2. Reaching the top tier is then worth a fight. Watch that one guild does not dominate.
- **Rebuild:** a player can build on their own occupied plot, paying the new cost minus the old card's printed cost (minimum 1). Cheap opening buildings become temporary, and the final session keeps real purchases. Target: at least 2 of 3 actions in session 6 are not Work.
- **Spend influence on the market:** spend 2 influence to reserve one market card until your next action. Influence then matters outside the council.
- **Term commissions:** at the start of Term III, reveal 2 public goals, such as "first to complete 3 streets: +3". These give players something to race for at the end.

## 3. Gravity Orchard

**Problems:** with perfect control, the spawn timer sets the pace. Skill changes the result very little, the content is thin, and the delay from phone to TV is not measured. This is unproven with people, so **measure the delay on a real phone before tuning difficulty.**

### Try first, after the phone delay test

| # | Rule | Why |
| --- | --- | --- |
| 1 | **Spawns follow the team's pace, plus encore orders.** A fruit spawns every 120 ticks while 3 or fewer are active, and every 210 ticks otherwise. After the fourth recipe, the stage continues to 90 seconds with repeating recipes. Each encore recipe gives one blossom. Stars stay the same. | A fast team is never left waiting, and a slower team never sees the faster rate. Blossoms give a score worth improving, even after 9 of 9 stars. |
| 2 | **Open order board.** The team can complete any of the 3 visible recipes, in any order. | Players have to talk: "you have two pears, let's do Sunlit". This adds cooperation without new controls. |
| 3 | **One special fruit per stage from stage 2.** A melon has half the acceleration, needs Brake held twice as long, and fits any basket. | One tilt now moves fruit at two speeds, which deepens the core skill of controlling several fruit at once. |

**Test pass condition:**

- a bot with degraded input (added delay and noise) still finishes stage 1;
- blossom counts differ by 3 or more per stage between strong and weak input;
- in a playtest, players never say they were waiting with nothing to do.

### More options

- **Personal bests on the host only:** best blossoms and best time per stage. This gives a reason to replay without an online leaderboard.
- **Expert version of each stage:** a narrower bridge, compost closer to the baskets, and a gust with only a 1-second forecast. Unlock it after 3 stars.
- **Shared bridge tug:** in the bridge's blend zone, both players' tilt forces add together. A handoff then needs both players at the same time: one pushes and the other catches.

## 4. Across the collection: the Sofa Evening

- **Scrapbook on the host:** record crowns, prestige and blossoms per evening. This gives the collection a memory without accounts.
- **Gentle catch-up between games:** the player who lost the last duel chooses the next game or the first seat. This is fair for two people who play each other every week, and it changes nothing inside a game's rules.

## 5. Order of work

1. ~~Fix the Sofa Kingdoms bot and sweep rules v4.~~ Done; v4 is balanced but not yet engaging enough. Next: test the "Lala's treat refills" and "caught bags are loot" options on top of v4, then build the TV and phone controls for next-round toys and play it.
2. Add a lobbying policy to the Odd Laws sweep. Then sweep rules v0.3 items 1–3, one at a time and then together.
3. Build a minimal prototype that measures the delay from phone tilt to the TV on a real phone. Only after that, prototype Gravity Orchard's adaptive spawns and encore orders.
4. Play one human evening with all three games. Record the time for each game, ties, and the moments where players paused or were bored. Compare those notes with the bot results before anything becomes a release rule.
