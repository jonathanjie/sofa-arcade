# Gravity Orchard guided practice

```js
import { mountTutorial } from './tutorial/index.mjs';

const tutorial = mountTutorial(root, {
  onClose: closeHelp,
  inputMode: 'touch', // or 'tilt'; changes the introductory teaching copy only
  reducedMotion: () => preferences.reducedMotion,
});

tutorial.dispose();
```

The exact public mount returns only `dispose()`. `reducedMotion` can be a boolean,
a function returning the current preference, or a `MediaQueryList`. The operating
system's reduced-motion setting is also honored, including live changes. The
lesson remains mounted when the preference changes.

The tutorial has eight short interactive lessons: comfortable grip/recenter,
independent steering, held Brake, a bridge handoff, matching a basket, recipe
buffers, gust/gate/compost forecasts, and shared pause with both-ready countdown.
The on-screen controls work with pointer/touch and keyboard. Brake responds to
held pointer, Space, or Enter; release, cancellation, visibility loss, and blur
clear it. Arrow keys steer the selected private practice tray.

## Isolation and host responsibilities

These are private scripted teaching positions. They do not import an engine,
transport, phone sensor module, sound system, or persistent storage. The only
outward callback is `onClose()`, called once for Close, Escape, or completion.
Calling `dispose()` directly does not call `onClose()`.

The live TV owner requests `{kind:'pause', payload:{reason:'help'}}` during
playing/countdown and opens Help after authority confirms the pause. Closing this
tutorial never issues `ready`, `resume`, `rematch`, or another live command. Each
phone must separately become ready before the normal authoritative countdown.
Recenter teaching does not request permission or calibrate any real device.

The mount creates its own fixed modal and a scoped style element. It inerts
sibling branches while open, traps focus, restores the previous inert/focus
state, and removes its frame, listeners, style, and markup on disposal. Reusing
the same root automatically disposes the previous tutorial instance. A late
animation callback cannot restore a disposed tutorial.

## Runtime inventory

- `index.mjs`: mount, lesson interactions, focus/keyboard/pointer lifecycle.
- `lessons.mjs`: private teaching text and fresh per-lesson state.
- `graphics.mjs`: code-native diagnostic SVG illustrations.
- `styles.mjs`: scoped modal styling.

No production dependency or external asset is required. The diagnostic graphics
are teaching diagrams, not an alternate final game media pack.

## Stable fixture hooks

The outer modal has `[data-go-tutorial]`; its `role="dialog"` has
`[data-tutorial-step="0"]` through `"7"`. Interactive buttons use
`[data-tutorial-action]`:

| Step | Required exercise before Next becomes available |
| --- | --- |
| 0 | `recenter` |
| 1 | `steer` on Jon, `select-lydia`, `steer` on Lydia; arrows have `data-direction` |
| 2 | Hold `brake` for at least 300 ms of foreground practice frames |
| 3 | `pass`, followed by the 900 ms handoff; immediate with reduced motion |
| 4 | `catch` with `data-fruit="pear"`; `"apple"` demonstrates rejection |
| 5 | `deliver` three times: apple, apple, pear |
| 6 | `forecast`, then hold `brake` |
| 7 | `pause`, `ready-jon`, `ready-lydia`, followed by a three-second countdown |

`next`, `back`, and `close` are present throughout. The last `next` completes and
closes. The browser fixture verifies these controls without a real dispatcher;
this tutorial alone does not establish live phone, network, native, or audio
acceptance.
