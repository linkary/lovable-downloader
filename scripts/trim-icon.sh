#!/usr/bin/env bash

# Trims transparent padding from the original Lovable icon, adds a small
# margin, and writes the result to public/icon.png.
#
# The original is fetched once and cached at public/icon-original.png so
# the script is idempotent — repeated runs always start from a clean source.
#
# Usage: bash scripts/trim-icon.sh [padding_percent]
#   padding_percent: percentage of canvas to use as padding (default: 5, max: 40)

set -euo pipefail

src="public/icon-original.png"
out="public/icon.png"
size=192
padding="${1:-5}"

if ! command -v magick &> /dev/null; then
  echo "Error: ImageMagick (magick) not found." >&2
  exit 1
fi

# Ensure we have the original icon
if [ ! -f "$src" ]; then
  if [ -f "$out" ]; then
    cp "$out" "$src"
  else
    echo "Error: no source icon found. Place icon at $out first." >&2
    exit 1
  fi
fi

if [ "$padding" -gt 40 ]; then
  echo "Error: padding must be 0-40 (got ${padding})." >&2
  exit 1
fi

border=$((size * padding / 100))
inner=$((size - border * 2))

echo "Trimming icon: ${padding}% padding (${border}px border, ${inner}x${inner} inner)"

magick "$src" -trim -resize "${inner}x${inner}" \
  -gravity center -background none -extent "${size}x${size}" \
  "$out"

echo "Done: $out updated (${size}x${size} with ${border}px padding)"
