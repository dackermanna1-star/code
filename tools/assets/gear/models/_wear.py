"""Shared helpers for wearable gear: body envelope look-ups (from fit/body_envelope_m.json) and shell builders.

Envelope coordinates are glTF character space (x = character LEFT, y = up, z = forward, feet at y = 0).
Kit coordinates are mm "gun" coords: f = z, u = y, s = -x.
"""
import json, math, os
import numpy as np
from mathutils import Vector
from gkit import grid_surface, apply_mods, sweep, MM, catmull

HERE = os.path.dirname(os.path.abspath(__file__))
ENV = json.load(open(os.path.join(HERE, '..', 'fit', 'body_envelope_m.json')))
HC = ENV['head_center']          # glTF (x, y, z) of the head centre (helmet origin)
ZC = ENV['zc']


def _blur(a, k=1, wrap_x=False):
    a = np.array(a, dtype=float)
    for _ in range(k):
        b = a.copy()
        b[1:-1, :] = (a[:-2, :] + 2 * a[1:-1, :] + a[2:, :]) / 4
        if wrap_x:
            b = (np.roll(b, 1, axis=1) + 2 * b + np.roll(b, -1, axis=1)) / 4
        else:
            b[:, 1:-1] = (b[:, :-2] + 2 * b[:, 1:-1] + b[:, 2:]) / 4
        a = b
    return a


# head: rows el -60..90 step 5, cols az 0..350 step 10
_HE = list(range(-60, 91, 5))
HEAD = _blur([ENV['head_bare'][str(e)] for e in _HE], 1, wrap_x=True)
# torso: rows y 90..162 cm, cols theta 0..355 step 5 (0 = front, 90 = left)
_TY = list(range(90, 163))
TORSO = np.array([ENV['max']['torso'][str(y)] for y in _TY], dtype=float)
FRONT = np.array([ENV['max']['front'][str(x)] for x in range(-30, 31)], dtype=float)     # [x_cm+30][y_cm-90]
BACK = np.array([ENV['max']['back'][str(x)] for x in range(-30, 31)], dtype=float)
TOP = np.array([ENV['max']['top'][str(x)] for x in range(-30, 31)], dtype=float)         # [x_cm+30][z_cm+20]
TOP_NH = np.array([ENV['top_nohood'][str(x)] for x in range(-30, 31)], dtype=float)    # same, without the hood variant


def _bilin(A, i, j, wrap_j=False):
    i = max(0.0, min(A.shape[0] - 1.0, i))
    if wrap_j:
        j = j % A.shape[1]
    else:
        j = max(0.0, min(A.shape[1] - 1.0, j))
    i0 = int(math.floor(i)); j0 = int(math.floor(j))
    i1 = min(i0 + 1, A.shape[0] - 1); j1 = (j0 + 1) % A.shape[1] if wrap_j else min(j0 + 1, A.shape[1] - 1)
    ti = i - i0; tj = j - j0
    return (A[i0, j0] * (1 - ti) * (1 - tj) + A[i1, j0] * ti * (1 - tj) + A[i0, j1] * (1 - ti) * tj + A[i1, j1] * ti * tj)


def head_r(el, az):
    """bare-head radius (m) from the head centre along elevation el (deg) / azimuth az (deg, 0 = front, 90 = left)."""
    return _bilin(HEAD, (el + 60) / 5.0, (az % 360) / 10.0, wrap_j=True)


def torso_r(y, th):
    return _bilin(TORSO, y * 100 - 90, (th % 360) / 5.0, wrap_j=True)


def front_z(x, y):
    return _bilin(FRONT, x * 100 + 30, y * 100 - 90)


def back_z(x, y):
    return _bilin(BACK, x * 100 + 30, y * 100 - 90)


def top_y(x, z, hood=False):
    return _bilin(TOP if hood else TOP_NH, x * 100 + 30, z * 100 + 20)


def periodic_interp(table, th):
    """smooth periodic interpolation of {deg: value} (Catmull-Rom over sorted keys, period 360)."""
    ks = sorted(table)
    th = th % 360
    ext = [(k - 360, table[k]) for k in ks[-2:]] + [(k, table[k]) for k in ks] + [(k + 360, table[k]) for k in ks[:2]]
    for i in range(1, len(ext) - 2):
        (x1, y1), (x2, y2) = ext[i], ext[i + 1]
        if x1 <= th <= x2:
            y0 = ext[i - 1][1]; y3 = ext[i + 2][1]
            t = (th - x1) / (x2 - x1)
            return 0.5 * ((2 * y1) + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t * t + (-y0 + 3 * y1 - 3 * y2 + y3) * t ** 3)
    return table[ks[0]]


# ----------------------------------------------------------------------------------------------
# helmet shells (mm, head-centre origin). Azimuth th: 0 = front, 90 = left (-s), elevation e: 90 = top.
# ----------------------------------------------------------------------------------------------
class Shell:
    def __init__(self, cf=0.0, cu=0.0, af=125.0, as_=115.0, au=140.0, al=120.0, k=0.12, flare=None, rim=None):
        self.cf, self.cu, self.af, self.as_, self.au, self.al, self.k = cf, cu, af, as_, au, al, k
        self.flare = flare or (lambda th, e: 0.0)
        self.rim = rim or (lambda th: -30.0)

    def point(self, th, e, off=0.0):
        """outer surface point (f, u, s) mm at azimuth th, elevation e; off = offset along the approximate normal (mm)."""
        if e >= 0:
            h = math.cos(math.radians(e)); v = self.au * math.sin(math.radians(e))
        else:
            t = -e / 90.0
            h = 1.0 - self.k * t * t; v = -self.al * math.sin(math.radians(-e))
        h *= 1.0 + self.flare(th, e)
        ct, st = math.cos(math.radians(th)), math.sin(math.radians(th))
        f = self.cf + self.af * h * ct
        s = -self.as_ * h * st
        u = self.cu + v
        if off:
            n = Vector(((f - self.cf) / self.af ** 2, (u - self.cu) / (self.au if u >= self.cu else self.al) ** 2, s / self.as_ ** 2)).normalized()
            f += n.x * off; u += n.y * off; s += n.z * off
        return (f, u, s)

    def surface(self, nu=72, nv=26, e_top=86.0, off=0.0, e_lo=None, e_hi=None):
        """mesh (metres, x=f y=u z=s) of the shell from the crown down to the rim (or between e_lo(th)/e_hi(th))."""
        def fn(a, b):
            th = a * 360.0
            lo = self.rim(th) if e_lo is None else e_lo(th)
            hi = e_top if e_hi is None else e_hi(th)
            e = hi + (lo - hi) * b
            p = self.point(th, e, off)
            return (p[0] * MM, p[1] * MM, p[2] * MM)
        return grid_surface(fn, nu, nv, wrap_u=True, cap_v0=(e_hi is None))

    def rim_path(self, n=144, off=0.0, de=0.0):
        pts = []
        for i in range(n):
            th = 360.0 * i / n
            p = self.point(th, self.rim(th) + de, off)
            pts.append(Vector((p[0] * MM, p[1] * MM, p[2] * MM)))
        return pts

    def clearance(self, thick):
        """min clearance (mm) between the inner shell (outer - thick) and the bare head, over covered directions."""
        worst = 1e9; where = None
        for e in range(-60, 91, 5):
            for az in range(0, 360, 10):
                if e < self.rim(az) + 4: continue
                hr = head_r(e, az) * 1000
                # direction from the head centre
                ce, se = math.cos(math.radians(e)), math.sin(math.radians(e))
                d = Vector((ce * math.cos(math.radians(az)), se, -ce * math.sin(math.radians(az))))
                # march along d until outside the inner shell (implicit test via param at the same angles, approx)
                p = Vector(self.point(az, e, -thick))
                r_in = p.length
                c = r_in - hr
                if c < worst: worst, where = c, (e, az)
        return worst, where


def solidify(me, thick_mm, offset=-1.0, rim=True):
    return apply_mods(me, [('SOLIDIFY', dict(thickness=thick_mm * MM, offset=offset, use_rim=rim, use_even_offset=True))])


def orient_out(me, center=(0, 0, 0)):
    """flip faces so normals point away from center (metres, local)."""
    import bmesh
    c = Vector(center)
    avg = 0.0
    for p in me.polygons:
        avg += p.normal.dot(p.center - c) * p.area
    if avg < 0:
        bm = bmesh.new(); bm.from_mesh(me)
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
        bm.to_mesh(me); bm.free()
    return me


def strap_on_shell(sh, th0, th1, e_of_th, width, off, thick, n=48):
    """a band/strap lying on the shell surface along th0..th1 at elevation e_of_th(th) (centre line), width in degrees of elevation."""
    def fn(a, b):
        th = th0 + (th1 - th0) * a
        e = e_of_th(th) + (b - 0.5) * width
        p = sh.point(th, e, off)
        return (p[0] * MM, p[1] * MM, p[2] * MM)
    closed = abs((th1 - th0) - 360) < 1e-6
    me = grid_surface(fn, n, 2, wrap_u=closed)
    me = orient_out(me)
    return solidify(me, thick, offset=1.0)


def head_point(el, az, off_mm=0.0):
    """point on the bare head surface (+off) in gun mm."""
    r = head_r(el, az) * 1000 + off_mm
    ce, se = math.cos(math.radians(el)), math.sin(math.radians(el))
    return (r * ce * math.cos(math.radians(az)), r * se, -r * ce * math.sin(math.radians(az)))


def chin_strap(g, sh, kind='webbing_od', width=18.0, off=7.0, anchor_th=95, anchor_de=6.0, name='chinstrap', group='body'):
    """strap from inside the shell behind the temples, down the jaw and under the chin to the other side."""
    a_l = sh.point(anchor_th, sh.rim(anchor_th) + anchor_de, -14)
    a_r = sh.point(-anchor_th, sh.rim(-anchor_th) + anchor_de, -14)
    mids = [(-30, 90), (-42, 75), (-52, 50), (-57, 22), (-58, 0), (-57, -22), (-52, -50), (-42, -75), (-30, -90)]
    pts = [a_l] + [head_point(e, a, off) for (e, a) in mids] + [a_r]
    P = [Vector((p[0] * MM, p[1] * MM, p[2] * MM)) for p in catmull(pts, n=4)]
    # strap lies flat on the face: width direction ~ perpendicular to the path and to the radial direction
    ups = [Vector(p).normalized() for p in P]
    prof = [(-0.9 * MM, -width / 2 * MM), (0.9 * MM, -width / 2 * MM), (0.9 * MM, width / 2 * MM), (-0.9 * MM, width / 2 * MM)]
    g.mesh(name, sweep(P, prof, up=ups), kind, group)
    return a_l, a_r
