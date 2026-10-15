#!/bin/bash
# Download the Mixamo FBX clips listed in anim_sources.tsv from public GitHub repositories.
# usage: download_anim_sources.sh <outDir>
# Files tracked with git-lfs are fetched from media.githubusercontent.com, plain files from raw.githubusercontent.com.
# Keep the output OUTSIDE the repository (raw sources are not committed).
set -e
OUT=$1; mkdir -p "$OUT"
HERE=$(cd "$(dirname "$0")" && pwd)
grep -v '^#' "$HERE/anim_sources.tsv" | while IFS=$'\t' read -r tag repo path; do
  [ -z "$tag" ] && continue
  name=$(basename "$path" .fbx); name=${name// /_}; name=${name//@/_}
  f="$OUT/${tag}__${name}.fbx"
  [ -s "$f" ] && [ "$(head -c 18 "$f")" = "Kaydara FBX Binary" ] && continue
  u=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$path")
  for host in media.githubusercontent.com/media raw.githubusercontent.com; do
    curl -sSL "https://$host/$repo/HEAD/$u" -o "$f" < /dev/null || true
    [ "$(head -c 18 "$f")" = "Kaydara FBX Binary" ] && break
  done
  [ "$(head -c 18 "$f")" = "Kaydara FBX Binary" ] || { echo "FAILED $repo $path"; rm -f "$f"; }
done
echo "done: $(ls "$OUT"/*.fbx | wc -l) files in $OUT"
