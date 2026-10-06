#!/usr/bin/env bash
# Dev helper: runs the real Minecraft client headlessly (Xvfb + Mesa) and executes a
# LaptopCraft screenshot script (see src/gametest/java/.../ScreenshotHarness.java).
#
#   scripts/screenshot.sh path/to/script.txt     # or: scripts/screenshot.sh - <<< "use;wait:80;shot:desktop"
#
# Screenshots land in build/lc-shots/. The full client log is written to build/lc-run.log.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build
if [ "${1:-}" = "-" ]; then
	cat > build/lc-script.txt
elif [ -n "${1:-}" ]; then
	cp "$1" build/lc-script.txt
fi
rm -rf build/lc-shots
export LIBGL_ALWAYS_SOFTWARE=1
export LP_NUM_THREADS=2
export MESA_GL_VERSION_OVERRIDE=4.5
export MESA_GLSL_VERSION_OVERRIDE=450
set +e
timeout "${LC_TIMEOUT:-900}" xvfb-run -a -s "-screen 0 1920x1080x24" \
	./gradlew runClientGameTest --no-configuration-cache -Dorg.gradle.jvmargs=-Xmx2G \
	> build/lc-run.log 2>&1
code=$?
set -e
grep -E "\[LC-HARNESS\]|Exception|Error|FAILED|BUILD" build/lc-run.log | grep -v "JAVA_TOOL" | tail -60 || true
echo "exit=$code; screenshots:"
ls -1 build/lc-shots 2>/dev/null || echo "(none)"
