# Snack Stack tutorial report

Each challenge now has a teaching stage on the TV and phones. The server controls when scored input opens. The TV shows the gesture, the instruction and the scoring rule. The phone shows the same instruction over its disabled control. Reduced motion uses three example frames. At Go the phone enables input and requests one short vibration on supported devices.

## Schedule

| Stage | Full tutorial | Short tutorial |
| --- | ---: | ---: |
| Teaching | 4.5 s | 2 s |
| Scored play | 5 s | 5 s |
| Input delivery grace | 0.25 s | 0.25 s |
| Score reveal | 2.25 s | 2.25 s |
| Total per challenge | 12 s | 9.5 s |

The full tutorial gives players 1.5 seconds to read before the final three-second countdown. It can also demonstrate a three-second hold and release at real speed. The first round adds a 3.5-second intro. With the default host setting, the first round takes 147.5 seconds and a repeat takes 114 seconds. Always full takes 144 seconds on repeats. Always short takes 117.5 seconds on the first round. These times exclude the platform's three-second countdown.

The shared TV header and harness use the maximum wall-clock budget of 153.5 seconds, including six seconds for host stalls. The short round can end while time remains in that header. The challenge countdown and phone opening use the actual schedule. Selecting a game again resets the platform's game-round counter.

## Files

- games/party/snack-stack/game.mjs sets the schedule, modes and role projections. game.test.mjs checks replay, scoring, intro, opening times and rejection of early input.
- ui/party/games/snack-stack/cards.mjs defines tutorial copy, timing and gestures. tv.mjs draws the demonstrations. phone.mjs and phone.css render and gate the touch controls. The matching four served copies are in public/party/games/snack-stack/.
- tests/integration/party/snack-stack.test.mjs checks two rounds with 2, 8 and 16 socket controllers. tests/party/snack-stack.browser.test.mjs checks the rendered controls and captures screenshots.

## Checks

Asset preparation and production build passed. ESLint reported zero errors and 14 warnings outside Snack Stack. Unit tests had 733 passes and one exhaustive-only skip. Integration had 82 passes and one failure. The portable ZIP inventory matches, but the archive contains older bytes for games/party/snack-stack/game.mjs. The integrator owns the pinned ZIP rebuild.

All three browser tests passed. The 16-seat run used two Chromium phone views and fourteen socket controllers. The TV draw time at the 95th percentile was 0.4 ms over 480 frames. Both smaller TV layout tests passed again after adjusting the manual clock to allow snapshot delivery.

## Screenshot evidence

Screenshots and command logs are under work/snack-tutorial/. Each row lists files relative to that directory.

| Stage | TV | Phone |
| --- | --- | --- |
| Cheese wheel | cheese-wheel-tv.png | cheese-wheel-phone.png |
| Hold | hold-three-tv.png | hold-three-phone.png |
| Lala lookout | lala-lookout-tv.png | lala-lookout-phone.png |
| Trace | trace-crack-tv.png | trace-crack-phone.png |
| Intro | intro.png | |
| Short repeat | short-repeat.png | |
| Reduced motion | | tutorial-reduced.png |

Chromium used a 1920×1080 TV viewport and 390×844 phone viewports. Physical vibration, motion sensors and viewing distance still need device checks.
