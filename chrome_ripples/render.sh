#!/usr/bin/env bash
# Build the scene, render all frames with Cycles, and encode the MP4.
# Usage: ./render.sh [output_dir]        (requires Blender 4.5 and ffmpeg)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-$HERE/render}"
BLENDER="${BLENDER:-blender}"
mkdir -p "$OUT"
"$BLENDER" -b --factory-startup --python "$HERE/build_scene.py" -- --out "$HERE/chrome_ripples.blend"
# Re-running resumes: frames that already exist are skipped.
"$BLENDER" -b "$HERE/chrome_ripples.blend" -o "$OUT/frame_####" -a
ffmpeg -y -framerate 30 -start_number 1 -i "$OUT/frame_%04d.png" \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -movflags +faststart \
  "$HERE/chrome_ripples.mp4"
echo "done: $HERE/chrome_ripples.mp4"
