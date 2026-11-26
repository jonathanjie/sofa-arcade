# Sprite stacks on the party TV

## Whiteout Drift

Each block rises 18–24 world pixels above its footprint. Each course steps north and every second course steps west. This exposes the south and east walls. Lower courses are darker. Lit apartments, a snow-covered parapet and raised vents, skylights or water tanks give the roof and walls distinct features. The TV builds one bitmap per block when it prepares the layout and copies it once per frame.

Buildings, street props and cars share a draw order. A building uses the y coordinate of its south foundation edge. A car uses its ground centre. A car on the north street can disappear behind the roof edge. A car on the south street draws over the wall. Driver labels and the crown draw afterward.

Cars are 48 world pixels long, up from 32. The eight coupe slices rise 2.16 world pixels per course, up from 1. Player cars keep their seat colour, including the patrol body below its white roof and raised light bar. Hydrants and cones use double-size slices. Street lamps have a base, shaft and lantern above the existing pool of light.

## Dust Bunny Sumo

Each bunny has 12 slices with feet, uneven fleece, a seat-coloured scarf, muzzle, eyes and pink-lined ears. Moving bunnies face their velocity. Still bunnies face the audience. The TV keeps the dash, squash, blink and reduced-motion behaviour. Label placement allows space for the taller model. The round rug has four edge layers below its playing surface. Its warning and pull use the same radius as the game rules.

The browser readability check measures opaque rows in the cached model frame and applies the live canvas transform. The 64 CSS pixel minimum still applies. The final art pass widened the bunnies and varied roof colours, seams and rooftop fixtures after review of the first full-TV captures.

## Verification

| 1920 × 1080 TV, 16 players | Draw callback p95 | Frames sampled |
| --- | ---: | ---: |
| Whiteout Drift | 1.6 ms | 71 |
| Dust Bunny Sumo | 1.0 ms | 180 |

Both measurements are below 16.7 ms. The smallest measured bunny was 66.7 CSS pixels high. These Chromium timings cover the TV draw callback. Physical TV viewing at 3 m and end-to-end display latency remain unverified.

| Check | Final result |
| --- | --- |
| Prepare game and production build | Passed |
| ESLint | 0 errors, 14 warnings outside the changed files |
| Unit suite | 735 passed, 1 skipped |
| Integration suite | 81 passed, 2 expected portable-ZIP failures. The archive differs from current source and its host returns 404 for the stack module. An earlier concurrent run also timed out in Wall of Paddles. That test passed on both subsequent full runs. |
| Whiteout browser | 1 passed |
| Sumo browser | 2 passed |

Local captures from the final browser runs:

- [Whiteout full TV](../work/sprite-stack/pass2/whiteout-tv.png) and [two buildings with cars](../work/sprite-stack/pass2/whiteout-close.png)
- [Sumo full TV](../work/sprite-stack/pass2/sumo-tv.png) and [bunny close-up](../work/sprite-stack/pass2/sumo-close.png)

The [first-pass Whiteout frame](../work/sprite-stack/after.png) shows the previous wall and car heights from commit `d8da427`.
