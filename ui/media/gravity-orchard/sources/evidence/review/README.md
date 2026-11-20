# Inspected GO5 gallery evidence

These are the original PNG bytes downloaded from the passing [GO5 media run 44780762995](https://github.com/jonathanjie/sofa-arcade/actions/runs/44780762995), captured from **`288a5975a2a59da909959f5246f178a83290f31b`** with Chromium **157.0.8103.0**. They show the rendered component gallery, not the integrated game or a physical device session.

[`evidence.json`](evidence.json) records the artifact digest, screenshot dimensions/hashes and source-file hashes. [`browser-validation.json`](browser-validation.json) retains the actual tested commit, viewport list, no-overflow checks, decoded audio playback, thumbnail ratio checks, reduced-motion freeze and real missing-file behavior. [`asset-validation.json`](asset-validation.json) contains the decoded final asset/inventory results.

| Review surface | Retained capture |
| --- | --- |
| Cover and collection thumbnail, desktop | [collection-1280.png](collection-1280.png) |
| Cover and collection thumbnail, 360px phone | [cover-phone-360.png](cover-phone-360.png) |
| Fruit and all basket states, bright/dark/grayscale | [fruit-and-baskets-1280.png](fruit-and-baskets-1280.png) |
| All character states and source poses | [cast-normal-1280.png](cast-normal-1280.png) |
| Character states at 360px phone width | [cast-phone-360.png](cast-phone-360.png) |
| Morning Delivery material fixture | [garden-morning-delivery-1280.png](garden-morning-delivery-1280.png) |
| Switchback Grove material fixture | [garden-switchback-grove-1280.png](garden-switchback-grove-1280.png) |
| Lala's Moonlight Picnic material fixture | [garden-moonlight-picnic-1280.png](garden-moonlight-picnic-1280.png) |
| Shared-scheduler controls and recorded audio | [audio-preview-1280.png](audio-preview-1280.png) |
| Actual failed fruit request, with truthful status | [fallback-real-missing-url.png](fallback-real-missing-url.png) |
| Actual failed atlas request, full native fallback | [fallback-real-missing-atlas.png](fallback-real-missing-atlas.png) |

The full CI artifact also includes all three gardens at 1920×1080, both 360px and 390px phone captures, normal/reduced/dark character modes, simulated failures and phone audio layouts. The artifact was verified against SHA-256 `f88fc794d7430c674dd880bc815ff4ede8c284d027670c72de458c3d6385adf9` before extraction. The representative files here remain reviewable after CI artifact retention expires.

## Visual review and corrections

The original captured review exposed a stretched secondary cover thumbnail, a moonlight gust banner covering Lydia, low-contrast night ownership labels, basket names on the tray rim and dark-row pose captions. Those were corrected and these captures were inspected again. The secondary thumbnail now measures **318×178.875 CSS pixels** inside its 320px bordered card, exactly **16:9**, at all three tested gallery widths.

All 24 character drawings remain fully inside their source rectangles, with clean alpha and stable apparent scale. The four fruit identities and basket emblems remain distinguishable at small sizes and in grayscale. Scene labels, hazards and the bridge are unobstructed. Genuine missing images are labeled as failures in the global status and the affected card; toggling the demonstration cannot erase a genuine failure. Reduced-motion samples freeze while keeping a clear state visible.

## Reproduce the live review

```sh
npm ci --prefix ui/media/gravity-orchard --no-audit --no-fund
npm run preview --prefix ui/media/gravity-orchard
```

Open `http://127.0.0.1:4195/`. The live gallery includes real atlas animation, stage selection, bright/dark and reduced-motion controls, simulated missing-image handling, shared host audio controls and the retained recordings. Audio starts only after a gesture.

See [`../../audio/render-report.json`](../../audio/render-report.json) for the matching rendered score/cue measurements and [`../../audio/previews/`](../../audio/previews/) for four MP3s. Browser rendering, numerical audio checks, playback and seeking were performed; no human speaker audition or physical phone/TV test is claimed.

All material in this directory is authoring/review evidence. It is excluded from the explicit production runtime inventory.
