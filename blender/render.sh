#!/usr/bin/env bash
# Build, render and encode GLITCH CUBE end to end.
#
#   ./render.sh [workdir] [processes]
#
# Needs: blender 4.5 on PATH (or $BLENDER), ffmpeg, python3 + numpy.
# Frames render with use_overwrite=off + placeholders, so several Blender
# processes share one frame range and an interrupted render can be resumed
# by simply running this script again.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="${1:-$HERE/out}"
PROCS="${2:-2}"
BLENDER="${BLENDER:-blender}"
mkdir -p "$WORK/frames"

echo "== building scene"
"$BLENDER" -b --factory-startup -P "$HERE/glitch_cube.py" -- "$WORK/glitch_cube.blend" "$WORK/cues.json"

echo "== synthesising soundtrack"
python3 "$HERE/soundtrack.py" "$WORK/cues.json" "$WORK/soundtrack.wav"

echo "== rendering 1440 frames with $PROCS processes"
find "$WORK/frames" -name '*.png' -size 0 -delete      # drop placeholders of crashed runs
pids=()
for i in $(seq "$PROCS"); do
  "$BLENDER" -b "$WORK/glitch_cube.blend" -o "$WORK/frames/####" -a > "$WORK/render_$i.log" 2>&1 &
  pids+=($!)
  sleep 15
done
wait "${pids[@]}"

echo "== encoding"
ffmpeg -y -loglevel error -framerate 24 -i "$WORK/frames/%04d.png" -i "$WORK/soundtrack.wav" \
  -vf "vignette=angle=PI/4.5,noise=alls=3:allf=t,format=yuv420p" \
  -af "loudnorm=I=-16:TP=-1.5:LRA=14" \
  -c:v libx264 -preset slow -crf 21 -tune grain -movflags +faststart \
  -c:a aac -b:a 192k -ar 48000 -shortest "$WORK/glitch_cube.mp4"
echo "done: $WORK/glitch_cube.mp4"
