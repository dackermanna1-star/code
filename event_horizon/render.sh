#!/usr/bin/env bash
# Full pipeline: bake sky -> build scene -> render frames -> soundtrack -> encode.
#   ./render.sh [WORKDIR]
# Re-running resumes: existing frames are skipped (Blender placeholders), so the
# render can be interrupted and restarted. Set BLENDER=/path/to/blender if needed.
# Optional: RES_PCT (default 100 = 1280x720), SAMPLES (default 24), DEVICE=GPU.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
WORK=${1:-$HERE/work}
BLENDER=${BLENDER:-blender}
mkdir -p "$WORK/textures" "$WORK/frames"
[ -f "$WORK/textures/sky_stars.exr" ] || "$BLENDER" -b -P "$HERE/bake_sky.py" -- "$WORK/textures" 8192
[ -f "$WORK/event_horizon.blend" ] || "$BLENDER" -b -P "$HERE/build_scene.py" -- "$WORK/event_horizon.blend"
"$BLENDER" -b "$WORK/event_horizon.blend" --python-expr "
import bpy, os
sc = bpy.context.scene
sc.render.resolution_percentage = int(os.environ.get('RES_PCT', '100'))
sc.cycles.samples = int(os.environ.get('SAMPLES', '24'))
if os.environ.get('DEVICE') == 'GPU':
    sc.cycles.device = 'GPU'
sc.render.filepath = os.path.join('$WORK', 'frames', 'eh_')
" -a
python3 "$HERE/make_soundtrack.py" "$WORK/soundtrack.wav"
"$HERE/encode.sh" "$WORK/frames" "$WORK/soundtrack.wav" "$HERE/output/event_horizon.mp4"
