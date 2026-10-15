#!/bin/bash
# LOD1 copies of the wearable gear (about 25-30 % of the triangles, 512 px textures), for characters beyond ~25 m.
set -e
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
for id in helmet_1 helmet_2 helmet_3 vest_1 vest_2 vest_3 backpack_1 backpack_2 backpack_3; do
  node tools/assets/gear/gltf_util.mjs lod "public/assets/gear/$id.glb" "public/assets/gear/${id}_lod1.glb" --ratio 0.28 --error 0.004 --tex 512 | grep '^{'
done
