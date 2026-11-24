# Don't Wake Lala

Hold the button to tiptoe towards the cheese and let go to stop. Lala twitches an ear and lifts an eyelid before she looks. Keep still while her eyes are open, or slide back to the start and try again when she sleeps. Reach the cheese first to win, or lead on distance when the 60-second timer ends. Mice with the same finishing distance share a place.

## Controls

- On a phone, hold the large pad with one finger and let go when the TV shows **Freeze!**. Space and Enter also work. The small cat on the pad mirrors the TV cue.
- **Strict motion** is an individual choice, off by default. Tap it on a phone with trusted HTTPS to permit motion sensing, then keep the phone still when Lala looks. Tap again to turn it off. If permission or readings are unavailable, the button still works. The phone sends a motion flag and keeps the sensor readings on the device.
- The TV runs the countdown, warning calls, catch effects and podium. Its motion setting keeps the cues and status labels while removing the camera cut, slide and particles.

## Scaling

Two to eight mice use one bank of lanes. Nine to sixteen mice use two banks. Names stay at the lane entrance. A scarf and matching badge travel with each mouse. The room locks the roster at countdown, and late guests join the next round. A mouse can advance again as soon as Lala sleeps. A disconnected seat keeps its last distance after the hold expires. A removed seat loses its place.

## Tuning

| Setting | Value and reason |
| --- | --- |
| Deadline and target | 60 seconds and 150 points. A 50 ms tick adds 0.25 points while held and the eyes are closed, so a finish takes at least 30 seconds of movement. |
| Hold renewal | The phone renews every 100 ms. The host expires a hold after 350 ms without a renewal or release and requires a fresh hold at the finish line. |
| Nap and look | Seeded naps last 2.50–4.75 s. Looks last 0.85–1.15 s, so a caught mouse returns to play in less than 1.2 s. |
| Warning | The first warning window lasts 0.90–0.95 s. When the host supplies the round number, the window shrinks by 0.10 s per round to a 0.60 s floor, and seeded ear-only fake-outs start in round two. |
| Release grace | The host accepts a release up to 150 ms after the look starts. Progress stops when the look starts. |
| Motion | A phone sends a flag at most once every 150 ms if acceleration without gravity reaches 2.5 m/s² or rotation reaches 35°/s. The host counts it during a look. The limit leaves room for hold renewals in the input budget. |
| Catch and look effects | The 430 ms slide shows where a mouse was caught. A 105 ms freeze and integer-scale close-up highlight the open eye. Both end within the look. |

The current [party contract](../../PARTY_CONTRACT.md) passes the roster and seed to `createRound`. Live rooms use the first-round warning window. Supply the trusted round number as the optional third argument to enable the tested difficulty progression and fake-outs. The shared 16-phone shortcut stops after 500 ticks, so the integration test drives the same socket harness directly for rounds up to 1,200 ticks.
