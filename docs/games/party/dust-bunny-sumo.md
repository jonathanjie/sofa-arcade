# Dust Bunny Sumo

Tilt or drag to roll. Dash to bump rivals off the rug. The last bunny on wins.

Lala shows the next edge two seconds before she pulls the rug smaller. The gold band shows the part of the rug that will disappear. If your bunny’s centre crosses the edge, you become a draught and can send a gust every four seconds. If several riders remain at 90 seconds, the rider closest to the centre wins.

The host ranks riders by survival time, then by distance from the centre at elimination or at the time limit. Riders with the same survival time and distance share a place. Each score is the number of eligible riders minus the number ranked ahead. Expired and removed seats leave the arena and the standings. A temporarily disconnected rider coasts to a stop as its steering lease expires. Reconnecting to the same seat restores control.

## Phone controls

- **Roll** — Drag the stick or tap **Enable tilt** on a secure phone connection. Hold the phone at a comfortable angle when the round starts. The first sensor sample sets the neutral angle. Tap **Use stick** to switch back.
- **Dash** — Tap the large button to dash in your last steering direction. Until your first steering input, the dash aims towards the centre. The charge takes two seconds.
- **Send a gust** — After a ring-out, swipe in the direction you want the gust to travel. You can send the first gust as soon as the phone changes roles. Wait four seconds between gusts. Arrow keys work on both pads.
- **Join during a round** — Drag the practice stick while you wait for the next round. Practice stays on your phone and has no effect on the arena.

The phone draws its charge bar from the host time estimate and the latest charge snapshot. The host confirms when a dash or gust is ready. If the phone has no clock sample yet, it uses the charge remaining in the snapshot.

## Scaling and timing

The host locks 2–16 seats when it starts the countdown. The square of the starting rug radius is `6500 + 1150 × players`. Riders start at rest on a ring with equal angles between neighbours. The seed rotates the ring. Every rider has the same distance to the centre and to its nearest edge.

| Riders | Start radius as a share of the rug | Nearest rider at start | First pull in round one | Aim |
| --- | --- | --- | --- | --- |
| 2 | 45% | 84 units | 14 s | Bring opponents together with opening dashes and make a quiet duel tighten sooner. |
| 8 | 52% | 50 units | 16 s | Give each rider room to steer and make the first group skirmish easy to read. |
| 16 | 63% | 39 units | 16 s | Leave about 16 units of clear space between adjacent bodies. |

With three or more seats in round one, Lala pulls at 16, 29, 42, 55, 68, 74, 78, 82, 86 and 89 seconds. The new radii are 91%, 82%, 73%, 64%, 56%, 46%, 37%, 28%, 19% and 10% of the first radius, with a 13-unit minimum. Each new game round advances the first pull by another two seconds, to a maximum advance of six seconds from round four. The two-seat advance adds another two seconds. The advance tapers towards the 90-second limit. Every pull still has a two-second warning.

The TV uses the full play stage and keeps the action inside the safe area. Name tags follow the riders. The crowd scale gives the 16-player riders at least 68 CSS pixels of visible height at 1920 × 1080, including the compressed hit pose. Smaller groups get larger sprites. A hard hit pauses the TV positions briefly and shakes the rug. Dashes leave streaks. Lala reacts to a ring-out as the rider falls and the phone changes to the gust pad. Reduced motion keeps the warning band, contact marks, status text and podium.

## Physics and checks

| Setting | Purpose |
| --- | --- |
| 50 ms fixed tick, 250 ms steering lease, 75 ms phone refresh | Tolerate brief network gaps, then return to neutral when a phone stops sending. |
| 11.5-unit rider radius, equal mass, 0.83 restitution | Transfer most of a dash’s speed to the struck rider. A second separation pass helps in close packs. |
| 155 units/s² acceleration, 0.88 velocity retained per tick, 104 units/s speed cap | Start quickly and still slide. A rider moves at most 5.2 units per tick. |
| 82 units/s dash impulse, 2 s cooldown | Let a rider displace a rival or recover near the edge. |
| 12 units/s gust impulse, 16 units/s combined cap per tick | Gusts take up to 900 ms to cross the rug. The outer band blocks them near the edge. A gust can only leave a rider with a stopping point inside the rug. |

The host validates exact input fields and finite direction vectors. The party transport allows up to 20 input frames per second per seat, with a burst of eight. The replay test includes the seed, game round, match context, ordered inputs and seat removal. The integration suite exercises 2, 8 and 16 seats and checks private phone packets against the 320-byte limit.

Run `node --test tests/party/dust-bunny-sumo.browser.test.mjs` with the installed Chromium. Set `SOFA_CHROMIUM_EXECUTABLE` to select an existing Chromium executable. The browser test saves captures and 16-player draw measurements in `work/dust-bunny-sumo/review/`. Physical tilt, home Wi-Fi and cast-to-TV delay need a device test.
