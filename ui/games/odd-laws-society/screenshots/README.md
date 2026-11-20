# Rendered Odd Laws interface evidence

These unmodified PNGs came from actual headless Chromium, using the labelled standalone fixture harness. They are not design mockups or integrated multiplayer screenshots.

- Capture commit: `e1aab1a2492da1a4c00e94f583fbb08c387a2c78`.
- [Successful CI run: 33 Node tests and 61 browser checks](https://github.com/jonathanjie/sofa-arcade/actions/runs/44701879120).
- Browser: locked Playwright 1.57.0 Chromium, Ubuntu 24.04.
- The final evidence/report commit leaves production runtime code unchanged; its exact tested SHA is in the PR.
- [evidence.json](evidence.json) records the original artifact, paths, dimensions, and SHA-256 hashes.

| Capture | Viewport | State |
| --- | --- | --- |
| [tv-1920-actions.png](tv-1920-actions.png) | 1920×1080 | Shared market and both boroughs |
| [tv-1920-income.png](tv-1920-income.png) | 1920×1080 | Income / session transition |
| [tv-1280-council.png](tv-1280-council.png) | 1280×720 | Public council proposals |
| [tv-1280-reveal.png](tv-1280-reveal.png) | 1280×720 | Both votes/bids revealed with Lala stamp |
| [tv-1280-results.png](tv-1280-results.png) | 1280×720 | Final score breakdown |
| [tv-1280-tie.png](tv-1280-tie.png) | 1280×720 | Tied final score breakdown |
| [phone-jon-360-council.png](phone-jon-360-council.png) | 360×800 | Private choice and influence bid |
| [phone-jon-390-actions.png](phone-jon-390-actions.png) | 390×844 | Four ordinary actions |
| [phone-390-build.png](phone-390-build.png) | 390×844 | Exact-cost Build and plot confirmation |
| [phone-lydia-390-locked.png](phone-lydia-390-locked.png) | 390×844 | Own sealed vote and opponent readiness |
| [phone-jon-360-full.png](phone-jon-360-full.png) | 360×800 | Full city with remaining legal actions |
| [phone-offline-fallback.png](phone-offline-fallback.png) | 1280×720 | Failed media with network offline |
| [tutorial-360-council.png](tutorial-360-council.png) | 360×800 | Optional isolated all-pay lesson |

The CI artifact contains all 40 size/state layout captures, plus interaction/tutorial screenshots. TV boards fit the requested viewports. Phones permit vertical scrolling for inspection, Build detail, and the complete result ledger. The harness banner remains visible as evidence of fixture mode; production mounting does not include that banner.

To reproduce:

```sh
npm ci --prefix ui/games/odd-laws-society
npx --prefix ui/games/odd-laws-society playwright install --with-deps chromium
npm test --prefix ui/games/odd-laws-society
WS3_CAPTURE_SCREENSHOTS=1 npm run test:browser --prefix ui/games/odd-laws-society
```

The optional capture variable writes eight representative layout files here. All other captures remain in the ignored `test-results/` directory until explicitly reviewed and copied.
