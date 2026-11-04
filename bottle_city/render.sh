#!/usr/bin/env bash
# Render the full animation (resumable) and encode it to MP4.
#   bash bottle_city/render.sh            # render missing frames, then encode
#   bash bottle_city/render.sh encode     # only encode existing frames
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BLENDER="${BLENDER:-blender}"
FRAMES="$HERE/render/frames"
mkdir -p "$FRAMES"
if [ "${1:-}" != "encode" ]; then
  # no-overwrite + placeholders: safe to stop and restart, or run several instances in parallel
  "$BLENDER" -b "$HERE/bottle_city.blend" \
    --python-expr "import bpy; r=bpy.context.scene.render; r.use_overwrite=False; r.use_placeholder=True; r.filepath='$FRAMES/frame_'" \
    -a
fi
ffmpeg -y -loglevel error -framerate 24 -i "$FRAMES/frame_%04d.png" \
  -c:v libx264 -preset slow -crf 19 -pix_fmt yuv420p -movflags +faststart \
  "$HERE/render/city_in_a_bottle.mp4"
echo "wrote $HERE/render/city_in_a_bottle.mp4"
