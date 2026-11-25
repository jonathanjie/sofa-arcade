#!/bin/bash
# Rebuild the published-size party artwork from retained lossless originals.
# Optionally import newly generated PNGs from a directory before rebuilding.
set -euo pipefail

source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
raw_dir="$source_dir/raw"
covers_dir="$source_dir/../covers"
incoming_dir="${1:-}"

for game in tap-race dont-wake-lala dust-bunny-sumo wall-of-paddles tug-of-yarn snack-stack; do
  raw="$raw_dir/$game.webp"
  if [[ -n "$incoming_dir" && -f "$incoming_dir/$game.png" ]]; then
    cwebp -quiet -z 6 -exact "$incoming_dir/$game.png" -o "$raw"
  fi
  if [[ ! -f "$raw" ]]; then
    echo "Awaiting $game artwork." >&2
    continue
  fi
  mkdir -p "$covers_dir/$game"
  # The originals are within 0.06% of 16:9. Resize the full picture without cropping.
  cwebp -quiet -resize 1280 720 -q 87 -m 6 "$raw" -o "$covers_dir/$game/cover.webp"
  cwebp -quiet -resize 560 315 -q 84 -m 6 "$raw" -o "$covers_dir/$game/cover-560.webp"
done
