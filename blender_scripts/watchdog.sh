#!/bin/bash
# kill the newest blender render if available memory gets dangerously low
while true; do
  av=$(free -m | awk '/Mem/{print $7}')
  if [ "$av" -lt 900 ]; then
    p=$(pgrep -n -f "^/opt/blender/blender-4.5.15-linux-x64/blender")
    [ -n "$p" ] && kill $p && echo "$(date +%H:%M:%S) killed $p avail=$av"
    sleep 20
    find /opt/work/frames -name 'f_*.png' -size 0 -mmin +0 -delete
  fi
  sleep 3
done
