# Lala Calls the House

An original chamber-comedy miniature for **Odd Laws Society**, authored for this
repository during WS4. The runtime is a fixed musical score, not a random-note
system. No third-party tune, performance, sound font, recording or sample was
imported.

## Form and musical decisions

**F major · 4/4 · quarter note = 100 · 32 bars · 76.8 seconds per loop.**
The B section visits D minor. A rounded clarinet-like woodwind carries one lead;
a low bass and quiet pizzicato support it. The shared synthesizer determines the
final timbre. Nothing here adds a new audio context or scheduler.

| Bars (one-based) | Playback time | Material | Harmony and phrase |
| --- | --- | --- | --- |
| 1–8 | 0:00–0:19.2 | A | F – C/E – Bb – C7 / F – Dm – C7 – F |
| 9–16 | 0:19.2–0:38.4 | A | Exact theme return, including its rests and accents |
| 17–24 | 0:38.4–0:57.6 | B | Dm – A7/C# – Dm/F – Gm7 / Bb – Gm/Bb – C7 – C7 |
| 25–32 | 0:57.6–1:16.8 | A | Recognizable return and tonic cadence before looping |

A starts after a half-beat pickup space. Its **A–C–A** figure, short downward
answer and gently asymmetric eighth-note rhythm are the calling-card. Bars 1 and
5 share that figure. Four-bar questions have a full beat to breathe, and the
C7-to-F answer leaves a beat and a half of melody silence. Accompaniment also
stops before the last beat of each authentic cadence, preserving audible space.

B has a sustained high D opening, longer average note values, a higher register,
and the C-sharp leading tone of A7/C#. This creates a real relative-minor detour,
not merely a different accompaniment under A. Its descending sequence settles
onto C7 for the return to F. All onsets, durations, rests and phrase accents are
written in `score.mjs`; the entire melody is identical across scene modes.

## Runtime interfaces

Only these files need inclusion in the production/browser runtime:

- `ui/media/odd-laws-society/score.mjs` — `SCORE`, `eventsForBar(index, mode='play')`.
- `ui/media/odd-laws-society/effects.mjs` — `eventsForEffect(name)`.

`SCORE` and every nested score object are frozen. Each call returns a fresh array
of fresh event objects. Events use the contracted fields
`{ instrument, pitch, beat, duration, level }`; pitch is MIDI and both timing
fields are **beats at `SCORE.bpm`**, never milliseconds or seconds.

| Scene | Arrangement |
| --- | --- |
| `play`, `term1` | Full theme, two bass pulses, quiet three-note offbeat pizzicato |
| `lobby` | Same tune; one bass pulse and softer two-note voicings |
| `council` | Quieter lead, one bass note, only one soft two-note chord per bar |
| `term2` | Same melody and tempo; slightly longer, rounder pizzicato |
| `term3` | Term II texture plus one very quiet tonic bell on bars 8, 16 and 32 |
| `celebrate` | Modest dynamic lift; the same three cadence bells, no competing lead |

Unknown modes, including non-string values and object-prototype names, use
`play`. Finite numeric indices are floored and wrapped: `32 → 0`, `-1 → 31`,
`4.9 → 4`, `-0.1 → 31`. Non-finite and non-numeric indices use bar zero. These
rules avoid accidental exceptions during a scene change or resume.

Effects: `build`, `coin`, `influence`, `street`, `seal`, `reveal`, `stamp`,
`festival`, `win`, `tie`. Unknown names return `[]`. Cues are brief and restrained;
most use one or two notes. The effect preview separates cues with silence and is
not itself a runtime soundtrack.

### Shared engine integration

WS6 connects these data exports to the **existing** shared audio engine:

1. Select this score as the active soundtrack when entering Odd Laws. Use its
   tempo and meter rather than the Sofa Kingdoms waltz's constants.
2. Convert events with `beatSeconds = 60 / SCORE.bpm` and
   `barSeconds = SCORE.beatsPerBar * beatSeconds`. Both `beat` and `duration` need
   this conversion, including effect cues.
3. Preserve the four-bar phrase boundary for arrangement changes. Do not reset
   the melody on every public game event. Switching games should stop the old
   score's scheduled voices so two soundtracks never overlap.
4. Reuse the shared host-only music policy, independent music/effects settings,
   quiet phone defaults, user volume, gesture unlock, and hidden-page pause.
5. Trigger council reveal/stamp and rewards only from committed public events;
   local sealed-bid feedback must not become a public cue. Deduplicate repeated
   events after reconnect. These files contain no game-state listeners.

The MP3 files and renderer are review evidence; production should use the score
modules through the shared synthesizer. No production dependency is added.

## Preview and measurement evidence

Complete rendered AABA previews:

- [Full arrangement](audio-evidence/lala-calls-the-house-play.mp3).
- [Quiet council arrangement](audio-evidence/lala-calls-the-house-council.mp3).
- [Ten effects in contract order](audio-evidence/civic-effects.mp3).
- [Signal measurements and source/file hashes](audio-evidence/render-report.json).

Both music previews contain 76.8 seconds of composition plus a 0.6-second release
tail. They use the shared music bus gain of 0.7 and **100% user volume** for
review, with no loudness normalization or limiter. The report also computes the
current shared default volume of 45%. Previews are mono, 32 kHz, 80 kbps MP3;
only the compact files are retained. WAV intermediates are reproducible and
ignored by Git.

The dependency-free Node renderer approximates the existing woodwind harmonic
wave, triangle bass/pizzicato, sine bell, gain envelopes, lowpass filters and
quiet 75 ms reflection. It intentionally omits the shared compressor, so signal
headroom is checked before compression. Browser oscillator normalization and
filter implementation can differ; this is **not** a bit-exact capture of the
production Web Audio graph.

| Arrangement | Events per loop | Peak before bus/compressor | RMS at 100% preview volume |
| --- | ---: | ---: | ---: |
| Play / Term I | 388 | −13.29 dBFS | −25.85 dBFS |
| Lobby | 295 | −14.63 dBFS | −26.95 dBFS |
| Council | 237 | −16.25 dBFS | −28.91 dBFS |
| Term II | 388 | −13.29 dBFS | −25.84 dBFS |
| Term III | 391 | −13.25 dBFS | −25.84 dBFS |
| Celebration | 391 | −12.74 dBFS | −25.26 dBFS |

All seven complete arrangements and all ten effects produced finite samples,
zero clipped samples and negligible DC offset. The loudest source peak was
0.2308 (celebration), before the 0.7 music bus and user volume. Encoded MP3s were
then decoded and measured independently; all retained their headroom. Exact
values, cue timestamps, file hashes and encoder version are in the report.

**No auditory evaluation is claimed.** Written musical review, structural tests,
numerical rendering and browser decode/play/seek verification are distinct from
listening. Final timbre and volume should be auditioned through the integrated
shared audio engine on the Mac/TV. Physical speakers and the complete game's
sound lifecycle are WS6 acceptance work.

## Reproducible checks

From the repository root, with Node 22.13 or newer:

```sh
node --test ui/media/odd-laws-society/score.test.mjs ui/score.test.mjs
node ui/media/odd-laws-society/audio-preview.mjs --verify
```

The suite checks 32-bar form, exact A recurrence, modal/rhythmic/register contrast
in B, complete accounting of notes/rests, real cadences and breath space,
instrument/pitch/timing/level bounds, restrained arrangements, all mode/index
fallbacks, deep immutability, cue safety, runtime independence from browser/clock
or randomness, and correspondence of retained evidence to exact source hashes.

To regenerate evidence and all three previews (optional `ffmpeg` with
`libmp3lame` is needed only for MP3 encoding):

```sh
node ui/media/odd-laws-society/audio-preview.mjs --write --encode
```

`--write` alone creates PCM WAVs and numeric evidence without invoking ffmpeg.
The committed evidence includes encoded-preview hashes, so the final evidence
update should use `--write --encode` before running the suite. Tests and renderer
must remain in this owned subtree; they do not belong in the LAN/desktop runtime
allowlist.

## Provenance and scope

Composition and cues were authored directly as new note data for this project.
The synthesizer approximation follows the repository's inspected `ui/audio.js`
timbres, not external recordings. This work introduces no third-party music
licence or sample attribution. It does not change the repository-wide licensing
policy. Source files are the editable composition, and the exact base source
revision for this workstream is recorded in `docs/workstreams/odd-laws-media.md`.
