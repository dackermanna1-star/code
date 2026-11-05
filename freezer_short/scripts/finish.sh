#!/bin/bash
# Runs after the main render queue: fix-pass re-renders, final compositing, encode.
R=/opt/work/renders; S=/home/user/code/freezer_short/scripts
until grep -q ALL_DONE /opt/work/render_queue.log; do sleep 60; done
echo "$(date +%H:%M:%S) FIXPASS start" >> /opt/work/render_queue.log
REDO="SH01 SH02 SH04 SH05 SH06a SH06b SH07 SH08b SH09 SH10b SH10c SH11a SH11b SH14 SH15 SH16c SH16d SH18 SH18c SH20 SH22 SH25a"
rm -f $R/SH01/SH01_char_*.exr $R/SH02/SH02_char_*.exr
# full re-render: framing / animation fixes (SH18: camera follows the face, arms tucked; SH20: low tracking angle; SH22: re-aimed, Maya's pose)
for sh in SH06a SH11a SH11b SH16c SH18 SH20 SH22; do rm -f $R/$sh/${sh}_plate* $R/$sh/${sh}_char_*.exr $R/$sh/${sh}_breath_*.exr $R/$sh/breath.log; done
# heavy-frost shots whose character pass was rendered before the strand-following hair rime patch
for sh in SH21 SH23 SH24a; do
  if [ -f $R/$sh/char.log ] && ! grep -q "rime mask" $R/$sh/char.log; then
    rm -f $R/$sh/${sh}_char_*.exr; REDO="$REDO $sh"; echo "rime redo $sh" >> /opt/work/render_queue.log
  fi
done
cd /opt/work && blender -b blend/master.blend --python $S/build_anim.py -- /opt/work/blend/anim_new.blend > /opt/work/tmp/rebake_fix.log 2>&1 && mv -f blend/anim_new.blend blend/anim.blend && echo "$(date +%H:%M:%S) REBAKED" >> /opt/work/render_queue.log || echo "REBAKE FAILED" >> /opt/work/render_queue.log
blender -b blend/anim.blend --python $S/export_anchors.py -- $R/anchors.json > /opt/work/tmp/anchors.log 2>&1
for sh in SH01 SH04 SH14 SH15 SH16d; do rm -f $R/$sh/${sh}_plate*; done   # lighter floor ice
rm -f $R/SH07/SH07_thermal_*.png $R/SH10c/SH10c_thermal_*.png $R/SH18c/SH18c_thermal_*.png $R/SH25a/SH25a_thermal_*.png   # tucked arms, HUD clearance
for sh in SH01 SH02 SH04 SH05 SH06b SH08b SH09 SH10b SH11a SH11b; do rm -f $R/$sh/${sh}_breath_*.exr $R/$sh/breath.log; done
sed -i 's/^ALL_DONE$/ALL_DONE_MAIN/' /opt/work/render_queue.log
$S/render_queue.sh
for sid in $REDO; do
  python3 -c "
import json; s=json.load(open('$R/shots.json'))['$sid']
import os
for f in range(s['f0'], s['f1']+1):
    p='/opt/work/final/%05d.png'%f
    if os.path.exists(p): os.remove(p)"
done
cd $S && OMP_NUM_THREADS=2 python3 assemble.py | grep ASSEMBLED
python3 audio_mix.py /opt/work/mix.wav >> /opt/work/encode.log 2>&1
python3 overlay_all.py >> /opt/work/render_queue.log 2>&1
python3 -c "
import os; miss=[f for f in range(1,3991) if not os.path.exists('/opt/work/final/%05d.png'%f)]; print('MISSING', len(miss), miss[:20])" >> /opt/work/render_queue.log
cd $S && python3 assemble.py --encode >> /opt/work/encode.log 2>&1 && echo "$(date +%H:%M:%S) ENCODED" >> /opt/work/render_queue.log
