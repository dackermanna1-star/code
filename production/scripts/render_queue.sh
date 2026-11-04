#!/bin/bash
# Detached render queue. Lines in renders/queue.txt: "<blend> <scene>". Marks renders/<scene>/DONE.
B=/opt/blender_dl/blender-4.5.3-linux-x64/blender
ROOT=/home/user/code/production
Q=$ROOT/renders/queue.txt
LOG=$ROOT/renders/queue.log
touch $Q
while true; do
  next=""
  while read -r blend scene; do
    [ -z "$scene" ] && continue
    [ "$blend" = "STOP" ] && { echo "STOP $(date)" >> $LOG; exit 0; }
    [ -f "$ROOT/renders/$scene/DONE" ] && continue
    [ -f "$ROOT/renders/$scene/RUNNING" ] && continue
    next="$blend $scene"; break
  done < $Q
  if [ -z "$next" ]; then sleep 20; continue; fi
  set -- $next
  mkdir -p $ROOT/renders/$2; touch $ROOT/renders/$2/RUNNING
  echo "START $2 $(date +%T)" >> $LOG
  nice -n 5 $B -b "$1" -S "$2" --python-expr "import bpy; s=bpy.context.scene; s.render.filepath='$ROOT/renders/$2/####'; s.render.use_overwrite=False; s.render.use_placeholder=True; s.eevee.taa_render_samples=min(s.eevee.taa_render_samples,3)" -a > $ROOT/renders/$2/render.log 2>&1
  rm -f $ROOT/renders/$2/RUNNING
  n=$(ls $ROOT/renders/$2/*.png 2>/dev/null | wc -l)
  echo "END $2 frames=$n $(date +%T)" >> $LOG
  touch $ROOT/renders/$2/DONE
done
