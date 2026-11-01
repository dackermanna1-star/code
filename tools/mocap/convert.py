"""Convert selected CMU mocap clips into compact locomotion tracks for the player character.

Usage: python3 -I tools/mocap/convert.py <dir with CMU .asf/.amc> <out.json>

Each clip becomes either a gait *cycle* (one stride, left foot down to left foot down, made
seamless) or an idle *loop*. Frames are expressed in the character's root space (X left, Y up,
Z forward, root on the floor under the hips) and normalised by the CMU subject's leg / arm length
so they retarget onto any body: hips offset and rotation, spine/chest/neck/head local rotations,
ankle targets with foot rotation and toe bend, knees (IK poles), wrists and elbows relative to the
shoulders in chest space, and foot contacts (for foot locking).
"""
import sys, os, math, json
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cmu import read_asf, read_amc, fk

SRC, OUT = sys.argv[1], sys.argv[2]

# name, CMU trial, kind, window (s) or None
CLIPS = [
    ('idle', ['13_17', '14_01', '17_10'], 'loop', None),
    ('walk', '35_01', 'cycle', None),
    ('jog', '35_17', 'cycle', None),
    ('run', '16_46', 'cycle', None),
    ('sprint', '09_06', 'cycle', None),
    ('back', '141_31', 'cycle', (0.2, 1.9)),
    ('sideL', '143_40', 'cycle', (1.0, 3.6)),
    ('sideR', '143_40', 'cycle', (4.6, 7.2)),
]
CYCLE_N = 40   # samples per gait cycle
LOOP_FPS = 30


def ry(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def mat2quat(m):
    t = m[0, 0] + m[1, 1] + m[2, 2]
    if t > 0:
        s = math.sqrt(t + 1.0) * 2
        w, x, y, z = 0.25 * s, (m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = math.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
        w, x, y, z = (m[2, 1] - m[1, 2]) / s, 0.25 * s, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s
    elif m[1, 1] > m[2, 2]:
        s = math.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
        w, x, y, z = (m[0, 2] - m[2, 0]) / s, (m[0, 1] + m[1, 0]) / s, 0.25 * s, (m[1, 2] + m[2, 1]) / s
    else:
        s = math.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
        w, x, y, z = (m[1, 0] - m[0, 1]) / s, (m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, 0.25 * s
    q = np.array([x, y, z, w])
    return q / np.linalg.norm(q)


def qmul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return np.array([aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz])


def qinv(q):
    return np.array([-q[0], -q[1], -q[2], q[3]])


def qslerp(a, b, t):
    d = float(np.dot(a, b))
    if d < 0:
        b, d = -b, -d
    if d > 0.9995:
        r = a + (b - a) * t
        return r / np.linalg.norm(r)
    th = math.acos(min(1.0, d))
    s = math.sin(th)
    return (math.sin((1 - t) * th) * a + math.sin(t * th) * b) / s


def yaw_of(v):
    return math.atan2(v[0], v[2])


def circ_mean(angles):
    return math.atan2(np.mean(np.sin(angles)), np.mean(np.cos(angles)))


JOINTS = {
    'hips': 'root', 'hipL': 'lhipjoint', 'hipR': 'rhipjoint', 'kneeL': 'lfemur', 'kneeR': 'rfemur',
    'ankleL': 'ltibia', 'ankleR': 'rtibia', 'ballL': 'lfoot', 'ballR': 'rfoot', 'toeL': 'ltoes', 'toeR': 'rtoes',
    'chest': 'thorax', 'neck': 'upperneck', 'head': 'head', 'shL': 'lclavicle', 'shR': 'rclavicle',
    'elL': 'lhumerus', 'elR': 'rhumerus', 'wrL': 'lradius', 'wrR': 'rradius', 'handL': 'lhand', 'handR': 'rhand',
}
ROTS = {'hips': 'root', 'spine': 'upperback', 'chest': 'thorax', 'neck': 'lowerneck', 'head': 'head', 'footL': 'lfoot', 'footR': 'rfoot', 'toesL': 'ltoes', 'toesR': 'rtoes'}


def load(trial):
    subj = trial.split('_')[0]
    bones = read_asf(os.path.join(SRC, subj + '.asf'))
    frames = read_amc(os.path.join(SRC, trial + '.amc'))
    P = {k: [] for k in JOINTS}
    R = {k: [] for k in ROTS}
    for f in frames[::2]:  # 60 fps
        pos, rot = fk(bones, f)
        for k, b in JOINTS.items():
            P[k].append(pos[b])
        for k, b in ROTS.items():
            R[k].append(rot[b])
    P = {k: np.array(v) for k, v in P.items()}
    R = {k: np.array(v) for k, v in R.items()}
    leg = bones['lfemur'].length + bones['ltibia'].length
    arm = bones['lhumerus'].length + bones['lradius'].length
    # vertical drop from the root (pelvis) to the hip sockets
    hj = bones['lhipjoint']
    drop = -hj.direction[1] * hj.length
    return P, R, leg, arm, 60.0, drop


def contacts(P, side, floor):
    ball = P['ball' + side]
    ank = P['ankle' + side]
    v = np.zeros(len(ball))
    v[1:] = np.linalg.norm(np.diff(ball[:, [0, 2]], axis=0), axis=1) * 60
    low = (ball[:, 1] - floor < 0.04) | (ank[:, 1] - floor < 0.12)
    c = (low & (v < 0.8)).astype(float)
    # close 1-frame gaps
    for i in range(1, len(c) - 1):
        if c[i - 1] and c[i + 1]:
            c[i] = 1
    return c


def frame_out(P, R, i, root, yaw, leg, arm, stand_hip, ankle_flat):
    """One output frame in normalised root space."""
    Rinv = ry(-yaw)
    def rs(p):
        d = p - np.array([root[0], 0, root[1]])
        return Rinv @ d
    o = {}
    h = rs(P['hips'][i])
    o['hp'] = [h[0] / leg, (P['hips'][i][1] - stand_hip) / leg, h[2] / leg]
    W = {k: Rinv @ R[k][i] for k in ROTS}
    q = {k: mat2quat(W[k]) for k in W}
    o['hq'] = q['hips']
    o['sp'] = qmul(qinv(q['hips']), q['spine'])
    o['ch'] = qmul(qinv(q['spine']), q['chest'])
    o['nk'] = qmul(qinv(q['chest']), q['neck'])
    o['hd'] = qmul(qinv(q['neck']), q['head'])
    for s in 'LR':
        a = rs(P['ankle' + s][i])
        o['a' + s] = [a[0] / leg, (P['ankle' + s][i][1] - ankle_flat) / leg, a[2] / leg]
        o['f' + s] = q['foot' + s]
        rel = qmul(qinv(q['foot' + s]), q['toes' + s])
        # toe bend about the foot's X axis (+ = toes up)
        o['t' + s] = math.degrees(2 * math.atan2(rel[0], rel[3]))
        k = rs(P['knee' + s][i])
        o['k' + s] = [k[0] / leg, P['knee' + s][i][1] / leg, k[2] / leg]
        # arm relative to the shoulder, in chest space, normalised by arm length
        Wc = W['chest']
        sh = Rinv @ P['sh' + s][i]
        def cs(p):
            return Wc.T @ (Rinv @ p - sh)
        w = cs(P['wr' + s][i])
        e = cs(P['el' + s][i])
        hd = cs(P['hand' + s][i]) - w
        o['w' + s] = [w[0] / arm, w[1] / arm, w[2] / arm]
        o['e' + s] = [e[0] / arm, e[1] / arm, e[2] / arm]
        n = np.linalg.norm(hd)
        o['d' + s] = list(hd / n) if n > 1e-6 else [0, -1, 0]
    return o


def find_idle(trials):
    """The calmest, best-closing stance loop across several boxing sessions (no punches, no
    walking off, no ducking, little turning)."""
    best = None
    for trial in trials:
        P, R, leg, arm, fps, drop = load(trial)
        n = len(P['hips'])
        wr = np.maximum(np.r_[0, np.linalg.norm(np.diff(P['wrL'], axis=0), axis=1)], np.r_[0, np.linalg.norm(np.diff(P['wrR'], axis=0), axis=1)]) * fps
        hv = np.r_[0, np.linalg.norm(np.diff(P['hips'][:, [0, 2]], axis=0), axis=1)] * fps
        chf = np.array([R['chest'][i] @ np.array([0, 0, 1.0]) for i in range(n)])
        yaw = np.unwrap(np.arctan2(chf[:, 0], chf[:, 2]))
        def pose(i):
            return np.concatenate([P[k][i] - P['hips'][i] for k in ('ankleL', 'ankleR', 'kneeL', 'kneeR', 'wrL', 'wrR', 'head')] + [[P['hips'][i][1]]])
        for s in range(0, n - int(1.8 * fps), 6):
            for L in range(int(1.8 * fps), int(3.0 * fps), 6):
                e = s + L
                if e >= n:
                    break
                if wr[s:e].max() > 4.5 or hv[s:e].max() > 0.9:
                    continue
                yr = yaw[s:e].max() - yaw[s:e].min()
                if yr > math.radians(45):
                    continue
                err = np.linalg.norm(pose(s) - pose(e)) + 0.5 * np.linalg.norm(P['hips'][e][[0, 2]] - P['hips'][s][[0, 2]])
                hy = P['hips'][s:e, 1]
                depth = max(0.0, (np.percentile(P['hips'][:, 1], 90) - hy.mean()) / leg - 0.08)
                score = err + 6.0 * np.std(hy) + 3.0 * depth + 1.2 * yr - 0.02 * L / fps
                if best is None or score < best[0]:
                    best = (score, trial, s / fps, e / fps)
    print('idle pick', best)
    return best[1], (best[2], best[3])


def process(name, trial, kind, window):
    if isinstance(trial, list):
        trial, window = find_idle(trial)
    P, R, leg, arm, fps, drop = load(trial)
    n = len(P['hips'])
    low = np.minimum(np.minimum(P['ballL'][:, 1], P['ballR'][:, 1]), np.minimum(P['toeL'][:, 1], P['toeR'][:, 1]))
    floor = float(np.percentile(low, 3))
    # standing reference: flat ankle, straight vertical legs, pelvis above the hip sockets
    ankle_flat = np.percentile(np.concatenate([P['ankleL'][:, 1], P['ankleR'][:, 1]]), 5)
    stand_hip = ankle_flat + leg + drop
    a, b = 0, n
    if window:
        a, b = int(window[0] * fps), min(n, int(window[1] * fps))
    cL = contacts(P, 'L', floor)
    cR = contacts(P, 'R', floor)
    fwd = np.array([R['hips'][i] @ np.array([0, 0, 1.0]) for i in range(n)])
    chf = np.array([R['chest'][i] @ np.array([0, 0, 1.0]) for i in range(n)])
    if kind == 'cycle':
        downsL = [i for i in range(max(a, 1), b) if cL[i] and not cL[i - 1]]
        downsR = [i for i in range(max(a, 1), b) if cR[i] and not cR[i - 1]]
        best = None
        # a stride from one touchdown of either foot to its next; it must contain a left touchdown
        for downs in (downsL, downsR):
            for j in range(len(downs) - 1):
                s, e = downs[j], downs[j + 1]
                if e - s < 0.45 * fps or e - s > 1.8 * fps:
                    continue
                inner = [i for i in downsL if s <= i < e]
                if not inner:
                    continue
                # the stride whose ends match best (pose of the legs relative to the hips)
                def legs(i):
                    return np.concatenate([P[k][i] - P['hips'][i] for k in ('ankleL', 'ankleR', 'kneeL', 'kneeR')])
                err = np.linalg.norm(legs(s) - legs(e))
                mid = abs((s + e) / 2 - (a + b) / 2) / fps
                score = err + 0.05 * mid
                if best is None or score < best[0]:
                    best = (score, s, e, inner[0])
        if best is None:
            raise SystemExit(f'{name}: no clean cycle in {trial} {window} (downs L={downsL} R={downsR})')
        _, s, e, lDown = best
        T = (e - s) / fps
        p0, p1 = P['hips'][s][[0, 2]], P['hips'][e][[0, 2]]
        travel = p1 - p0
        speed = np.linalg.norm(travel) / T
        yaw = circ_mean(np.array([yaw_of(0.5 * (fwd[i] + chf[i])) for i in range(s, e)]))
        frames = []
        for k in range(CYCLE_N):
            u = k / CYCLE_N
            fi = s + u * (e - s)
            i0 = int(math.floor(fi))
            i1 = min(e, i0 + 1)
            t = fi - i0
            root = p0 + travel * u
            f0 = frame_out(P, R, i0, root, yaw, leg, arm, stand_hip, ankle_flat)
            f1 = frame_out(P, R, i1, root, yaw, leg, arm, stand_hip, ankle_flat)
            f = blend(f0, f1, t)
            f['cL'] = float(cL[int(round(fi))])
            f['cR'] = float(cR[int(round(fi))])
            frames.append(f)
        # seamless: spread the end-vs-start mismatch over the cycle
        last = frame_out(P, R, e, p1, yaw, leg, arm, stand_hip, ankle_flat)
        loop_fix(frames, last)
        # every cycle starts at the left foot's touchdown (phase-synchronised blending)
        shift = int(round((lDown - s) / (e - s) * CYCLE_N)) % CYCLE_N
        frames = frames[shift:] + frames[:shift]
        tv = ry(-yaw) @ np.array([travel[0], 0, travel[1]])
        meta = {'kind': 'cycle', 'dur': T, 'speed': speed / leg, 'dir': [tv[0] / (np.linalg.norm(tv) + 1e-9), tv[2] / (np.linalg.norm(tv) + 1e-9)]}
    else:
        # idle loop over the chosen window; the facing follows the boxer's slow turning (smoothed
        # over ~0.8 s) so the stance stays square to the opponent while the sway remains
        s, e = a, b
        T = (e - s) / fps
        root = P['hips'][s:e][:, [0, 2]].mean(axis=0)
        yraw = np.unwrap(np.array([yaw_of(chf[i]) for i in range(s, e + 1)]))
        half = int(0.4 * fps)
        ysm = np.array([yraw[max(0, i - half):min(len(yraw), i + half + 1)].mean() for i in range(len(yraw))])
        nfr = int(round(T * LOOP_FPS))
        frames = []
        for k in range(nfr):
            fi = s + (k / nfr) * (e - s)
            i0 = int(math.floor(fi))
            t = fi - i0
            yaw = float(ysm[i0 - s] * (1 - t) + ysm[min(e, i0 + 1) - s] * t)
            f0 = frame_out(P, R, i0, root, yaw, leg, arm, stand_hip, ankle_flat)
            f1 = frame_out(P, R, min(e, i0 + 1), root, yaw, leg, arm, stand_hip, ankle_flat)
            f = blend(f0, f1, t)
            f['cL'] = float(cL[int(round(fi))])
            f['cR'] = float(cR[int(round(fi))])
            frames.append(f)
        last = frame_out(P, R, e, root, float(ysm[-1]), leg, arm, stand_hip, ankle_flat)
        loop_fix(frames, last)
        # the boxer's feet shuffle and pivot all the time (~2 m/s); as an idle that reads as
        # jitter, so the feet are planted at their average place and angle (heels lifted a
        # little), while the hips, trunk and guard keep all of the bounce and weight shifts
        for side in 'LR':
            for key in ('a' + side, 'k' + side):
                m = [sum(f[key][j] for f in frames) / len(frames) for j in range(3)]
                for f in frames:
                    f[key] = list(m)
            qs = np.array([np.array(f['f' + side]) for f in frames])
            ref = qs[0]
            qs = np.array([q if np.dot(q, ref) >= 0 else -q for q in qs])
            qm = qs.mean(axis=0)
            qm = qm / np.linalg.norm(qm)
            tm = sum(f['t' + side] for f in frames) / len(frames)
            for f in frames:
                f['f' + side] = qm
                f['t' + side] = tm
        for f in frames:
            f['cL'] = 1.0
            f['cR'] = 1.0
        # a lighter stance: less crouched, a softer bob
        mean = sum(f['hp'][1] for f in frames) / len(frames)
        for f in frames:
            f['hp'][1] = mean + (f['hp'][1] - mean) * 0.65 + min(0.0, 0.08 - (mean + 0.08) * 0.0)
            f['hp'][1] += 0.08
        meta = {'kind': 'loop', 'dur': T, 'speed': 0.0, 'dir': [0.0, 1.0]}
    print(f'{name:6s} {trial:7s} {meta["kind"]:5s} dur={meta["dur"]:.2f}s speed={meta["speed"] * leg:.2f}m/s ({meta["speed"]:.2f} legs/s) dir={meta["dir"][0]:+.2f},{meta["dir"][1]:+.2f} frames={len(frames)} leg={leg:.3f} arm={arm:.3f}')
    return {'name': name, 'source': 'CMU ' + trial, **meta, 'frames': [pack(f) for f in frames]}


VEC = ['hp', 'aL', 'aR', 'kL', 'kR', 'wL', 'wR', 'eL', 'eR', 'dL', 'dR']
QUAT = ['hq', 'sp', 'ch', 'nk', 'hd', 'fL', 'fR']
SCAL = ['tL', 'tR', 'cL', 'cR']


def blend(f0, f1, t):
    o = {}
    for k in VEC:
        o[k] = list(np.array(f0[k]) * (1 - t) + np.array(f1[k]) * t)
    for k in QUAT:
        o[k] = qslerp(np.array(f0[k]), np.array(f1[k]), t)
    for k in ('tL', 'tR'):
        o[k] = f0[k] * (1 - t) + f1[k] * t
    return o


def loop_fix(frames, last):
    n = len(frames)
    for k in VEC:
        if k == 'hp':
            continue
        d = np.array(frames[0][k]) - np.array(last[k])
        for i, f in enumerate(frames):
            f[k] = list(np.array(f[k]) + d * (i / n))
    d = np.array(frames[0]['hp']) - np.array(last['hp'])
    for i, f in enumerate(frames):
        f['hp'] = list(np.array(f['hp']) + d * (i / n))
    for k in QUAT:
        dq = qmul(np.array(frames[0][k]), qinv(np.array(last[k])))
        if dq[3] < 0:
            dq = -dq
        for i, f in enumerate(frames):
            part = qslerp(np.array([0, 0, 0, 1.0]), dq, i / n)
            f[k] = qmul(part, np.array(f[k]))
    for k in ('tL', 'tR'):
        d = frames[0][k] - last[k]
        for i, f in enumerate(frames):
            f[k] = f[k] + d * (i / n)


def pack(f):
    r = lambda v, p=4: [round(float(x), p) for x in v]
    o = {k: r(f[k]) for k in VEC}
    for k in QUAT:
        q = np.array(f[k])
        q = q / np.linalg.norm(q)
        o[k] = r(q)
    o['tL'] = round(float(f['tL']), 1)
    o['tR'] = round(float(f['tR']), 1)
    o['c'] = int(f['cL']) | (int(f['cR']) << 1)
    return o


out = {'about': 'Retargeting tracks derived from the CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu), created with funding from NSF EIA-0196217.', 'clips': [process(*c) for c in CLIPS]}
json.dump(out, open(OUT, 'w'), separators=(',', ':'))
print(OUT, round(os.path.getsize(OUT) / 1024), 'KB')
