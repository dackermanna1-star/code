#!/bin/bash
# Build every character variant (LOD0 + LOD1) from the Rocketbox sources.
# usage: build_all_characters.sh <blender> <rocketboxAvatarsDir> <workDir> <sockets.json> <outDir> [idFilterRegex]
# FINALIZE_ONLY=1 re-runs only the last step (textures/sockets/compression) on the existing <workDir>/raw_glb + tex
# (e.g. after compute_sockets.mjs produced new weapon sockets).
set -e
BL=$1; RB=$2; W=$3; SOCK=$4; OUT=$5; FILTER=${6:-.}
HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p $W/raw_glb $W/tex $OUT
# id : source fbx (relative to RB) : LOD0 mode (subdiv|orig)
VARIANTS="
survivor_m_shirt:Adults/Male_Adult_08:subdiv
survivor_m_hoodie_blue:Adults/Male_Adult_17:subdiv
survivor_m_denim:Adults/Male_Adult_12:subdiv
survivor_m_hoodie_grey:Adults/Male_Adult_18:subdiv
survivor_m_hoodie_brown:Adults/Male_Adult_20:subdiv
survivor_m_leather:Adults/Male_Adult_04:subdiv
survivor_m_flannel:Professions/Delivery_Male_01:subdiv
survivor_m_workshirt:Professions/Wood_Male_01:subdiv
survivor_m_vest:Adults/Male_Adult_05:subdiv
soldier_m_acu:Professions/Military_Male_04:orig
survivor_f_leather:Adults/Female_Adult_04:subdiv:0.96957
survivor_f_hoodie:Adults/Female_Adult_12:subdiv:0.96957
"
for v in $VARIANTS; do
  IFS=: read id src mode bscale <<< "$v"; bscale=${bscale:-1}
  echo "$id" | grep -Eq "$FILTER" || continue
  name=$(basename $src)
  fbx=$RB/$src/Export/$name.fbx
  echo "== $id ($name, $mode)"
  if [ -z "$FINALIZE_ONLY" ]; then
  python3 -I $HERE/prep_textures.py $RB/$src/Textures $W/tex/$id --size 1024 --orm-size 512 > /dev/null
  python3 -I $HERE/prep_textures.py $RB/$src/Textures $W/tex/${id}_lod1 --size 512 --orm-size 256 > /dev/null
  if [ "$mode" = "subdiv" ]; then
    $BL --background --python $HERE/build_character.py -- --fbx $fbx --out $W/raw_glb/${id}.glb --subdiv 1 --max-tris 33000 --bake-scale $bscale 2>&1 | grep -E "^TRIS|Error" || true
    $BL --background --python $HERE/build_character.py -- --fbx $fbx --out $W/raw_glb/${id}_lod1.glb --bake-scale $bscale 2>&1 | grep -E "^TRIS|Error" || true
  else
    $BL --background --python $HERE/build_character.py -- --fbx $fbx --out $W/raw_glb/${id}.glb 2>&1 | grep -E "^TRIS|Error" || true
    $BL --background --python $HERE/build_character.py -- --fbx $fbx --out $W/raw_glb/${id}_lod1.glb --decimate 0.55 2>&1 | grep -E "^TRIS|Error" || true
  fi
  fi
  node $HERE/finalize_character.mjs $W/raw_glb/${id}.glb $W/tex/$id $OUT/${id}.glb --sockets $SOCK | tail -1
  node $HERE/finalize_character.mjs $W/raw_glb/${id}_lod1.glb $W/tex/${id}_lod1 $OUT/${id}_lod1.glb --sockets $SOCK | tail -1
done
