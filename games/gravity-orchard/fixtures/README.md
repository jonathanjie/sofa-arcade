# Gravity Orchard public fixtures

`projected/*.json` and `projected/index.mjs` contain only real `engine.project()` output. They are deterministic diagnostic/presentation fixtures for GO2–GO4 and GO7, **not production runtime files**. No fixture moves fruit, changes score, edits private state, exposes future supply, or bypasses collision handling.

Generate or verify them from the repository root:

```sh
node games/gravity-orchard/tests/generate-fixtures.mjs
node games/gravity-orchard/tests/generate-fixtures.mjs --check
node --test games/gravity-orchard/tests/geometry-public.test.mjs
```

The generator runs the real constructor, readiness, fixed steps, pause, checkpoint round trip and retry commands. It checks host, Jon, Lydia and public projections are identical, and validates each snapshot through `public.mjs`. Its neutral-and-Brake transcript intentionally reaches timeout results; successful routes are proved separately by the normalized-input campaign pilot, not fabricated in a fixture.

| Fixture | Authoritative state demonstrated |
| --- | --- |
| `waiting` | Fresh campaign, empty baskets, both players not ready |
| `countdown` | Both players ready; 180-tick countdown has started |
| `playing-both-trays` | First complete seeded bag spawned, with two fruit on each tray |
| `paused` | Authenticated Jon requested Help; controls/readiness cleared |
| `restored-paused` | Checkpoint restored paused with a new epoch and recovery reason |
| `interlude` | First stage timed out and produced a result |
| `gate-forecast` | Switchback Grove's first scheduled closure forecast |
| `gate-closed` | Gate closed after the clear collision region check |
| `gust-forecast` | Lala announces the first seeded-direction gust |
| `gust-active` | The same gust has become active |
| `finished` | Full three-stage timeout journey and final summary |
| `retry-waiting` | Host retried the most recently completed stage |
| `practice` | Untimed practice with ordinary physics and no gust |

Browser fixture consumers may import `PROJECTED_FIXTURES`, `FIXTURE_NAMES` and `getProjectedFixture(name, viewer = 'public')` from `projected/index.mjs`. Stored fixtures are deeply frozen; the accessor returns a detached mutable copy. The optional viewer accepts `public`, `host`, `tv`, `jon` or `lydia`; this cooperative game's public view is identical for all roles. Presence, sensor permission, calibration and connection metadata are owned by other components and are intentionally absent.

The production browser closure is exactly `catalog.mjs`, `geometry.mjs` and `public.mjs`. It has no authority, checkpoint, filesystem or fixture import. See the [delivery inventory](../../../docs/LOCAL_RELEASE.md#delivery-inventory-and-publicprivate-boundary) for the integrated runtime.
