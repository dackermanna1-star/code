"""Dacia 1300 style 1970s 4-door sedan (Renault 12 family).
Real data: L 4.35 m, W 1.62 m, H 1.44 m, wheelbase 2.44 m, track 1.31 m, tyres 155 SR 13 (R 0.292 m).
Body built as (section loft) x (side silhouette) x (plan outline) intersections, references in META."""
import math
from vkit import *

WB = 2.441
TRACK = 1.31
R = 0.292
FA, RA = WB / 2, -WB / 2
TW = TRACK / 2
TEX = 2048

META = {
    'name': 'Dacia 1300 (4-door sedan)',
    'references': ['https://commons.wikimedia.org/wiki/File:1980_Dacia_1300.jpg',
                   'https://commons.wikimedia.org/wiki/File:Dacia_1300_-_Front_View.jpg',
                   'https://commons.wikimedia.org/wiki/File:Dacia_1300_-_Rear_View.jpg',
                   'https://commons.wikimedia.org/wiki/File:Dacia_1300_1974_im_Museum_Nossen.JPG'],
}

SW = 0.806          # body half width
F_FRONT, F_REAR = 2.03, -2.27
BELT = 0.875
ROOF = 1.415
FLOOR = 0.27


def H(pts):
    return mirror_half(pts)


# ---------------------------------------------------------------------------------------------- body solids
def lower_keys(e=0.0):
    def sec(deck, crown=0.018, w=SW, bot=0.20):
        return H([(0.0, bot), (w - 0.07, bot, 0.05), (w - 0.012, 0.32, 0.10), (w, 0.55, 0.3), (w - 0.006, 0.72, 0.03),
                  (w - 0.035, deck - 0.01, 0.07), (0.0, deck + crown, 4.0)])
    keys = [(F_REAR - 0.02, sec(0.895, 0.012, SW - 0.02, 0.30)), (-1.62, sec(0.925)), (-1.2, sec(0.915)), (0.62, sec(0.885)),
            (1.25, sec(0.835, 0.02)), (F_FRONT + 0.02, sec(0.775, 0.016, SW - 0.025, 0.27))]
    return eroded_keys(keys, e) if e else keys


SIL_LOWER = [(F_REAR, 0.33, 0.05), (F_REAR - 0.005, 0.74, 0.02), (F_REAR + 0.03, 1.2, 0.0), (F_FRONT, 1.2, 0.0), (F_FRONT + 0.005, 0.70, 0.03),
             (F_FRONT, 0.36, 0.06), (F_FRONT - 0.14, 0.24, 0.1), (FA + 0.45, 0.21, 0.1), (RA - 0.50, 0.21, 0.1), (F_REAR + 0.12, 0.27, 0.08)]
PLAN_LOWER = [(F_REAR, -SW + 0.03, 0.13), (F_FRONT, -SW + 0.03, 0.16), (F_FRONT, SW - 0.03, 0.16), (F_REAR, SW - 0.03, 0.13)]


def gh_keys(e=0.0):
    def sec(w_base=0.775, w_roof=0.615, base=0.80, roof=ROOF):
        return H([(0.0, base), (w_base, base, 0.0), (w_base - 0.015, BELT + 0.02, 0.02), (w_roof, roof - 0.045, 0.085), (0.0, roof, 4.0)])
    keys = [(-1.80, sec(0.77, 0.60, roof=ROOF - 0.01)), (-0.6, sec()), (0.75, sec(0.775, 0.61))]
    return eroded_keys(keys, e) if e else keys


SIL_GH = [(-1.66, 0.80, 0.0), (-1.655, 0.93, 0.03), (-1.17, ROOF - 0.002, 0.18), (0.02, ROOF + 0.004, 0.16), (0.64, 0.88, 0.02), (0.66, 0.80, 0.0)]
PLAN_GH = [(-1.70, -0.79, 0.12), (0.70, -0.79, 0.30), (0.70, 0.79, 0.30), (-1.70, 0.79, 0.12)]


def body_solid(v, e=0.0, name='body', e_gh=None):
    e_gh = e if e_gh is None else e_gh
    lo = v.block(name + '_lo', lower_keys(e), 'paint', register=False, n_f=20, nseg=3, edge_div=sym_div([0, 1, 2, 2, 1, 4]) if not e else None)
    boolean(lo, prism(v, 'sil', SIL_LOWER, 'side', -1.2, 1.2, 'paint', erode=e), 'INTERSECT')
    boolean(lo, prism(v, 'plan', PLAN_LOWER, 'top', -0.2, 2.0, 'paint', erode=e), 'INTERSECT')
    gh = v.block(name + '_gh', gh_keys(e_gh), 'paint', register=False, n_f=10, nseg=4, edge_div=sym_div([0, 0, 2, 3]) if not e_gh else None)
    boolean(gh, prism(v, 'silg', SIL_GH, 'side', -1.2, 1.2, 'paint', erode=e_gh), 'INTERSECT')
    boolean(gh, prism(v, 'plang', PLAN_GH, 'top', 0.5, 2.0, 'paint', erode=e_gh), 'INTERSECT')
    boolean(lo, gh, 'UNION')
    return lo


# window outlines (side plane)
WIN_F = [(0.57, BELT + 0.02, 0.02), (0.035, ROOF - 0.055, 0.06), (-0.43, ROOF - 0.05, 0.03), (-0.43, BELT + 0.02, 0.0)]
WIN_R = [(-0.47, BELT + 0.025, 0.0), (-0.47, ROOF - 0.05, 0.03), (-1.10, ROOF - 0.055, 0.12), (-1.38, BELT + 0.05, 0.03), (-1.40, BELT + 0.025, 0.0)]
# windshield / backlight outlines in their own tilted planes: (s, t) with t = distance up the glass slope
WS_BASE, WS_ANG = (0.64, 0.88), 49.2          # pitch that maps the prism's u axis onto the windshield slope
BL_BASE, BL_ANG = (-1.655, 0.93), -45.0
WIN_WS = [(-0.62, 0.035, 0.05), (0.62, 0.035, 0.05), (0.545, 0.735, 0.07), (-0.545, 0.735, 0.07)]
WIN_BL = [(-0.60, 0.05, 0.05), (0.60, 0.05, 0.05), (0.53, 0.615, 0.07), (-0.53, 0.615, 0.07)]


def tilted(v, name, ctrl, base, ang, kind, depth=0.12):
    o = prism(v, name, ctrl, 'front', -depth, depth, kind)
    o.data.transform(TR(base[0], base[1], 0) @ pitch_up(ang))
    return o


def build(v):
    v.paint = '#7d9cab'
    v.paint_coat = 0.35
    v.look = dict(dirt=0.55, wear=0.6)
    v.uv_scale.update({'chassis': 0.4, 'paint_in': 0.5, 'vinyl': 0.6, 'fabric': 0.6, 'gap': 0.2, 'carpet': 0.4, 'seal': 0.5})
    shell(v)
    front_end(v)
    rear_end(v)
    side_details(v)
    interior(v)
    chassis(v)
    wheels(v)
    v.empty('light_l', F_FRONT - 0.02, 0.625, 0.60)
    v.empty('light_r', F_FRONT - 0.02, 0.625, -0.60)
    v.empty('exhaust', F_REAR - 0.03, 0.22, -0.42, M=yaw_left(180))


def shell(v):
    body = body_solid(v)
    v.body = body
    # wheel arches
    cuts = []
    for side in (1, -1):
        for fc in (FA, RA):
            cuts.append(v.cyl('arch', (fc, R + 0.035, side * 0.85), R + 0.075, 0.62, 'chassis', axis='s', segs=32, register=False))
    boolean(body, cuts)
    # cabin cavity = eroded body limited to the cabin
    cav = body_solid(v, 0.028, 'cav', e_gh=0.014)
    for o in [o for o in v.parts if False]:
        pass
    boolean(cav, v.box('cabin_lim', (-0.53, 1.0, 0.0), (2.30, 1.5, 2.0), 'paint_in', register=False), 'INTERSECT')
    for side in (1, -1):
        boolean(cav, v.cyl('wh', (RA, R + 0.035, side * 0.85), R + 0.11, 0.80, 'paint_in', axis='s', segs=24, register=False))
    for m in cav.data.materials:
        pass
    cav.data.materials.clear(); cav.data.materials.append(kind_material('paint_in'))
    boolean(body, cav)
    # windows
    cuts = []
    for side in (1, -1):
        cuts.append(prism(v, 'wf', WIN_F, 'side', side * 0.55, side * 1.0, 'seal'))
        cuts.append(prism(v, 'wr', WIN_R, 'side', side * 0.55, side * 1.0, 'seal'))
    cuts.append(tilted(v, 'ws', WIN_WS, WS_BASE, WS_ANG, 'seal'))
    cuts.append(tilted(v, 'bl', WIN_BL, BL_BASE, BL_ANG, 'seal'))
    boolean(body, cuts)
    # glass: thin skin of the greenhouse inside the openings
    g_out = gh_only(v, 0.003)
    boolean(g_out, gh_only(v, 0.008))
    gc = []
    for side in (1, -1):
        gc.append(prism(v, 'gwf', erode_ctrl(WIN_F, -0.010), 'side', side * 0.55, side * 1.0, 'glass'))
        gc.append(prism(v, 'gwr', erode_ctrl(WIN_R, -0.010), 'side', side * 0.55, side * 1.0, 'glass'))
    gc.append(tilted(v, 'gws', erode_ctrl(WIN_WS, -0.010), WS_BASE, WS_ANG, 'glass'))
    gc.append(tilted(v, 'gbl', erode_ctrl(WIN_BL, -0.010), BL_BASE, BL_ANG, 'glass'))
    gcut = join(gc, 'gcut')
    boolean(g_out, gcut, 'INTERSECT')
    g_out.data.materials.clear(); g_out.data.materials.append(kind_material('glass'))
    v.register(g_out); g_out.name = 'glass'
    # panel gaps: doors, hood, trunk
    cuts = []
    for side in (1, -1):
        a0, a1 = side * 0.60, side * 0.95
        cuts.append(slot(v, 'gd1', [(0.585, BELT + 0.03), (0.60, 0.70), (0.585, 0.26), (-0.44, 0.26)], 'side', a0, a1, 0.004))
        cuts.append(slot(v, 'gd2', [(-0.445, BELT + 0.04), (-0.445, 0.26)], 'side', a0, a1, 0.004))
        cuts.append(slot(v, 'gd3', [(-0.445, 0.26), (-1.05, 0.26), (-1.30, 0.50), (-1.36, 0.70), (-1.40, BELT + 0.04)], 'side', a0, a1, 0.004))
    cuts.append(slot(v, 'ghood', [(2.2, 0.73), (0.63, 0.73), (0.63, -0.73), (2.2, -0.73)], 'top', 0.70, 1.0, 0.004))
    cuts.append(slot(v, 'gtrunk', [(-2.40, 0.70), (-1.68, 0.70), (-1.68, -0.70), (-2.40, -0.70)], 'top', 0.84, 1.1, 0.004))
    cuts.append(slot(v, 'gtrunk2', [(-0.70, 1.0), (-0.70, 0.66), (0.70, 0.66), (0.70, 1.0)], 'front', -2.40, -2.15, 0.004))
    boolean(body, cuts)
    v.register(body)
    body.name = 'shell'
    set_kind_faces(body, 'chassis', lambda c, n: n[1] < -0.6 and c[1] < 0.30)
    # headliner: downward-facing cabin roof faces
    set_kind_faces(body, 'fabric', lambda c, n: n[1] < -0.5 and c[1] > 1.25 and -1.3 < c[0] < 0.3 and abs(c[2]) < 0.72)


def gh_only(v, e):
    gh = v.block('ghx', gh_keys(e), 'glass', register=False, n_f=10, nseg=4)
    boolean(gh, prism(v, 'silg', SIL_GH, 'side', -1.2, 1.2, 'glass', erode=e), 'INTERSECT')
    boolean(gh, prism(v, 'plang', PLAN_GH, 'top', 0.5, 2.0, 'glass', erode=e), 'INTERSECT')
    return gh


def front_end(v):
    body = v.body
    # recessed front panel (grille + lamps)
    rec = prism(v, 'frec', [(-0.745, 0.505, 0.04), (0.745, 0.505, 0.04), (0.745, 0.735, 0.03), (-0.745, 0.735, 0.03)], 'front', F_FRONT - 0.035, F_FRONT + 0.3, 'black_paint')
    boolean(body, rec)
    ff = F_FRONT - 0.035
    for side in (1, -1):
        # rounded-rectangle headlamp: chrome bezel, lens, reflector
        hl = [(-0.105, -0.075, 0.035), (0.105, -0.075, 0.035), (0.105, 0.075, 0.035), (-0.105, 0.075, 0.035)]
        c = (side * 0.595, 0.623)
        out = [(x + c[0], y + c[1], r) for x, y, r in hl]
        v.front(f'hl_bezel{side}', erode_ctrl(out, -0.012), ff, ff + 0.018, 'chrome', holes=[erode_ctrl(out, 0.004)])
        v.front(f'hl_refl{side}', out, ff - 0.01, ff + 0.004, 'reflector')
        lens = v.front(f'hl_lens{side}', erode_ctrl(out, 0.002), ff + 0.004, ff + 0.014, 'lens_head')
        # turn signal below bumper line
        v.box(f'turn_f{side}', (F_FRONT - 0.05, 0.415, side * 0.60), (0.03, 0.045, 0.13), 'lens_amber', r=0.01)
    # grille: horizontal slats + frame + emblem
    v.front('grille_back', [(-0.47, 0.515, 0.01), (0.47, 0.515, 0.01), (0.47, 0.725, 0.01), (-0.47, 0.725, 0.01)], ff - 0.02, ff - 0.005, 'gap')
    for i in range(7):
        u = 0.535 + i * 0.029
        v.box(f'slat{i}', (ff + 0.006, u, 0.0), (0.016, 0.009, 0.92), 'black_paint')
    v.front('grille_frame', [(-0.48, 0.508, 0.012), (0.48, 0.508, 0.012), (0.48, 0.732, 0.012), (-0.48, 0.732, 0.012)], ff, ff + 0.02, 'chrome',
            holes=[[(-0.465, 0.522, 0.006), (0.465, 0.522, 0.006), (0.465, 0.718, 0.006), (-0.465, 0.718, 0.006)]])
    v.front('emblem', [(0.0, 0.57, 0.0), (0.045, 0.66, 0.008), (0.0, 0.70, 0.0), (-0.045, 0.66, 0.008)], ff + 0.012, ff + 0.03, 'chrome')
    # bumper: chrome blade wrapping the corners + rubber overriders
    bumper(v, 'bumper_f', F_FRONT + 0.035, 1, 0.36, 0.47)
    for side in (1, -1):
        v.box(f'overrider_f{side}', (F_FRONT + 0.075, 0.43, side * 0.36), (0.07, 0.20, 0.06), 'rubber', r=0.02)
    v.box('plate_f', (F_FRONT + 0.083, 0.43, 0.0), (0.006, 0.11, 0.50), 'plate', r=0.004)


def bumper(v, name, f_face, sign, u0, u1):
    """chrome blade bumper following the plan outline, wrapping round the corners"""
    from shapely.geometry import Polygon, box as sbox
    outline = Polygon(dedupe(rpoly(PLAN_LOWER, 6)))
    band = outline.buffer(0.05, join_style=1).difference(outline.buffer(0.012, join_style=1))
    if sign > 0:
        band = band.intersection(sbox(F_FRONT - 0.22, -1.0, 3.0, 1.0))
    else:
        band = band.intersection(sbox(-3.0, -1.0, F_REAR + 0.24, 1.0))
    if band.geom_type != 'Polygon':
        band = max(band.geoms, key=lambda g: g.area)
    pts = [(x, y, 0.0) for x, y in list(band.exterior.coords)[:-1]]
    v.top(name, pts, u0, u1, 'chrome', nseg=1, bevel=0.012)
    v.top(name + '_rub', [(x, y, 0.0) for x, y in list(outline.buffer(0.054, join_style=1).difference(outline.buffer(0.02, join_style=1)).intersection(
        sbox(F_FRONT - 0.18, -1, 3, 1) if sign > 0 else sbox(-3, -1, F_REAR + 0.20, 1)).exterior.coords)[:-1]],
        (u0 + u1) / 2 - 0.012, (u0 + u1) / 2 + 0.012, 'rubber', nseg=1)


def rear_end(v):
    for side in (1, -1):
        c = (side * 0.62, 0.69)
        tl = [(-0.13, -0.05, 0.015), (0.13, -0.05, 0.015), (0.13, 0.05, 0.015), (-0.13, 0.05, 0.015)]
        out = [(x + c[0], y + c[1], r) for x, y, r in tl]
        v.front(f'tl_house{side}', erode_ctrl(out, -0.008), F_REAR - 0.012, F_REAR + 0.01, 'chrome')
        red = [(x, y, r) for x, y, r in out]
        v.front(f'tl_red{side}', [(c[0] - 0.12 * side, c[1] - 0.04, 0.01), (c[0] + 0.02 * side, c[1] - 0.04, 0.01), (c[0] + 0.02 * side, c[1] + 0.04, 0.01), (c[0] - 0.12 * side, c[1] + 0.04, 0.01)]
                if side > 0 else [(c[0] - 0.02, c[1] - 0.04, 0.01), (c[0] + 0.12, c[1] - 0.04, 0.01), (c[0] + 0.12, c[1] + 0.04, 0.01), (c[0] - 0.02, c[1] + 0.04, 0.01)],
                F_REAR - 0.02, F_REAR - 0.006, 'lens_tail')
        amb = [(c[0] + 0.03 * side, c[1] - 0.04, 0.01), (c[0] + 0.12 * side, c[1] - 0.04, 0.01), (c[0] + 0.12 * side, c[1] + 0.04, 0.01), (c[0] + 0.03 * side, c[1] + 0.04, 0.01)]
        if side < 0: amb = list(reversed(amb))
        v.front(f'tl_amb{side}', amb, F_REAR - 0.02, F_REAR - 0.006, 'lens_amber')
        v.box(f'overrider_r{side}', (F_REAR - 0.075, 0.43, side * 0.38), (0.07, 0.20, 0.06), 'rubber', r=0.02)
    bumper(v, 'bumper_r', F_REAR - 0.035, -1, 0.37, 0.47)
    v.box('plate_r', (F_REAR - 0.012, 0.62, 0.0), (0.006, 0.11, 0.50), 'plate', r=0.004)
    v.box('trunk_lock', (F_REAR - 0.006, 0.75, 0.0), (0.01, 0.03, 0.06), 'chrome', r=0.005)


def side_details(v):
    for side in (1, -1):
        so = side * (SW - 0.004)
        # chrome belt and sill trims
        v.tube(f'belt_trim{side}', [(0.62, BELT + 0.012, side * 0.772), (-1.42, BELT + 0.04, side * 0.769)], 0.005, 'chrome', segs=6)
        v.tube(f'sill_trim{side}', [(FA - 0.36, 0.255, so - side * 0.03), (RA + 0.36, 0.255, so - side * 0.03)], 0.006, 'chrome', segs=6)
        for f in (-0.30, -1.18):
            v.box(f'handle{side}{f}', (f, 0.77, so + side * 0.004), (0.12, 0.022, 0.016), 'chrome', r=0.008)
        # mirror on the driver's door only
        if side > 0:
            v.tube('mirror_stem', [(0.50, BELT + 0.02, side * 0.80), (0.48, BELT + 0.09, side * 0.86)], 0.008, 'chrome', segs=6)
            v.lathe('mirror_head', [(-0.02, 0.0), (-0.02, 0.055), (0.0, 0.06), (0.01, 0.05), (0.012, 0.0)], 'chrome', at=(0.47, BELT + 0.12, side * 0.875), axis='f', segs=16)
            v.cyl('mirror_glass', (0.457, BELT + 0.12, side * 0.875), 0.05, 0.004, 'reflector', axis='f', segs=16)
        v.cyl(f'fuel_cap{side}', (RA - 0.20, 0.79, so), 0.045, 0.012, 'chrome', axis='s', segs=16) if side < 0 else None
    # wipers (at the base of the windshield), antenna
    for s in (0.05, -0.50):
        v.tube(f'wiper{s}', [(0.66, 0.90, s), (0.50, 0.97, s + 0.40)], 0.005, 'black_paint', segs=5)
        v.box(f'wiper_blade{s}', (0.58, 0.935, s + 0.20), (0.014, 0.016, 0.42), 'rubber', M=yaw_left(-12, 0.58, s + 0.2))


def interior(v):
    v.box('floor_carpet', (-0.45, FLOOR + 0.006, 0.0), (1.90, 0.012, 1.42), 'carpet', r=0.02)
    v.block('tunnel', [(-1.2, H([(0, FLOOR), (0.14, FLOOR, 0.0), (0.12, 0.35, 0.05), (0.0, 0.36, 1.0)])),
                       (0.60, H([(0, FLOOR), (0.16, FLOOR, 0.0), (0.14, 0.42, 0.06), (0.0, 0.44, 1.0)]))], 'carpet', n_f=2, nseg=3)
    # dashboard
    v.side('dash', [(0.42, 0.62, 0.03), (0.72, 0.60, 0.0), (0.72, 0.90, 0.0), (0.50, 0.90, 0.05), (0.38, 0.84, 0.04), (0.38, 0.70, 0.03)], -0.76, 0.76, 'vinyl')
    v.box('cluster_hood', (0.40, 0.875, 0.37), (0.10, 0.06, 0.36), 'vinyl', r=0.02)
    for i, s in enumerate((0.30, 0.44)):
        v.cyl(f'gauge{i}', (0.377, 0.80, s), 0.05, 0.01, 'gauge', axis='f', segs=16)
        v.lathe(f'gauge_bez{i}', [(-0.006, 0.05), (0.0, 0.056), (0.006, 0.054), (0.006, 0.049), (-0.006, 0.049)], 'chrome', at=(0.373, 0.80, s), axis='f', segs=14, closed=True)
    v.box('radio', (0.385, 0.71, 0.0), (0.02, 0.05, 0.18), 'plastic', r=0.005)
    v.box('glovebox', (0.388, 0.76, -0.38), (0.012, 0.11, 0.32), 'vinyl', r=0.01)
    Rm = build_steering_wheel(v, 'steer', (0.20, 0.86, 0.37), 22.0, diameter=0.40, rim_t=0.012, spokes=2, kind='plastic')
    v.pivots['steering_wheel'] = Rm
    c = math.cos(math.radians(22)); s_ = math.sin(math.radians(22))
    v.tube('steer_col', [(0.20 + 0.04 * c, 0.86 - 0.04 * s_, 0.37), (0.45, 0.86 - 0.25 * s_ / c, 0.37)], 0.025, 'plastic', segs=10)
    for i, s in enumerate((0.27, 0.37, 0.46)):
        v.box(f'pedal{i}', (0.50, 0.38, s), (0.02, 0.07, 0.06), 'rubber', r=0.008, M=pitch_up(-30, 0.50, 0.38))
    v.tube('gear_lever', [(0.15, 0.44, 0.0), (0.07, 0.66, 0.0)], 0.008, 'chrome', segs=6)
    v.lathe('gear_knob', [(-0.02, 0.0), (-0.02, 0.014), (0.0, 0.022), (0.02, 0.016), (0.028, 0.0)], 'plastic', at=(0.07, 0.66, 0.0), axis='u', segs=12)
    v.box('handbrake', (-0.05, 0.42, 0.0), (0.2, 0.025, 0.03), 'plastic', r=0.008, M=pitch_up(15, -0.05, 0.42))
    hips = []
    for side in (1, -1):
        obs, hip = build_seat(v, f'seat_f{side}', -0.06, 0.50, side * 0.37, width=0.50, depth=0.50, back_h=0.62, recline=16,
                              kind='fabric', cush_t=0.12, floor_u=FLOOR, bolster=0.03)
        hips.append(hip)
    obs, hip = build_seat(v, 'bench', -0.88, 0.50, 0.0, width=1.36, depth=0.48, back_h=0.56, recline=20, kind='fabric', cush_t=0.13, bolster=0.012)
    v.box('bench_base', (-1.12, FLOOR + 0.11, 0.0), (0.42, 0.22, 1.30), 'carpet', r=0.02)
    v.box('parcel_shelf', (-1.50, 0.93, 0.0), (0.30, 0.012, 1.40), 'carpet')
    v.empty('seat_0', *hips[0]); v.empty('seat_1', *hips[1])
    v.empty('seat_2', hip[0], hip[1], 0.37); v.empty('seat_3', hip[0], hip[1], -0.37)
    v.box('rv_mirror', (0.06, ROOF - 0.07, 0.0), (0.02, 0.06, 0.18), 'plastic', r=0.01)
    for side in (1, -1):
        so = side * 0.765
        for (f0, f1) in ((0.52, -0.40), (-0.50, -1.25)):
            v.box(f'card{side}{f0}', ((f0 + f1) / 2, 0.60, so), (abs(f1 - f0) - 0.05, 0.42, 0.012), 'vinyl', r=0.006)
            v.box(f'armrest{side}{f0}', ((f0 + f1) / 2 - 0.05, 0.68, so - side * 0.03), (0.30, 0.04, 0.05), 'vinyl', r=0.015)
        v.box(f'visor{side}', (0.0, ROOF - 0.06, side * 0.36), (0.16, 0.015, 0.36), 'vinyl', r=0.006)


def chassis(v):
    K = 'chassis'
    v.box('floorpan', (-0.1, 0.205, 0.0), (3.6, 0.03, 1.40), K, r=0.01)
    v.box('engine', (1.45, 0.42, 0.0), (0.60, 0.40, 0.70), K, r=0.06)
    v.box('gearbox', (0.95, 0.30, 0.0), (0.45, 0.16, 0.30), K, r=0.04)
    v.cyl('rear_axle', (RA, R, 0.0), 0.04, 1.20, K, axis='s', segs=12)
    v.lathe('rear_diff', [(-0.10, 0.0), (-0.10, 0.06), (-0.04, 0.11), (0.05, 0.10), (0.10, 0.04), (0.10, 0.0)], K, at=(RA, R, 0.0), axis='f', segs=12)
    v.tube('driveshaft', [(0.75, 0.29, 0.0), (RA + 0.10, R, 0.0)], 0.03, K, segs=10)
    for side in (1, -1):
        v.cyl(f'coil_r{side}', (RA, 0.48, side * 0.48), 0.06, 0.24, K, axis='u', segs=10)
        v.tube(f'arm_f{side}', [(FA - 0.15, 0.25, side * 0.25), (FA, R - 0.02, side * (TW - 0.12))], 0.022, K, segs=8)
        v.cyl(f'strut_f{side}', (FA, 0.52, side * 0.55), 0.04, 0.38, K, axis='u', segs=10)
        for fc in (FA, RA):
            v.lathe(f'drum{fc}{side}', [(-0.04, 0.0), (-0.04, 0.11), (0.04, 0.11), (0.04, 0.0)], K, at=(fc, R, side * (TW - 0.09)), axis='s', segs=16)
    v.tube('exhaust_pipe', [(1.30, 0.25, -0.22), (0.4, 0.17, -0.20), (-0.6, 0.17, -0.25)], 0.022, 'exhaust', segs=8, bend_r=0.12)
    v.cyl('muffler', (-1.05, 0.20, -0.30), 0.075, 0.70, 'exhaust', axis='f', segs=14)
    v.tube('tail_pipe', [(-1.40, 0.20, -0.32), (-1.80, 0.21, -0.40), (F_REAR - 0.03, 0.22, -0.42)], 0.02, 'exhaust', segs=8, bend_r=0.1)
    v.box('fuel_tank', (-1.75, 0.30, 0.15), (0.40, 0.14, 0.70), K, r=0.03)
    v.box('spare_well', (-1.95, 0.30, 0.0), (0.55, 0.16, 0.60), K, r=0.05)


def wheels(v):
    rim_r = 13 * 0.0254 / 2
    build_tire(v, 'tire', R, 0.155, rim_r, 'road', segs=36, group='wheel')
    build_steel_rim(v, 'rim', rim_r, 0.115, kind='steel', group='wheel', segs=24, nuts=0, pcd=0.13, dish=0.03, holes=4)
    # chrome hub cap (dome)
    v.lathe('hubcap', [(0.040, 0.0), (0.040, 0.12), (0.048, 0.125), (0.058, 0.115), (0.070, 0.09), (0.078, 0.05), (0.080, 0.0)], 'chrome', at=(0, 0, 0), axis='s', segs=24, group='wheel')
    v.instance('wheel_fl', 'wheel', FA, R, TW)
    v.instance('wheel_fr', 'wheel', FA, R, -TW, flip=True)
    v.instance('wheel_rl', 'wheel', RA, R, TW)
    v.instance('wheel_rr', 'wheel', RA, R, -TW, flip=True)
    v.meta.update({'wheel_radius': R, 'wheelbase': WB, 'track': TRACK, 'seats': 4})
