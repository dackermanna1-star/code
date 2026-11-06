#!/bin/bash
# Fix pass 5: key_focus_on() measured from a stale camera matrix (focus 4.5-5.7 m instead of 0.9-2.4 m), so the
# SH25b release close-up and the SH11a phone were soft. Rebake, re-render both shots, re-composite them, re-encode.
R=/opt/work/renders; S=/home/user/code/freezer_short/scripts; LOG=/opt/work/render_queue.log
echo "$(date +%H:%M:%S) FIXPASS5 start" >> $LOG
cd /opt/work && blender -b blend/master.blend --python $S/build_anim.py -- /opt/work/blend/anim_new5.blend > /opt/work/tmp/rebake5.log 2>&1 \
  && grep -q SAVED /opt/work/tmp/rebake5.log && mv -f blend/anim_new5.blend blend/anim.blend && echo "$(date +%H:%M:%S) REBAKED5" >> $LOG \
  || { echo "REBAKE5 FAILED" >> $LOG; exit 1; }
for sh in SH25b SH11a; do
  rm -f $R/$sh/${sh}_plate* $R/$sh/${sh}_char_*.exr $R/$sh/${sh}_breath_*.exr $R/$sh/breath.log
done
sed -i 's/^ALL_DONE$/ALL_DONE_PREV/' $LOG
QUEUE_SHOTS="SH25b SH11a" $S/render_queue.sh
cd $S && OMP_NUM_THREADS=2 python3 assemble.py --only SH25b,SH11a | grep ASSEMBLED
python3 overlay_all.py 3740 3991 >> $LOG 2>&1
python3 -c "
import os; miss=[f for f in range(1,3991) if not os.path.exists('/opt/work/final/%05d.png'%f)]; print('MISSING', len(miss), miss[:20])" >> $LOG
cd $S && python3 assemble.py --encode >> /opt/work/encode.log 2>&1 && echo "$(date +%H:%M:%S) ENCODED5" >> $LOG
