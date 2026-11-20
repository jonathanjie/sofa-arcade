# GO6 reviewed setup evidence

Captured source: `f3f15aad3ac706993da7e97758ded85fe9a12a56`.
[GitHub Actions capture run](https://github.com/jonathanjie/sofa-arcade/actions/runs/44778320277).
Capture date: 21 November 2026 (Singapore).

The browser job passed all **11 flows**, using Chromium **151.0.7922.34**, Linux
x64 and Node **24.22.3**. It used the locked nested Playwright runner at
`desktop/secure-lan/tests/browser.mjs`. The exact capture SHA is also preserved in
[tested-sha.txt](tested-sha.txt); [browser-results.json](browser-results.json)
records each result and evidence boundary; [runtime.json](runtime.json) records
the runtime. All nine images were visually inspected before this evidence commit.

These are UI fixture screenshots over **HTTP loopback**. Provision, disable,
removal and root replacement callbacks are safe in-memory stubs. Phone results
in the setup fixture are explicitly simulated. The diagnostic independently
reports the page's real scheme and secure-context value; loopback's exception
does not establish private-IP HTTP eligibility. Synthetic orientation events
cannot establish physical sensor evidence. Certificate errors were not ignored,
and no system or phone trust store was changed.

The displayed fingerprint belongs to the test run's temporary public root. No
certificate, profile, key, private path, room credential or database is included
in these evidence files. The example private join address is fixture data.

| Capture | What to inspect |
| --- | --- |
| [Initial setup](initial-1280.png) | Explicit setup and immediate touch alternative |
| [Host ready](ready-1280.png) | Public fingerprint/export and safe HTTPS join; phone trust remains unchecked |
| [Missing phone trust](missing-trust-1280.png) | Host readiness separate from simulated phone trust failure |
| [Permission denied](permission-denied-1280.png) | Simulated denial distinct from secure context and readings |
| [Expired certificate](expired-1280.png) | Actionable renewal and touch fallback |
| [Address changed](address-changed-1280.png) | Explicit leaf refresh under the existing root |
| [Failure and retry](failed-1280.png) | Safe error copy and retry without private error content |
| [Narrow setup](missing-trust-390.png) | Touch action in the first 390×844 viewport; visible keyboard focus; no horizontal overflow |
| [Narrow diagnostic](diagnostic-http-390.png) | HTTP, secure context, permission and finite samples reported separately |

Wide screenshots use a 1280×1080 viewport; narrow screenshots use 390×844. Images
capture full page height and reduced motion. The evidence is excluded from
production packaging by both runtime inventories. The PR and its final-head CI
checks are the authoritative record of the final tested committed revision.
