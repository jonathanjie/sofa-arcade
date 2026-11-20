# Odd Laws Society — guild legibility and city inspection

## Scope

This feedback update starts from `a96fd477d2a3239d715421ed711682648e16eccc` and changes only the authored Odd Laws UI and its nested tests. The combined feedback PR owns generated runtime copies, the component manifest, cover artwork, and shared shell integration separately.

## Player-facing changes

- District guilds now have a large symbol beside the full guild name. Market icons are at least 24 px, with larger scaling on a 1080p TV. City plots also retain a visible guild symbol.
- Civic districts use teal, Craft terracotta, Commerce ochre, and Culture plum. Tinted card surfaces and stronger borders repeat the same identity across the phone market, TV market, almanac, placement grid, and built cities. Text and distinct symbols accompany colour throughout. These guild colours do not classify Economy/Civic law categories.
- A compact **My city** button remains in the player toolbar during council, sealed/waiting states, the market, placement, and results. It works while disconnected because inspection uses the last accepted snapshot.
- Other drawers include a **My city** shortcut. The read-only city drawer shows the authenticated player's nine plots, guild totals, current law effects, and the selected or acknowledged policy. Civic policies use the existing public rules adapter for a projection against the current city. Results do not promise another session-end award.
- Tapping a built district opens its existing inspection. Back returns to the previous city, agenda, or detail drawer with scroll/focus restored. Close returns to the initiating control. Inspection never sends a command, changes a draft, unlocks a sealed vote, or changes city contents.
- Live snapshots refresh an open city. A new match clears the drawer history and local drafts so a previous match cannot remain in an inspection back stack.

## Implementation boundaries

No game rules, network transport, protocol, server authority, music, preferences, or shared shell were changed. The UI continues to use only its authenticated projected snapshot and injected public rules. No new runtime module or external dependency was introduced. No generated `public/` files are part of this workstream.

Focus-trap endpoints exclude `tabindex="-1"` empty city plots so keyboard navigation cycles through actionable controls. Focus restoration now searches the active dialog first. This matters because both the inert player toolbar and a detail drawer contain a My city action; selecting the first global match would attempt to focus the inert background.

## Verification

### Completed in the local workspace

From `ui/games/odd-laws-society`:

```sh
npm ci --ignore-scripts
npm test
npx playwright test --list
node --check index.mjs
node --check drawers.mjs
node --check tests/city-inspection.spec.mjs
```

- **37 Node tests pass**, including four additional city-inspection tests for authenticated ownership, draft/public-state purity, acknowledged sealed choices, safe missing-commitment handling, current/hypothetical Civic effects, and host/public privacy.
- Playwright collects **72 browser cases**, including 11 new cases. These exercise council and build draft preservation, Back/Close focus, both sealed player views, waiting/offline inspection, live snapshot changes, stale-snapshot rejection, new-match reset, visible guild labels/colours/icon sizes, 48 px inspection controls, and phone/TV bounds.
- Added viewport coverage is 360×800 and 390×844 for phones and 1280×720 and 1920×1080 for TV. Existing six-session/table/tutorial regression cases remain enabled.
- `git diff --check` passes.

### Browser execution blocked locally — CI still required

The local Chromium executable aborts before a page opens:

```text
process_singleton_posix.cc:297
socket() failed: Operation not permitted (1)
```

The runner's escalation request was rejected by the environment's granular approval policy (`sandbox_approval: false`). A permitted Cloud desktop attempt could not reach the workspace's local harness (`net::ERR_CONNECTION_REFUSED`). No security setting or launch workaround was used.

**Do not describe the browser suite or visual review as locally passed.** The root integration session must run the suite in GitHub Actions, inspect its actual screenshots, and resolve any remaining layout or interaction failures before merge. The new tests save `city-council-360.png`, `city-council-390.png`, and `guilds-{360,390,1280,1920}.png` into their normal Playwright result directories; existing layout tests capture the rest of the scenes. There are no new verified local screenshots in this commit.

## Root integration checklist

1. Cherry-pick this workstream's commit into the combined feedback branch.
2. Regenerate the standard authored-to-public copies and refresh the relevant component manifest hashes through the repository's normal process. Existing module paths and runtime allowlists are unchanged.
3. Run the root production build and the nested Node/Playwright suites in GitHub Actions.
4. Inspect phone city/market screenshots and both TV resolutions, especially card fit at 720p and the new toolbar at 360 px.
5. Record the actual CI run, screenshot review, and any final fixes in the combined PR.

## CI regression follow-up

The first combined PR CI run at `0f32be6` executed the browser suites. The nested UI suite passed 69 of 72 cases; the remaining three assertions identified TV action/reveal layouts about 13 px below the 720p viewport. The real-room journey also found that the narrow phone toolbar could shrink its 7 px connection dot to zero width during sealed-vote recovery. The downloaded screenshots were inspected for these two findings.

The targeted follow-up keeps all guild symbols, illustrations, font sizes, and card targets intact. At short TV heights it reduces market-card vertical padding and price-row spacing, recovering about 20 px across the two market rows. The phone toolbar reserves an explicit 7 px connection column and uses equal-width, 48 px-minimum navigation targets with their symbols above their labels. This also keeps “My city” on one line. The existing waiting/offline browser case now asserts that the connection indicator stays visible before, during, and after reconnection and that toolbar controls remain inside the viewport.

The same full browser assertions remain enabled, including the 720p bounds checks. A subsequent CI run must verify the corrected layout and real-room recovery; the local browser restriction remains unchanged.
