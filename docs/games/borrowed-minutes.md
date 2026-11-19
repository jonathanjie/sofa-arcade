# Borrowed Minutes — provisional PRD and design

**Status:** design draft; not implemented. **Catalog ID:** `borrowed-minutes`. **Mode:** two-player cooperative heist. **Target:** 20–30 minutes. **Branch:** `feature/borrowed-minutes`.

Read [parallel development](../PARALLEL_DEVELOPMENT.md) for ownership and platform gates. The numbers and map rules below are a coherent MVP proposal, not established balance.

## Experience and core idea

Jon and Lydia are tiny clockwork burglars trying to borrow the Moon Biscuit from a mechanical pantry before Lala's midnight bell. A failed attempt becomes useful: translucent echoes replay the previous attempt's positions, holding switches while the live players try a better route.

The satisfying moment is deliberately spending an early loop to create a helpful echo, then coordinating a precise sequence around it. The game rewards conversation and planning; it does not depend on fast tapping or a real-time countdown.

## MVP rules

- One authored 6×6 orthogonal grid per mission, with walls, doors, pressure plates, a vault, two entrance/exit squares, and one or two guards on fixed routes. Both live players and echoes can share a square.
- A mission has **three loops of eight beats**. Each beat both players choose one action on their phones: move one square, wait, or interact with the object on their current square. Plans remain private until both commit, although players may discuss freely.
- An interaction can lift the Moon Biscuit from an unlocked vault, pick it up from the floor, or hand it to the other live player on the same square. Carrying it does not reduce movement. A player carries at most this one objective.
- A labelled plate opens its corresponding door while occupied by at least one live player or echo. The vault requires two labelled plates to be occupied simultaneously. Door state is deterministic and visibly previewed; the tutorial teaches its timing.
- Guards follow a public eight-position route. A guard catches a live player when they end a beat on the same square, or when guard and player swap the endpoints of the same edge that beat. There is no line-of-sight detection in the MVP.
- Each caught player adds one alarm, drops the biscuit on the caught square if carrying it, and returns to their entrance. Echoes cannot be caught. At **three alarms**, the current loop ends after that beat.
- A loop also ends after beat eight, or after both players select Rewind at a planning boundary. A rewind consumes an attempt; it cannot reset only one player's position or undo a submitted beat.
- Reset the map, doors, biscuit, guards, alarms, and live positions at the start of the next loop. Retain the completed loops' echo tracks. There can be two earlier tracks per player in the final loop.
- **Win:** after a resolved beat, both live players are at their respective entrances and one carries the Moon Biscuit, with alarms below three. **Lose:** the third loop ends without that condition. Winning is checked after catches, so being caught on the exit beat cannot produce a false escape.
- Report cooperative performance as loops used, total catches, and beats used, in that order. Do not add a competitive Jon-versus-Lydia score.

### Exact beat order

1. Validate both commitments against the same match, loop, and beat. Preserve them through reconnects. Movement/vault legality at commitment uses the same deterministic upcoming-echo positions and live pre-move positions as the resolution access snapshot; a phone must not validate against yesterday's door display.
2. Move each earlier echo to its recorded end position for this beat. An echo from a shorter loop holds its final recorded position for the remaining beats.
3. Compute passable doors and vault access from those echo positions plus the live players' **pre-move** positions. Snapshot that access for this beat.
4. Apply both live actions simultaneously against the access snapshot. A blocked/illegal command is rejected at commitment; a newly changed shared condition uses the documented snapshot, not arrival order. Interactions follow movement only when the selected action itself is an interaction; there is no free move-plus-pickup.
5. Advance guards, resolve catches, recompute visible door states for the next beat, record both live end positions, and check win/loop end.

Two people stepping onto plates this beat open the vault for the following beat. An echo already arriving on a plate can open it for this beat. Preview this distinction with ghost silhouettes and door pulses.

**Shared-object contention:** resolve interactions after both live moves, using the access snapshot. If both try to take the same vault/floor biscuit, a visible pickup-priority token selects the recipient and the other interaction becomes Wait. Seed the token's initial owner and flip it after every resolved beat, preserving it across rewinds; request arrival order never breaks a tie. Only the current carrier may initiate a handoff. The recipient automatically accepts if they are on the carrier's square after movement; otherwise the handoff has no effect and still consumes that beat's action. Resolve catches after pickup/handoff: a caught carrier drops the biscuit once on their caught square, then returns home. Thus a successful handoff followed by the recipient being caught drops the biscuit at the recipient, while the former carrier has nothing to drop. Maintain exactly one biscuit location or carrier throughout.

### What echoes do and do not do

An echo replays **recorded resolved positions**, rather than re-running old commands through the newly changed door state. This avoids divergent replays. It can occupy a pressure plate but cannot collect or hand over the biscuit, collide with another character, trigger alarms, or choose new actions. Its track and future locations are public. The game should call this rule out in the tutorial once; normal play needs only a loop color and next-position marker.

## Strategic decisions

Players choose whether to make immediate progress or create a useful next-loop track. Holding a plate for several beats may cost the current attempt but unlock a reliable escape later. A route that works on one beat may collide with a guard on another. Players can use the public echo and patrol timeline to coordinate a handoff rather than both walking the entire route.

Require authored maps to have at least one shortcut that becomes possible through echoes. Avoid maps solvable just by always moving toward the biscuit. At least one mission should permit two distinct winning plans so the solution is not merely a hidden sequence the designer expects.

## Screens and interaction

**TV:** large grid; live players; translucent, color-and-number-labelled echoes; open/closed doors; current and next guard positions; loop/beat count; alarm icons; two ready indicators. An optional timeline expands on demand to inspect future echoes. Do not show uncommitted phone actions.

**Phone:** movement pad, contextual Interact, Wait, and Commit. Show a small selected-action chip and relevant local tile/door status. Rewind opens a two-person confirmation. Once committed, show the submitted action and partner-ready status with no accidental duplicate submission.

**Tutorial:** a four-beat teaching fixture: move together, stand on a plate, see why a door opens next beat, rewind once, then let the echo hold the plate while the live player passes. The tutorial has its own state and returns cleanly to the collection or room.

**Art/motion/music:** parchment plans and brass clockwork, violet echo trails, cloth-clad mice, a sleepy Lala clockkeeper. Show guard motion and door changes in a readable sequence after commitment, without making animation completion authoritative. Write a short plucked motif with an audible loop return; add a quiet ticking layer only during resolution. Reduced motion uses fades and position highlights.

## State and actions

Own `games/borrowed-minutes/` and `ui/games/borrowed-minutes/`; shared integration belongs to the platform owner. Proposed full state includes `rulesVersion`, `matchId`, `missionId`, `loop`, `beat`, `stage`, public board/guard routes, live positions, biscuit location/carrier, pickup priority, alarm count, completed echo tracks, current recorded track, pending commitments, and result.

Actions are bounded data: `commitBeat({ phaseId, command: { type: 'move', direction } | { type: 'wait' } | { type: 'interact', targetId } })` and `requestRewind({ phaseId })`. Rewind intent is cleared when a new beat commits; one player cannot rewind behind the other's committed action. If both request before either commits, rewind immediately. Mission restart is a host operation after results, not an unrestricted player action.

Public/host views contain resolved state, complete echo tracks, patrol information, and ready flags. A player view additionally contains only their own pending command. Apply the platform's simultaneous-submission gate; arrival order must not decide which plan takes effect. No authoritative full-state prediction should expose the partner's pending plan.

## Scope and acceptance

MVP: one teaching fixture, **two complete authored missions**, three-loop play, one biscuit, plate-controlled doors, deterministic guards, retry/reconnect, results, and a clear echo timeline. Later: additional objects, asymmetric tools, optional harder patrol rules, and a mission editor. No procedural mission generation or live AI game master in v1.

Acceptance criteria:

- Stored solution replays win both authored missions from a clean state; one requires an echo-assisted route and one supports two different solutions.
- Echo playback remains identical despite later live choices, and short tracks have a tested hold-last-position tail.
- Catch, edge-swap, double-catch, simultaneous exit, alarm-limit, and final-beat win ordering are covered by deterministic fixtures. Include both players trying the same pickup, a recipient moving away, successful handoff then recipient catch, and simultaneous catches; the biscuit is never duplicated or lost.
- Opposite network arrival orders produce identical resolved beats. Duplicate commitments cannot consume extra beats; reconnect restores the same phase.
- TV and other phone payloads never include a player's unexposed commitment.
- Two people can explain which plate an echo will hold next and complete the tutorial without permanent instruction panels.

Open balance questions: eight beats may be too tight for some maps; guard catches may punish experimentation excessively; older echoes may visually crowd the final loop. Adjust authored routes and timing before adding more rules. Record playtest observations rather than asserting a balanced difficulty curve.
