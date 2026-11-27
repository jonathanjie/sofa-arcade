# Party arcade ideas, round 2

Sources found on X and GitHub on 26 November 2026. Every idea below is sized like Whiteout Drift: one board, rounds of about 75 seconds to 2 minutes, two to four modes, phone as controller plus a small personal status line. Bigger ideas (private second screens, camp phases, long sessions) are parked at the end.

## Sources and what we may reuse

| Source | What it is | License | What we may reuse |
| --- | --- | --- | --- |
| [nilbuild/goofyfish](https://github.com/nilbuild/goofyfish) ([play](https://goofyfish.com)) | 20 tiny one-input browser games with a stick-figure house style. "One input, a few seconds to learn, under 3 minutes, fun for a 6-year-old and a 40-year-old." | MIT, © Kamran Ahmed | Game rules, the stick-figure drawing and animation code, the house style. Keep the MIT notice in `docs/third-party/`. Use our own game names. |
| [kevintngo/cinderwatch](https://github.com/kevintngo/cinderwatch) ([play](https://kevintngo.github.io/cinderwatch/)) | Isometric firelit tower defence in one HTML file, three.js, miniature look (dither, tilt-shift, vignette). | MIT | Renderer, procedural models, post effects, monster behaviours. Needs three.js (MIT, vendored in that repo). |
| [kevintngo/procedural-rpg](https://github.com/kevintngo/procedural-rpg) "Brushwild" ([play](https://kevintngo.github.io/procedural-rpg/)) | Action RPG drawn in ballpoint and coloured pencil; attacks drawn on the ground before they land. | MIT | Pencil shaders and creature telegraphs. TypeScript, three.js and shaders. |
| [kevintngo/lumenwake](https://github.com/kevintngo/lumenwake) | Cel-shaded sky-island action RPG in raw WebGL2. | "other": check before any reuse | Ideas only until the license is clear. |
| [winchxyz/wumpus-torture-simulator](https://github.com/winchxyz/wumpus-torture-simulator) | Cartoon ragdoll sandbox, three.js plus Rapier, no build step. | MIT | Ragdoll and sandbox code. Not the Wumpus character, which belongs to Discord. Use our own character. |
| Flight simulator in 32 KB (post by @zer0point_eth) | A one-prompt flight sim. | No repository | Idea only. |
| Sprite stacking (post by @asynkimo, quoted by @ashmrz10) | Turn pixel art to any angle by stacking slices. | Technique | Already in our kit (`ui/party/kit/stack.mjs`). |

Not usable: Saltline (the linked repository does not exist), the "N GitHub repos for a game studio" lists (engines and tools, not games), winchxyz/x-games (no license).

**Art decision for the owner:** reusing Cinderwatch, Brushwild or the ragdoll sandbox as they look means adding three.js (and Rapier for ragdolls) to the TV for those games. The current plan says "Canvas 2D, no new library". Goofyfish games need no new library.

## Concepts

### A. From Goofyfish (one input, cheapest to build, recommended first batch)

1. **Head Hop** (from *Stomping*). The floor is spikes. All 16 stick figures bounce from head to head, on goons and on each other. Tap to hop where your figure faces, hold for a higher hop. A bramble wall scrolls in. Modes: *Last One Up* (survival), *Stomp Chain* (most chained stomps), *King of the Heads* (score while standing on someone).
2. **Balloon Bop** (from *Bopping*). Keep the room's balloons in the air. Tap where to hop; every bop scores for each balloon still up, so the team wants more balloons. Gusts and a dart-throwing goon. Modes: *Keep It Up* (co-op), *Balloon Volley* (two teams, a net in the middle: a balloon that lands on your side costs a point).
3. **Timber Rush** (from *Chopping*). Sixteen trees side by side on the TV, one per player. Tap left or right to chop and move; duck the branches. Modes: *Fell Race* (first to fell 3 trees), *Sabotage* (each 10-chop combo drops a branch into a rival's tree).
4. **Wobble Tower** (from *Stacks* and *Planks*). Two teams build towers. Players take turns (the phone says "Your drop!"); tap to drop the swinging block; overhang is sliced off. Modes: *Tallest Tower* (timed), *Don't Topple* (co-op height record).
5. **Swish** (from *Hoops*). Everyone shoots at the same moving hoop at once: drag back and release on the phone. Clean swish is 3, rim is 2. Balls collide in the air. Modes: *Ten Shots*, *Horse* (copy the leader's shot spot).
6. **Echo Run** (from *Selves*). A co-op platform room where each attempt replays as ghosts. With 16 players the room fills with helpers: stand on ghosts, hold doors, weigh switches. Modes: *Ghost Relay* (each round adds everyone's last run), *Speed Echo*.
7. **Goon Skirmish** (from *Skirmish*). Two teams. During the 20 s setup each phone places its own few units on its side of the field and drags one fence; then the TV plays the brawl. Three rounds with a pick-one upgrade between them. Uses the phone screen as a private deployment board, but stays simple.

### B. From the earlier leads (simplified)

8. **Beacon Keep** (from Cinderwatch). Builders defend a beacon: stick to move, one Build/Upgrade button, 3 tower kinds, shared gold that drops on the road. Six waves in about 2 minutes. Modes: *Hold the Light* (co-op), *Two Beacons* (teams send defeated monsters across).
9. **Inkwild** (from Brushwild). Pencil arena brawl: stick, Attack, Dash. Creatures draw their attack on the ground before it lands; a teammate revives you by standing next to you. Modes: *Survive the Sketchbook* (co-op), *Ink Duel* (teams).
10. **Paper Skies** (from the flight-sim post, original). Sprite-stacked paper planes from above. Tilt to bank, Boost, Fire. Modes: *Ring Rally*, *Balloon Pop*, *Sky Tag*.
11. **Ragdoll Rumble** (from the ragdoll sandbox). Our own floppy mascot. Each round every player picks one contraption on the phone (fan, spring, cannon, banana peel) and where to place it; the TV fires the ragdoll through all 16 contraptions; points for the bounces your contraption causes. Modes: *Chain Reaction* (co-op total), *Most Chaos* (individual).

## Suggested order

1. **Goofyfish batch:** Head Hop, Balloon Bop, Timber Rush, Wobble Tower. One input, shared stick-figure art reused under MIT, no new library. Four Sol or Astra lanes in parallel.
2. **Paper Skies.** Uses our own sprite-stack kit.
3. **Beacon Keep and Inkwild,** after the owner decides on three.js for the TV.
4. **Swish, Echo Run, Goon Skirmish, Ragdoll Rumble** as a later batch.

## Parked for later: the phone as a private second screen

Longer sessions of 20–40 minutes in stages; a camp phase between stages (draft, trade, vote); private phone panels (hands of cards, inventory, scout views, drawing); save and resume. See the conversation notes of 26 November 2026; the main candidates are Beacon Keep (role-based private information), Inkwild (Ink Keeper drawing on the phone) and Paper Skies (Grand Tour with a hangar phase).
