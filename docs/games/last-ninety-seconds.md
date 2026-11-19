# The Last Ninety Seconds — provisional PRD and design

**Status:** design draft; not implemented. **Catalog ID:** `last-ninety-seconds`. **Mode:** cooperative mystery. **Target:** 15–25 minutes. **Branch:** `feature/last-ninety-seconds`.

Read [parallel development](../PARALLEL_DEVELOPMENT.md). Private clues, jointly confirmed answers, and server-only solutions are prerequisites, not existing platform features.

## Experience and core idea

Something small but mysterious happened in the ninety seconds before the lights went out. Jon saw one side of the room; Lydia heard and noticed different details. Compare what is on your phones, reconstruct the timeline on the TV, and explain where the missing object went.

**Ninety seconds is the fictional interval, not a ninety-second real-time deadline.** Players should have time to talk, reason, and enjoy the scene. The mood is a cozy puzzle—missing tea, a misplaced bell, an unexpected parcel—not violent crime or real accusations involving the family.

The key pleasure is realizing that a clue which seems unhelpful on one phone becomes decisive when combined with the other person's observation. Avoid making one phone the complete solution with the other relegated to pressing Confirm.

## MVP case structure

Each case defines:

- A public illustrated room map with four named locations.
- Three fictional suspects/visitors and one missing object.
- **Six named event cards** and **nine timeline slots**, each covering ten seconds of the fictional interval. Exactly one event may occupy a slot; three slots remain empty.
- An answer consisting of the six event-to-slot assignments, the responsible suspect, and the object's final location.
- Three starting clue cards for Jon and three different starting clue cards for Lydia. The **combined starting clues must uniquely determine the whole answer**.
- Two optional investigative clue cards per player, tied to visible inspectable locations/objects. These clarify the puzzle without changing its solution; no paid or hidden prerequisite clue is needed to win.

Clues are authored from bounded constraints such as event-before-event, exactly-one-slot-apart, event-in-time-range, person-at-location, and object-transfer. Natural-language clue text must correspond to the machine-checkable constraint. The story, characters, and answer are fictional case data, not generated from personal information.

## Core loop and actions

1. The TV introduces the scene and displays the six event cards beside an empty timeline. Each phone privately receives its three starting clues.
2. Players discuss freely. Either can place, move, or remove an event on the shared timeline and choose a tentative suspect/location. A move into an occupied slot is rejected with a clear message rather than silently swapping two cards.
3. Each player may **Inspect twice** during the case. Select an eligible scene object on the phone to receive that player's corresponding extra clue. Inspecting a previously opened object does not spend another token. The TV shows only that the player inspected, not the private clue text.
4. A player can deliberately **Share** one of their clue cards to a public clue pinboard. Sharing is optional, explicit, and irreversible for that case; it is a convenience for conversation, not required for engine correctness.
5. Once all six events, a suspect, and a location are chosen, both players confirm the **same answer revision**. Changing any part of the candidate clears both confirmations. Only the second valid confirmation triggers evaluation.
6. A correct answer wins and unlocks the narrated replay. An incorrect answer consumes one of **three attempts** and gives a gentle general message that the reconstruction conflicts with the evidence. It does not identify every wrong cell or expose the solution through a detailed validation error.
7. After three incorrect submissions, offer the full explanation and a replay of the case as a loss. Players may also jointly choose Reveal solution. There is no hard real-time failure condition.

The result celebrates a correct first submission with no extra inspections, but taking a hint still produces a complete win. Report attempts and optional inspections descriptively; do not score one spouse against the other.

### Collaboration constraints

At least two starting clues in each case must require combining information across phones. Neither seat's starting clues alone may determine the entire answer. Role assignment is randomized for a fresh case, so Jon is not permanently “the visual clues person.” Swapping clue sets is a replay option, not a mid-case action that exposes a hidden view accidentally.

Host management cannot reveal every private card. A phone may read its own clues aloud, or explicitly share a card. Do not transmit the other seat's cards to the browser and trust the interface to hide them.

## Screens and interaction

**TV:** the scene/map, the nine-slot timeline, event-card tray, a compact suspect/location selection, attempt count, and each player's confirmation status. Shared clues appear only in a collapsible pinboard. The whole page should feel like a small illustrated case table, not a text-heavy case report.

**Phone:** the player's three clue cards in a readable carousel/list, an Inspect control with remaining uses, and a compact timeline editor. Selecting an event opens available slots; the phone does not require precision dragging. A final Review answer panel summarizes the current reconstruction before confirming it. Clue reading should not be interrupted by the other player's edits.

**Tutorial:** a separate two-event, three-slot vignette with one clue per role. Demonstrate combining clues, placing events, and confirming the same answer. Tutorial simulation must be clearly labelled if only one person is practicing.

**Art/motion/music:** warm twilight, little room dioramas, magnifying-glass focus, hand-lettered clue cards, and memory silhouettes. Jon and Lydia are witnesses; Lala is sometimes a comic red herring. A restrained composed piano/woodwind motif can leave silence during discussion. The solution replays the ninety-second scene at a comfortable accelerated pace, with pause/step controls and captions; no unskippable ninety-second video is required.

## Technical design

Own `games/last-ninety-seconds/` and `ui/games/last-ninety-seconds/`. Keep case solutions and private clue assignments in server-only modules/fixtures; the production/LAN browser allowlists must never serve that subtree. The public repository means a determined reader can inspect authored answers; normal browser play must still preserve the designed information split.

Full state includes `rulesVersion`, `matchId`, `caseId`, private clue assignment and answer, public case metadata, candidate timeline/suspect/location, candidate revision, inspection usage/unlocked clues, shared clue IDs, confirmations keyed to candidate revision, attempts, and result.

Action families:

- `placeEvent({ eventId, slot })`, `removeEvent({ eventId })`, `chooseSuspect({ suspectId })`, and `chooseLocation({ locationId })`.
- `inspect({ objectId })` and `shareClue({ clueId })`, validated against that player's ownership and remaining uses.
- `confirmAnswer({ candidateRevision })` and `requestReveal({ candidateRevision })`; require both players for solution reveal during play.

Shared timeline edits use authoritative revision checks. A stale edit must not overwrite a newer placement unseen by its author. Phone-local previews may highlight a pending destination; do not run a hidden solution checker in the browser. Confirmation races use the exact candidate revision, never a general “ready” boolean that survives a later edit.

Public/TV projection includes public scene, candidate answer, deliberate shared clues, attempt count, and ready states. A player view adds only their own original/unlocked cards and inspection history. The correct answer and other private clues become public only after finish or jointly authorized reveal. Error messages must not reveal whether one guessed event position was individually correct.

## Content and acceptance

MVP: one tutorial and **two complete original cases**, each with a clear human explanation and a machine-checkable unique solution. Suggested working titles: **The Missing Brass Bell** and **The Parcel by the Window**. Their actual plots/clues remain to be authored; these titles are not finished content.

Later: more cases, different scene layouts, a cooperative case-authoring tool, optional difficulty settings, and accessibility narration. Defer a real-time countdown, procedural mystery generation, unbounded free-text answer judging, and runtime AI narration.

Acceptance criteria:

- A case verifier finds exactly one complete answer from the union of starting clues. Check uniqueness across event placements, suspect, and final location, not just the timeline.
- Each seat alone leaves multiple complete candidates; both have materially useful evidence. Optional clues are consistent with the same unique answer.
- Every clue's displayed text and constraint fixture agree. Event IDs, duplicate slots, impossible times, and unknown objects are rejected without solution leakage.
- Two confirmations of different candidate revisions cannot submit an answer; editing clears readiness and retries cannot consume multiple attempts.
- Inspect/share rules preserve ownership and token counts across reconnects and retries. Host/public/other-seat serialized payload tests prove private cards and answers are absent.
- Two people can solve a case using conversation and the phone/TV controls, then understand every inference from the explanation. Test with people who did not author the case before claiming its difficulty or length.

Main risks: a puzzle with several unintended answers, clue wording that invites an unsupported assumption, one dominant solver, and too much reading on the TV. Validate content before polishing the reveal animation. “Unique solution” is a development gate, not a claim that these unwritten cases are already verified.
