# Snack Stack

## Rules

Join with 2–16 players, then wait for the TV countdown.
Play all 12 challenges in the shared, seeded order, with five seconds to act in each challenge.
Earn up to 100 points per challenge for speed and accuracy, and get double points in Lala’s fourth, eighth, and twelfth challenges.
Check the running scores after each challenge and keep playing even if you miss one.
The highest total wins, and equal totals share a place.

## Controls

| TV challenge | Phone control |
| --- | --- |
| Tap exactly 7 times | Tap the large pad seven times, then stop until time runs out. One tap too many costs points. |
| Tap as fast as you can | Tap the pad repeatedly until time runs out or you reach 50 taps. |
| Hold for exactly 3 seconds | Press and hold the pad, then lift your thumb. |
| Release in the green zone | Hold the pad and lift your thumb when the marker enters the green zone. |
| Shake or tap the pepper | Enable shake if your browser offers it, then shake six times. You can also tap six times. |
| Make the picture hang level | Drag sideways and hold the picture level, or enable tilt and lean your phone. |
| Trace the zigzag | Start on 1 and drag through 2, 3, and 4 in one stroke. |
| Swipe where the arrow points | Swipe anywhere on the pad in the direction shown on the TV. |
| Stop the wheel on cheese | Press Stop when the needle reaches the cheese. |
| Count the mice | Count the mice on the TV and tap that number. |
| Tap only when Lala looks away | Tap five times while you see Lala’s back and the TV says **TAP!**. Each tap while she looks costs points. |
| Pick the odd snack | Tap the number below the different snack on the TV. |

## Player count and seats

The same targets and timers apply at every player count. The TV shows one ladder column up to eight players and two columns from nine to sixteen. Each row carries the player’s name, patterned badge, and scarf colour. The phone has the same name and look and shows only the current challenge. The TV cues and broadcasts the scores. Player phones are silent.

A missed challenge gives a player another chance in the next slot. A player who disconnects can return during the 30-second hold and keep their score. Kicked and expired seats lose their place. Late guests join the next round. If all guests leave and their seats expire, the TV shows an empty podium. Reduced motion keeps the score changes and the moving parts needed for timing while removing decorative movement.

## Tuning

| Constant | Why |
| --- | --- |
| 1.50 s preview, 5 s play, 0.25 s receive grace, 2.25 s score reveal | The preview gives players time to read, the grace accepts in-window events still in transit, and the reveal gives them time to see changes in place. A normal round takes 108 s after the shared 3 s countdown. The platform’s 114 s ceiling leaves room for short host stalls. |
| 0–100 points, 2× every fourth challenge | A common scale keeps challenges comparable. Accuracy supplies most of the score. On most complete attempts, speed adds up to 20 points. The maximum round score is 1,500. |
| 3 s hold target with a 1.5 s error falloff | The hold rewards close timing with partial credit for a near miss. |
| Green zone ±12% of the track and cheese ±12° of the dial | Both windows allow thumb reaction time and some display and network delay, with higher scores near the center. |
| Phone timestamps within 450 ms behind to 100 ms ahead of the host’s simulation | Each phone estimates its offset from the earliest-arriving snapshots for the current challenge. The host checks the result against its clock and accepts timestamps inside the five-second window. The hold duration uses the phone’s monotonic clock. The party protocol has no round-trip clock exchange, so the estimate retains the lowest observed one-way delay. |
| 115 ms between shakes, 300 ms level hold with no gap over 175 ms | Distinct shake events count once. The picture needs a maintained level position with fresh input. |
| Four zigzag corners with a 17% tolerance, 32 CSS px minimum swipe | The controls allow a thumb to cover the mark and reject incidental motion. |
| Lala looks for 650 ms in each 1.65 s cycle | Short waits give everyone several chances to tap while she faces away. |

See the [party runtime contract](../../PARTY_CONTRACT.md) for the shared lobby, motion, and network limits.
