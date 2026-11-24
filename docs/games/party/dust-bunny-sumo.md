# Dust Bunny Sumo

## Rules

Ride a dust bunny and bump rivals off the rug. Lala shows the next edge two seconds before she pulls the rug smaller. If your bunny’s centre crosses the edge, you become a draught and can send a gust every four seconds. The last bunny on the rug wins, or the bunny closest to the centre wins if several remain at 90 seconds. Your score is the starting player count minus the number of bunnies ranked ahead of yours, with survival time first and distance from the centre breaking ties on the same tick.

## Controls

- **Roll** — Tap **Enable tilt** on a secure phone connection and hold the phone in a comfortable position when the round starts. The first sensor sample sets the centre of the dot. You can drag the stick from the start, or tap **Use stick** to switch back.
- **Dash** — Tap the large button to dash in your last steering direction. Your first dash aims towards the centre if you have not steered. The charge bar fills in two seconds.
- **Send a gust** — After a ring-out, swipe anywhere on the large pad in the direction you want the gust to travel. The four-second charge starts after each gust. Arrow keys also work on both steering pads.

## Scaling and timing

The TV locks 2–16 seats when it starts the countdown. The area of the rug is proportional to `6500 + 1150 × players`. The starting positions are evenly spaced at 61% of that radius, with a seeded rotation. This gives sixteen bunnies room to start while keeping two close enough to meet after a few seconds of steering.

Lala pulls at 16, 29, 42, 55, 68, 74, 78, 82, 86 and 89 seconds. The new radius is 91%, 82%, 73%, 64%, 56%, 46%, 37%, 28%, 19% and 10% of the first radius, with a minimum of 13 units. The last 20 seconds leave less time between warnings and make it hard for two bunnies to share the centre. An early ring-out can finish a round sooner.

The room holds a disconnected guest’s place under the party rules. A bunny coasts to a stop when its last steering input expires. The host excludes kicked and expired seats from results. A late guest waits for the next round.

## Tuning

| Setting | Purpose |
| --- | --- |
| 50 ms fixed tick, 250 ms steering lease, 75 ms phone refresh | The host owns the result. Steering tolerates brief network gaps, then returns to neutral when a phone stops sending. |
| 11.5-unit bunny radius, equal mass, 0.83 restitution | A dash gives the other bunny most of its speed. Light bumps lose energy and the second separation pass helps packed groups. |
| 155 units/s² acceleration, 0.88 velocity retained per tick, 104 units/s speed cap | The bunny starts quickly and still slides. A bunny moves at most 5.2 units per tick, less than its diameter. |
| 82 units/s dash impulse, 2 s cooldown | A dash can dislodge a rival or let a rider turn away from the edge. The cooldown gives rivals time to react. |
| 12 units/s gust impulse, 16 units/s combined cap per tick | Gusts take up to 900 ms to cross the rug. The outer band blocks direct hits near the edge, and each gust must leave the bunny’s stopping point inside the rug. |
| Distance rounded to 0.001 units for standings | Symmetrical finishes share a place. Distance is measured at elimination or at the time limit. |
