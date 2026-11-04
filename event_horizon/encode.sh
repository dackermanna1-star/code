#!/usr/bin/env bash
# Encode rendered frames + soundtrack into the final film.
#   ./encode.sh FRAMES_DIR SOUNDTRACK.wav OUT.mp4
# Adds the fade in from black, the white flash, the cut to black and the title.
set -euo pipefail
FRAMES=${1:-work/frames}
AUDIO=${2:-work/soundtrack.wav}
OUT=${3:-output/event_horizon.mp4}
FONT=${FONT:-/usr/share/fonts/opentype/inter/Inter-Thin.otf}
[ -f "$FONT" ] || FONT=$(fc-match -f '%{file}' 'sans:light')
mkdir -p "$(dirname "$OUT")"
VF="fade=t=in:st=0:d=1.6"
VF+=",fade=t=out:st=57.95:d=0.5:color=white"
VF+=",drawbox=enable='gte(t,58.5)':x=0:y=0:w=iw:h=ih:color=black:t=fill"
VF+=",drawtext=fontfile=${FONT}:text='E V E N T     H O R I Z O N':fontcolor=white:fontsize=h*0.052"
VF+=":x=(w-tw)/2:y=(h-th)/2:enable='gte(t,58.85)':alpha='min(1,(t-58.85)/0.55)'"
VF+=",noise=alls=2:allf=t"
ffmpeg -y -hide_banner -loglevel warning \
  -framerate 24 -i "${FRAMES}/eh_%04d.png" -i "$AUDIO" \
  -vf "$VF" -c:v libx264 -preset slow -crf 20 -tune film -maxrate 9M -bufsize 18M -pix_fmt yuv420p \
  -c:a aac -b:a 192k -shortest -movflags +faststart "$OUT"
echo "wrote $OUT"
