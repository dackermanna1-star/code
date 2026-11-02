"""Turn martial-arts motion capture into the game's combat clips.

Usage: python3 -I tools/mocap/strikes.py <ACCAD Male2 BVH dir> <CMU dir> <out.json>

Sources: the ACCAD Open Motion Project's "Male2" martial-arts captures (BVH, CC BY 3.0) and the CMU
Graphics Lab database (ASF/AMC). Every entry in CLIPS cuts one strike (or dodge) out of a take and
writes it in the clip key format the runtime already plays (src/anim/clip.ts): a root track
(clip space, +Z towards the target), the pelvis offset and rotation, spine / chest / neck / head
rotations, hands relative to the shoulders in chest space (normalised by arm length, so any build
reaches the same way), elbow and knee poles, and feet (ankle positions, heading, pitch, toe bend)
normalised by leg length. Frames for the trunk come from joint *positions* (hips, shoulders, spine),
calibrated against a neutral standing frame so a standing pose maps onto the skeleton's rest pose;
the hands' roll and the head's facing come from the joints' rotations, calibrated the same way.
"""
import sys, os, math, json
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bvh import read_bvh, fk_bvh

ACCAD, CMU, OUT = sys.argv[1], sys.argv[2], sys.argv[3]

GAME_LEG = 0.85  # thigh + shin at scale 1

# game name: (source, striking limb, target region, options)
#   frame: 'strike' (+Z from the start towards where the limb lands) or 'facing' (the fighter's own
#          forward at the start: dodges, strikes at someone behind)
#   peak:  'ext' (furthest reach of the limb) or 'speed' (fastest moment + a beat: hooks)
#   mirror: swap left and right (an orthodox version of a southpaw take)
#   speed: time scale (>1 = faster)
CLIPS = {
    # ---- the fighters' hands
    'm_jab': ('accad:E1_JabLeft', 'lh', 'head', {'speed': 1.1}),
    'm_cross': ('accad:E4_CrossRight', 'rh', 'head', {'speed': 1.05}),
    'm_hook': ('accad:E5_HookLeft', 'lh', 'head', {'peak': 'speed'}),
    'm_rhook': ('accad:E6_HookRight', 'rh', 'head', {'peak': 'speed', 'speed': 1.15}),
    'm_uppercut': ('accad:E7_UppercutLeft', 'lh', 'jaw', {'peak': 'speed'}),
    'm_bodyhook': ('accad:E10_BodyHookRight', 'rh', 'gut', {'peak': 'speed', 'speed': 1.15}),
    'm_bodycross': ('accad:E14_BodyCrossRight', 'rh', 'gut', {}),
    'm_bodyjab': ('accad:E16_BodyJabLeft', 'lh', 'gut', {}),
    'm_backfist': ('accad:E11_BackfistLeft', 'lh', 'head', {}),
    # an elbow: the rear hook's whole body, the arm folded so the point of the elbow leads
    'm_elbow': ('accad:E6_HookRight', 'rh', 'head', {'peak': 'speed', 'speed': 1.15, 'fold': True}),
    # ---- kicks
    'm_frontkick': ('accad:G17_PushKickLeft', 'lf', 'gut', {'speed': 1.3}),
    'm_frontkick_r': ('accad:G2_FrontKick', 'rf', 'gut', {'speed': 1.1}),
    'm_roundhouse': ('accad:G9_RoundhouseRight', 'rf', 'head', {'speed': 1.15}),
    'm_roundhouse_l': ('accad:G10_RoundhouseLeadingLeft', 'lf', 'head', {'speed': 1.15}),
    'm_bodykick': ('accad:G15_RoundhouseBodyRight', 'rf', 'gut', {'speed': 1.15}),
    'm_sidekick': ('accad:G1_SidekickLeadingLeft', 'lf', 'chest', {'speed': 1.2}),
    'm_axekick': ('accad:G6_AxeKick', 'rf', 'head', {'speed': 1.1}),
    'm_spinkick': ('accad:G4_SpinningBackKick', 'lf', 'gut', {'spin': True, 'speed': 1.1}),
    'm_spinhook': ('accad:G19_ReverseSpinCrescentLeft', 'lf', 'head', {'spin': True, 'speed': 1.1}),
    'm_crescent': ('accad:G13_CrescentRight', 'rf', 'head', {'speed': 1.15}),
    # ---- the street's attacks: the same captures, started earlier and a touch slower, so the
    #      wind-up reads (the player needs the warning to counter)
    'me_punch': ('accad:E4_CrossRight', 'rh', 'head', {'lead': 0.3, 'speed': 0.8}),
    'me_haymaker': ('accad:E6_HookRight', 'rh', 'head', {'peak': 'speed', 'lead': 0.32, 'speed': 0.78}),
    'me_kick': ('accad:G2_FrontKick', 'rf', 'gut', {'lead': 0.22, 'speed': 0.85}),
    'me_jab': ('accad:E1_JabLeft', 'lh', 'head', {'lead': 0.3, 'speed': 0.85}),
    'me_heavy': ('accad:E4_CrossRight', 'rh', 'head', {'lead': 0.34, 'speed': 0.66}),
    # ---- footwork: the player's evasions - a quick step out to the side, a boxer's retreat
    'm_sidestep': ('accad:C24_QuickSidestepLeft', None, None, {'frame': 'facing', 'cut': (0.03, 0.95), 'speed': 1.45}),
    'm_retreat': ('accad:E6_QuickRetreat', None, None, {'frame': 'away', 'cut': (2.07, 2.8), 'speed': 1.35}),
}

ACCAD_J = {
    'pelvis': 'Hips', 'spine0': 'ToSpine', 'spine': 'Spine', 'chest': 'Spine1', 'neck': 'Neck', 'head': 'Head', 'top': 'Head_end',
    'clL': 'LeftShoulder', 'shL': 'LeftArm', 'elL': 'LeftForeArm', 'wrL': 'LeftHand', 'fiL': 'LeftHand_end',
    'clR': 'RightShoulder', 'shR': 'RightArm', 'elR': 'RightForeArm', 'wrR': 'RightHand', 'fiR': 'RightHand_end',
    'hipL': 'LeftUpLeg', 'knL': 'LeftLeg', 'anL': 'LeftFoot', 'baL': 'LeftToeBase', 'toL': 'LeftToeBase_end',
    'hipR': 'RightUpLeg', 'knR': 'RightLeg', 'anR': 'RightFoot', 'baR': 'RightToeBase', 'toR': 'RightToeBase_end',
}
ACCAD_ROT = {'handL': 'LeftHand', 'handR': 'RightHand', 'head': 'Head', 'footL': 'LeftFoot', 'footR': 'RightFoot'}


# ------------------------------------------------------------------ math
def norm(v):
    n = np.linalg.norm(v)
    return v / n if n > 1e-9 else v


def frame_from(x_hint, y_axis):
    """Orthonormal frame (columns X left, Y up, Z forward) from an up axis and a lateral hint."""
    y = norm(y_axis)
    x = norm(x_hint - y * np.dot(x_hint, y))
    z = np.cross(x, y)
    return np.stack([x, y, z], axis=1)


def euler_yxz(M):
    """Rotation matrix -> (pitch, yaw, roll) degrees for three.js Euler order 'YXZ'."""
    m23 = max(-1.0, min(1.0, M[1, 2]))
    x = math.asin(-m23)
    if abs(m23) < 0.9999999:
        y = math.atan2(M[0, 2], M[2, 2])
        z = math.atan2(M[1, 0], M[1, 1])
    else:
        y = math.atan2(-M[2, 0], M[0, 0])
        z = 0.0
    return [math.degrees(x), math.degrees(y), math.degrees(z)]


def ry(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def signed_angle(a, b, axis):
    a = norm(a - axis * np.dot(a, axis))
    b = norm(b - axis * np.dot(b, axis))
    return math.degrees(math.atan2(np.dot(np.cross(a, b), axis), np.dot(a, b)))


# ------------------------------------------------------------------ loading
class Take:
    """Joint positions (N x 3 per joint) and a few rotations (N x 3 x 3) in metres, Y up."""

    def __init__(self, P, R, fps):
        self.P, self.R, self.fps = P, R, fps
        self.n = len(next(iter(P.values())))

    def mirrored(self):
        """Swap left and right (reflect across the YZ plane of the take's own facing)."""
        # reflect X; a reflected rotation is M R M with the local axes' handedness kept by M on the right
        Mx = np.diag([-1.0, 1, 1])
        P2, R2 = {}, {}
        sw = lambda k: (k[:-1] + ('R' if k[-1] == 'L' else 'L')) if k[-1] in 'LR' and k not in ('pelvis',) else k
        for k, v in self.P.items():
            P2[sw(k)] = v * np.array([-1.0, 1, 1])
        for k, v in self.R.items():
            k2 = {'handL': 'handR', 'handR': 'handL', 'footL': 'footR', 'footR': 'footL'}.get(k, k)
            R2[k2] = np.einsum('ij,njk,kl->nil', Mx, v, Mx)
        return Take(P2, R2, self.fps)


def load_accad(name):
    joints, frames, ft, unit = read_bvh(os.path.join(ACCAD, f'Male2_{name}.bvh'))
    P = {k: [] for k in ACCAD_J}
    R = {k: [] for k in ACCAD_ROT}
    for f in frames:
        pos, rot = fk_bvh(joints, f, unit)
        for k, j in ACCAD_J.items():
            P[k].append(pos[j])
        for k, j in ACCAD_ROT.items():
            R[k].append(rot[j])
    return Take({k: np.array(v) for k, v in P.items()}, {k: np.array(v) for k, v in R.items()}, 1.0 / ft)


# ------------------------------------------------------------------ calibration (a neutral stand)
class Calib:
    def __init__(self, take, i=0):
        P, R = take.P, take.R
        g = lambda k: P[k][i]
        lat = g('hipL') - g('hipR')
        lat[1] = 0
        lat = norm(lat)
        F = frame_from(lat, np.array([0, 1.0, 0]))  # facing frame
        self.F = F
        floor = min(g('baL')[1], g('baR')[1], g('toL')[1], g('toR')[1])
        segs = self.segments(P, i)
        # each segment's frame at rest, relative to the facing frame: its offset from the identity
        self.off = {k: F.T @ v for k, v in segs.items()}
        # the head's lateral axis and the backs of the hands, in their joints' own frames
        self.headX = R['head'][i].T @ F[:, 0]
        self.off['head'] = F.T @ frame_from(R['head'][i] @ self.headX, g('top') - g('head'))
        self.backL = R['handL'][i].T @ F[:, 0]
        self.backR = R['handR'][i].T @ (-F[:, 0])
        self.leg = np.linalg.norm(g('hipL') - g('knL')) + np.linalg.norm(g('knL') - g('anL'))
        self.arm = np.linalg.norm(g('shL') - g('elL')) + np.linalg.norm(g('elL') - g('wrL'))
        self.standHip = g('pelvis')[1] - floor
        self.ankleFlat = 0.5 * (g('anL')[1] + g('anR')[1]) - floor
        self.ballFlat = 0.5 * (g('baL')[1] + g('baR')[1]) - floor
        self.footPitch = {s: self.pitch_of(g('an' + s), g('ba' + s)) for s in 'LR'}
        self.toeBend = {s: self.bend_of(g('an' + s), g('ba' + s), g('to' + s)) for s in 'LR'}
        # each foot's frame on the stand (left, up, forward along the sole, level), in its joint's
        # own frame: a foot's turn, pitch and roll come from its full rotation, not from the line
        # to the ball of the foot (which spins when the foot turns over in a kick's chamber)
        self.footOff = {}
        up = np.array([0, 1.0, 0])
        for s in 'LR':
            d = g('ba' + s) - g('an' + s)
            d[1] = 0
            self.footOff[s] = R['foot' + s][i].T @ frame_from(np.cross(up, norm(d)), up)

    @staticmethod
    def segments(P, i):
        g = lambda k: P[k][i]
        hipLat = g('hipL') - g('hipR')
        shLat = g('shL') - g('shR')
        return {
            'pelvis': frame_from(hipLat, g('spine') - g('pelvis')),
            'spine': frame_from(norm(hipLat) + norm(shLat), g('chest') - g('spine')),
            'chest': frame_from(shLat, g('neck') - g('chest')),
            'neck': frame_from(shLat, g('head') - g('neck')),
        }

    @staticmethod
    def pitch_of(an, ba):
        d = ba - an
        return math.degrees(math.asin(max(-1, min(1, -d[1] / max(1e-6, np.linalg.norm(d))))))

    @staticmethod
    def bend_of(an, ba, to):
        a, b = norm(ba - an), norm(to - ba)
        # positive when the toes bend up relative to the foot
        side = np.cross(a, np.array([0, 1.0, 0]))
        return signed_angle(a, b, norm(side) if np.linalg.norm(side) > 1e-6 else np.array([1.0, 0, 0]))


# ------------------------------------------------------------------ one clip
def speed(x, fps):
    v = np.zeros(len(x))
    v[1:] = np.linalg.norm(np.diff(x, axis=0), axis=1) * fps
    return v


def smooth(a, k=2):
    """Moving average (window 2k+1), edges clamped."""
    if k <= 0:
        return a
    out = np.copy(a)
    n = len(a)
    for i in range(n):
        lo, hi = max(0, i - k), min(n, i + k + 1)
        out[i] = a[lo:hi].mean(axis=0)
    return out


def pivot_offset(pitch):
    """The runtime's ankle offset (up, forward) for a foot pitched about its contact point (the
    ball when the heel is up, the heel when the toes are) - the game foot (ankle 0.075 up, ball
    0.13 ahead and 0.05 below it) is the capture's to within a few millimetres."""
    a = math.radians(pitch)
    ty, tz = (-0.05, 0.13) if a >= 0 else (-0.075, -0.035)
    c, sn = math.cos(a), math.sin(a)
    return ty * (1 - c) + tz * sn, tz * (1 - c) - ty * sn


def convert(name, take, cal, limb, region, opt):
    P, R, fps, n = take.P, take.R, take.fps, take.n
    leg_k = GAME_LEG / cal.leg
    # the floor under this take: where a flat foot's ankle sits, less its height on the stand
    # (the balls of the feet dip below the floor in some takes - marker noise as a kick lands -
    # and would lift the whole take off it)
    floor = np.percentile(np.minimum(P['anL'][:, 1], P['anR'][:, 1]), 5) - cal.ankleFlat
    # ---- the strike's moment
    if limb:
        side = limb[1].upper()
        eff = P[('wr' if limb[0] in 'lr' and limb[1] == 'h' else 'an') + side] if False else None
        is_hand = limb[1] == 'h'
        side = 'L' if limb[0] == 'l' else 'R'
        eff = P[('wr' if is_hand else 'an') + side]
        base = P[('sh' if is_hand else 'hip') + side]
        reach = np.linalg.norm(eff - base, axis=1)
        sp = speed(eff, fps)
        if opt.get('peak') == 'speed':
            peak = int(np.argmax(sp)) + 1
        else:
            # furthest reach while moving fast just before
            fast = np.array([sp[max(0, i - 6):i + 1].max() for i in range(n)])
            score = reach + (0 if is_hand else 0.6 * (eff[:, 1] - floor))
            score[fast < (2.0 if is_hand else 2.5)] = -1
            peak = int(np.argmax(score))
        peak = min(n - 1, peak)
        # the start: a couple of frames before the limb (or for a kick, the body) gets going
        vmax = sp[max(0, peak - int(0.6 * fps)):peak + 1].max()
        go = 0.22 * vmax
        calm_v = 0.45 if is_hand else 0.6
        st = peak
        # (a brief slow-down - a kick's chamber - is not the start: it must stay slow a few frames)
        while st > 2 and not (sp[st - 1] < go and sp[st - 2] < go and sp[st - 3] < go):
            st -= 1
        lead = opt.get('lead', 0.07 if is_hand else 0.1)
        st = max(0, st - int(round(lead * fps)))
        max_lead = 0.42 if is_hand else 0.65
        st = max(st, peak - int(max_lead * fps))
        en = peak + 2
        while en < n - 1 and not (sp[en] < calm_v and sp[en + 1] < calm_v):
            en += 1
        en = min(n - 1, en + int(0.12 * fps))
        max_tail = 0.55 if is_hand else 0.8
        en = min(en, peak + int(max_tail * fps))
    else:
        # dodges: the whole move between calm stances (or the given stretch of the take)
        pel = P['pelvis']
        sp = speed(pel, fps) + speed(P['head'], fps)
        act = np.where(sp > 0.5)[0]
        st = max(0, act[0] - int(0.1 * fps)) if len(act) else 0
        en = min(n - 1, act[-1] + int(0.15 * fps)) if len(act) else n - 1
        if opt.get('cut'):
            st, en = int(round(opt['cut'][0] * fps)), min(n - 1, int(round(opt['cut'][1] * fps)))
        peak = int(st + np.argmax(np.linalg.norm(P['head'][st:en + 1] - P['head'][st], axis=1)))
        eff = None
    # ---- the clip frame: origin under the pelvis at the start, +Z towards the strike (or facing)
    o = P['pelvis'][st].copy()
    o[1] = floor
    if opt.get('frame', 'strike') == 'strike' and eff is not None:
        fw = eff[peak] - P['pelvis'][st]
    elif opt.get('frame') == 'away':
        # a retreat faces whatever it backs away from (a bladed stance's hips point elsewhere)
        fw = P['pelvis'][st] - P['pelvis'][en]
    else:
        lat = P['hipL'][st] - P['hipR'][st]
        fw = np.cross(norm(lat), np.array([0, 1.0, 0]))
    fw[1] = 0
    fw = norm(fw)
    X = np.cross(np.array([0, 1.0, 0]), fw)
    C = np.stack([X, np.array([0, 1.0, 0]), fw], axis=1)  # clip axes in world
    to_clip = lambda p: C.T @ (p - o)
    idx = list(range(st, en + 1))
    # ---- root: the pelvis over the floor, smoothed; spins carry the turn in the root's yaw
    pel = np.array([to_clip(P['pelvis'][i]) for i in idx])
    rootXZ = smooth(pel[:, [0, 2]], 3)
    rootXZ -= rootXZ[0]
    segs = [Calib.segments(P, i) for i in idx]
    true = []
    for s in segs:
        t = {}
        for k, M in s.items():
            Mc = C.T @ M  # in clip space
            t[k] = Mc @ cal.off[k].T
        true.append(t)
    pel_yaw = np.unwrap([math.atan2(t['pelvis'][0, 2], t['pelvis'][2, 2]) for t in true])
    # a spin: the body turns its back on the target before contact
    pk = min(len(pel_yaw) - 1, peak - st)
    spin = abs(pel_yaw[pk] - pel_yaw[0]) > math.radians(140) or opt.get('spin', False)
    root_yaw = smooth(pel_yaw - pel_yaw[0], 2) if spin else np.zeros(len(idx))
    keys = []
    hitT = (peak - st) / fps
    for j, i in enumerate(idx):
        t = true[j]
        Ry = ry(root_yaw[j])
        def rs(p):  # clip -> root space
            q = p.copy()
            q[0] -= rootXZ[j][0]
            q[2] -= rootXZ[j][1]
            return Ry.T @ q
        k = {'t': round(j / fps, 4), 'e': 'linear'}
        k['root'] = [rootXZ[j][0] * leg_k, rootXZ[j][1] * leg_k, math.degrees(root_yaw[j])]
        hp = rs(to_clip(P['pelvis'][i]))
        k['hips'] = [hp[0] * leg_k, (P['pelvis'][i][1] - floor - cal.standHip) * leg_k, hp[2] * leg_k]
        Wp = Ry.T @ t['pelvis']
        k['hipsR'] = euler_yxz(Wp)
        k['spine'] = euler_yxz(t['pelvis'].T @ t['spine'])
        k['chest'] = euler_yxz(t['spine'].T @ t['chest'])
        k['neck'] = euler_yxz(t['chest'].T @ t['neck'])
        # head: up from the joint to the crown, lateral from the joint's rotation (calibrated)
        hx = C.T @ (R['head'][i] @ cal.headX)
        Hm = frame_from(hx, C.T @ (P['top'][i] - P['head'][i])) @ cal.off['head'].T
        k['head'] = euler_yxz(t['neck'].T @ Hm)
        Ch = t['chest']
        for s in 'LR':
            sh, el, wr = to_clip(P['sh' + s][i]), to_clip(P['el' + s][i]), to_clip(P['wr' + s][i])
            folded = opt.get('fold') and limb and limb[0] == s.lower() and limb[1] == 'h'
            if folded:
                fore = np.linalg.norm(to_clip(P['wr' + s][i]) - el)
                # the fist tucked by the temple, the forearm folded back from the elbow towards it
                tgt = 0.5 * (to_clip(P['head'][i]) + to_clip(P['neck'][i]))
                wr = el + norm(tgt - el) * fore * 0.9
            p = Ch.T @ (wr - sh) / cal.arm
            mid = 0.5 * (sh + wr)
            # (a nearly straight arm has no clear bend: lean the hint out and back, the way elbows go)
            sgx = 1 if s == 'L' else -1
            pole = Ch.T @ (el - mid)
            pole = norm(pole + np.array([sgx * 0.3, -0.5, -0.4]) * 0.06)
            # the hand's roll about the forearm (see the solver): 0 = back of the hand outwards
            fing = norm(wr - el)
            back = C.T @ (R['hand' + s][i] @ (cal.backL if s == 'L' else cal.backR))
            sg = 1 if s == 'L' else -1
            out = Ch[:, 0] * sg
            roll = sg * signed_angle(out, back, fing)
            if folded:
                roll = 20.0
            k['lh' if s == 'L' else 'rh'] = {'p': [round(float(x), 4) for x in p], 'sp': 'shoulder', 'pole': [round(float(x), 3) for x in pole], 'roll': round(roll, 1)}
        for s in 'LR':
            an, ba, to = to_clip(P['an' + s][i]), to_clip(P['ba' + s][i]), to_clip(P['to' + s][i])
            hipj, kn = to_clip(P['hip' + s][i]), to_clip(P['kn' + s][i])
            pitch, yaw, froll = euler_yxz(C.T @ R['foot' + s][i] @ cal.footOff[s])
            toe = Calib.bend_of(an, ba, to) - cal.toeBend[s]
            # the key holds the foot as if flat (the runtime turns it about its contact point by the
            # pitch): the ankle with that turn taken back out - or a raised heel counts twice and
            # the ball of the foot floats
            # (only while the foot's contact point is near the floor - in the air the runtime places
            # the ankle itself, so a pitched foot's heading can never swing it)
            hc = min(an[1] - cal.ankleFlat, ba[1] - cal.ballFlat) * leg_k
            u = min(1.0, max(0.0, (hc - 0.03) / 0.07))
            kc = 1 - u * u * (3 - 2 * u)
            pv_y, pv_f = pivot_offset(pitch)
            pv_y, pv_f = pv_y * kc, pv_f * kc
            fx, fz = math.sin(math.radians(yaw)), math.cos(math.radians(yaw))
            y = (an[1] - cal.ankleFlat) * leg_k - pv_y
            mid = 0.5 * (hipj + an)
            # (a straight leg's bend direction is noise: lean the hint over the toes)
            toes = ba - an
            toes[1] = 0
            pole = (kn - mid) + norm(toes) * 0.06
            pole = rs(pole + mid) - rs(mid)
            k['lf' if s == 'L' else 'rf'] = {
                'p': [an[0] * leg_k - fx * pv_f, max(0.0, y), an[2] * leg_k - fz * pv_f],
                'yaw': yaw, 'pitch': pitch, 'roll': froll, 'toe': toe, 'piv': round(kc, 3), 'pole': [round(float(x), 3) for x in norm(pole)],
            }
        keys.append(k)
    # ---- unwrap angles across keys (no 359 -> 0 jumps for the interpolation)
    for fld in ('hipsR', 'spine', 'chest', 'neck', 'head'):
        a = np.unwrap(np.radians(np.array([k[fld] for k in keys])), axis=0)
        for k, v in zip(keys, np.degrees(a)):
            k[fld] = [round(float(x), 2) for x in v]
    for s in ('lf', 'rf'):
        a = np.unwrap(np.radians(np.array([k[s]['yaw'] for k in keys])))
        for k, v in zip(keys, np.degrees(a)):
            k[s]['yaw'] = round(float(v), 1)
        a = np.unwrap(np.radians(np.array([k[s]['toe'] for k in keys])))
        for k, v in zip(keys, np.degrees(a)):
            k[s]['toe'] = float(v)
        a = np.unwrap(np.radians(np.array([k[s]['roll'] for k in keys])))
        for k, v in zip(keys, np.degrees(a)):
            k[s]['roll'] = float(v)
    for h in ('lh', 'rh'):
        # (no hand ever spins the long way round between two frames)
        a = np.unwrap(np.radians(np.array([k[h]['roll'] for k in keys])))
        a = smooth(a, 1)
        for k, v in zip(keys, np.degrees(a)):
            k[h]['roll'] = round(float(v), 1)
        if opt.get('fold'):
            ps = smooth(np.array([k[h]['p'] for k in keys]), 1)
            for k, v in zip(keys, ps):
                k[h]['p'] = [round(float(x), 4) for x in v]
    # ---- feet on the floor. Keys hold a foot as if flat (the runtime turns it about the ball of
    #      the foot by a positive pitch, about the heel by a negative one), so of the ankle, the
    #      ball and the heel, the point that moves least is the one the foot stands on.
    def hspeed(a):
        return np.r_[0, np.linalg.norm(np.diff(a[:, [0, 2]], axis=0), axis=1)] * fps

    def smoothstep(e0, e1, x):
        t = np.clip((x - e0) / (e1 - e0), 0, 1)
        return t * t * (3 - 2 * t)

    BALL, HEEL = 0.13, 0.035
    for s in ('lf', 'rf'):
        ps = np.array([k[s]['p'] for k in keys])
        yaw = np.radians(np.array([k[s]['yaw'] for k in keys]))
        pit = np.array([k[s]['pitch'] for k in keys])
        dirs = np.stack([np.sin(yaw), np.zeros(len(keys)), np.cos(yaw)], axis=1)
        vc = np.minimum(np.minimum(hspeed(ps), hspeed(ps + dirs * BALL)), hspeed(ps - dirs * HEEL))
        # a foot the capture slides along the floor (a skip, a shuffle) steps instead: off the
        # floor while it travels, by as much as it travels
        slide = (ps[:, 1] < 0.05) & (vc >= 0.6)
        # (a foot that wobbles out and back on the spot is planted, not stepping)
        jitter = np.zeros(len(keys), dtype=bool)
        j = 1
        while j < len(keys):
            if not slide[j]:
                j += 1
                continue
            e = j
            while e + 1 < len(keys) and slide[e + 1]:
                e += 1
            a, b = j - 1, min(len(keys) - 1, e + 1)
            D = min(float(np.linalg.norm((q[b] - q[a])[[0, 2]])) for q in (ps, ps + dirs * BALL, ps - dirs * HEEL))
            if D > 0.05 and b - a >= 2:
                h = min(0.1, 0.03 + 0.15 * D)
                for q in range(a + 1, b):
                    u = (q - a) / (b - a)
                    ps[q, 1] = max(ps[q, 1], math.sin(math.pi * u) ** 0.7 * h)
            elif D <= 0.05:
                jitter[a + 1:b] = True
            j = e + 1
        # planted: exactly still and on the floor while in contact (the runtime keeps a planted
        # foot where the fighter actually stands) - except that a foot turning on its ball or
        # heel turns round that point
        planted = (ps[:, 1] < 0.03) & ((vc < 0.6) | jitter)
        spans = []
        j = 0
        while j < len(keys):
            if not planted[j]:
                j += 1
                continue
            e = j
            while e + 1 < len(keys) and planted[e + 1]:
                e += 1
            spans.append((j, e))
            j = e + 1
        orig = ps.copy()
        for j, e in spans:
            # a planted foot that turns, turns about one point of its sole: the one (from the heel
            # to the ball) that best explains how the capture's foot moved, held fixed
            best = None
            for f in np.linspace(-HEEL, BALL, 34):
                c = orig[j:e + 1] + dirs[j:e + 1] * f
                C = c.mean(axis=0)
                err = float((((c - C)[:, [0, 2]]) ** 2).sum())
                if best is None or err < best[0] - 1e-9:
                    best = (err, f, C)
            _, f, C = best
            for q in range(j, e + 1):
                p_ = C - dirs[q] * f
                ps[q] = [p_[0], 0.0, p_[2]]
        # the swings between plants leave from where the foot was held and land where it will be
        # (what the hold moved it by fades across the swing, never a jump at lift-off)
        for a in range(len(spans) + 1):
            s0 = spans[a - 1][1] if a > 0 else None
            s1 = spans[a][0] if a < len(spans) else None
            lo = s0 + 1 if s0 is not None else 0
            hi = s1 - 1 if s1 is not None else len(keys) - 1
            if hi < lo:
                continue
            d0 = (ps[s0] - orig[s0]) if s0 is not None else None
            d1 = (ps[s1] - orig[s1]) if s1 is not None else None
            d0 = d0 if d0 is not None else d1
            d1 = d1 if d1 is not None else d0
            if d0 is None:
                continue
            for q in range(lo, hi + 1):
                u = (q - lo + 1) / (hi - lo + 2)
                u = u * u * (3 - 2 * u)
                dq = d0 * (1 - u) + d1 * u
                ps[q, 0] += dq[0]
                ps[q, 2] += dq[2]
        for k, p_ in zip(keys, ps):
            k[s]['p'] = [float(x) for x in p_]
            # (a sole on the floor lies flat on it: its roll comes in as the foot leaves the floor)
            u = min(1.0, max(0.0, p_[1] / 0.08))
            k[s]['roll'] = float(k[s]['roll']) * u * u * (3 - 2 * u)
    for k in keys:
        for s in ('lf', 'rf'):
            k[s]['p'] = [round(float(x), 4) for x in k[s]['p']]
            k[s]['pitch'] = round(float(k[s]['pitch']), 1)
            k[s]['roll'] = round(float(k[s]['roll']), 1)
            k[s]['toe'] = round(float(k[s]['toe']), 1)
        k['root'] = [round(float(x), 4) for x in k['root']]
        k['hips'] = [round(float(x), 4) for x in k['hips']]
    sp_ = opt.get('speed', 1.0)
    if sp_ != 1.0:
        for k in keys:
            k['t'] = round(k['t'] / sp_, 4)
        hitT /= sp_
    dur = keys[-1]['t']
    info = {
        'keys': keys, 'hitT': round(hitT, 3), 'dur': round(dur, 3), 'limb': limb, 'region': region,
        'source': opt.get('_src'), 'spin': bool(spin),
    }
    return info


def main():
    stand = load_accad('A1_Stand')
    cal = Calib(stand, 0)
    out = {}
    for name, (src, limb, region, opt) in CLIPS.items():
        kind, clip = src.split(':')
        take = load_accad(clip)
        if opt.get('mirror'):
            take = take.mirrored()
            limb = {'lh': 'rh', 'rh': 'lh', 'lf': 'rf', 'rf': 'lf'}.get(limb, limb)
        o = dict(opt)
        o['_src'] = src
        info = convert(name, take, cal, limb, region, o)
        out[name] = info
        print(f"{name:16s} {src:34s} hitT={info['hitT']:.2f} dur={info['dur']:.2f} keys={len(info['keys'])} spin={info['spin']}")
    meta = {
        'about': 'Combat clips cut from the ACCAD Open Motion Project (Male2 martial arts, CC BY 3.0) - see tools/mocap/strikes.py',
        'clips': out,
    }
    with open(OUT, 'w') as f:
        json.dump(meta, f, separators=(',', ':'))
    print('wrote', OUT, os.path.getsize(OUT), 'bytes')


main()
