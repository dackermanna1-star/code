#!/usr/bin/env bash
# Run every benchmark and print the RESULT lines (usage: bash tools/bench/all.sh)
cd "$(dirname "$0")/../.."
for b in idle push throws getup lethality; do node tools/bench/$b.mjs | grep '^RESULT'; done
