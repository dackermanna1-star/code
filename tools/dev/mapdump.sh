#!/bin/sh
# Development helper: generate a world type on a headless server and render top-down maps.
#   tools/dev/mapdump.sh <preset> [seed] [radius_chunks] [centre "x,z"]
# Example: tools/dev/mapdump.sh sahara_desert 12345 32
set -e
PRESET="${1:?preset, e.g. african_savanna}"
SEED="${2:-12345}"
RADIUS="${3:-24}"
CENTER="${4:-}"
cd "$(dirname "$0")/../.."
RUN=run-mapdump
mkdir -p $RUN
rm -rf $RUN/world
echo "eula=true" > $RUN/eula.txt
cat > $RUN/server.properties <<PROPS
level-type=earthscapes\:$PRESET
level-seed=$SEED
level-name=world
online-mode=false
spawn-protection=0
view-distance=4
simulation-distance=4
max-tick-time=-1
sync-chunk-writes=false
generate-structures=true
PROPS
OUT="map_${PRESET}_${SEED}.bin"
EXTRA=""
if [ -n "$CENTER" ]; then EXTRA="-PmapCenter=$CENTER"; fi
./gradlew --no-daemon -q runMapDump -PmapRadius=$RADIUS -PmapOut=$OUT $EXTRA
python3 tools/dev/render_map.py $RUN/$OUT build/maps/${PRESET}_${SEED}
