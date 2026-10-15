#!/bin/bash
# Convert the downloaded Poly Haven props (CC0) used by this category.
#   BLENDER=/path/to/blender tools/assets/gear/build_ph.sh <ph_dir> [work_dir]
# <ph_dir> holds Poly Haven glTF downloads (<id>/<id>_2k.gltf), e.g. fetched with
#   curl -s https://api.polyhaven.com/files/<id>  ->  gltf.2k.gltf (+ include) urls.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
BLENDER="${BLENDER:-blender}"
PH="$1"; WORK="${2:-/tmp/gear_build}"
mkdir -p "$WORK" "$HERE/meta"
run() {  # id out_dir src args...
  local id=$1 out=$2 src=$3; shift 3
  "$BLENDER" -b -P "$HERE/ph_prop.py" -- "$PH/$src/${src}_2k.gltf" "$WORK/$id.glb" --name "$id" "$@" 2>&1 | grep -E "^DONE|Error|Traceback" | cut -c1-200
  (cd "$ROOT" && node tools/assets/gear/gltf_util.mjs optimize "$WORK/$id.glb" "public/assets/$out/$id.glb")
  cp "$WORK/$id.meta.json" "$HERE/meta/$id.meta.json"
}
# melee (origin = hand grip, +Z = tip)
run melee_machete weapons machete --pivot 0,-0.105,0 --rot 90,0,0 --tex 1024 --empty tip:0,0,0.645
run melee_crowbar weapons crowbar_01 --pivot 0,-0.2,0 --rot 90,0,0 --tex 1024 --empty tip:0,0,0.46
# items (origin = bottom centre on the ground)
run ammo_762 items ammo_box --pivot bottom --rot 0,90,0 --tex 1024
run item_fuelcan items metal_jerrycan --pivot bottom --decimate 0.4 --tex 1024 --empty spout:0.12,0.45,0
run deathbox items wooden_crate_02 --pivot bottom --tex 1024 --keep --rename wooden_crate_02_crate=body,wooden_crate_02_lid=lid
