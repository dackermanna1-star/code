#!/bin/bash
# Low-priority incremental compositing during the second fix pass (stops once finish2.sh has rendered everything;
# finish2.sh then runs a final assemble + overlay pass itself).
export OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 OPENCV_NUM_THREADS=1
cd /home/user/code/freezer_short/scripts
until grep -q "ANCHORS2" /opt/work/render_queue.log; do sleep 30; done
sleep 120   # let render_queue.sh rewrite shots.json and the camera json first
until grep -q "FIXPASS2 RENDERED" /opt/work/render_queue.log; do
  nice -n 15 python3 assemble.py 2>&1 | grep ASSEMBLED
  sleep 120
done
