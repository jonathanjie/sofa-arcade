# Wall of Paddles

## Rules and controls

Slide one thumb up or down to move your paddle. Block balls and send them past the other team's wall. Release to hold your position. The pad also accepts keyboard input. Look for your name, badge and drone beside your slot on the TV. Cyan and Coral defend opposite walls.

Each ball that clears a wall scores one point for the other team. Balls return from the centre. Hits add speed, and hits near a paddle tip produce sharper angles. A ball that a paddle has hit can collect a centre boost. Boosts widen the collecting team's paddles, split a ball, bend a ball or briefly slow all balls.

After 45 seconds, a team wins if it has reached the target and leads. If both teams are tied at the target, the next goal wins. At 90 seconds, the higher score wins and equal scores share first place. An empty wall ends the round early. The other team wins if it still has players.

## Players and departures

The host alternates ready players between teams. Each team divides its wall into equal slots. A smaller team gets longer slots and paddles, so both teams have the same total base paddle length. Bright brackets mark the slots. Players can slide together to close a gap that an unattended ball could pass through.

A sleeping or disconnected phone holds its place and position during the platform's reconnect window. A kicked or expired seat loses its paddle on the next simulation tick. The TV shows a short burst at the old position. The remaining teammates keep their positions on their phone pads as the game redivides that wall. The podium excludes departed seats.

A guest who joins mid-round can practice on the phone immediately. Slide to the marked target to block it and get a new one. Practice runs on the phone and sends no game input. Live play uses absolute positions and judges all timing on the host.

## Tuning

| Players | Opening balls | Target | Base slot coverage | Reason |
| --- | ---: | ---: | ---: | --- |
| 2 | 2 | 12 | 36% | One opening ball heads toward each solo defender. Long travel gives each player room to cover either end. |
| 8 | 4 | 15 | 48% | Two balls open toward each wall. The higher target gives softer walls enough time for a comeback. |
| 16 | 6 | 11 | 64% | More balls give the eight players on each wall more chances to act. The dense wall blocks more shots, so the target drops. |

The ball count and target change at 6 and 12 players. Coverage grows by 4 percentage points per additional seat on the larger team. The opening count, target and coverage stay fixed during a round. Each ready player helps protect one wall throughout play.

| Setting | Reason |
| --- | --- |
| 1,440 × 640 logical court and 9-unit ball radius | The full TV stage fits this court between two wide identity lanes. At 16 players and 1920 × 1080, the drones stand 88 CSS px tall. With two players, they stand 132 CSS px tall. |
| 365–460 units/s at the first serve, 8% faster per game round through round five | Later rounds put pressure on defenders. Each hit adds 8% speed up to 1,050 units/s. Rebounds turn up to 57.6°. |
| 1.8 s re-serve delay toward the scoring team | The goal has time to register and the conceding team gets a chance to respond. |
| Boost at 4.5 s, then every 8.5 s, visible for up to 7 s | The opening balls move first. The court shows one boost at a time. |
| Wide paddles at 1.55× for 6.5 s, capped at 76% of a slot | At 16 players, a centred wide wall still has a gap at each slot boundary. |
| Split ball, maximum seven including pending serves | The new ball moves in the same horizontal direction with opposite vertical motion. At capacity, another boost replaces split. |
| Curve for 3.1 s or until the next paddle hit | The collecting ball bends and shows a purple highlight. |
| Slow at 62% speed for 2.8 s | Both teams get a short recovery. The round timer keeps running. |
| 50 ms fixed tick and swept contacts | Earliest contact resolves first. Exact ties use ball creation order. A replay uses the seed, game round, ordered inputs and departures. |

In 540 seeded runs, staggered slide inputs produced median rounds of 52.0 seconds for 2 players, 49.6 for 8, and 50.3 for 16. The runs covered rounds one and five with idle, staggered, and single-wall tracking inputs. Human playtime and balance remain open.

The host plays hit, boost, goal and win cues. A goal lights the breached wall and updates the team score at once. Reduced motion keeps the names, contact highlights, goal text and wall light while removing trails, bursts, the goal wave and position interpolation. The phone stays quiet.
