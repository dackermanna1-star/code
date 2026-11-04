#!/bin/bash
# Background render daemon: renders shots listed in renders/queue.txt (one shot id per line), in order.
R=/home/user/code/amazon_short; B=/opt/blender/blender-4.5.15-linux-x64/blender
cd $R
while true; do
  [ -f renders/STOP ] && exit 0
  next=""
  for sid in $(cat renders/queue.txt 2>/dev/null); do
    [ -f renders/shots/$sid/DONE ] || { next=$sid; break; }
  done
  if [ -z "$next" ]; then sleep 20; continue; fi
  echo "$(date +%T) START $next" >> renders/queue.log
  t0=$(date +%s)
  $B -b blend/shots/$next.blend --python-expr "import bpy; s=bpy.context.scene; s.render.use_overwrite=False; s.render.use_placeholder=True; c=s.cycles; c.samples=4; c.denoising_prefilter='FAST'; s.render.resolution_percentage=46; c.sample_clamp_indirect=2.0" -a > renders/shots/$next.log 2>&1
  n=$(ls renders/shots/$next/f_*.png 2>/dev/null | wc -l)
  echo "$(date +%T) END $next frames=$n secs=$(( $(date +%s)-t0 ))" >> renders/queue.log
  touch renders/shots/$next/DONE
done
