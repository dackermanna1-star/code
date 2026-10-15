# Fragmentation hand grenade (M67-style): 64 mm OD steel body, fuze, spoon and pull ring.
# Origin = body centre (hand grip). +Y = fuze up; spoon on the +Z side, ring on the right (-X).
import math
from _grenade import fuze

OUT = 'weapons'
TEX = 512
META = dict(kind='throwable', type='frag', nodes_note="'pin' (pivot: pull ring + pin) and 'spoon' (pivot at the lever hinge) can be animated off")


def R(u):
    # egg-ish sphere: radius 32 (slightly flattened top)
    v = max(-32.0, min(32.0, u))
    return math.sqrt(max(0.0, 32.0 ** 2 - v * v)) * (1.0 if u < 0 else 0.985)


def build(g):
    prof = [(-32.2, 0)]
    for k in range(1, 40):
        a = -90 + k * (158.0 / 39)
        u = 32.0 * math.sin(math.radians(a)); r = R(u)
        prof.append((u, r))
    prof += [(29.0, 11.5), (30.5, 11.0), (30.5, 0)]
    g.lathe('body', prof, 'paint_olive', axis='u', segs=40)
    # equator seam and a yellow marking band at the shoulder
    g.lathe('seam', [(-1.0, 32.0), (0, 32.5), (1.0, 32.0)], 'paint_olive!', axis='u', segs=40)
    g.lathe('band', [(21.5, R(21.5) + 0.05), (25.0, R(25.0) + 0.05)], 'paint_yel', axis='u', segs=40)
    fuze(g, 30.5, R, -14)
    g.set_origin(0, 0)
