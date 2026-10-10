#!/bin/sh
# Development helper: render in-game screenshots of world types with the client game test.
# Runs the real client under Xvfb with Mesa software OpenGL when no display is available.
#   tools/dev/screenshots.sh [presets comma separated] [seed] [render distance]
# With ZOO=true it photographs every animal of each world instead of the landscapes.
set -e
cd "$(dirname "$0")/../.."
SHOTS="${1:-african_savanna,sahara_desert,amazon_rainforest,mongolian_steppe}"
SEED="${2:-12345}"
RD="${3:-12}"
export LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe MESA_GL_VERSION_OVERRIDE=4.5 MESA_GLSL_VERSION_OVERRIDE=450
xvfb-run -a -s "-screen 0 1280x720x24" ./gradlew --no-daemon runClientGameTest \
	-Pearthscapes.shots="$SHOTS" -Pearthscapes.seed="$SEED" -Pearthscapes.renderDistance="$RD" -Pearthscapes.zoo="${ZOO:-false}"
ls -1 build/run/clientGameTest/screenshots/ 2>/dev/null | tail -40
