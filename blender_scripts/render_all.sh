#!/bin/bash
# renders groups in order; run two copies of this script in parallel (placeholders avoid duplicate work)
B="/opt/blender/blender-4.5.15-linux-x64/blender --gpu-backend opengl"
cd /opt/work
for g in "$@"; do
  $B -b groups/$g.blend -P scripts/render_anim.py > /opt/work/logs_render_${g}_$$.txt 2>&1
  echo "DONE $g $(date +%H:%M)"
done
