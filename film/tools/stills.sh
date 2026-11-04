#!/bin/bash
# Render the middle frame (or given fraction) of every shot in a sequence and tile a contact sheet.
# usage: tools/stills.sh SEQ [fraction=0.5] [extra render.py args]
cd "$(dirname "$0")/.."
SEQ=$1; FRAC=${2:-0.5}; shift; shift
FR=$(python3 -c "
from mcfilm import timeline as tl
fr=tl.frames(); print(','.join(str(int(fr[s][0]+(fr[s][1]-fr[s][0])*$FRAC)) for s,_,_ in tl.seq_shots('$SEQ')))")
OUT=build/stills_$SEQ
rm -rf $OUT; mkdir -p $OUT
xvfb-run -a -s "-screen 0 1280x720x24" blender -b --python render.py -- $SEQ --still $FR --out $OUT --preview --nosave "$@" 2>&1 | grep -E "Error|Traceback|line [0-9]+|\[render\]|\[mesh\]"
N=$(ls $OUT/*.png | wc -l); ROWS=$(( (N+1)/2 ))
ffmpeg -loglevel error -y -pattern_type glob -i "$OUT/*.png" -filter_complex "tile=2x${ROWS}:padding=4" build/sheet_$SEQ.png
echo "sheet: build/sheet_$SEQ.png ($N stills)"
