#!/bin/bash
# Render every shot: camera json, then per shot plate -> character -> breath (or thermal). Resumable.
BLEND=/opt/work/blend/anim.blend
R=/opt/work/renders
S=/home/user/code/freezer_short/scripts/render_shot.py
LOG=/opt/work/render_queue.log
SHOTS="SH01 SH02 SH03 SH04 SH05 SH06a SH06b SH07 SH08a SH08b SH09 SH10a SH10b SH10c SH11a SH11b SH12a SH12b SH13 SH14 SH15 SH16a SH16b SH16c SH16d SH17a SH17b SH17c SH18 SH18c SH19 SH20 SH21 SH22 SH23 SH24a SH24b SH25a SH25b"
THERMAL="SH07 SH08a SH10a SH10c SH17a SH18c SH25a"
NOCHAR="SH03 SH12b SH19 SH24b SH25b"
blender -b $BLEND --python-expr "import bpy; open('$R/shots.json','w').write(bpy.context.scene['shots'])" > /dev/null 2>&1
blender -b $BLEND --python $S -- $(echo $SHOTS | tr ' ' ',') camjson $R >> $LOG 2>&1
for sh in $SHOTS; do
  mkdir -p $R/$sh
  t0=$(date +%s)
  if [[ " $THERMAL " == *" $sh "* ]]; then
    blender -b $BLEND --python $S -- $sh thermal $R/$sh final > $R/$sh/thermal.log 2>&1
  else
    [ -f $R/$sh/${sh}_plate.json ] || blender -b $BLEND --python $S -- $sh plate $R/$sh final > $R/$sh/plate.log 2>&1
    if [[ " $NOCHAR " != *" $sh "* ]]; then
      blender -b $BLEND --python $S -- $sh char $R/$sh final > $R/$sh/char.log 2>&1
    fi
    blender -b $BLEND --python $S -- $sh breath $R/$sh final > $R/$sh/breath.log 2>&1
  fi
  echo "$(date +%H:%M:%S) DONE $sh in $(( $(date +%s) - t0 ))s" >> $LOG
done
echo "ALL_DONE" >> $LOG
