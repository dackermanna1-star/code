"""1980s compact 4-door (double cab) pickup truck, e.g. Toyota Hilux N40 double cab class.
Approx. data: L 4.69 m, W 1.66 m, H 1.62 m, wheelbase 2.85 m, track 1.40 m, tyres 185R14 (R 0.326 m)."""
import math
from vkit import *

WB = 2.85
TRACK = 1.40
R = 0.326
FA, RA = WB / 2, -WB / 2
TW = TRACK / 2
TEX = 2048
META = {'name': 'Compact pickup (double cab, 4 seats)',
        'references': ['https://commons.wikimedia.org/wiki/Category:Toyota_Hilux_(fourth_generation)']}

SW = 0.83
F_FRONT, CAB_BACK, F_REAR = 2.18, -0.86, -2.50
BELT = 1.06
ROOF = 1.615
HOOD_F, HOOD_R = 1.00, 1.04
FLOOR = 0.52
BED_FLOOR = 0.70
BED_TOP = 1.06


def H(pts):
    return mirror_half(pts)


def cab_keys(e=0.0):
    def sec(deck, w=SW, bot=0.40):
        return H([(0.0, bot), (w - 0.06, bot, 0.04), (w - 0.01, bot + 0.10, 0.06), (w, 0.70, 0.2), (w - 0.004, 0.86, 0.01),
                  (w - 0.02, deck - 0.012, 0.035), (0.0, deck + 0.012, 4.0)])
    keys = [(CAB_BACK - 0.02, sec(BELT)), (0.95, sec(HOOD_R)), (F_FRONT + 0.02, sec(HOOD_F, SW - 0.015, 0.43))]
    return eroded_keys(keys, e) if e else keys


SIL_CAB = [(CAB_BACK, 0.40, 0.03), (CAB_BACK, 1.30, 0.0), (F_FRONT, 1.30, 0.0), (F_FRONT + 0.005, 0.96, 0.02), (F_FRONT, 0.46, 0.04),
           (F_FRONT - 0.10, 0.36, 0.06), (CAB_BACK + 0.10, 0.36, 0.06)]
PLAN_CAB = [(CAB_BACK, -SW, 0.02), (F_FRONT, -SW + 0.02, 0.07), (F_FRONT, SW - 0.02, 0.07), (CAB_BACK, SW, 0.02)]


def gh_keys(e=0.0):
    def sec(wb=0.80, wr=0.70):
        return H([(0.0, 0.95), (wb, 0.95, 0.0), (wb - 0.01, BELT + 0.02, 0.02), (wr, ROOF - 0.04, 0.06), (0.0, ROOF, 4.0)])
    keys = [(CAB_BACK - 0.02, sec(0.80, 0.70)), (1.10, sec(0.80, 0.70))]
    return eroded_keys(keys, e) if e else keys


SIL_GH = [(CAB_BACK, 0.95, 0.0), (CAB_BACK, ROOF + 0.01, 0.05), (0.52, ROOF + 0.01, 0.07), (0.98, BELT + 0.0, 0.02), (1.02, 0.95, 0.0)]
PLAN_GH = [(CAB_BACK - 0.01, -0.80, 0.03), (1.05, -0.80, 0.12), (1.05, 0.80, 0.12), (CAB_BACK - 0.01, 0.80, 0.03)]
WS_BASE, WS_ANG = (0.98, BELT), 39.2
WIN_WS = [(-0.70, 0.045, 0.04), (0.70, 0.045, 0.04), (0.66, 0.665, 0.06), (-0.66, 0.665, 0.06)]
WIN_FD = [(0.88, BELT + 0.03, 0.02), (0.505, ROOF - 0.05, 0.05), (-0.02, ROOF - 0.05, 0.03), (-0.02, BELT + 0.03, 0.0)]
WIN_RD = [(-0.07, BELT + 0.03, 0.0), (-0.07, ROOF - 0.05, 0.03), (-0.72, ROOF - 0.05, 0.05), (-0.72, BELT + 0.03, 0.02)]
WIN_BK = [(-0.62, BELT + 0.07, 0.05), (0.62, BELT + 0.07, 0.05), (0.60, ROOF - 0.07, 0.06), (-0.60, ROOF - 0.07, 0.06)]


def tilted(v, name, ctrl, base, ang, kind, depth=0.12):
    o = prism(v, name, ctrl, 'front', -depth, depth, kind)
    o.data.transform(TR(base[0], base[1], 0) @ pitch_up(ang))
    return o


def cab_solid(v, e=0.0, e_gh=None, name='cab'):
    e_gh = e if e_gh is None else e_gh
    lo = v.block(name + '_lo', cab_keys(e), 'paint', register=False, n_f=14, nseg=3, edge_div=sym_div([0, 1, 2, 1, 1, 4]) if not e else None)
    boolean(lo, prism(v, 'sil', SIL_CAB, 'side', -1.2, 1.2, 'paint', erode=e), 'INTERSECT')
    boolean(lo, prism(v, 'plan', PLAN_CAB, 'top', 0.0, 2.0, 'paint', erode=e), 'INTERSECT')
    gh = v.block(name + '_gh', gh_keys(e_gh), 'paint', register=False, n_f=6, nseg=4)
    boolean(gh, prism(v, 'silg', SIL_GH, 'side', -1.2, 1.2, 'paint', erode=e_gh), 'INTERSECT')
    boolean(gh, prism(v, 'plang', PLAN_GH, 'top', 0.5, 2.0, 'paint', erode=e_gh), 'INTERSECT')
    boolean(lo, gh, 'UNION')
    return lo


def gh_only(v, e):
    gh = v.block('ghx', gh_keys(e), 'glass', register=False, n_f=6, nseg=4)
    boolean(gh, prism(v, 'silg', SIL_GH, 'side', -1.2, 1.2, 'glass', erode=e), 'INTERSECT')
    boolean(gh, prism(v, 'plang', PLAN_GH, 'top', 0.5, 2.0, 'glass', erode=e), 'INTERSECT')
    return gh


def build(v):
    v.paint = '#c9b892'
    v.paint_coat = 0.15
    v.look = dict(dirt=1.0, wear=0.9)
    v.uv_scale.update({'chassis': 0.4, 'paint_in': 0.5, 'vinyl': 0.6, 'fabric': 0.6, 'gap': 0.2, 'carpet': 0.4, 'seal': 0.5})
    cab(v)
    bed(v)
    front_end(v)
    interior(v)
    chassis(v)
    wheels(v)
    v.empty('light_l', F_FRONT + 0.005, 0.80, 0.60)
    v.empty('light_r', F_FRONT + 0.005, 0.80, -0.60)
    v.empty('exhaust', F_REAR + 0.29, 0.30, -0.555, M=yaw_left(180))


def cab(v):
    body = cab_solid(v)
    cuts = [v.cyl('arch', (FA, R + 0.04, side * 0.85), R + 0.08, 0.60, 'chassis', axis='s', segs=32, register=False) for side in (1, -1)]
    boolean(body, cuts)
    cav = cab_solid(v, 0.03, 0.015, 'cav')
    boolean(cav, v.box('lim', (0.06, 1.2, 0.0), (1.80, 1.6, 2.0), 'paint_in', register=False), 'INTERSECT')
    cav.data.materials.clear(); cav.data.materials.append(kind_material('paint_in'))
    boolean(body, cav)
    cuts = []
    for side in (1, -1):
        cuts.append(prism(v, 'wfd', WIN_FD, 'side', side * 0.6, side * 1.0, 'seal'))
        cuts.append(prism(v, 'wrd', WIN_RD, 'side', side * 0.6, side * 1.0, 'seal'))
    cuts.append(tilted(v, 'ws', WIN_WS, WS_BASE, WS_ANG, 'seal'))
    cuts.append(prism(v, 'bk', WIN_BK, 'front', CAB_BACK - 0.1, CAB_BACK + 0.1, 'seal'))
    boolean(body, cuts)
    g = gh_only(v, 0.003)
    boolean(g, gh_only(v, 0.008))
    gc = []
    for side in (1, -1):
        gc.append(prism(v, 'g1', erode_ctrl(WIN_FD, -0.01), 'side', side * 0.6, side * 1.0, 'glass'))
        gc.append(prism(v, 'g2', erode_ctrl(WIN_RD, -0.01), 'side', side * 0.6, side * 1.0, 'glass'))
    gc.append(tilted(v, 'g3', erode_ctrl(WIN_WS, -0.01), WS_BASE, WS_ANG, 'glass'))
    gc.append(prism(v, 'g4', erode_ctrl(WIN_BK, -0.01), 'front', CAB_BACK - 0.1, CAB_BACK + 0.1, 'glass'))
    boolean(g, join(gc, 'gcut'), 'INTERSECT')
    g.data.materials.clear(); g.data.materials.append(kind_material('glass'))
    v.register(g); g.name = 'glass'
    cuts = []
    for side in (1, -1):
        a0, a1 = side * 0.62, side * 0.95
        cuts.append(slot(v, 'gd1', [(0.90, BELT + 0.04), (0.92, 0.70), (0.90, 0.43), (-0.05, 0.43), (-0.05, BELT + 0.04)], 'side', a0, a1, 0.004))
        cuts.append(slot(v, 'gd2', [(-0.07, 0.43), (-0.72, 0.43), (-0.74, BELT + 0.04)], 'side', a0, a1, 0.004))
    cuts.append(slot(v, 'ghood', [(2.40, 0.74), (1.02, 0.74), (1.02, -0.74), (2.40, -0.74)], 'top', 0.85, 1.2, 0.004))
    cuts.append(slot(v, 'ghood2', [(-0.74, 1.10), (-0.74, 0.92), (0.74, 0.92), (0.74, 1.10)], 'front', F_FRONT - 0.1, F_FRONT + 0.1, 0.004))
    boolean(body, cuts)
    set_kind_faces(body, 'chassis', lambda c, n: n[1] < -0.6 and c[1] < 0.45)
    set_kind_faces(body, 'fabric', lambda c, n: n[1] < -0.5 and c[1] > 1.45 and abs(c[2]) < 0.74)
    v.register(body); body.name = 'cab'
    v.body = body
    for side in (1, -1):
        so = side * (SW + 0.002)
        for f in (0.05, -0.62):
            v.box(f'handle{side}{f}', (f, 0.96, so), (0.12, 0.025, 0.02), 'black_paint', r=0.008)
        v.box(f'mirror_arm{side}', (0.86, BELT + 0.05, side * 0.86), (0.05, 0.03, 0.08), 'black_paint', r=0.01)
        v.box(f'mirror{side}', (0.85, BELT + 0.12, side * 0.92), (0.03, 0.14, 0.10), 'black_paint', r=0.015)
        v.box(f'mirror_g{side}', (0.835, BELT + 0.12, side * 0.92), (0.004, 0.12, 0.085), 'reflector', r=0.008)
        v.tube(f'drip{side}', [(0.44, ROOF - 0.03, side * 0.705), (CAB_BACK + 0.02, ROOF - 0.03, side * 0.705)], 0.006, 'chrome', segs=5)
        v.tube(f'belt_trim{side}', [(0.92, BELT + 0.01, side * 0.807), (CAB_BACK + 0.02, BELT + 0.01, side * 0.807)], 0.005, 'chrome', segs=5)
    for s in (0.05, -0.55):
        v.box(f'wiper{s}', (1.0, BELT + 0.04, s + 0.24), (0.014, 0.016, 0.46), 'rubber', M=yaw_left(-10, 1.0, s + 0.24))


def bed(v):
    bsec = H([(0.0, 0.50), (SW - 0.05, 0.50, 0.03), (SW, 0.62, 0.05), (SW, 0.86, 0.01), (SW - 0.01, BED_TOP, 0.02), (0.0, BED_TOP)])
    b = v.block('bed', [(F_REAR, bsec), (CAB_BACK - 0.03, bsec)], 'paint', end0=0.02, n_f=2, nseg=3)
    inner = v.box('bed_in', ((F_REAR + CAB_BACK) / 2, 1.2, 0.0), (abs(F_REAR - CAB_BACK) - 0.10, 1.0, 2 * SW - 0.08), 'paint_in', register=False, r=0.02)
    inner.data.transform(TR(0, BED_FLOOR - 0.7, 0))
    for side in (1, -1):
        hump = v.cyl('hump', (RA, R + 0.04, side * 0.70), R + 0.12, 0.40, 'paint_in', axis='s', segs=24, register=False)
        boolean(inner, hump)
    boolean(b, inner)
    cuts = [v.cyl('arch', (RA, R + 0.04, side * 0.85), R + 0.08, 0.40, 'chassis', axis='s', segs=32, register=False) for side in (1, -1)]
    boolean(b, cuts)
    boolean(b, slot(v, 'tg', [(-0.78, BED_TOP + 0.05), (-0.78, 0.56), (0.78, 0.56), (0.78, BED_TOP + 0.05)], 'front', F_REAR - 0.08, F_REAR + 0.06, 0.005))
    set_kind_faces(b, 'chassis', lambda c, n: n[1] < -0.6 and c[1] < 0.55)
    for side in (1, -1):
        v.box(f'tail{side}', (F_REAR - 0.012, 0.80, side * 0.75), (0.02, 0.22, 0.07), 'lens_tail', r=0.01)
        v.box(f'tail_amb{side}', (F_REAR - 0.012, 0.66, side * 0.75), (0.02, 0.06, 0.07), 'lens_amber', r=0.01)
        v.box(f'stake{side}', (CAB_BACK - 0.09, BED_TOP + 0.01, side * 0.79), (0.08, 0.02, 0.06), 'black_paint', r=0.005)
    v.box('tg_handle', (F_REAR - 0.01, 0.98, 0.0), (0.02, 0.04, 0.20), 'black_paint', r=0.01)
    v.side('bumper_r', [(F_REAR - 0.10, 0.42, 0.02), (F_REAR + 0.02, 0.42, 0.0), (F_REAR + 0.02, 0.54, 0.0), (F_REAR - 0.10, 0.54, 0.02)], -0.80, 0.80, 'chrome', bevel=0.008)
    v.box('step', (F_REAR - 0.06, 0.545, 0.0), (0.10, 0.012, 0.40), 'rubber', r=0.004)
    v.box('plate_r', (F_REAR - 0.104, 0.48, 0.0), (0.006, 0.11, 0.30), 'plate', r=0.004)
    # headache rack behind the cab
    for side in (1, -1):
        v.tube(f'rack{side}', [(CAB_BACK - 0.10, BED_TOP, side * 0.76), (CAB_BACK - 0.10, ROOF + 0.06, side * 0.76)], 0.022, 'black_paint', segs=10)
    v.tube('rack_top', [(CAB_BACK - 0.10, ROOF + 0.06, 0.76), (CAB_BACK - 0.10, ROOF + 0.06, -0.76)], 0.022, 'black_paint', segs=10)


def front_end(v):
    body = v.body
    rec = prism(v, 'frec', [(-0.77, 0.66, 0.02), (0.77, 0.66, 0.02), (0.77, 0.92, 0.02), (-0.77, 0.92, 0.02)], 'front', F_FRONT - 0.03, F_FRONT + 0.3, 'black_paint')
    boolean(body, rec)
    ff = F_FRONT - 0.03
    v.front('grille_back', [(-0.52, 0.67, 0.0), (0.52, 0.67, 0.0), (0.52, 0.91, 0.0), (-0.52, 0.91, 0.0)], ff - 0.02, ff - 0.006, 'gap')
    for i in range(5):
        v.box(f'grille_h{i}', (ff + 0.004, 0.70 + i * 0.045, 0.0), (0.02, 0.012, 1.04), 'black_paint')
    for i in range(9):
        v.box(f'grille_v{i}', (ff + 0.002, 0.79, -0.48 + i * 0.12), (0.016, 0.24, 0.010), 'black_paint')
    v.front('grille_frame', [(-0.535, 0.665, 0.01), (0.535, 0.665, 0.01), (0.535, 0.915, 0.01), (-0.535, 0.915, 0.01)], ff, ff + 0.02, 'chrome',
            holes=[[(-0.515, 0.68, 0.005), (0.515, 0.68, 0.005), (0.515, 0.90, 0.005), (-0.515, 0.90, 0.005)]])
    for side in (1, -1):
        c = (side * 0.645, 0.80)
        out = [(c[0] - 0.105, c[1] - 0.075, 0.012), (c[0] + 0.105, c[1] - 0.075, 0.012), (c[0] + 0.105, c[1] + 0.075, 0.012), (c[0] - 0.105, c[1] + 0.075, 0.012)]
        v.front(f'hl_bezel{side}', erode_ctrl(out, -0.012), ff, ff + 0.02, 'chrome', holes=[erode_ctrl(out, 0.004)])
        v.front(f'hl_refl{side}', out, ff - 0.012, ff + 0.004, 'reflector')
        v.front(f'hl_lens{side}', erode_ctrl(out, 0.002), ff + 0.004, ff + 0.016, 'lens_head')
        v.box(f'turn_f{side}', (F_FRONT + 0.05, 0.58, side * 0.62), (0.03, 0.05, 0.14), 'lens_amber', r=0.01)
        v.box(f'side_marker{side}', (F_FRONT - 0.12, 0.80, side * (SW - 0.004)), (0.08, 0.035, 0.012), 'lens_amber', r=0.006)
    v.side('bumper_f', [(F_FRONT - 0.02, 0.48, 0.0), (F_FRONT + 0.10, 0.48, 0.02), (F_FRONT + 0.10, 0.64, 0.02), (F_FRONT - 0.02, 0.64, 0.0)], -0.84, 0.84, 'chrome', bevel=0.01)
    v.box('plate_f', (F_FRONT + 0.104, 0.56, 0.0), (0.006, 0.11, 0.40), 'plate', r=0.004)
    v.box('valance', (F_FRONT - 0.05, 0.47, 0.0), (0.06, 0.04, 1.40), 'chassis', r=0.01)


def interior(v):
    v.box('floor_mat', (0.05, FLOOR + 0.006, 0.0), (1.70, 0.012, 1.48), 'rubber', r=0.02)
    v.side('dash', [(0.70, 0.86, 0.03), (0.98, 0.84, 0.0), (0.98, 1.10, 0.0), (0.78, 1.10, 0.04), (0.66, 1.04, 0.04), (0.66, 0.92, 0.03)], -0.79, 0.79, 'plastic')
    v.box('cluster', (0.665, 1.0, 0.40), (0.012, 0.11, 0.34), 'gauge', r=0.01)
    v.box('glovebox', (0.672, 0.98, -0.40), (0.012, 0.12, 0.34), 'plastic_grey', r=0.01)
    Rm = build_steering_wheel(v, 'steer', (0.45, 1.08, 0.40), 25.0, diameter=0.40, rim_t=0.013, spokes=3, kind='plastic')
    v.pivots['steering_wheel'] = Rm
    c = math.cos(math.radians(25)); s_ = math.sin(math.radians(25))
    v.tube('steer_col', [(0.45 + 0.04 * c, 1.08 - 0.04 * s_, 0.40), (0.72, 1.08 - 0.27 * s_ / c, 0.40)], 0.025, 'plastic', segs=10)
    for i, s in enumerate((0.30, 0.40, 0.50)):
        v.box(f'pedal{i}', (0.74, 0.66, s), (0.02, 0.07, 0.06), 'rubber', r=0.008, M=pitch_up(-30, 0.74, 0.66))
    v.tube('gear_lever', [(0.40, 0.62, 0.0), (0.30, 0.90, 0.0)], 0.009, 'black_paint', segs=6)
    v.lathe('gear_knob', [(-0.02, 0.0), (-0.02, 0.014), (0.0, 0.024), (0.02, 0.016), (0.028, 0.0)], 'plastic', at=(0.30, 0.90, 0.0), axis='u', segs=12)
    hips = []
    for side in (1, -1):
        obs, hip = build_seat(v, f'seat_f{side}', 0.18, 0.79, side * 0.40, width=0.52, depth=0.50, back_h=0.60, recline=15,
                              kind='fabric', cush_t=0.13, floor_u=FLOOR, bolster=0.025, headrest=False)
        hips.append(hip)
    obs, hip = build_seat(v, 'bench', -0.40, 0.79, 0.0, width=1.40, depth=0.42, back_h=0.54, recline=10, kind='fabric', cush_t=0.13, bolster=0.01)
    v.box('bench_base', (-0.62, FLOOR + 0.07, 0.0), (0.36, 0.14, 1.36), 'paint_in', r=0.02)
    v.empty('seat_0', *hips[0]); v.empty('seat_1', *hips[1])
    v.empty('seat_2', hip[0], hip[1], 0.40); v.empty('seat_3', hip[0], hip[1], -0.40)
    v.box('rv_mirror', (0.50, ROOF - 0.07, 0.0), (0.02, 0.06, 0.18), 'plastic', r=0.01)
    for side in (1, -1):
        so = side * 0.795
        for (f0, f1) in ((0.88, -0.03), (-0.09, -0.72)):
            v.box(f'card{side}{f0}', ((f0 + f1) / 2, 0.86, so), (abs(f1 - f0) - 0.06, 0.38, 0.012), 'vinyl', r=0.006)


def chassis(v):
    K = 'chassis'
    for side in (1, -1):
        v.box(f'rail{side}', (-0.15, 0.40, side * 0.45), (4.50, 0.12, 0.06), K, r=0.006)
        pts = []
        for i in range(9):
            t = -1 + 2 * i / 8
            pts.append((RA + 0.62 * t, 0.36 - 0.05 * (1 - t * t)))
        band = [(p[0], p[1] + 0.012) for p in pts] + [(p[0], p[1] - 0.028) for p in reversed(pts)]
        v.side(f'spring{side}', [(x, y, 0.0) for x, y in band], side * 0.42, side * 0.48, K, nseg=1)
        v.tube(f'arm_f{side}', [(FA - 0.15, 0.38, side * 0.35), (FA, R, side * (TW - 0.12))], 0.025, K, segs=8)
        v.tube(f'shock{side}', [(RA + 0.15, R, side * 0.55), (RA + 0.25, 0.52, side * 0.52)], 0.022, 'steel', segs=8)
        for fc in (FA, RA):
            v.lathe(f'drum{fc}{side}', [(-0.04, 0.0), (-0.04, 0.13), (0.04, 0.13), (0.04, 0.0)], K, at=(fc, R, side * (TW - 0.10)), axis='s', segs=16)
    v.cyl('rear_axle', (RA, R, 0.0), 0.042, 1.24, K, axis='s', segs=12)
    v.lathe('rear_diff', [(-0.11, 0.0), (-0.11, 0.06), (-0.04, 0.12), (0.06, 0.11), (0.11, 0.05), (0.11, 0.0)], K, at=(RA, R, 0.0), axis='f', segs=14)
    v.box('engine', (1.50, 0.62, 0.0), (0.60, 0.42, 0.62), K, r=0.06)
    v.box('gearbox', (0.70, 0.48, 0.0), (0.70, 0.18, 0.28), K, r=0.04)
    v.tube('driveshaft', [(0.35, 0.46, 0.0), (RA + 0.12, R, 0.0)], 0.032, K, segs=10)
    v.tube('exhaust_pipe', [(1.30, 0.42, -0.25), (0.6, 0.33, -0.25), (-0.3, 0.33, -0.30)], 0.024, 'exhaust', segs=8, bend_r=0.12)
    v.cyl('muffler', (-0.65, 0.34, -0.32), 0.08, 0.60, 'exhaust', axis='f', segs=14)
    v.tube('tail_pipe', [(-0.95, 0.34, -0.32), (-1.60, 0.34, -0.38), (F_REAR + 0.40, 0.33, -0.50), (F_REAR + 0.30, 0.30, -0.55)], 0.022, 'exhaust', segs=8, bend_r=0.1)
    v.box('fuel_tank', (-1.0, 0.45, 0.55), (0.70, 0.20, 0.30), K, r=0.03)
    v.instance('spare_wheel', 'wheel', F_REAR + 0.55, 0.40, 0.0, R=roll_left(90))


def wheels(v):
    rim_r = 14 * 0.0254 / 2
    build_tire(v, 'tire', R, 0.185, rim_r, 'road', segs=36, group='wheel')
    build_steel_rim(v, 'rim', rim_r, 0.14, kind='steel', group='wheel', segs=24, nuts=6, pcd=0.1397, dish=0.035, holes=5)
    v.lathe('centre_cap', [(0.050, 0.0), (0.050, 0.07), (0.058, 0.072), (0.066, 0.06), (0.072, 0.0)], 'chrome', at=(0, 0, 0), axis='s', segs=20, group='wheel')
    v.instance('wheel_fl', 'wheel', FA, R, TW)
    v.instance('wheel_fr', 'wheel', FA, R, -TW, flip=True)
    v.instance('wheel_rl', 'wheel', RA, R, TW)
    v.instance('wheel_rr', 'wheel', RA, R, -TW, flip=True)
    v.meta.update({'wheel_radius': R, 'wheelbase': WB, 'track': TRACK, 'seats': 4})
