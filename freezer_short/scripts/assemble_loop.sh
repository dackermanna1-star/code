#!/bin/bash
# Low-priority incremental compositing of finished shots while the render queue runs.
export OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 OPENCV_NUM_THREADS=1
cd /home/user/code/freezer_short/scripts
while true; do
  nice -n 15 python3 assemble.py 2>&1 | grep ASSEMBLED
  grep -q ALL_DONE /opt/work/render_queue.log && { nice -n 15 python3 assemble.py | grep ASSEMBLED; break; }
  sleep 120
done
