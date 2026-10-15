#!/usr/bin/env bash
# Rebuild public/assets/textures + public/assets/hdri from scratch.
# usage: tools/assets/textures/build_all.sh <scratch_dir>     (raw downloads go to <scratch_dir>/src, never the repo)
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
RAW="$(mkdir -p "$1/src" "$1/api" && cd "$1" && pwd)"
T="$REPO/tools/assets/textures"
cd "$REPO"
# API listings (dimensions / tile sizes)
[ -s "$RAW/api/ph_textures.json" ] || curl -sSL --fail -o "$RAW/api/ph_textures.json" "https://api.polyhaven.com/assets?t=textures"
[ -s "$RAW/api/acg_all.json" ] || python3 -I "$T/acg_list.py" "$RAW/api/acg_all.json"
python3 -I "$T/fetch.py" "$RAW/src"
python3 -I "$T/build.py" "$RAW/src" public/assets/textures
python3 -I "$T/generate.py" noise public/assets/textures/noise
python3 -I "$T/install_hdri.py" "$RAW/src/hdri" public/assets/hdri
python3 -I "$T/manifest.py" "$RAW/src" "$RAW/api/ph_textures.json" "$RAW/api/acg_all.json"
# preview: node "$T/static_server.mjs" --port 5261 &  node "$T/contact.mjs" "$RAW/contact" --port 5261
du -sh public/assets/textures public/assets/hdri
