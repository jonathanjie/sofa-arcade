# Sofa Arcade integration 2

The integration base was `origin/main` at `3b06c68`. The six merge commits, in order, are `770968a` (ink kit and sprite stack), `d356fc6` (Snack Stack teaching), `5208121` (Balloon Bop), `60cb11b` (Wobble Tower), `79814f5` (Timber Rush), and `670d54c` (Head Hop). Commit `310fb1c` contains the combined shelf and review fixes.

## Merge conflicts and resolutions

| Merge | Resolution |
| --- | --- |
| Ink kit | Compared the pre-squash base `8a0ef00` with main. Kept the newer kit entries in the desktop manifest, runtime file list, party delivery list and party contract. Kept the branch's Sumo and Whiteout art, TV renderers, cover source, tests and sprite-depth lesson. Kept main's Whiteout shelf expectation and count derived from the game list. |
| Snack Stack tutorial and Balloon Bop | Both merged cleanly. Regenerated served files. |
| Wobble Tower | Combined the server and UI game registries, cover map, party delivery entries, desktop staging entries and shelf expectations. Used distinct imports for the Balloon Bop and Wobble Tower renderers. |
| Timber Rush and Head Hop | Combined the same lists and the catalog. Reconciled the Timber Rush rules import. Retained both cover sizes, both renderers and every host module. Removed duplicate Whiteout entries and aligned the catalog, runtime game order and shelf expectations. |
| Generated conflicts | Selected a side for the served files and regenerated them from source with `node scripts/prepare-game.mjs`. The portable ZIP kept its bytes from main. |

Verified that the CI workflows, desktop route test, native atlas test and Odd Laws TV stylesheet match main. The local shelf and hosted local-only shelf both expect eleven cards.

## Fixes

- **Snack Stack.** Balanced the instruction lines and moved the teaching hand clear of the Hold label. Chromium checked the gap between the hand and the text at four gesture times at each of 320, 390 and 600 px wide.
- **Head Hop.** Removed the lines from goons' feet to the floor. A shared streak message identifies the player in the top strip. Player name tags start below the strip, and impact particles stay at the jump.
- **Wobble Tower.** Increased the distance between roster rows from 104 to 115 board units. Raised the crew caption and reduced the roster figure scale slightly to keep cheering hands clear of the caption. Both rows and their tags fit on the 16-player board.
- **Shelf.** Checked all eleven cover images and selected all eleven hero slides at 1480 × 1000, 1024 × 800 and 390 × 844. The selected hero action matched the card at all 33 checks. Desktop and tablet showed three columns. The phone showed two, with no horizontal overflow.

## Checks

| Check | Result |
| --- | --- |
| Prepare, production build and runtime bundle | Passed. The dependency bundle reproduced its tracked bytes. |
| ESLint | 0 errors, 14 warnings outside the changed game code. |
| Unit suite | 766 passed. One exhaustive-only pairing proof was skipped by the default suite. |
| Integration suite | 94 passed, 2 failed. Both failures use the old portable ZIP. One compares its inventory and contents. The other starts its host and requests a new browser file. The desktop staging test passed. An initial Lala bandwidth assertion also passed on both subsequent suite runs. |
| Browser suite | 14 passed. |
| Worker and D1 | 1 passed. |
| Individual party browser files | 18 tests passed across all 11 files, run one file at a time. The Head Hop, Snack Stack and Wobble Tower files also passed after their final visual fixes. |
| Portable host on port 4191 | One TV, three Chromium phone pages and thirteen socket controllers kept all 16 seats for 11 completed games and ten podium switches. Zero console errors, page exceptions or HTTP 404s. The prior TV game canvas detached at every podium. No global listener belonging to an earlier game remained on the four pages. |
| Phone cleanup | Switched through all 11 controllers and back to Tap Race. Old controller canvases detached. The final number of listeners on document, window and the observed long-lived event targets matched the initial 11. |

The checks ran with Node.js 26.12.1. The [session driver](../work/integration-2/session.mjs), [shelf check](../work/integration-2/shelf.mjs) and [controller cleanup check](../work/integration-2/phone-cleanup.mjs) are local verification files. An early session check treated each game's active phone listeners as a leak. The corrected check tracked which game registered each listener. The portable-host run used the same room throughout. Separate browser reruns verified the final visual edits made during that run, including commit `b7d9060`.

## Screenshots

All captures are in [work/integration-2](../work/integration-2/). The TV and phone captures use the game ID followed by `-tv.png` or `-phone.png`.

| View | Captures |
| --- | --- |
| Party shelf | [1480 × 1000](../work/integration-2/shelf-1480.png), [1024 × 800](../work/integration-2/shelf-1024.png), [390 × 844](../work/integration-2/shelf-390.png) |
| All eleven games | [TV contact sheet](../work/integration-2/boards-review.jpg), [phone contact sheet](../work/integration-2/phones-review.jpg) |
| Snack Stack | [Hold teaching gesture on the phone](../work/integration-2/snack-hold-midplay.png) |
| Head Hop | [Streak message above the 16-player board](../work/integration-2/head-hop-midplay.png) |
| Wobble Tower | [Both crew rows during play](../work/integration-2/wobble-tower-midplay.png) |

## Remaining work

Rebuild the portable ZIP with the pinned Node.js 24.22.3 toolchain and rerun the two ZIP checks. Device tilt, LAN certificate trust and physical-phone latency remain open. All commits are local to `party/integration-2`.
