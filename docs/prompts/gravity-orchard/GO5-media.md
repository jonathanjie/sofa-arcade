# GO5 — Gravity Orchard original art, animation assets and score

You are implementing GO5, the actual reusable graphics, motion assets and composed music for **Gravity Orchard v0.2** in Sofa Arcade. Produce and inspect finished assets, compose and validate the score/effects, demonstrate them in a rendered gallery, and open a GitHub PR. A concept board or a set of prompts is not the deliverable.

**Repository:** https://github.com/jonathanjie/sofa-arcade

## Context and baseline

Jon and Lydia play one local Tauri Mac/TV collection with two ordinary browser phones. Sofa Kingdoms and Odd Laws Society already have an established warm illustrated identity. Jon wants lively characters, legible board information, spacious interfaces and music that sounds composed rather than random piano notes.

Gravity Orchard v0.2 is a real-time cooperative harvest: each player tilts a floating garden tray, passes fruit across a bridge, holds Brake to steady it and fills shared picnic recipes for Lala. Three short stages introduce broad routes, a hedge/gate grove and Lala's forecast moonlight gusts. The TV has to remain readable at 720p. Four fruit/basket types are apple, plum, pear and starfruit; shape and pattern matter as much as colour.

Read `AGENTS.md`, `README.md`, `docs/GITHUB_WORKFLOW.md`, `docs/GRAVITY_ORCHARD_CONTRACT.md`, `docs/DISPATCH_GRAVITY_ORCHARD.md`, `docs/games/gravity-orchard.md`, the current art manifests and the existing shared audio scheduler/score modules. Inspect delivered Jon/Lydia/Lala artwork before producing new identities. The archived turn-based Gravity Orchard draft is not the current game.

Fetch GitHub, inspect active branches/PRs and work in an isolated clone/worktree on `feature/gravity-orchard-media`. Record the exact base SHA. Use current `main` containing the packet, or explicitly identify the reviewed packet commit from Git history if needed. Preserve concurrent work; do not overwrite or force-push another session's branch.

## Exclusive write ownership

- `public/assets/gravity-orchard/**`
- `ui/media/gravity-orchard/**`
- `.github/workflows/go5-media.yml`
- `docs/workstreams/gravity-orchard-go5.md`

Authoring inputs and gallery/test tooling must stay in owned subtrees. Clearly separate final runtime assets from source/review material and declare an exact runtime inventory so GO7 can exclude authoring files from public delivery. Nested dependencies/locks are allowed only inside ownership.

Do not edit global artwork, the existing games' media, shared audio engine, menu composition, shared shell, root locks, game geometry, phone/TV components, native manifest or generated browser module copies. GO7 owns collection wiring, runtime delivery and any global audio integration.

Use up to three subagents if available, each with exclusive files: visual assets, authored score/effects and independent gallery/validation are suitable lanes. Maintain one coherent art direction and reconcile the outputs yourself.

## Produce finished visual assets

1. Deliver a wide **Gravity Orchard cover** that reads as a thumbnail: two linked floating gardens, Jon and Lydia cooperating, rolling fruit and Lala's picnic. Follow the current warm illustrated character identity. Keep the game title as a separate UI layer; do not bake instructions or illegible generated text into the art.
2. Deliver four instantly distinguishable fruit designs and matching basket states: accepting, rejecting/full and ordinary. Each type needs a clear silhouette and a non-colour emblem/pattern. Check recognition on the actual 720p board scale, not only a large source image.
3. Supply three coherent stage treatments: Morning Delivery, Switchback Grove and Lala's Moonlight Picnic. Decorative trays, foliage, hedges, bridge, gate, compost and bumpers must respect public geometry and leave collision boundaries readable. Artwork never determines authority geometry.
4. Provide real reusable character states for Jon/Lydia idle, lean, brace and cheer; Lala idle, forecast, gust and pleased. Add restrained fruit impact/capture/compost and basket-feedback assets where useful. State clearly which motion uses sprite changes and which uses transforms; a single unchanging portrait does not satisfy dynamic behavior.
5. Keep transparent cutouts, consistent pivots/baselines, safe padding, useful dimensions and deliberate file sizes. Provide scalable code-native symbols where that gives clearer results than raster art. Use image generation for requested bitmap assets when available, then inspect and refine the actual outputs. Do not mark placeholders, broken crops or unreviewed generations as final.
6. Create `public/assets/gravity-orchard/manifest.json`, its `ui/media/gravity-orchard/manifest.mjs` adapter and `runtime-files.json` with the exact schema from the contract. Use `schemaVersion: 1`, `gameId`, `assets`, `characterStates` and `runtimeFiles`; asset entries have explicit root-relative `src`, dimensions, `kind: 'image'|'atlas'` and applicable frame rectangles/durations. Add useful alternatives and provenance without replacing the canonical fields. Keep paths local and browser-safe. Declare source/review files separately so they cannot be accidentally shipped.

A gallery should show the cover at collection-card size; every fruit and basket against both bright and dark backgrounds; stage materials at their real scale; all character states; normal and reduced-motion examples; and missing-asset fallbacks. Actual images must be decoded and visually inspected. Include evidence screenshots and fix seams, clipping, inconsistent scale, muddy symbols or confusing boundaries.

## Compose the soundtrack and effects

Create `score.mjs` exporting `SCORE` and `eventsForBar`, and `events.mjs` exporting `eventsForEffect`, compatible with the contract and the existing shared scheduler. Inspect the current `SCORE`/`eventsForBar` pattern, finite beat-based event fields and supported instrument names. Supply pure data/event functions; do not introduce a second AudioContext, autonomous audio clock, external stream or random-note generator.

Compose an original returning motif, an answering phrase, harmonic movement, intentional rests, a contrasting section and a deliberate loop transition. A light plucked/marimba/woodwind palette and a clear 32-bar AABA or comparably structured form are appropriate starting choices. Document key, meter, tempo and form. The first few seconds should establish an identifiable tune without crowding conversation.

Provide the exact scenes `menu`, `practice`, `stage1`, `stage2`, `stage3`, `paused` and `celebrate`, with appropriate sparse and full arrangements. Unknown scenes fall back safely and unknown effects return `[]`. Arrange changes at musical boundaries rather than restarting every time a fruit is caught. Respect host-only defaults, independent music/effects settings and gesture unlocking. The phone controllers must remain quiet by default.

Author restrained cues for valid catch, basket rejection/full, completed recipe, compost, gate warning, Lala forecast/gust, countdown, stage result and final celebration. Stable event IDs will be supplied by gameplay; document how GO7 deduplicates cues. Do not attach a long jingle to every high-frequency physics collision.

Render score/cue samples offline, check finite events, note/beat bounds, voice overlap, peak/clipping behavior and clean loop/scene transitions. Audition the result if an actual audio playback/listening capability is available; distinguish numerical/audio-render verification from a real listening session if it is not. Never claim speaker audition or musical quality validation you did not perform.

## Verification, CI and sustained completion

Validate every final manifest path, case, size/dimension, transparency/pivot where relevant, image decode and catalog/state coverage. Verify all URLs are local and the browser gallery makes no unexpected external requests. Exercise both final assets and graceful code-native fallbacks in the owned gallery.

Test deterministic score/events, all arrangements, unknown-mode behavior, finite bounds and scheduler compatibility. Test reduced-motion examples and readable fruit/basket categories at the intended render scale. Do not satisfy tests by replacing missing final media with a fabricated manifest success flag.

Your owned CI must execute the new manifest, music/effect and rendered-gallery checks, using locked nested tooling and retained evidence. A legacy root test pass is not sufficient. Run relevant baseline/build checks required by `AGENTS.md`; shared generated outputs stay uncommitted.

Continue through actual asset production, composition, rendered inspection, tests and repairs. Do not stop after generating inspiration, writing specifications or delivering only one character state. Work against the contract/fixtures while other streams are unfinished; report requests rather than editing their components.

## GitHub handoff

Write `docs/workstreams/gravity-orchard-go5.md` with base SHA, art/music decisions, exact exports/manifest keys, source-versus-runtime inventories, provenance/license notes, measured file sizes, tests/evidence, integration guidance and remaining limitations. Mark a component ready only when its delivered assets and score are actually usable.

Commit only owned files, push and open a GitHub PR to `main` titled **GO5: Gravity Orchard art and composed soundtrack**. Include the exact tested commit, representative gallery screenshots, score/cue verification and GO7 wiring needs. Do not self-merge, change the main-menu soundtrack, enable the game or deploy Sites/Pages. Return the PR URL, tested commit, deliverables, checks and honest limitations.
