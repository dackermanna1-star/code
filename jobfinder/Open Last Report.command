#!/bin/bash
# Double-click to re-open the most recent reports without searching again.
cd "$(dirname "$0")" || exit 1
found=0
for f in output/jobs.html output/easy-jobs.html; do
  if [ -f "$f" ]; then open "$f"; found=1; fi
done
if [ $found -eq 0 ]; then
  echo "No report yet - double-click 'Find Jobs' or 'Find Easy Jobs' first."
  read -r -p "Press Return to close this window."
fi
