#!/bin/sh
# Regenerates all textures, assets and data. Needs Python 3 with Pillow and numpy, and the vanilla
# 1.21.11 client jar extracted somewhere (pass its root directory, containing assets/ and data/).
set -e
VANILLA="${1:?usage: tools/generate_all.sh <extracted vanilla client jar directory>}"
cd "$(dirname "$0")/.."
python3 tools/textures.py
python3 tools/gen_assets.py "$VANILLA/assets/minecraft"
python3 tools/gen_worldgen.py "$VANILLA/data/minecraft"
python3 tools/gen_mobs.py
