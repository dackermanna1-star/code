#!/bin/bash
# Render worker: claims shots from render/queue.txt (one per line), renders them in order.
# Start detached:  setsid nohup bash worker.sh W1 > render/logs/W1.log 2>&1 &
W=${1:-W}
B=/opt/blender_dl/blender-4.5.15-linux-x64/blender
R=/home/user/code/render
cd /home/user/code/blender
while true; do
  [ -f $R/STOP ] && { echo "$W stop"; exit 0; }
  found=0
  while read sid; do
    [ -z "$sid" ] && continue
    [ -f $R/final/$sid/.done ] && continue
    if mkdir $R/locks/$sid 2>/dev/null; then
      found=1
      echo "$(date +%T) $W start $sid"
      $B -b --factory-startup -P scripts/render_shot.py -- $sid --resume >> $R/logs/$sid.log 2>&1
      if grep -q "^DONE $sid" $R/logs/$sid.log; then touch $R/final/$sid/.done; echo "$(date +%T) $W done $sid"; else echo "$(date +%T) $W FAILED $sid"; fi
      rmdir $R/locks/$sid
      break
    fi
  done < $R/queue.txt
  [ $found = 0 ] && sleep 20
done
