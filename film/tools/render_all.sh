#!/bin/bash
# Render every sequence with two parallel Blender workers, then build audio and the final film.
cd "$(dirname "$0")/.."
mkdir -p build/logs
R() { xvfb-run -a -s "-screen 0 1280x720x24" blender -b --python render.py -- "$@"; }
( for s in overworld cave desert edge; do R $s > build/logs/render_$s.log 2>&1; done ) &
( for s in night snow jungle farlands; do R $s > build/logs/render_$s.log 2>&1; done ) &
wait
python3 tools/missing.py
python3 audio/make_audio.py
python3 tools/assemble.py
