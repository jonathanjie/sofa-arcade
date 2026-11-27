# Party ink kit

The public API lives in `ui/party/kit/ink.mjs`. It exports the eight base poses (`P`), pose creation and interpolation (`mk`, `pathPose`), the timed `Actor` queue and `drawFigure`. The drawing helpers provide paper, ground, ink shapes, colour and pattern badges, roster name tags, bounded popups, particles and screen shake. See the [kit contract](../docs/PARTY_CONTRACT.md#ink-figures-on-tv-and-phone) for units, options and calls.

The port takes the poses, interpolation, limb solver, six body styles and ink drawing conventions from goofyfish’s `.claude/skills/game/references/snippets.js`. The chunky style is the default. Shared Sofa Arcade looks supply the headbands and badge patterns. Effects reuse the arcade particle system. Reduced motion suppresses particles, shake, breathing and sketch movement while keeping messages visible.

| Files | Purpose |
| --- | --- |
| `ui/party/kit/ink.mjs`, `ink-poses.mjs`, `ink-paper.mjs` | Figure rendering, animation and scene helpers |
| `ui/party/kit/ink.test.mjs` | Five tests for pose interpolation, queue timing, identity mapping, 16-tag layout and all six styles |
| `public/party/kit/ink*.mjs` | Generated browser modules |
| `server/party-delivery.mjs`, `scripts/runtime-files.mjs`, `desktop/runtime-manifest.json` | Browser and host delivery inventories |
| `docs/third-party/goofyfish-LICENSE.txt` | Original MIT notice, © 2026 Kamran Ahmed |

Preparation and the production build passed. ESLint reported zero errors and 14 warnings outside the changed files. The unit suite passed 740 tests and skipped one. Integration passed 81 of 83. Both failures concern the existing portable ZIP. Its inventory lacks the three ink modules, the license and the earlier stack module. Its isolated host returns 404 for the ink entry point.

The Playwright capture shows all 16 name tags and distinct badge patterns at 1920 × 1080. The eight poses appear facing both directions. The rows have clearance above raised hands. Physical TV readability at 3 m remains unverified. [Full-size capture](../work/ink-kit/figures.png)
