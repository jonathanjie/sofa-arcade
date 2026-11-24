# Sofa Arcade

Play on one Mac with a shared TV board and two phone browsers. Jon and Lydia compete for crumbs in Sofa Kingdoms, build cities in The Odd Laws Society, or steer fruit together in Gravity Orchard.

## The collection

| Game | Status | Idea |
| --- | --- | --- |
| Sofa Kingdoms | Playable | A crumb-collecting rivalry on a board rearranged by Lala |
| Borrowed Minutes | Planned | A cooperative time-loop heist with echoes of earlier attempts |
| Gravity Orchard | Playable on the local Mac host | Tilt your garden and pass fruit across the bridge to fill picnic orders together |
| Afterglow Market | Planned | Build and trade at an unpredictable night market |
| The Odd Laws Society | Playable on the local host | Build a nine-plot borough through six sealed councils, finite markets and changing laws |
| The Last Ninety Seconds | Planned | Reconstruct a mystery from clues split across two phones |
| Footprints at Midnight | Planned | Hidden movement through a moonlit garden |

Games marked **Planned** have a design brief but cannot start a room.

## Play

1. Open the Mac app or open **Sofa Kingdoms** on the hosted Site. For portable play, select **Play over local Wi-Fi**, then **Download portable ZIP** and [start the LAN host](docs/LAN.md). Connect the Mac and both phones to the same local network.
2. Select an available game and host a room. For Gravity Orchard with tilt, configure [trusted phone access](desktop/README.md#optional-trusted-local-access) in the Mac app and switch the lobby link to **Phone link with tilt** before scanning.
3. Scan the room QR code on each phone, or enter its six-character code at the same local address. Choose Jon on one phone and Lydia on the other.
4. Start the game from the TV. In Gravity Orchard, select **Enter the orchard** on the TV. On each phone, select **Use touch controls** or finish tilt setup, then select **I'm ready**.

The **desktop v0.2.0 tag** predates Gravity Orchard. For that game, use the portable host from this checkout or a Mac build from a commit that enables it. The hosted Site has no realtime coordinator. See the [release guide](docs/LOCAL_RELEASE.md) for Mac artifact selection and device checks.

Sofa Kingdoms **Same-screen practice** lets one person play both characters in one browser. Each playable game has a replayable tutorial. Sofa Kingdoms saves tutorial completion and Odd Laws Society saves tutorial progress in the current browser.

## Sound and motion

The collection menu welcomes you with **Make Yourself at Home**, an original 32-bar G-major waltz at 92 BPM. A recurring woodwind invitation returns around a contrasting E-minor middle section, with gentle plucked accompaniment and written breaths. Selecting a game and returning to the shelf have brief matching sound cues. The pure score and cue data are in `ui/media/sofa-menu/`.

Sofa Kingdoms has **Lala’s Little Waltz**, an original 32-bar composition in G major and 3/4 time at 104 BPM. A rounded woodwind melody repeats in an AABA form over a gentle bass-and-pizzicato accompaniment, with a contrasting middle section, held phrase endings, and written breaths. Its game detail screen retains the melody with a quieter accompaniment. The score is in `ui/score.mjs`; Web Audio synthesizes it locally without external audio services.

Odd Laws adds **Lala Calls the House**, a 32-bar F-major AABA score in 4/4 at 100 BPM, with arrangements for the council, three terms and results. All three games share one audio engine and saved controls. Switching games stops the previous score.

Music and effects have separate toggles and a saved volume setting. A direct click, tap, or Enter/Space interaction unlocks menu audio. Music follows the collection, TV/host, or practice screen through one audio engine; phone controllers start quiet, with their own optional effects toggle. Leaving a controller or Join screen keeps that session's menu quiet until explicitly hosting or starting practice. Background tabs pause their soundtrack.

Characters use the illustrated atlas with layered movement and action effects: idle motion, mouse hops, crumb pickups, banking celebrations, and Lala's swipe, pounce, and nap. The animation system respects the device's reduced-motion preference. This is procedural animation of illustrated characters rather than a full frame-by-frame character atlas.

## Rules

### The Odd Laws Society

Build a nine-plot borough across six council sessions. Both players secretly choose a proposed law and an influence bid on their own phones; the TV shows readiness until both have sealed. Take Build, Work, Festival or Lobby actions against a finite shared market and the active laws. Final prestige combines buildings, streets, festivals, civic laws and treasury; equal totals share victory. The optional ten-lesson tutorial and in-game Help explain the details. See [the complete rules](docs/games/odd-laws-society.md). The catalog's 35–45 minute duration is a design target awaiting human playtime validation.

### Sofa Kingdoms

Collect crumbs and bank them at your burrow over ten rounds. Watch Lala’s next move before you spend a toy or risk carrying a full bag. See the [rules, forecasts and match versions](docs/games/sofa-kingdoms.md).

### Gravity Orchard

Each phone steers one tray. Pass fruit across the bridge and fill shared picnic orders before the stage timer runs out. See the [stage and scoring rules](docs/games/gravity-orchard.md).

## Development

Start with the [project instructions](AGENTS.md), [source checkpoints and open checks](docs/HANDOFF.md), and [game design index](docs/games/README.md). Use the [release guide](docs/LOCAL_RELEASE.md) for checks and packaging, and the [GitHub and Sites workflow](docs/GITHUB_WORKFLOW.md) for publication.

Run `npm run dev` for framework development. For a local Worker/D1 multiplayer preview, apply the checked-in migration under `drizzle/`. Use `npm run db:generate` when the schema changes. The portable host applies its local SQLite migrations at startup.

## Multiplayer

Rooms last 24 hours. The TV and each phone keep their own credentials. The hosted turn-based games poll the Worker/D1 API. On the LAN, turn-based games use HTTP actions and authenticated SSE. Odd Laws projects each seat’s private council choices. Gravity Orchard sends continuous controls and snapshots over a local WebSocket.

The catalog and registry identify playable games. Gravity Orchard also needs the local coordinator and LAN transport capability. The host still emits the legacy `sofa-gravity-orchard=candidate` HTML value on ordinary enabled builds. The client accepts either `candidate` or `enabled`. See the [network design](docs/NETWORKING.md) and [private-game integration checklist](docs/PARALLEL_DEVELOPMENT.md).

## Art and credits

Original generated artwork was created for this game using the user-provided Jon, Lydia, and Lala character references. Character atlas order: Jon, Lydia, Lala.

QR codes use `qrcode-generator` by Kazuhiko Arase under the MIT license. The complete dependency license notice is included at `public/assets/qrcode-LICENSE.txt`.
