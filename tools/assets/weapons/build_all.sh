#!/bin/bash
# Build every authored weapon, then optimize into public/assets/weapons and regenerate manifest.json.
#   BLENDER=/path/to/blender tools/assets/weapons/build_all.sh [work_dir] [id ...]
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
BLENDER="${BLENDER:-blender}"
WORK="${1:-/tmp/weapons_build}"; shift || true
IDS="$*"
[ -z "$IDS" ] && IDS=$(cd "$HERE/guns" && ls *.py | grep -v '^_' | sed 's/\.py$//')
mkdir -p "$WORK" "$ROOT/public/assets/weapons"
for id in $IDS; do
  echo "== $id"
  (cd "$ROOT" && "$BLENDER" -b -P tools/assets/weapons/build.py -- "$id" "$WORK" 2>&1 | grep -E "^TRIS|^DONE|Error|Traceback" | cut -c1-200)
  (cd "$ROOT" && node tools/assets/weapons/gltf_util.mjs optimize "$WORK/$id.glb" "public/assets/weapons/$id.glb")
  cp "$WORK/$id.meta.json" "$HERE/meta/$id.meta.json" 2>/dev/null || { mkdir -p "$HERE/meta"; cp "$WORK/$id.meta.json" "$HERE/meta/$id.meta.json"; }
done
(cd "$ROOT" && node tools/assets/weapons/make_manifest.mjs)
