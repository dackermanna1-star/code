#!/bin/bash
# Render progress per shot: rendered/total (+ = done)
cd /home/user/code
python3 - <<'PY'
import json, os
shots = json.load(open('story/shots.json'))['shots']; tot = done = 0; row = []
for sid, t0, t1, *_ in shots:
    n = int(round((t1 - t0) * 30)); d = 'render/final/' + sid
    c = len([f for f in os.listdir(d) if f.endswith('.png')]) if os.path.isdir(d) else 0
    tot += n; done += min(c, n)
    row.append('%s %d/%d%s' % (sid, c, n, '+' if os.path.exists(d + '/.done') else ''))
print(' | '.join(row)); print('TOTAL %d/%d frames (%.1f%%)' % (done, tot, 100 * done / tot))
PY
