#!/bin/bash
# Runs after the main render queue: fix-pass re-renders, final compositing, encode.
R=/opt/work/renders; S=/home/user/code/freezer_short/scripts
until grep -q ALL_DONE /opt/work/render_queue.log; do sleep 60; done
echo "$(date +%H:%M:%S) FIXPASS start" >> /opt/work/render_queue.log
rm -f $R/SH01/SH01_char_*.exr $R/SH02/SH02_char_*.exr
rm -f $R/SH06a/SH06a_plate* $R/SH06a/SH06a_char_*.exr $R/SH06a/SH06a_breath_*.exr $R/SH06a/breath.log
rm -f $R/SH07/SH07_thermal_*.png
for sh in SH01 SH02 SH04 SH05 SH06b SH08b SH09 SH10b SH11a SH11b; do rm -f $R/$sh/${sh}_breath_*.exr $R/$sh/breath.log; done
sed -i 's/^ALL_DONE$/ALL_DONE_MAIN/' /opt/work/render_queue.log
$S/render_queue.sh
for sid in SH01 SH02 SH04 SH05 SH06a SH06b SH07 SH08b SH09 SH10b SH11a SH11b; do
  python3 -c "
import json; s=json.load(open('$R/shots.json'))['$sid']
import os
for f in range(s['f0'], s['f1']+1):
    p='/opt/work/final/%05d.png'%f
    if os.path.exists(p): os.remove(p)"
done
cd $S && OMP_NUM_THREADS=2 python3 assemble.py | grep ASSEMBLED
python3 -c "
import os; miss=[f for f in range(1,3947) if not os.path.exists('/opt/work/final/%05d.png'%f)]; print('MISSING', len(miss), miss[:20])" >> /opt/work/render_queue.log
cd $S && python3 assemble.py --encode >> /opt/work/encode.log 2>&1 && echo "$(date +%H:%M:%S) ENCODED" >> /opt/work/render_queue.log
