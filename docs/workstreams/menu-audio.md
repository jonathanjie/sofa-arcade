# Collection menu music and sound

## Source and request

This follow-up starts from `main` at
**`a96fd477d2a3239d715421ed711682648e16eccc`** in an isolated worktree on
`feature/sofa-menu-music`. Jon requested a main-menu composition and explicitly
authorized merging the completed audio work.

The earlier Odd Laws media PR #8 and integration PR #3 were already merged.
The current source already selects **Lala Calls the House** and its ten civic
effect cues during Odd Laws gameplay. This change adds the collection's own
theme and connects it to the same sound engine.

## Composed material

**Make Yourself at Home** is an original 32-bar G-major waltz in 3/4 at 92 BPM.
Its D–G–B–A–G invitation returns in an AABA form; B visits E minor through
B7/D♯, changes register and note lengths, and returns through D7. The loop is
62.6087 seconds, with written breaths and resolving cadences.

The three short cues are `menu-select`, `menu-back`, and `menu-confirm`. They
share the theme's vocabulary and use beats at 92 BPM, including when a click
has just selected a game whose music runs at a different tempo. Unknown menu
cues return an empty event list.

Runtime files:

- `ui/media/sofa-menu/score.mjs`: pure `SCORE`, `eventsForBar`, and re-exported
  `eventsForEffect`.
- `ui/media/sofa-menu/effects.mjs`: the three authored cue definitions.

These modules total **5,817 bytes**. Original composition/provenance notes,
deterministic rendering tools, tests, complete MP3 previews, source hashes,
and numeric evidence are retained under `ui/media/sofa-menu/`. They are
development material and are excluded from application delivery.

## Player behavior

- The collection and planned-game detail pages select the menu theme.
- A primary pointer interaction or Enter/Space on the menu unlocks playback.
  Loading or reloading a page creates no audio graph until a gesture.
- Playable game pages select their own scores. Returning to the collection
  selects the menu theme. Re-rendering the same screen keeps the phrase and
  clock running instead of restarting the tune.
- Selecting a game plays `menu-select`; returning to the collection plays
  `menu-back`; confirming menu sound settings plays `menu-confirm`.
- Music and effects retain their separate controls and saved volume. All
  music/cues share the existing AudioContext, effects/music buses, and clock.
- Join screens and phone controllers remain quiet by default. Returning from
  either to the shelf keeps that session quiet, including planned-game pages
  and the tutorial. Explicitly hosting or starting practice selects host audio.
- Hidden pages pause and resume through the established lifecycle.

The shell changes are in `ui/app.js`; shared synthesis/routing is in
`ui/audio.js`. The app and audio module URL versions are updated so the new
entry points select the updated source together.

## Delivery and validation

The two pure menu modules are present in the shared browser/portable inventory,
the explicit LAN routes, and the Tauri runtime manifest. The manifest contains
106 runtime entries; the reproducible portable ZIP contains 109 files including
its generated notices/manifest. Adjacent tests, notes, render tools, WAVs and
MP3 evidence remain excluded. The two affected protected delivery files have
exact Git blob hashes and review notes in `tests/integration/components.json`.

Local verification includes:

- 10 new composition/render-evidence tests.
- 3 shared audio lifecycle tests, including the complete menu loop, one graph
  and clock across all three scores, cue tempo conversion, mute/phone/hidden
  behavior, repeatable renders, and restored preferences.
- All 81 existing root tests.
- 5 production/portable/LAN/Tauri delivery tests, including actual served bytes
  and rejection of existing adjacent authoring/evidence canaries.
- Successful production build and zero clipped/nonfinite samples in the
  deterministic theme and cue renders and decoded MP3s.

`.github/workflows/local-integration.yml` runs the new composition checks and
`tests/integration/browser/menu-audio.mjs` alongside the existing acceptance.
The browser test uses real LAN routes, native Web Audio with observation only,
and rendered controls across one TV and two isolated phone contexts. It checks
initial/keyboard unlocking, menu-to-game transitions, actual cue timing,
non-restarting renders, saved independent preferences, and quiet phone exits.
It saves screenshots and a JSON evidence report. The PR records the exact
tested head, workflow runs, and resulting merge; CI evidence is attached to
those runs.

```sh
npm run install:ci
node scripts/prepare-game.mjs
npm run package:lan
node --test ui/media/sofa-menu/score.test.mjs
node ui/media/sofa-menu/audio-preview.mjs --verify
npm test
npm run verify:local-release
npm run build
node tests/integration/package/production.mjs
node tests/integration/browser/menu-audio.mjs
```

Browser checks require the existing locked Playwright installation and its
Chromium binary. The current managed local browser could not be used in this
session; actual rendered acceptance runs in the existing CI environment.

## Native Quit correction found during acceptance

The first published menu candidate,
`c384d4523bdb2ad52913ada10555b6dedec9adf7`, passed all ten new real-browser menu
scenarios, the existing browser journeys, integrated Intel acceptance and both
production Mac builds. Its integrated Apple Silicon run restored the saved room,
host credential and exact state, but lost the test's final localStorage marker
after quitting. The saved Quit evidence showed `lastSupervisorState: "ready"`,
even though the normal AppKit Quit request ran and both processes exited.

Inspection of the pinned Tao 0.37.3 and tauri-runtime-wry 2.12.5 sources showed
that `applicationWillTerminate:` reaches `RunEvent::Exit` directly. The existing
app began its controlled shutdown only on `ExitRequested` or `CloseRequested`.
This was a pre-existing path that could bypass document retirement and the
owned-host shutdown; a passing rerun would not correct it.

`desktop/src-tauri/src/termination.rs` now adds the absent public
`applicationShouldTerminate:` callback to the existing Tao delegate. It keeps
that delegate and all its other callbacks, verifies the method encoding, and
refreshes AppKit's optional-selector cache. It uses Apple's documented
[deferred termination callback](https://developer.apple.com/documentation/appkit/nsapplicationdelegate/applicationshouldterminate(_:)?language=objc)
and [completion reply](https://developer.apple.com/documentation/appkit/nsapplication/reply(toapplicationshouldterminate:)?language=objc).
The existing main run loop remains available while the supervisor retires the
game document, stops its retained child and records `stopped`. Only successful
completion permits termination. Duplicate native/window Quit requests share
one operation; queued window creation is refused once shutdown starts.

The platform-independent coordinator is included in the existing Rust test
suite: 17 tests pass, including six new ordering/failure cases. The bridge uses
the already-locked objc2 0.6.5 and objc2-app-kit 0.3.2 packages; no package version
is upgraded. The existing native test now also requires the final supervisor
state to be `stopped`. All immediate-marker, saved-credential, sound-preference,
root-restore, explicit-exit and forced-crash assertions remain unchanged. No
post-write sleep or test-data rewrite is added. The exact corrected head must
pass both native architectures before merge; the PR records those results.

## Audio evidence and limits

The complete MP3 theme is
`ui/media/sofa-menu/audio-evidence/make-yourself-at-home.mp3`; the three-cue reel
is `menu-effects.mp3` beside it. Together they are 695,248 bytes. The theme's
uncompressed source peak is −14.24 dBFS before the shared music bus/master gain;
the encoded theme peaks at −17.79 dBFS. The precise measurements, source/file
hashes and synthesis assumptions are in `audio-evidence/render-report.json`.

These are original synthesized compositions, with no third-party recordings
or melodies copied. Numeric rendering, MP3 decode, real browser scheduling and
native lifecycle tests are distinct from human listening or a physical Mac,
TV and phone test. No human auditory evaluation is claimed. Merging source
does not update an already installed app or publish the separate hosted Site.
