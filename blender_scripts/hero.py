"""Hero (Mehran) specific pose helpers."""
import math
import animlib as A
from mathutils import Vector, Matrix

SEAT_Z = 0.465
BENCH_SEATS = [(-0.87, 1.98), (-0.29, 1.98), (0.29, 1.98), (0.87, 1.98)]

def rot2(v, deg):
    a = math.radians(deg); c, s = math.cos(a), math.sin(a)
    return (v[0] * c - v[1] * s, v[0] * s + v[1] * c)

def sit_frame(a, f, seat=(-0.29, 1.98), rotz=0.0, seat_z=SEAT_Z, feet_fwd=0.46, feet_apart=0.0, back=0.425, slouch=0.0, knees_up=0.0):
    """Key a seated lower body at frame f on a seat whose centre is `seat`, character facing rotz (0 = -Y)."""
    off = rot2((0, -0.38), rotz)
    a.place(f, seat[0] + off[0], seat[1] + off[1], 0, rotz)
    hip_z = seat_z + 0.09
    a.root(f, 0, back, hip_z - a.hip_z)
    for side in ('L', 'R'):
        a.leg_ik(f, side, (0, -feet_fwd, (a.ankle_z + knees_up) - hip_z))
    if feet_apart:
        a.pose(f, {'upperleg01.L': None}) if False else None
    return off

def seated_upper(a, f, lean=6.0, head=(0, 0, 0), slouch=0.0, twist=0.0):
    a.pose(f, {
        'spine05': (0, 0, 0),
        'spine04': (lean * 0.4 + slouch * 0.6, 0, twist * 0.3),
        'spine03': (lean * 0.3 + slouch * 0.5, 0, twist * 0.3),
        'spine02': (lean * 0.2 + slouch * 0.3, 0, twist * 0.2),
        'spine01': (-slouch * 0.3, 0, twist * 0.2),
        'neck01': (head[0] * 0.4 - slouch * 0.4, 0, head[2] * 0.3),
        'head': (head[0] * 0.6, head[1], head[2] * 0.7),
    })

def hands_on_thighs(a, f, spread=0.17, fwd=-0.30, z=0.60):
    a.hands(f, (spread, fwd, z), pole_l=(0.5, 0.4, 0.9))

def hands_relaxed(a, f):
    a.hands(f, (0.215, -0.03, 0.865), pole_l=(0.45, 0.55, 1.1))

def head_shake(a, f0, n=3, amp=14, period=9):
    for i in range(n * 2 + 1):
        v = 0 if i in (0, n * 2) else (amp if i % 2 else -amp) * (1 - i / (n * 2 + 2))
        a.pose(f0 + i * period // 2, {'head': (2, 0, v), 'neck02': (0, 0, v * 0.3)})

def nod(a, f0, amp=10, n=1, base=(0, 0, 0)):
    for i in range(n):
        a.pose(f0 + i * 10, {'head': (base[0], 0, base[2])})
        a.pose(f0 + i * 10 + 5, {'head': (base[0] + amp, 0, base[2])})
    a.pose(f0 + n * 10, {'head': (base[0], 0, base[2])})

def look(a, f, yaw=0.0, pitch=0.0, eyes=True):
    """Head yaw (+ = character's left) & pitch (+ = down)."""
    a.pose(f, {'head': (pitch * 0.6, 0, yaw * 0.6), 'neck02': (pitch * 0.4, 0, yaw * 0.4)})
    if eyes:
        a.face(f, eyeLookOutLeft=max(0, yaw) / 60, eyeLookInRight=max(0, yaw) / 60,
               eyeLookInLeft=max(0, -yaw) / 60, eyeLookOutRight=max(0, -yaw) / 60,
               eyeLookDownLeft=max(0, pitch) / 40, eyeLookDownRight=max(0, pitch) / 40)

EXPR = {
    'neutral': dict(),
    'tired': dict(eyeBlinkLeft=0.25, eyeBlinkRight=0.25, browInnerUp=0.25, mouthFrownLeft=0.2, mouthFrownRight=0.2),
    'sad': dict(browInnerUp=0.75, mouthFrownLeft=0.45, mouthFrownRight=0.45, eyeBlinkLeft=0.15, eyeBlinkRight=0.15, mouthPressLeft=0.2, mouthPressRight=0.2),
    'smile': dict(mouthSmileLeft=0.6, mouthSmileRight=0.6, cheekSquintLeft=0.35, cheekSquintRight=0.35, eyeSquintLeft=0.2, eyeSquintRight=0.2),
    'soft_smile': dict(mouthSmileLeft=0.3, mouthSmileRight=0.3, cheekSquintLeft=0.15, cheekSquintRight=0.15),
    'shock': dict(eyeWideLeft=0.9, eyeWideRight=0.9, browInnerUp=0.6, browOuterUpLeft=0.7, browOuterUpRight=0.7, jawOpen=0.35, mouthFunnel=0.2),
    'worried': dict(browInnerUp=0.8, mouthStretchLeft=0.3, mouthStretchRight=0.3, eyeWideLeft=0.3, eyeWideRight=0.3),
    'stern': dict(browDownLeft=0.55, browDownRight=0.55, mouthPressLeft=0.5, mouthPressRight=0.5, eyeSquintLeft=0.25, eyeSquintRight=0.25),
    'proud': dict(mouthSmileLeft=0.35, mouthSmileRight=0.35, browOuterUpLeft=0.25, browOuterUpRight=0.25, jawForward=0.1),
    'sigh': dict(eyeBlinkLeft=0.6, eyeBlinkRight=0.6, jawOpen=0.12, mouthFunnel=0.15, browInnerUp=0.4),
    'sleep': dict(eyeBlinkLeft=1.0, eyeBlinkRight=1.0, jawOpen=0.08),
    'chew': dict(),
    'focus': dict(browDownLeft=0.25, browDownRight=0.25, eyeSquintLeft=0.2, eyeSquintRight=0.2, mouthPressLeft=0.2, mouthPressRight=0.2),
}
ALL_FACE = sorted({k for d in EXPR.values() for k in d} | {'eyeLookOutLeft', 'eyeLookInRight', 'eyeLookInLeft', 'eyeLookOutRight', 'eyeLookDownLeft', 'eyeLookDownRight', 'jawOpen'})

def expr(a, f, name, amt=1.0):
    d = EXPR[name]
    vals = {k: d.get(k, 0.0) * amt for k in ALL_FACE if not k.startswith('eyeLook')}
    a.face(f, **vals)

def chew(a, f0, f1, rate=7):
    f = f0; i = 0
    while f < f1:
        a.face(f, jawOpen=0.16 if i % 2 else 0.03)
        f += rate; i += 1
