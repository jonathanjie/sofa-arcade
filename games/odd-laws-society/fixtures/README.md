# Odd Laws Society canonical projected fixtures

These are synthetic examples of the v1 projected state contract, generated from
legal v0.2 engine traces. Every scenario contains `tv`, `jon`, and `lydia` views.
The TV view uses the host role, which has the same game information as the public
role. Each phone view includes only that seat's own locked commitment.

Use one selected role snapshot in a frontend harness. A real room server must
project the live state for the authenticated viewer and must never send this
multi-role fixture container as its response.

## Browser-safe interface

```js
import {
  PROJECTED_FIXTURES,
  FIXTURE_NAMES,
  getProjectedFixture,
} from './projected/index.mjs';

const tvView = getProjectedFixture('council-jon-locked', 'tv');
const jonView = getProjectedFixture('council-jon-locked', 'jon');
```

`PROJECTED_FIXTURES` and `FIXTURE_NAMES` are deeply frozen data. The accessor
returns a fresh copy so a fixture harness can advance its own demonstration.
Each scenario is also available as a JSON file with the same `{tv,jon,lydia}`
shape. These examples are optional development assets, not live match data.

| Scenario | Coverage |
| --- | --- |
| `council-unsubmitted` | Both readiness indicators false; both phone commitments null |
| `council-jon-locked` | Jon sees his own lock; TV/Lydia see readiness and unchanged influence |
| `council-lydia-locked` | The opposite arrival order and own-lock role |
| `council-revealed` | Both choices visible together in `lastCouncil`; both bids paid |
| `ordinary-turn` | First Corner Shop purchased; Jon's city action is current |
| `late-full-city` | Session 5, both nine-plot cities full and six street points secured |
| `finished-tie` | Complete six-session match with a shared victory and all score components |

## Reproducible generation

From the repository root:

```sh
node games/odd-laws-society/tests/generate-fixtures.mjs
node games/odd-laws-society/tests/generate-fixtures.mjs --check
```

The check mode makes no writes and detects changed content, missing files, and
unexpected JSON/module outputs. The authority recipes live in
`tests/fixture-source.mjs`, outside this browser-safe subtree. They pin the first
Chair and public agenda; they do not modify resources, cities, or scores directly.
The full-city route uses one copy per seat of each selected design and reaches
nine buildings after session 4. The resulting tie is an accounting fixture,
not a recommended strategy or evidence about human balance.

For production browser serving, allowlist `catalog.mjs`, `preview.mjs`, and
`errors.mjs` only. The authority `engine.mjs`, `projection.mjs`, all test sources,
and full-state fixture recipes remain on the host. A development harness may
explicitly serve the generated projected examples when needed.
