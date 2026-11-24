# Wall of Paddles

## Rules

Cyan and Coral defend opposite walls, and each player moves one paddle in an assigned slot.
A ball scores for the opposite team when it clears a wall, then returns from the centre.
Each paddle hit speeds the ball up, and hits near the tip bounce at a sharper angle.
A ball collects a centre boost for the team that last touched it, triggering wide paddles, a split ball, a curve ball, or slow motion.
The first team to seven wins, or the higher score wins after 90 seconds, with equal scores sharing first place.

## Controls

Slide one thumb up or down anywhere on the phone's pad. The position maps to the paddle's available travel within its slot. Release to hold that position. Find your name, colour, and pattern next to your slot on the TV. The slider also accepts keyboard input. The TV plays the hit, boost, goal, and win cues using the host sound settings. Reduced motion keeps the scores, boost labels, and contact highlights visible while removing trails, shake, particles, and interpolated motion.

## Scaling

Two to sixteen ready players alternate between the teams in seating order. Each team divides its wall into equal slots. With an odd roster, the smaller team's slots and paddles grow in the same proportion, so both teams start with the same total paddle length. Three balls open a game with two to seven players. Four open a game with eight to sixteen. Every active player keeps a paddle for the round. It holds each paddle at its last position if a phone leaves and keeps that slot for the round. The platform removes revoked or expired seats from the podium and admits late arrivals at the next round.

## Tuning

| Setting | Reason |
| --- | --- |
| 1,440 × 640 court, 10-unit ball radius | The wide court gives players time to spot incoming balls. The bright 20-unit ball stays visible across the room. |
| 29% starting slot coverage, plus 1.8 percentage points per extra seat on the larger team | Solo defenders have room to move. At 8 per side, 41.6% coverage keeps the narrow slots playable. |
| 365–460 units/s serve, 8% gain per hit, 1,050 units/s cap, 57.6° maximum rebound angle | Serves give players time to react. Rallies speed up and edge hits redirect the ball without turning it almost vertical. |
| 1.8 s re-serve delay, towards the scoring team | Leaves time to read a goal and gives the other team a chance to recover. |
| Boost at 4.5 s, then every 8.5 s, visible for up to 7 s | Introduces the first boost after the opening serves. One visible boost at a time keeps the centre clear. An untouched ball passes through. |
| Wide paddles at 1.55× for 6.5 s, capped at 77% of a slot | Rewards the collecting team and preserves gaps between adjacent paddles. |
| Split ball, maximum seven including pending serves | The new ball travels in the same horizontal direction with an opposite vertical component. Both balls stay in rotation. At capacity, the next boost replaces split. |
| Curve for 3.1 s or until the next paddle hit | The collecting ball bends toward the centre of the court or across it, with a distinct purple trail. |
| Slow motion at 62% speed for 2.8 s | Both teams get a short recovery window. The round timer continues normally. |
| 50 ms simulation tick with swept contacts | The server checks the path through the tick. The earliest contact resolves first. Exact ties use ball creation order. |

The shared contract keeps the roster locked. A departure event in that contract would let the rules retire a revoked paddle separately from a briefly disconnected one.
