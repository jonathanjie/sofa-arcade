# Don't Wake Lala

Hold the pad to tiptoe to the cheese. Let go and keep still when Lala looks. Her ear twitches first, then one eyelid opens. In later rounds, some ear twitches end in another nap. A caught mouse skids back to the start and can move again as soon as Lala closes her eyes. The first mouse to reach the cheese wins. After 60 seconds, the furthest mouse wins. Equal distances share a place.

## Controls and cues

- **Phone** — Hold the pad with one finger, Space, or Enter. Let go to stop. The pad shows the same cat cues as the TV, your progress, and whether Lala caught you.
- **Strict motion** — Off by default. Opt in on a secure phone browser that permits motion sensing. Keep the phone still during a look. The controller uses the party clock to stop sending motion flags when the projected look ends. The host judges flags against its current gaze. Sensor samples stay on the phone. The hold pad works without the sensor, permission, or a clock sample.
- **TV** — One moonlit hallway fills the play area. Follow the shared rug toward the cheese beside Lala. The cat's ear marks, one raised eyelid, and bright open eyes match the large cue at the top. The look freezes the pack briefly and brings Lala closer. Catch skids, cheese sparks, and sounds mark setbacks and progress. Reduced motion retains the open eye, vignette, signs, and catch marks.
- **Guests** — The TV locks the starting roster. Late guests can practice hold and release locally as soon as they join, then race next round. A disconnected mouse dims during the 30-second seat hold. A kick or expiration removes its body and score eligibility on the next simulation tick. The TV replaces its body with a brief puff. If every racing seat leaves, the round ends.

## TV tuning at 1920 × 1080

| Players | Visible mouse height | Layout |
| --- | ---: | --- |
| 2 | 180 CSS px | Two widely spaced depths let the duel fill the rug. |
| 8 | 90 CSS px | Eight depths use a small stagger to separate nearby mice and name tags. |
| 16 | 75 CSS px | Alternating starts keep the pack readable when everyone holds together. Names and pattern badges travel with the mice. |

The scale helper fits native sprites inside the stage's overscan-safe rectangle. The cat, cheese, cues, and mice all use the same scene. Pace, penalties, and winning distance are shared across group sizes.

## Round tuning

| Setting | Value and reason |
| --- | --- |
| Deadline and target | 60 seconds and 150 points. One 50 ms tick adds 0.25 points while held and the eyes are closed. It takes at least 30 seconds of movement to finish. |
| Hold renewal | Renew every 100 ms. A hold expires after 350 ms. The host requires a fresh hold at the line, so a disconnected phone cannot finish on its lease. |
| Nap and look | Seeded naps last 2.50–4.75 s. Looks last 0.85–1.15 s, so a caught mouse returns to play within 1.15 s. |
| Warning | Round one gives 0.90–0.95 s. The combined ear-and-eyelid window shrinks by 0.10 s per round to a 0.60 s floor. Seeded ear-only fake-outs start in round two. |
| Release grace | The host accepts a release on the tick 150 ms into the look. Progress stops when the look starts. |
| Motion | Strict mode sends at most one flag per 150 ms at 2.5 m/s² acceleration without gravity or 35°/s rotation. During a look, that and hold renewals fit the host's 20-input/s budget. |
| Effects | The gaze holds mouse positions for 105 ms. A 480 ms skid makes it clear who was caught. The reduced-motion setting skips both. |

The [party contract](../../PARTY_CONTRACT.md) supplies the game round, host-clock start, and seat departures. The seed, match context, and ordered input and departure log reproduce the round. The LAN authority validates exact input fields, seat ownership, round and sequence, and rate. The harness uses the declared round duration.

## Review evidence

Run `node --test tests/party/dont-wake-lala.browser.test.mjs` with `SOFA_CHROMIUM_EXECUTABLE` set to the installed Chromium headless shell. The browser test writes screenshots and timing data to `work/dont-wake-lala/review/`. It covers a live 16-player race and podium, motion permission and fallback, a 390 × 844 controller, 2- and 8-player layouts, and a late guest's practice pad. Physical TV viewing and phone sensor feel remain open.

On Apple M5, the 16-player draw callback took 0.30 ms median and 0.50 ms p95 over 361 frames. The live socket test measured 1,560 B/s peak phone traffic over one second.
