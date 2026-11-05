#!/bin/bash
# Takes over from finish2.sh after late fixes (SH08b hands/camera; floor-ice black voids in five plates):
# wait for the running render queue, re-render SH08b with a fresh camera export, then composite,
# remix audio, re-apply overlays to every frame and encode.
R=/opt/work/renders; S=/home/user/code/freezer_short/scripts; LOG=/opt/work/render_queue.log
BLEND=/opt/work/blend/anim.blend
while pgrep -f "render_queue.sh" > /dev/null; do sleep 60; done
echo "$(date +%H:%M:%S) FIXPASS3 SH08b" >> $LOG
rm -f $R/SH08b/SH08b_plate* $R/SH08b/SH08b_char_*.exr $R/SH08b/SH08b_breath_*.exr $R/SH08b/breath.log
for f in $(seq 776 862); do rm -f /opt/work/final/$(printf %05d $f).png; done
blender -b $BLEND --python-expr "import bpy; open('$R/shots.json','w').write(bpy.context.scene['shots'])" > /dev/null 2>&1
blender -b $BLEND --python $S/render_shot.py -- SH08b camjson $R >> $LOG 2>&1
blender -b $BLEND --python $S/render_shot.py -- SH08b plate $R/SH08b final > $R/SH08b/plate.log 2>&1
blender -b $BLEND --python $S/render_shot.py -- SH08b char $R/SH08b final > $R/SH08b/char.log 2>&1
blender -b $BLEND --python $S/render_shot.py -- SH08b breath $R/SH08b final > $R/SH08b/breath.log 2>&1
echo "$(date +%H:%M:%S) DONE SH08b (fix3)" >> $LOG
# plates whose overlapping floor-ice slabs rendered black voids (render_shot now staggers them); re-composite those shots
for sh in SH14 SH15 SH16b SH16d SH17b; do
  rm -f $R/$sh/${sh}_plate*
  blender -b $BLEND --python $S/render_shot.py -- $sh plate $R/$sh final > $R/$sh/plate.log 2>&1
  python3 -c "
import json, os; s=json.load(open('$R/shots.json'))['$sh']
for f in range(s['f0'], s['f1']+1):
    p='/opt/work/final/%05d.png'%f
    if os.path.exists(p): os.remove(p)"
  echo "$(date +%H:%M:%S) DONE $sh plate (ice stagger)" >> $LOG
done
echo "$(date +%H:%M:%S) FIXPASS2 RENDERED" >> $LOG
cd $S && OMP_NUM_THREADS=2 python3 assemble.py | grep ASSEMBLED
python3 audio_mix.py /opt/work/mix.wav >> /opt/work/encode.log 2>&1
python3 overlay_all.py >> $LOG 2>&1
python3 -c "
import os; miss=[f for f in range(1,3991) if not os.path.exists('/opt/work/final/%05d.png'%f)]; print('MISSING', len(miss), miss[:20])" >> $LOG
cd $S && python3 assemble.py --encode >> /opt/work/encode.log 2>&1 && echo "$(date +%H:%M:%S) ENCODED" >> $LOG
