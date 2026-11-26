# Whiteout Drift sprite stacks

At 1920×1080 with 16 players, the TV draw callback took 2.8 ms at p95 over 71 frames. The browser test limit is 16.7 ms. The baseline took 0.8 ms at p95. These were separate live rounds with different car positions.

Drawing 16 cached coupes took 0.1 ms at median and 0.2 ms at p95 in headless Chromium. The measurement used a 1920×1080 canvas, all 16 seat colours and 32 warm-up frames to cover every heading. It timed the next 120 batches of 16 car draws. These times measure JavaScript and canvas command submission. They exclude display latency.

## Kit and art

Use `compileStack(document, layers, palette)` once per look. Supply equal-size letter grids from the ground up. The result includes slice canvases, width, height and depth. Use `drawStack(ctx, stack, x, y, {angle, scale, sliceGap, shade})` to draw at a ground-centre position. The angle is in radians and the gap is in art pixels. Each frame includes the shadow and lower-slice shading.

Each palette variant caches up to 64 bitmaps across 32 headings and all scale, gap and shade settings. The oldest entry is evicted first. Whiteout uses one scale per model. A coupe frame measures 40×47 pixels. A cruiser frame measures 40×48. With all 32 headings for 16 coupes and both patrol light phases, the vehicle frame pixels occupy about 4.14 MiB at four bytes per pixel, before canvas overhead and slice storage. Props each use one cached frame.

The 16×8-pixel coupe has eight slices. The cruiser adds a ninth for its light bar. Reduced motion holds the bar and siren glow steady. The road keeps its original camera, headlights, track marks and ice. The new roof height has clearance below the driver labels. Static buildings bake four wall levels into the city canvas.

## Files changed

- Shared renderer and tests in `ui/party/kit/stack.mjs` and `ui/party/kit/stack.test.mjs`.
- Whiteout art, TV and canvas test fixture in `ui/party/games/whiteout-drift/{art,tv,tv.test}.mjs`.
- Cover renderer import list and heading handling in `ui/media/party/sources/whiteout-drift-cover.mjs`.
- Delivery lists in `server/party-delivery.mjs` and `desktop/runtime-manifest.json`. The runtime file list imports the party list.
- Served copies in `public/party/kit/stack.mjs` and `public/party/games/whiteout-drift/{art,tv}.mjs`.
- API contract in `docs/PARTY_CONTRACT.md` and this report.

## Checks and screenshots

| Check | Result |
| --- | --- |
| Prepare game and production build | Passed |
| ESLint | 0 errors, 14 warnings outside the changed files |
| Unit suite | 735 passed, 1 exhaustive-only test skipped |
| Integration suite | 81 passed, 2 failed. The ZIP inventory lacks the new module and the archived host returns 404 for it. The integrator owns the pinned ZIP rebuild. |
| Whiteout browser test | 1 passed with 16 players |

The local evidence includes the [before TV](../work/sprite-stack/before.png), [after TV](../work/sprite-stack/after.png) and [three-car close-up](../work/sprite-stack/cars.png). The crop uses nearest-neighbour enlargement. The wider windscreen in the final art helps separate the roof and hood at diagonal headings.

## Other party games

- **Dust Bunny Sumo** — Stack the fur, ears and feet so a bunny's heading stays visible during a shove.
- **Don’t Wake Lala** — Give the sleeping cat a raised back and ears while keeping its face clear.
- **Snack Stack** — Give each snack a visible edge so players can count layers in a pile.
