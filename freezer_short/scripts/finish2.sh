#!/bin/bash
# Second fix pass, after the multi-agent visual review: invalidate every output touched by the review fixes,
# rebake the animation, re-render (heavy independent shots first, shots that show the iced release last),
# re-composite every frame with the fixed compositor, re-apply overlays, remix audio and encode.
R=/opt/work/renders; S=/home/user/code/freezer_short/scripts; LOG=/opt/work/render_queue.log
echo "$(date +%H:%M:%S) FIXPASS2 start" >> $LOG
# full re-render (animation and/or camera changed: seating/grounding, tucked arms, IK contacts, framing, focus)
for sh in SH04 SH06a SH08b SH09 SH11a SH11b SH12a SH13 SH14 SH16b SH16c SH16d SH17b SH17c SH18 SH20 SH22 SH23 SH24a; do
  rm -f $R/$sh/${sh}_plate* $R/$sh/${sh}_char_*.exr $R/$sh/${sh}_breath_*.exr $R/$sh/breath.log
done
# plates only (floor ice, ghost-free door variants, SH03/SH12b framing, flat display glass, clear release ice)
for sh in SH01 SH02 SH03 SH05 SH06b SH12b SH15 SH19 SH21; do rm -f $R/$sh/${sh}_plate*; done
# character passes (SH01/SH02 framing + boundary fixes; SH15 grounded get-up)
for sh in SH01 SH02 SH15 SH21; do rm -f $R/$sh/${sh}_char_*.exr $R/$sh/${sh}_breath_*.exr $R/$sh/breath.log; done
# SH25b: door + iced release now come from a char pass (the plates leave an animated door out)
rm -f $R/SH25b/SH25b_plate* $R/SH25b/SH25b_char_*.exr $R/SH25b/SH25b_breath_*.exr $R/SH25b/breath.log   # plate1 was truncated (disk full)
# thermal passes (soft breath, tucked arms, grounding, new angles)
for sh in SH07 SH08a SH10a SH10c SH17a SH18c SH25a; do rm -f $R/$sh/${sh}_thermal_*.png; done
# breath passes
for sh in SH05 SH06b SH10b; do rm -f $R/$sh/${sh}_breath_*.exr $R/$sh/breath.log; done
cd /opt/work && blender -b blend/master.blend --python $S/build_anim.py -- /opt/work/blend/anim_new.blend > /opt/work/tmp/rebake_fix2.log 2>&1 \
  && mv -f blend/anim_new.blend blend/anim.blend && echo "$(date +%H:%M:%S) REBAKED2" >> $LOG || { echo "REBAKE2 FAILED" >> $LOG; exit 1; }
blender -b blend/anim.blend --python $S/export_anchors.py -- $R/anchors.json > /opt/work/tmp/anchors.log 2>&1
rm -f /opt/work/final/*.png   # every frame is re-composited with the fixed compositor (border-line fix)
echo "$(date +%H:%M:%S) ANCHORS2" >> $LOG
sed -i 's/^ALL_DONE$/ALL_DONE_PREV/' $LOG
QUEUE_SHOTS="SH09 SH18 SH20 SH22 SH23 SH08b SH04 SH06a SH11a SH11b SH14 SH15 SH16b SH16c SH16d SH17b SH17c SH24a SH12a \
SH05 SH06b SH10b SH07 SH08a SH10a SH10c SH17a SH18c SH25a SH06b SH08a SH10c SH16a SH19 SH24b \
SH01 SH02 SH03 SH12b SH13 SH21 SH25b" $S/render_queue.sh
echo "$(date +%H:%M:%S) FIXPASS2 RENDERED" >> $LOG
cd $S && OMP_NUM_THREADS=2 python3 assemble.py | grep ASSEMBLED
python3 audio_mix.py /opt/work/mix.wav >> /opt/work/encode.log 2>&1
python3 overlay_all.py >> $LOG 2>&1
python3 -c "
import os; miss=[f for f in range(1,3991) if not os.path.exists('/opt/work/final/%05d.png'%f)]; print('MISSING', len(miss), miss[:20])" >> $LOG
cd $S && python3 assemble.py --encode >> /opt/work/encode.log 2>&1 && echo "$(date +%H:%M:%S) ENCODED" >> $LOG
