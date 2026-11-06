#!/bin/bash
# Fix pass 4, after the final multi-agent QA: re-staged rescue (SH20-SH23, Maya at the door in SH21), carried box and
# grounded walk (SH01/SH02), framing (SH11a, SH25b), contacts (SH10c, SH13) and frosted release ice (SH12b/SH13/SH25b).
# Renders first; the final composite/overlay/audio/encode waits for /opt/work/tmp/INTEGRATED (set once the audio and
# overlay fixes have been reviewed and integrated).
R=/opt/work/renders; S=/home/user/code/freezer_short/scripts; LOG=/opt/work/render_queue.log
echo "$(date +%H:%M:%S) FIXPASS4 start" >> $LOG
cd /opt/work && blender -b blend/master.blend --python $S/build_anim.py -- /opt/work/blend/anim_new4.blend > /opt/work/tmp/rebake4.log 2>&1 \
  && grep -q SAVED /opt/work/tmp/rebake4.log && mv -f blend/anim_new4.blend blend/anim.blend && echo "$(date +%H:%M:%S) REBAKED4" >> $LOG \
  || { echo "REBAKE4 FAILED" >> $LOG; exit 1; }
blender -b blend/anim.blend --python $S/export_anchors.py -- $R/anchors.json > /opt/work/tmp/anchors.log 2>&1
SHOTS4="SH20 SH22 SH23 SH25b SH01 SH02 SH11a SH13 SH21 SH10c SH12b"
for sh in $SHOTS4; do
  rm -f $R/$sh/${sh}_plate* $R/$sh/${sh}_char_*.exr $R/$sh/${sh}_breath_*.exr $R/$sh/${sh}_thermal_*.png $R/$sh/breath.log
done
sed -i 's/^ALL_DONE$/ALL_DONE_PREV/' $LOG
QUEUE_SHOTS="$SHOTS4" $S/render_queue.sh
echo "$(date +%H:%M:%S) FIXPASS4 RENDERED" >> $LOG
until [ -f /opt/work/tmp/INTEGRATED ]; do sleep 60; done
cd $S && OMP_NUM_THREADS=2 python3 assemble.py --only $(echo $SHOTS4 | tr ' ' ',') | grep ASSEMBLED
python3 audio_mix.py /opt/work/mix.wav >> /opt/work/encode.log 2>&1
python3 overlay_all.py >> $LOG 2>&1
python3 -c "
import os; miss=[f for f in range(1,3991) if not os.path.exists('/opt/work/final/%05d.png'%f)]; print('MISSING', len(miss), miss[:20])" >> $LOG
cd $S && python3 assemble.py --encode >> /opt/work/encode.log 2>&1 && echo "$(date +%H:%M:%S) ENCODED4" >> $LOG
