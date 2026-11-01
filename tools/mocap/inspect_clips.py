"""Print per-second root speed / heading / foot heights for CMU clips (to pick cycles)."""
import sys, os, math
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cmu import read_asf, read_amc, fk

src = sys.argv[1]
for clip in sys.argv[2:]:
    subj = clip.split('_')[0]
    bones = read_asf(os.path.join(src, subj + '.asf'))
    frames = read_amc(os.path.join(src, clip + '.amc'))
    fps = 120
    P = [fk(bones, f) for f in frames[::4]]  # 30 fps
    hip = np.array([p[0]['root'] for p in P])
    la = np.array([p[0]['ltibia'] for p in P])
    ra = np.array([p[0]['rtibia'] for p in P])
    lw = np.array([p[0]['lradius'] for p in P])
    rw = np.array([p[0]['rradius'] for p in P])
    fwd = np.array([p[1]['root'] @ np.array([0, 0, 1.0]) for p in P])
    floor = min(la[:, 1].min(), ra[:, 1].min())
    print(f"== {clip}: {len(frames)} frames ({len(frames)/fps:.1f}s) hipY={np.median(hip[:,1]-floor):.2f} floor={floor:.3f}")
    for s in range(0, len(P) - 30, 30):
        seg = slice(s, s + 30)
        v = np.linalg.norm(hip[s + 29, [0, 2]] - hip[s, [0, 2]]) / (29 / 30)
        hd = math.degrees(math.atan2(fwd[s + 15, 0], fwd[s + 15, 2]))
        mv = hip[s + 29] - hip[s]
        md = math.degrees(math.atan2(mv[0], mv[2])) if np.linalg.norm(mv[[0, 2]]) > 0.05 else float('nan')
        wsp = (np.linalg.norm(np.diff(lw[seg], axis=0), axis=1).max() + np.linalg.norm(np.diff(rw[seg], axis=0), axis=1).max()) * 30
        print(f"  t={s/30:5.1f}s speed={v:4.2f} face={hd:6.0f} move={md:6.0f} footY L={la[seg,1].min()-floor:.2f}..{la[seg,1].max()-floor:.2f} R={ra[seg,1].min()-floor:.2f}..{ra[seg,1].max()-floor:.2f} wristMax={wsp:4.1f} hipY={hip[s+15,1]-floor:.2f}")
