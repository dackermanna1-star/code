#!/bin/bash
# Double-click to re-open the most recent report without searching again.
cd "$(dirname "$0")" || exit 1
if [ -f output/jobs.html ]; then
  open output/jobs.html
else
  echo "No report yet - double-click 'Find Jobs' first."
  read -r -p "Press Return to close this window."
fi
