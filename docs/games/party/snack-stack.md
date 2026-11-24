# Snack Stack

## Rules

Join with 2–16 players. The TV gives one instruction at a time. Play all 12 challenges in the shared seeded order and build the highest score. Each challenge gives up to 100 points for accuracy and speed. Lala doubles points in challenges 4, 8 and 12. Equal totals share a place.

Check the ladder after each challenge. The TV shows gains, rank changes and the next instruction. Nobody is eliminated for a miss. Players who finish early and guests waiting for the next round can tap the local warm-up pad. Warm-up taps give no points.

## Controls

| TV challenge | Phone control |
| --- | --- |
| Tap exactly 7 times | Tap seven times, then stop. One tap too many costs points. |
| Tap as fast as you can | Tap repeatedly. Reach 32 taps for full points. |
| Hold for exactly 3 seconds | Press and hold. Release when the phone stopwatch reaches 3 seconds. |
| Release in the green zone | Hold the pad. Release when the marker enters the green zone. |
| Shake or tap the pepper | Tap the pepper six times, or enable shake and shake six times. |
| Make the picture hang level | Drag sideways and hold the picture level. You can also enable tilt and lean the phone. |
| Trace the zigzag | Start at 1 and drag through 2, 3 and 4 in one stroke. |
| Swipe where the arrow points | Swipe on the pad in the direction shown on the TV. |
| Stop the wheel on cheese | Tap Stop when the pointer reaches the gold cheese wedge. |
| Count the mice | Count the mice in the TV tray and tap that number. |
| Tap only when Lala looks away | Tap five times while the cue says **Tap!**. Taps while Lala faces you cost points. |
| Pick the odd snack | Tap the number below the different snack on the TV. |

## Seats and TV layout

| Players | Ladder at 1920 × 1080 | Reason |
| --- | --- | --- |
| 2 | One column with 150 CSS px of visible mouse height and larger names and scores. | The two players can track each other from the sofa. |
| 8 | One column with 90 CSS px of visible mouse height. | The entire ranking reads down one list. |
| 16 | Two columns with 75 CSS px of visible mouse height. | The TV keeps all 16 mice, badges, names and scores visible while reserving most of the stage for the challenge. |

The kit reserves the outer 3% of the TV for overscan. The ladder pairs each scarf colour with a distinct badge and name. Phones use the same look and stay silent. The TV gives a sound and a small burst when a player locks in. Score reveals slide the rows to their new positions, show gains and highlight the top three places. Lala gets her own double-points animation and sound.

A disconnected phone keeps its mouse and score for 30 seconds. A kick or expiry removes the player from the next simulation tick and the TV briefly fades the departing mouse. Late guests play in the next round. If all seats expire, the podium is empty. Reduced motion removes slides, exits and particles while keeping the timing cues and score changes.

## Tuning

| Constant | Reason |
| --- | --- |
| 1.50 s preview, 5 s play, 0.25 s receive grace, 2.25 s score reveal | The preview gives players time to see the target. The receive grace accepts in-window events still in transit. The reveal gives everyone time to read gains and prepare for the next instruction. The round runs 108 s after the shared countdown. The host allows up to 114 s for discarded ticks after brief stalls. |
| 0–100 points and 2× every fourth challenge | Accuracy supplies most of the points. Speed adds up to 20 points on most completed attempts. The maximum round score is 1,500. |
| 32 quick taps and a 3 s hold | About six or seven taps per second can earn full points. The hold gives partial credit within 1.5 s of the target. |
| Green zone ±12%, ±11%, ±10% of the track. Cheese ±14°, ±12°, ±10°. | The targets narrow in rounds two and three. Later rounds hold at the third-round difficulty. Near misses can still score. |
| Lala faces the players for 650, 700, then 750 ms of each 1.65 s cycle | Later rounds allow less time to tap. The same windows apply to every player count. |
| Phone stamps up to 450 ms behind and 100 ms ahead of the simulation | Each phone uses the kit’s synchronized host clock. The host sends the play opening in that clock and corrects it after discarded simulation ticks. It validates claimed times, order and the play window. The transport limits each phone to 20 input frames per second with a burst of eight. |
| 115 ms between shakes. Level for 300 ms with no sample gap over 175 ms. | Distinct shakes count once. The picture needs a maintained level position. |
| Four zigzag corners with a 17% tolerance and a 32 CSS px minimum swipe | The controls leave room for a thumb and reject incidental motion. |

The rules replay from a seed, round number, ordered input log and departure log. Host-clock projection changes the timing cues without changing that replay. Count, odd-snack and swipe answers stay in the TV view.

The shared harness runs two rounds each at 2, 8 and 16 seats. Chromium covers all 12 cards, the two-phone flow with 14 additional socket controllers, reduced motion, and the late-guest warm-up. At 1920 × 1080 with 16 players, 480 frames gave a median TV draw time of 0.3 ms and a 95th percentile of 0.6 ms. Review captures and timing data are in `work/snack-stack/review/`. Physical-phone motion sensors, home Wi-Fi, casting latency and human balance still need a playtest.

See the [party runtime contract](../../PARTY_CONTRACT.md) for the shared lobby and network limits.
