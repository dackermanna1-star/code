#!/bin/bash
B=/opt/blender/blender-4.5.15-linux-x64/blender
cd /opt/work/chars
for j in *.json; do n=${j%.json}; [ "$n" = "mehran" ] && continue
  $B -b -P /opt/work/scripts/build_char.py -- $j $n.blend > logs_$n.txt 2>&1 && echo "OK $n" || echo "FAIL $n"
done
