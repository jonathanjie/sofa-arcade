# Make Yourself at Home

The original main-menu theme for **Sofa Arcade**, composed for the collection
screen rather than an individual game. It is a welcoming, unhurried chamber
waltz for the existing rounded woodwind, bass and pizzicato voices, with three
very quiet tonic bell arrivals.

**G major · 3/4 · quarter note = 92 · AABA · 32 bars · 62.6087 seconds per loop.**
The B section visits E minor. The composition is distinct from both the existing
Sofa Kingdoms **Lala’s Little Waltz** and Odd Laws **Lala Calls the House**. It
introduces its own D–G–B–A–G hook, melodic phrasing, bass movement and dominant
harmony; it does not switch back to either game’s tune while browsing the menu.

## Form and phrasing

| Bars, one-based | Time | Material | Harmonic path |
| --- | --- | --- | --- |
| 1–8 | 0:00–0:15.65 | A — invitation and answer | G – D/F# – C/E – D7 / G – Em7 – D7 – G |
| 9–16 | 0:15.65–0:31.30 | A — the complete familiar theme again | Exact melody and breath recurrence |
| 17–24 | 0:31.30–0:46.96 | B — a brief reflective detour | Em – B7/D# – Em/G – Am / C – Am/C – D7 – D7 |
| 25–32 | 0:46.96–1:02.61 | A — return home | Original invitation, then a resolved tonic cadence |

The opening five-note **D–G–B–A–G** figure rises from a low pickup through the
major chord, then relaxes down by step. It repeats inside each eight-bar A
section. A descending G–F#–E–D bass line supports the first question without
adding a competing tune. Two-note pizzicato voicings suggest a small ensemble;
the melody remains the only continuous lead.

B begins with a sustained E in a higher register, moves through B7’s D-sharp
leading tone, and sings in longer average note values. Its upper G is the
melodic high point. A descending answer and a G-to-F# suspension return the
music to D7 before A comes back. This is a written contrasting melody and
harmonic section, not a mode switch that merely changes accompaniment.

Each bar contains explicit rests. Authentic D7-to-G cadences leave the melody
silent for 1.25 beats; the accompaniment also leaves the last beat clear. The
B turnaround leaves a full beat of space. These breaths make the loop settle
and give menu interactions room to be heard. No random pitches, free-running
arpeggiator, or per-frame sound generation is used.

## Runtime API and integration

Runtime files:

- `ui/media/sofa-menu/score.mjs`
- `ui/media/sofa-menu/effects.mjs`

The score module exports `SCORE`, `eventsForBar(index, mode='play')`, and a
re-export of `eventsForEffect(name)`, so the existing engine can consume a
single module namespace:

```js
import * as menuMusic from './media/sofa-menu/score.mjs';

audio.setScore('sofa-menu', menuMusic);
audio.setScene('lobby');
```

`play`, `menu`, `lobby`, and unknown mode values all produce the same complete
menu arrangement. There is no scene-dependent melody replacement. The shared
engine’s existing `lobby` scene is sufficient; it does not need a new scene enum
for this composition.

All events have the existing `{instrument,pitch,beat,duration,level}` shape.
Pitches are MIDI values; **both `beat` and `duration` are beats at 92 BPM**.
`SCORE` is deeply frozen; events are fresh mutable objects. Finite numeric bar
indices are floored and wrapped, including negative indices. Non-numeric and
non-finite indices start at bar zero. Unknown cue names return a fresh `[]`.

The shared engine continues to own the only `AudioContext`, timing, volume,
preferences, gesture unlock, phone policy and visibility lifecycle. The
collection screen needs to be eligible for host music, and entering a game
selects that game’s soundtrack. Menu navigation should not restart the tune.
Do not add a second scheduler or use the review MP3 as a competing live track.

### Restrained menu gestures

| Cue | Material | Duration at 92 BPM |
| --- | --- | ---: |
| `menu-select` | Soft G pizzicato followed by a quiet B bell | About 0.28 s |
| `menu-back` | Descending B-to-G pizzicato | About 0.49 s |
| `menu-confirm` | Short G–B–D woodwind rise with a low pluck | About 0.98 s |

These pitches echo the main hook. Trigger them on accepted deliberate
navigation, not hover or every render. The shared effects preference still
controls them. Unknown or unrelated names remain silent while this score is
active. The runtime data contains no event listeners or navigation logic.

## Preview and signal evidence

- [Complete theme MP3](audio-evidence/make-yourself-at-home.mp3)
- [Menu effects MP3](audio-evidence/menu-effects.mp3)
- [Numerical measurements and exact source/file hashes](audio-evidence/render-report.json)

The complete preview contains the full 62.6087-second form and a 0.6-second
release tail. It is mono, 32 kHz, 80 kbps MP3. It corresponds to **100% user
volume** through the existing music bus gain of 0.7. It has not been loudness
normalized. The report separately gives levels at the current 45% shared
volume default.

The theme has **262 events per loop**. Its uncompressed source peak is
**−14.24 dBFS**; preview RMS is **−26.83 dBFS** at 100% user volume. All samples
are finite and no samples clip. All three effects also pass the level and DC
offset checks. Retained MP3s were decoded and measured again after encoding.
The complete figures are in the report, including the separated effect-cue
timestamps.

`offline-render.mjs` is a parameterized, development-only synthesis utility
adapted from this repository’s inspected audio-preview mathematics. It mirrors
the woodwind harmonic wave, triangle bass/pizzicato, bell partial, note
envelopes, lowpass cutoffs and quiet room reflection used by `ui/audio.js`.
It adds no I/O, device access or live audio lifecycle. `audio-preview.mjs` is
the separate CLI wrapper for writing previews and evidence.

The offline render omits the shared compressor so headroom is checked before
compression. Browser oscillator normalization and filter details can differ,
so this is an approximation rather than a bit-exact Web Audio capture.

**No human auditory evaluation is claimed.** Written musical review, exact
structural tests, numerical rendering, decoded-file verification and browser
playback checks are separate from listening on Jon’s Mac, TV or speakers.

## Verification and regeneration

From the repository root, with Node 22.13 or newer:

```sh
node --test ui/media/sofa-menu/score.test.mjs
node ui/media/sofa-menu/audio-preview.mjs --verify
```

The ten tests cover the complete AABA form, recurring hook, distinction from
the two game scores, exact beat accounting, E-minor contrast, leading-tone
harmony, breath/cadence space, event timing/pitch/levels, mode/index fallbacks,
immutability, menu cue vocabulary, runtime independence from browser/clock or
randomness, deterministic tempo-aware offline synthesis, WAV layout, and
correspondence between the exact sources and retained preview evidence.

Regenerate PCM evidence with Node alone, or include compact MP3s with ffmpeg:

```sh
node ui/media/sofa-menu/audio-preview.mjs --write
node ui/media/sofa-menu/audio-preview.mjs --write --encode
```

The final committed evidence uses `--write --encode` because tests verify the
MP3 hashes as well as the source hashes. ffmpeg with `libmp3lame` is required
only for encoding; verification does not invoke it. Reproducible WAVs are
ignored by Git. No new package or root dependency is required.

Only `score.mjs` and `effects.mjs` belong in browser/LAN/ZIP/desktop runtime
allowlists. The renderer, CLI, tests, notes and MP3 review evidence are
non-runtime development material.

## Provenance

The melody, harmonies, rhythm, rests, dynamics and three menu cues were newly
authored as note data for Sofa Arcade. No stock track, external composition,
recording, sound font or sampled instrument was imported. The renderer uses
this project’s own previously inspected synth vocabulary and math, with tempo
parameterization; it does not borrow an outside performance.

Base revision for this menu task:
`a96fd477d2a3239d715421ed711682648e16eccc`, current `main` at branch creation.
The editable source is the score itself. This work introduces no third-party
music attribution requirement and does not change repository-wide licensing.
