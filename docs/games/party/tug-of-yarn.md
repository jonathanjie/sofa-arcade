# Tug of Yarn

Tap on the beat. Pull the knot past your team’s flag to win the heat. Mint is on the left and Honey is on the right. The first team to win two heats wins the match. After three heats, the team with more heat wins takes the match. Equal scores give both teams a draw.

## Play

- **Phone** · Tap anywhere on your team’s pad when the rings meet. With reduced motion, tap when the target lights. The pad gives immediate Perfect, Good or Miss feedback. Space and Enter also work when the pad has focus.
- **TV** · Follow the ring and the beat cue. The mice whose taps counted lean back together when the pull lands. The unity bars show the share of each team that pulled together. Keep your eyes on the red knot and the flags. Lala watches from behind the rope.
- **Host** · Select Start in the lobby. The countdown gives players three seconds to find their name, scarf and badge. On the podium, select Next match to lock a new roster.

The roster locks for the entire best-of-three match. The TV lists ready guests waiting for the next match. Their phones show when they join and offer an immediate practice beat. Practice stays on the phone and does not affect scores. A phone that disconnects keeps its seat for the platform’s hold period. A permanent departure removes the mouse and its queued taps on the next simulation tick. A short dust effect marks the exit. No player is knocked out by play.

The knot moves toward the stronger team. If time expires before a line cross, the team whose side holds the knot wins the heat. A centered knot gives neither team a point. Scored pulls light the mice and the bars. At a line cross, the knot jumps past the flag and the line bursts. Reduced motion uses static highlights, the new knot position, the heat score and the podium result.

## Rules and tuning

The host orders the roster by seed, then assigns alternating players to teams. A pull uses the strongest group of taps inside one unity window. Unity is that group’s share of its locked team. Accuracy is the mean quality of those taps. The host multiplies unity and accuracy with integer arithmetic, so equal team fractions cancel even for odd rosters. A departed seat keeps its place in the team’s denominator. Each eligible player’s podium score is their team’s heat wins.

| Players | Unanswered perfect team pulls to the line | Layout and reason |
| --- | --- | --- |
| 2 | 7 | One mouse per side. The smaller threshold makes a missed beat matter in a duel and prevents a one-sided heat from dragging. |
| 8 | 8 | Four mice per side in one row. An extra pull gives the group time to settle into a shared rhythm. |
| 16 | 9 | Two rows per side. The widest comeback margin gives a team time to regroup after its first scattered beats. |

The first heat of a new party takes about 6.4, 7.2 or 8.0 seconds at those three counts when only one team lands every beat. Contested heats can run to 38 seconds. The line thresholds also apply to 3–8 players and 9–16 players respectively. Visible mouse height at 1920×1080 is 180 CSS px in a duel, 120 CSS px with eight players and 100 CSS px with sixteen.

| Setting | Value and reason |
| --- | --- |
| Heat and reset | 38 seconds per heat and 2 seconds between heats. A full match takes 118 seconds, with a 120-second host cap for scheduler delays. |
| Tempo | The first heat starts at 800 ms between beats. Each later heat and each of the first two rematches takes 50 ms off the starting interval. The last ten seconds speed up toward 550 ms in the first heat and 450 ms at the top difficulty. The first beat arrives 1,100 ms into each heat. |
| Unity | 150 ms from first to last tap in the first heat. Each difficulty step cuts 5 ms, down to 130 ms. At that limit, a group can still include players whose clocks are 110 ms apart. |
| Accuracy | Perfect is within ±60 ms. Good extends through ±165 ms and tap strength tapers to 25% at that edge. The wider Perfect band covers a split-path clock error of about 55 ms. |
| Authority | The game accepts one in-window tap per locked player and beat. It permits up to 100 ms of reported clock lead, and accepts delivery through 250 ms after the hit window. The party transport also limits messages, inputs and queued records. |

The phone uses the kit’s `serverNow()` and the host’s match start to judge taps. It shows **Syncing** until it has a usable sample. The host uses elapsed monotonic time to keep the same beat schedule even when the platform drops short-stall catch-up ticks. Replays use the seed, roster, round context, tick elapsed times, ordered taps with their receipt times and departures.

## Review checks

The LAN socket harness exercised 2, 8 and 16 players, including reconnect, removal, late join, round two and a full-duration draw. Chromium exercised touch and reduced motion at 390×844, both TV layouts at 1920×1080, waiting practice and the line-cross finish. The browser check delayed one phone’s clock replies by 110 ms. The added offset was −55.3 ms and its tap counted. Unit checks cover both signs of that error, delayed delivery and discarded ticks together. At 16 players, the median draw callback took 0.3 ms and p95 took 0.6 ms over 180 frames. The p95 frame interval was 17.5 ms. See `work/tug-of-yarn/review/` for the screenshots, timing samples and check logs. Human group play, physical phones, home Wi-Fi and TV casting remain open.
