#!/bin/bash
B="/opt/blender/blender-4.5.15-linux-x64/blender --gpu-backend vulkan"
cd /opt/work
for g in "$@"; do
  $B -b set.blend -P scripts/build_group.py -- $g > groups/build_$g.log 2>&1
  if grep -q "BUILT" groups/build_$g.log; then echo "OK $g $(grep BUILT groups/build_$g.log)"; else echo "FAIL $g"; grep -E "Error|line [0-9]+" groups/build_$g.log | tail -5; fi
done
