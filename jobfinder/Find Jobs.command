#!/bin/bash
# Double-click this file on a Mac to search for jobs and open the report.
cd "$(dirname "$0")" || exit 1

echo "=============================================="
echo "  Job Finder - Reston / Herndon / Fairfax, VA"
echo "=============================================="
echo

if ! command -v python3 >/dev/null 2>&1 || ! python3 -c "import sys" >/dev/null 2>&1; then
  echo "Python 3 is needed (it's free and made by Apple/Python.org)."
  echo "A window may pop up offering to install 'Command Line Developer Tools' - click Install,"
  echo "wait for it to finish, then double-click 'Find Jobs' again."
  xcode-select --install >/dev/null 2>&1
  echo
  read -r -p "Press Return to close this window."
  exit 1
fi

python3 jobfinder.py "$@"
status=$?
echo
if [ $status -ne 0 ]; then
  echo "Something went wrong (see the messages above)."
fi
read -r -p "Press Return to close this window."
