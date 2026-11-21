# Over the Little Bridge

Original music and sound effects for **Gravity Orchard**, authored as editable
note data for this repository. The shared synthesizer provides the timbres; no
recording, sample pack, sound font, external stream or random-note generator is
used.

## Musical design

**D major · 4/4 · quarter note = 104 · AABA · 32 bars · 73.846 seconds per loop.**
The contrasting section visits B minor. A rounded woodwind sings the returning
melody above a quiet bass and plucked chord pattern. Small bells mark the tonic
cadences. This stays within the four instruments the existing scheduler actually
supports: `woodwind`, `bass`, `pizzicato` and `bell`.

| Bars, one-based | Approximate time | Section | Harmony |
| --- | --- | --- | --- |
| 1–8 | 0:00–0:18.46 | A | D – G – D/F# – A7 / D – G – A7 – D |
| 9–16 | 0:18.46–0:36.92 | A | Exact melodic return, with the same written breaths |
| 17–24 | 0:36.92–0:55.38 | B | Bm – F#7/A# – Bm/D – Em / G – D/F# – Em7 – A7 |
| 25–32 | 0:55.38–1:13.85 | A | Familiar return and a D-major cadence before looping |

The first bar establishes **F#–A–B–A–F#–E** with a lightly asymmetric dotted
rhythm. It rises as if handing a fruit across the bridge and comes back to a
descending answer. Bar five repeats that invitation; bar six takes the answer
higher before A7 resolves to D. The B section uses longer notes, a higher
register and the A-sharp leading tone of F#7. Its last two bars return through
Em7 and A7. The composition therefore changes its melodic and harmonic material,
not only its accompaniment.

Every melody bar has an explicit rest. The authentic cadences leave a beat and
a half of melody silence; the accompaniment also stops early. No note reaches
the final beat of a tonic cadence or the B turnaround. That space gives the
phrases a clear ending and permits a quiet loop seam. The score is independent
of the 90-second stage clock.

## Seven arrangements

All scenes retain the same pitches, rhythms, meter and tempo, so changing the
scene does not interrupt the tune. Dynamics, bass activity, chord rhythm and
cadence bells vary deliberately.

| Scene | Arrangement |
| --- | --- |
| `menu` | Complete tune, two light bass pulses, three offbeat chord gestures |
| `practice` | Quieter melody, one bass pulse and two small chord gestures |
| `stage1` | Clear melody and steady, lightly plucked support |
| `stage2` | Shorter chord articulation and an extra late offbeat away from cadences |
| `stage3` | Softer lead and accompaniment, with a little more bell colour at cadences |
| `paused` | Quiet complete melody and one low bass pulse; no plucked ostinato or bells |
| `celebrate` | Modest dynamic lift and a soft bell echo of the opening gesture |

Unknown scenes use `menu`. Finite numeric bar indices are floored and wrapped;
all other indices select bar zero. All nested score data are frozen. Event calls
return new arrays and event objects so presentation code cannot mutate the score.

## Runtime interface and GO7 integration

Only two files belong in the shipped music runtime:

- `ui/media/gravity-orchard/score.mjs`: `SCORE`, `eventsForBar(barIndex, scene)`;
  also re-exports `eventsForEffect` for the existing `audio.setScore` interface.
- `ui/media/gravity-orchard/events.mjs`: `eventsForEffect(name)`, `EFFECT_NAMES`,
  `CUE_POLICY`.

Every musical event has exactly
`{ instrument, pitch, beat, duration, level }`. Pitch is MIDI. **Both timing
fields are beats at 104 BPM**, not seconds. The existing scheduler already
performs that conversion and schedules arrangement changes on four-bar
boundaries.

The current supported integration is:

```js
import { audio } from '../../audio.js';
import * as orchardMusic from '../../media/gravity-orchard/score.mjs';

audio.setScore('gravity-orchard', orchardMusic);
audio.setContext({ role: 'host', view: 'game', scoreScene: 'stage1' });
// Existing gesture handler, before any unrelated await:
await audio.unlock();
```

The example's relative import paths are illustrative from the game wiring;
GO7 should resolve them from its actual entry module. `audio.setContext` already
accepts `scoreScene`. The current `audio.setScene` convenience method has a
whitelist for older games; GO7 must extend that whitelist if it chooses that
method instead. Do not silently rename the contracted scenes to old-game names.

Update `scoreScene` when the phase or stage changes; do not call `setScore` for
every catch. Selecting the same game score repeatedly is unnecessary. Existing
gesture unlocking, host-only music, quiet phone defaults, independent music and
effects preferences, hidden-page pause and shared disposal remain authoritative.
No GO5 runtime file constructs an `AudioContext`, schedules a timer, reads local
storage or observes game state.

## Cues and deduplication

| Public situation | Canonical cue | Typical duration | Recommended minimum interval |
| --- | --- | ---: | ---: |
| Valid capture | `catch` | 0.242 s | 120 ms |
| Wrong basket or full basket | `reject` | 0.283 s | 180 ms |
| Compost | `compost` | 0.260 s | 300 ms |
| Completed recipe | `order` | 0.681 s | 650 ms |
| Lala forecast | `forecast` | 0.577 s | 850 ms |
| Gate warning | `gate-warning` | 0.415 s | 1,000 ms |
| Lala gust begins | `gust` | 0.415 s | 900 ms |
| One countdown number | `countdown` | 0.156 s | 700 ms |
| Stage result | `stage-result` | 1.067 s | 1,500 ms |
| Final celebration | `finish` | 1.558 s | 2,500 ms |

The canonical contract cues `catch`, `reject`, `compost`, `order`, `forecast`,
`countdown` and `finish` are present. Public event names also work directly:
`order-complete`, `gate-forecast`, `gust-forecast`, `gust-start` and
`stage-complete` map to their corresponding cues. `full`, `basket-full`,
`basket-reject`, `lala-forecast`, `lala-gust`, `celebrate`, `celebration` and
`final-celebration` are documented aliases. Unknown cues return `[]`.
`spawn`, `transfer`, `impact`, `collision` and bare `phase-change` are deliberately
silent: continuous physics does not need a jingle.

GO7/GO4's host event adapter should:

1. Deduplicate each committed public event by `(matchId, event.id)`. Preserve the
   cursor across repeated projections and reconnects within the match, and clear
   it for a new match. Keep a bounded recent-ID set large enough for the public
   event ring. An epoch change by itself does not make old events new again.
2. Normalize the event name to its canonical cue for `CUE_POLICY`, apply its
   cooldown, and prefer a completed recipe over its simultaneous ingredient
   catch. `CUE_POLICY.priority` documents that choice; no timer is hidden here.
3. Play a stage-result cue or the final celebration at the last boundary, not
   both together. Use the last stage's stable event identity for the final cue.
4. For countdown numbers, deduplicate a synthetic presentation key such as
   `(matchId, runEpoch, countdownNumber)`. Never play it at every snapshot.
5. Send accepted cues to the existing `audio.effect(name)`. Do not invoke this
   from phone controllers or from local speculative physics.

The frequently occurring catch/reject/compost cues contain only two notes and
last less than 0.3 seconds. Effects have restrained envelope levels, and no
collision cue is attached to the score's clock.

## Preview, render and verification

`audio-preview.mjs` exports
`mountAudioPreview(root, { audio? }) -> { play, stop, selectScene, getState, dispose }`.
It begins silently and uses the existing shared scheduler after a button
gesture. The same global preferences are shown; stopping the preview does not
change them. Recordings are optional review controls, separate from the shipped
runtime. The gallery must serve the audio module's existing shared imports.

The development-only renderer runs the **unchanged shared `ui/audio.js`** in
Chromium's real `OfflineAudioContext`. A clock facade allows the existing
look-ahead callback to schedule complete phrases immediately. One channel
captures the final output, and a second taps the existing master gain before
its compressor. This does not create another runtime engine. It checks:

- Two full loops of all seven scenes, including the quiet tails and sample
  jumps at the actual loop seam.
- Scene changes requested between musical boundaries; the score cursor and
  single scheduler interval continue while arrangements switch on the next
  four-bar boundary.
- All ten effects, a cue reel, representative overlap with music, finite
  samples, conservative peak headroom, DC offset and oscillator concurrency.
- An actual render at the existing 45% default volume, separately from the
  100% renders used to check headroom.
- Quiet phone defaults: no music clock, oscillators or effect samples.
- MP3 encoding followed by decoding and another signal measurement.

The report records hashes of the exact score, effects, shared scheduler,
renderer and previews. The retained-evidence test fails if any recorded source
changes or a preview is missing. It never treats the absence of a render as a
successful check.

From the repository root, after the locked nested development dependencies and
Playwright Chromium are installed:

```sh
node ui/media/gravity-orchard/sources/audio/render.mjs --write --encode
node --test ui/media/gravity-orchard/score.test.mjs
node ui/media/gravity-orchard/sources/audio/render.mjs --verify
```

The first command requires `ffmpeg` with MP3 encoding support and writes four
compact recordings under `sources/audio/previews/`. Its PCM intermediates are
removed after successful encoding. `--verify` re-renders without writing.
`--interactive --write --encode` provides a loopback-only browser fixture for
environments that permit a shared browser to reach the renderer; it still uses
the same offline graph and assertions. Browser-process or network sandbox
failures are reported as blocked verification, never worked around with
security-disabling flags.

Review recordings:

- [Morning Delivery, full loop](previews/over-the-little-bridge-stage1.mp3)
- [Moonlight Picnic, full loop](previews/over-the-little-bridge-stage3.mp3)
- [Scenes changing at phrase boundaries](previews/orchard-scene-transitions.mp3)
- [All ten cues with silence between them](previews/orchard-cues.mp3)
- [Exact measurements and source hashes](render-report.json)

**No human auditory evaluation is claimed.** Reading notation, rendering Web
Audio, checking signal levels, decoding files and operating playback controls
are distinct from listening. The final Mac/TV speaker balance and the complete
game's event deduplication remain GO7 acceptance checks.

## Source and distribution notes

The score and cues are original event data authored for Sofa Arcade at the
repository owner's request. The existing compositions were inspected for API
and arrangement conventions; their melodies were not reused. The shared audio
engine was inspected and exercised unchanged. No third-party recording or
sample licence is introduced. This notice records origin and does not change
the repository owner's distribution terms or add a repository-wide licence.

All material in `sources/audio/`, the gallery preview helper and the test file
are authoring/review material. They must be excluded from the public, LAN,
portable and native runtime inventories. Development tools retain their own
licences and are not bundled as game media.
