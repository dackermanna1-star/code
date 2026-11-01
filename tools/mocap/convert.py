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
    ('sideL', '141_33', 'cycle', (4.6, 8.0)),
    ('sideR', '141_33', 'cycle', (0.8, 3.4)),
]
CYCLE_N = 40   # samples per gait cycle
LOOP_FPS = 60
SEAM = 0.25    # loop seams: the last quarter of a cycle cross-fades into the stride before it
IDLE_SEAM = 0.45  # (s) the same for the idle loop


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
        for s in range(int(IDLE_SEAM * fps), n - int(1.8 * fps), 6):
            for L in range(int(1.8 * fps), int(3.0 * fps), 6):
                e = s + L
                if e >= n:
                    break
                # (the seam cross-fades in the moments before the window: those must be calm too)
                pre = s - int(IDLE_SEAM * fps)
                if wr[pre:e].max() > 4.5 or hv[pre:e].max() > 0.9:
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
        def cyc_frame(u):
            # u in [-1, 1): the stride, or (u < 0) the one before it, against the same moving root
            fi = max(0.0, s + u * (e - s))
            i0 = int(math.floor(fi))
            t = fi - i0
            root = p0 + travel * u
            f0 = frame_out(P, R, i0, root, yaw, leg, arm, stand_hip, ankle_flat)
            f1 = frame_out(P, R, min(n - 1, i0 + 1), root, yaw, leg, arm, stand_hip, ankle_flat)
            f = blend(f0, f1, t)
            f['cL'] = float(cL[int(round(fi))])
            f['cR'] = float(cR[int(round(fi))])
            return f
        frames = [cyc_frame(k / CYCLE_N) for k in range(CYCLE_N)]
        # seamless: the end of the stride cross-fades into the end of the stride before it, which
        # runs straight on into this stride's start - so the loop is continuous in position AND
        # velocity (spreading the end-vs-start mismatch over the cycle left a kink at the seam)
        for k in range(CYCLE_N):
            u = k / CYCLE_N
            if u > 1 - SEAM:
                w = smooth01((u - (1 - SEAM)) / SEAM)
                frames[k] = blend_frames(frames[k], cyc_frame(u - 1), w)
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
        pre = min(s, int(IDLE_SEAM * fps))
        yraw = np.unwrap(np.array([yaw_of(chf[i]) for i in range(s - pre, e + 1)]))
        half = int(0.4 * fps)
        ysm = np.array([yraw[max(0, i - half):min(len(yraw), i + half + 1)].mean() for i in range(len(yraw))])
        nfr = int(round(T * LOOP_FPS))
        def idle_frame(fi):
            i0 = int(math.floor(fi))
            t = fi - i0
            j = i0 - (s - pre)
            yaw = float(ysm[j] * (1 - t) + ysm[min(len(ysm) - 1, j + 1)] * t)
            f0 = frame_out(P, R, i0, root, yaw, leg, arm, stand_hip, ankle_flat)
            f1 = frame_out(P, R, min(e, i0 + 1), root, yaw, leg, arm, stand_hip, ankle_flat)
            f = blend(f0, f1, t)
            f['cL'] = float(cL[int(round(fi))])
            f['cR'] = float(cR[int(round(fi))])
            return f
        frames = [idle_frame(s + (k / nfr) * (e - s)) for k in range(nfr)]
        # seamless loop (as for the cycles): the end cross-fades into what came before the start
        ov = pre / fps
        for k in range(nfr):
            tt = (k / nfr) * T
            if tt > T - ov:
                w = smooth01((tt - (T - ov)) / ov)
                frames[k] = blend_frames(frames[k], idle_frame(s + (k / nfr) * (e - s) - (e - s)), w)
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
            f['hp'][1] = mean + (f['hp'][1] - mean) * 0.65 + 0.08
        meta = {'kind': 'loop', 'dur': T, 'speed': 0.0, 'dir': [0.0, 1.0]}
    normalise_posture(name, frames)
    shorten_steps(name, frames, meta)
    turn_feet(name, frames)
    calm(name, frames)
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


def smooth01(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def blend_frames(a, b, t):
    """Blend two full frames (tracks + contacts from the dominant one)."""
    o = blend(a, b, t)
    src = a if t < 0.5 else b
    o['cL'], o['cR'] = src['cL'], src['cR']
    return o


# One consistent posture for every clip (degrees: pelvis tilt / chest lean, + = forward), upright
# side to side. The subjects stand differently
# (one backs away and side-steps with a tipped pelvis, another hunches forward, others carry one
# hip higher); blending between them made the pelvis rock and the backside stick out. Each clip
# keeps its own motion around these averages.
# The last number lowers the hips (in leg lengths) of the stiff-legged walkers: the subject who
# walks backwards and side-steps keeps his knees all but locked (median extension 0.99), which on a
# fighter reads as a pole-vaulting bob; a little lower, the same steps are taken on soft knees.
# (The boxer's crouch comes up a little instead.)
# Pelvis, lower back (our spine bone) and chest are each set: the subjects all bend forward at the
# lower back (10-20 degrees more than the pelvis), which on this skeleton folds the belly forward
# and pushes the backside out. A fighter's posture: hips tucked, lower back upright, the shoulders
# rounded over the guard.
POSTURE = {
    'idle': (-2, 3, 10, 0.02), 'walk': (-1, 2, 4, -0.02), 'back': (-1, 1, 3, -0.045), 'sideL': (-1, 2, 5, -0.05), 'sideR': (-1, 2, 5, -0.05),
    'jog': (2, 5, 8, 0), 'run': (4, 8, 11, 0), 'sprint': (4, 9, 12, 0),
}


# (horizontal, vertical) scale of the hips' motion about their average
SWAY = {'sideL': (0.65, 0.6), 'sideR': (0.65, 0.6), 'back': (1.0, 0.7)}


def rot_x(deg):
    a = math.radians(deg) / 2
    return np.array([math.sin(a), 0.0, 0.0, math.cos(a)])


def qrot(q, v):
    x, y, z, w = q
    u = np.array([x, y, z])
    v = np.array(v, dtype=float)
    return v + 2 * np.cross(u, np.cross(u, v) + w * v)


def rot_z(deg):
    a = math.radians(deg) / 2
    return np.array([0.0, 0.0, math.sin(a), math.cos(a)])


def lean_of(q):
    up = qrot(q, (0, 1, 0))
    return math.degrees(math.atan2(up[2], up[1]))


def roll_of(q):
    """Sideways lean of the up axis (+ = towards +X, the left)."""
    up = qrot(q, (0, 1, 0))
    return math.degrees(math.atan2(up[0], up[1]))


# Side-steps as a fighter's shuffle: (step length, stance width, cycle time) relative to the
# subject's big, slow foot-to-foot strides (0.7 m a cycle, the feet a metre apart at full stretch).
STEPS = {'sideL': (0.55, 0.8, 0.8), 'sideR': (0.55, 0.8, 0.8)}


def shorten_steps(name, frames, meta):
    if name not in STEPS:
        return
    step, width, tscale = STEPS[name]
    for key in ('aL', 'aR', 'kL', 'kR'):
        m = [sum(f[key][j] for f in frames) / len(frames) for j in (0, 2)]
        for f in frames:
            v = f[key]
            f[key] = [m[0] * width + (v[0] - m[0]) * step, v[1], m[1] * width + (v[2] - m[1]) * step]
    for f in frames:
        f['hp'] = [f['hp'][0] * step, f['hp'][1], f['hp'][2] * step]
    meta['dur'] *= tscale
    meta['speed'] *= step / tscale
    print(f'  steps {name}: x{step} long, x{width} wide, x{tscale} cycle -> {meta["dur"]:.2f}s, {meta["speed"]:.2f} legs/s')


# The boxer bounces hard (hips pumping 9 cm up and down, rocking 15 degrees): as the stance every
# idle fighter shows, that reads as the hips popping in and out. Same rhythm, calmer: (horizontal
# and vertical scale of the hips' travel, scale of the pelvis / spine / neck / head swing).
CALM = {'idle': (0.6, 0.7, 0.6)}


def calm(name, frames):
    if name not in CALM:
        return
    kh, kv, kr = CALM[name]
    n = len(frames)
    m = [sum(f['hp'][j] for f in frames) / n for j in range(3)]
    for f in frames:
        h = f['hp']
        f['hp'] = [m[0] + (h[0] - m[0]) * kh, m[1] + (h[1] - m[1]) * kv, m[2] + (h[2] - m[2]) * kh]
    for k in ('hq', 'sp', 'ch', 'nk', 'hd'):
        qs = [np.array(f[k]) for f in frames]
        ref = qs[0]
        qs = [q if np.dot(q, ref) >= 0 else -q for q in qs]
        mean = sum(qs) / n
        mean = mean / np.linalg.norm(mean)
        for f, q in zip(frames, qs):
            f[k] = qslerp(mean, q, kr)


def foot_yaw(q):
    """Heading of a foot (degrees, + = towards +X) and how flat it is (1 flat .. 0 vertical)."""
    fw = qrot(q, (0, 0, 1))
    L = math.hypot(fw[0], fw[2])
    return math.degrees(math.atan2(fw[0], fw[2])), min(1.0, max(0.0, (L - 0.5) / 0.35))


def rot_y(deg):
    a = math.radians(deg) / 2
    return np.array([0.0, math.sin(a), 0.0, math.cos(a)])


def turn_feet(name, frames):
    """Feet turned slightly out on average in every gait (the side-stepper walked pigeon-toed, the
    sprinter duck-footed; a bent knee follows the toes, so toes in made the knees knock). One turn
    per foot and clip (measured where the foot is near flat - a foot pointing at the floor has no
    heading), so the swing's own twist is untouched."""
    if name == 'idle':
        return
    for side, want in (('L', 8.0), ('R', -8.0)):
        ys = [foot_yaw(f['f' + side]) for f in frames]
        m = sum(y * w for y, w in ys) / max(1e-6, sum(w for _, w in ys))
        q = rot_y(want - m)
        for f in frames:
            f['f' + side] = qmul(q, np.array(f['f' + side]))
        print(f'  feet {name} {side}: toes {m:+.1f} -> {want:+.0f}')


def normalise_posture(name, frames):
    if name not in POSTURE:
        return
    want_p, want_s, want_c, lower = POSTURE[name]
    hips = [np.array(f['hq']) for f in frames]
    spineW = [qmul(h, np.array(f['sp'])) for h, f in zip(hips, frames)]
    chestW = [qmul(sw, np.array(f['ch'])) for sw, f in zip(spineW, frames)]
    mp = sum(lean_of(q) for q in hips) / len(hips)
    mc = sum(lean_of(q) for q in chestW) / len(chestW)
    ms = sum(lean_of(q) for q in spineW) / len(spineW)
    rp = sum(roll_of(q) for q in hips) / len(hips)
    rs = sum(roll_of(q) for q in spineW) / len(spineW)
    rc = sum(roll_of(q) for q in chestW) / len(chestW)
    Cp = qmul(rot_x(want_p - mp), rot_z(rp))
    Cs = qmul(rot_x(want_s - ms), rot_z(rs))
    Cc = qmul(rot_x(want_c - mc), rot_z(rc))
    for f, h, sw, cw in zip(frames, hips, spineW, chestW):
        h2, s2, c2 = qmul(Cp, h), qmul(Cs, sw), qmul(Cc, cw)
        f['hq'] = h2
        f['sp'] = qmul(qinv(h2), s2)
        f['ch'] = qmul(qinv(s2), c2)
    # the body centred over the root on average (one subject drifted, carrying the hips 3-4 cm
    # off): the hips, ankles and knees move together, so the balance over the feet is unchanged
    mx = sum(f['hp'][0] for f in frames) / len(frames)
    mz = sum(f['hp'][2] for f in frames) / len(frames)
    for f in frames:
        for k in ('hp', 'aL', 'aR', 'kL', 'kR'):
            f[k] = [f[k][0] - mx, f[k][1], f[k][2] - mz]
    # a fighter's shuffle carries the hips steadier than the step-together walker, whose pelvis
    # surges sideways with each step and rises and falls with his locked knees
    sh, sv = SWAY.get(name, (1.0, 1.0))
    my = sum(f['hp'][1] for f in frames) / len(frames)
    for f in frames:
        f['hp'] = [f['hp'][0] * sh, my + (f['hp'][1] - my) * sv + lower, f['hp'][2] * sh]
    print(f'  posture {name}: pelvis {mp:+.1f} -> {want_p:+.0f}, lower back {ms:+.1f} -> {want_s:+.0f}, chest {mc:+.1f} -> {want_c:+.0f} (rolls {rp:+.1f} {rs:+.1f} {rc:+.1f} -> 0), hips centred by {mx:+.3f},{mz:+.3f}')


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
