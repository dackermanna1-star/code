#!/bin/sh
# Development helper: sample terrain height and biomes of a world type over a large area.
#   tools/dev/survey.sh <preset> [seed] [extent_blocks] [step]
set -e
PRESET="${1:?preset}"
SEED="${2:-12345}"
EXTENT="${3:-8192}"
STEP="${4:-16}"
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
view-distance=3
simulation-distance=3
max-tick-time=-1
PROPS
OUT="survey_${PRESET}_${SEED}.bin"
./gradlew --no-daemon -q runMapDump -Psurvey=$EXTENT -PsurveyStep=$STEP -PmapOut=$OUT
python3 tools/dev/render_survey.py $RUN/$OUT build/maps/${PRESET}_${SEED}
