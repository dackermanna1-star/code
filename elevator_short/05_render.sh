#!/usr/bin/env bash
# Render all frames with N parallel Blender instances (frame ranges interleaved in chunks).
# Usage: ./05_render.sh [instances] [blender_binary]
set -euo pipefail
cd "$(dirname "$0")"
N=${1:-2}
BL=${2:-/opt/blender-dl/blender-4.5.3-linux-x64/blender}
END=$(python3 -c "import json;print(json.load(open('build/timeline.json'))['frame_end'])")
mkdir -p build/frames build/logs
THREADS=$(( $(nproc) / N )); [ "$THREADS" -lt 1 ] && THREADS=1
for i in $(seq 0 $((N-1))); do
  # each instance renders every N-th chunk of 30 frames; existing frames are skipped (resumable)
  LP_NUM_THREADS=$THREADS "$BL" -b build/elevator.blend -t "$THREADS" --python-expr "
import bpy, os
sc = bpy.context.scene
sc.render.use_overwrite = False
sc.render.use_placeholder = True
chunk, n, i, end = 30, $N, $i, $END
for c0 in range(1 + i*chunk, end + 1, n*chunk):
    sc.frame_start, sc.frame_end = c0, min(end, c0 + chunk - 1)
    bpy.ops.render.render(animation=True)
" > build/logs/render_$i.log 2>&1 &
done
wait
echo "render done: $(ls build/frames | wc -l) frames"
