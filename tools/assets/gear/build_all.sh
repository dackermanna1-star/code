#!/bin/bash
# Build authored gear/attachment/item assets, optimize them into public/assets/<dir> and keep their meta.
#   BLENDER=/path/to/blender tools/assets/gear/build_all.sh [work_dir] [id ...]
# The output folder of each id is given by models/<id>.py OUT (attachments | gear | items | weapons).
# Afterwards: build_ph.sh (Poly Haven props), make_lods.sh (gear LOD1), node make_manifest.mjs.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
BLENDER="${BLENDER:-blender}"
WORK="${1:-/tmp/gear_build}"; shift || true
IDS="$*"
[ -z "$IDS" ] && IDS=$(cd "$HERE/models" && ls *.py | grep -v '^_' | sed 's/\.py$//')
mkdir -p "$WORK" "$HERE/meta"
python3 "$HERE/labels.py" "$WORK/labels" --reticles "$ROOT/public/assets/attachments/reticles"
for id in $IDS; do
  OUT=$(grep -E "^OUT *= *" "$HERE/models/$id.py" | sed -E "s/^OUT *= *['\"]([a-z]+)['\"].*/\1/")
  [ -z "$OUT" ] && OUT=gear
  echo "== $id -> $OUT"
  (cd "$ROOT" && "$BLENDER" -b -P tools/assets/gear/build.py -- "$id" "$WORK" 2>&1 | grep -E "^TRIS|^DONE|Error|Traceback|error" | cut -c1-300)
  (cd "$ROOT" && node tools/assets/gear/gltf_util.mjs optimize "$WORK/$id.glb" "public/assets/$OUT/$id.glb")
  cp "$WORK/$id.meta.json" "$HERE/meta/$id.meta.json"
done
