"""UAZ-469 style Soviet 4x4 with canvas soft top.
Real data: L 4.03 m, W 1.79 m, H 2.02 m, wheelbase 2.38 m, track 1.44 m, tyres 215/90 R15 (R 0.384 m).
Body lines read off Wikimedia Commons side photos (see META['references'])."""
import math
from vkit import *

WB = 2.38
TRACK = 1.442
R = 0.384
FA, RA = WB / 2, -WB / 2
TW = TRACK / 2
TEX = 2048
DEFAULT_VARIANT = 'soft'

META = {
    'name': 'UAZ-469 (canvas soft top)',
    'references': ['https://commons.wikimedia.org/wiki/File:UAZ_469.JPG',
                   'https://commons.wikimedia.org/wiki/File:UAZ-469_FI_H86018_05.JPG',
                   'https://commons.wikimedia.org/wiki/File:UAZ-469_(side).jpg'],
}

S = 0.885          # front clip half width
SB = 0.845         # tub side half width
TOP = 1.2          # belt line (tub top)
FLOOR = 0.56


def H(pts):
    return mirror_half(pts)


def both(fn):
    return [fn(1), fn(-1)]


def build(v):
    v.paint = '#4d5534'
    v.uv_scale.update({'chassis': 0.45, 'paint_in': 0.6, 'vinyl': 0.7, 'gap': 0.2, 'rubber': 0.6, 'canvas': 0.8})
    body_shell(v)
    front_end(v)
    doors_and_frames(v)
    if v.variant != 'open':
        canvas_top(v)
    rear_end(v)
    interior(v)
    chassis(v)
    wheels(v)
    # named points
    v.empty('light_l', 1.72, 0.93, 0.665)
    v.empty('light_r', 1.72, 0.93, -0.665)
    v.empty('exhaust', -1.83, 0.36, -0.55, M=yaw_left(180))


# ------------------------------------------------------------------------------------------------ body
def body_shell(v):
    # hood / centre block (its front face is the grille panel)
    def hsec(hood_u, bot):
        return H([(0.0, bot), (0.64, bot, 0.0), (0.64, hood_u - 0.004, 0.012), (0.0, hood_u + 0.022, 3.0)])
    clip = v.block('front_clip', [(0.44, hsec(1.215, 0.45)), (1.0, hsec(1.203, 0.52)), (1.695, hsec(1.170, 0.60))],
                   'paint_matte', end1=0.035, n_f=8, nseg=3, edge_div=sym_div([0, 0, 4]))
    # pontoon fenders with rounded noses (headlamps live in the noses)
    def fd(side, top, bot, so=S, si=0.47):
        pts = [(si, bot, 0.0), (so - 0.03, bot, 0.03), (so, bot + 0.12, 0.05), (so, top - 0.06, 0.25), (0.60, top, 0.04), (si, top - 0.012, 0.0)]
        pts = [(side * p[0], p[1], p[2]) for p in pts]
        return pts if side > 0 else list(reversed(pts))
    for side in (1, -1):
        fen = v.block('fender', [(0.44, fd(side, 1.207, 0.45)), (1.0, fd(side, 1.195, 0.52)), (1.735, fd(side, 1.152, 0.60, S - 0.022))],
                      'paint_matte', register=False, end1=0.11, n_f=8, nseg=4, edge_div=[0, 1, 3, 2, 1, 0])
        boolean(clip, fen, 'UNION')
    def tsec(top=TOP, bot=0.45):
        return H([(0.0, bot), (SB - 0.05, bot, 0.03), (SB, 0.62, 0.05), (SB, 1.03, 0.008), (SB - 0.018, top, 0.022), (0.0, top)])
    tub = v.block('tub', [(-1.73, tsec()), (0.44, tsec())], 'paint_matte', end0=0.05, n_f=2, n_end=3, nseg=3)
    v.clip, v.tub = clip, tub
    fa = [(1.60, -0.2), (1.58, 0.66, 0.06), (1.44, 0.915, 0.18), (0.90, 0.915, 0.18), (0.66, 0.52, 0.05), (0.62, -0.2)]
    ra = [(-0.83, -0.2), (-0.84, 0.50, 0.05), (-1.0, 0.83, 0.18), (-1.50, 0.83, 0.18), (-1.67, 0.55, 0.05), (-1.68, -0.2)]
    for side in (1, -1):
        boolean(clip, v.side('arch_cut_f', fa, 0.50 * side, 1.2 * side, 'chassis', register=False))
        boolean(tub, v.side('arch_cut_r', ra, 0.52 * side, 1.2 * side, 'chassis', register=False))
    # cavity (cabin + cargo) keeps the rear wheel-house humps
    csec = H([(0, FLOOR), (0.80, FLOOR, 0.03), (0.80, 1.6, 0.0), (0, 1.6)])
    cav = v.block('cavity', [(-1.69, csec), (0.40, csec)], 'paint_in', register=False, n_f=2)
    for side in (1, -1):
        hump = v.side('hump', [(-0.78, -0.2), (-0.80, 0.55, 0.05), (-0.96, 0.87, 0.2), (-1.54, 0.87, 0.2), (-1.73, 0.58, 0.05), (-1.74, -0.2)],
                      0.50 * side, 1.0 * side, 'paint_in', register=False)
        boolean(cav, hump)
    boolean(tub, cav)
    # door gaps (through the wall: the doors become separate shells)
    cuts = []
    for side in (1, -1):
        a0, a1 = 0.76 * side, 0.95 * side
        cuts.append(slot(v, 'gap_fd', [(0.43, 1.30), (0.43, 0.50), (0.03, 0.50), (-0.37, 1.30)], 'side', a0, a1, 0.005))
        cuts.append(slot(v, 'gap_rd', [(0.03, 0.50), (-0.76, 0.50), (-1.055, 1.30)], 'side', a0, a1, 0.005))
    boolean(tub, cuts)
    # tailgate gap (rear face)
    boolean(tub, slot(v, 'gap_tg', [(0.60, 1.30), (0.60, 0.56), (-0.60, 0.56), (-0.60, 1.30)], 'front', -1.80, -1.66, 0.005))
    # hood gap (plan view) + louvres on the shoulders
    cuts = [slot(v, 'gap_hood', [(1.85, 0.60), (0.475, 0.60), (0.475, -0.60), (1.85, -0.60)], 'top', 1.05, 1.40, 0.005)]
    for side in (1, -1):
        for i in range(6):
            f = 0.90 + i * 0.032
            c = v.box('louvre', (f, 1.145, side * 0.835), (0.011, 0.055, 0.12), 'gap', register=False)
            c.data.transform(roll_left(-side * 35, u=1.145, s=side * 0.835) if False else Matrix.Identity(4))
            cuts.append(c)
    boolean(clip, cuts)
    # rolled arch lips
    lips = []
    for side in (1, -1):
        lips.append(v.tube('lip_f', [(1.61, 0.655, side * 0.876), (1.45, 0.94, side * 0.876), (0.89, 0.94, side * 0.876), (0.64, 0.505, side * 0.876)],
                           0.024, 'paint_matte', segs=6, bend_r=0.14, bend_segs=4))
        lips.append(v.tube('lip_r', [(-0.81, 0.49, side * 0.836), (-0.99, 0.855, side * 0.836), (-1.51, 0.855, side * 0.836), (-1.70, 0.545, side * 0.836)],
                           0.024, 'paint_matte', segs=6, bend_r=0.14, bend_segs=4))
    # underside -> chassis grime
    for ob in (clip, tub):
        set_kind_faces(ob, 'chassis', lambda c, n: n[1] < -0.6 and c[1] < 0.52)


def front_end(v):
    clip = v.clip
    # grille openings in the recessed panel between the fenders
    ops = [v.front('grille_up', [(-0.42, 0.985, 0.025), (0.42, 0.985, 0.025), (0.42, 1.065, 0.025), (-0.42, 1.065, 0.025)], 1.55, 1.75, 'grille', register=False),
           v.front('grille_lo', [(-0.42, 0.70, 0.035), (0.42, 0.70, 0.035), (0.42, 0.935, 0.035), (-0.42, 0.935, 0.035)], 1.55, 1.75, 'grille', register=False)]
    boolean(clip, ops)
    # headlight sockets + lamps
    socks = [v.cyl('hl_sock', (1.73, 0.93, side * 0.665), 0.099, 0.22, 'black_paint', axis='f', segs=24, register=False) for side in (1, -1)]
    boolean(clip, socks)
    for side in (1, -1):
        build_round_lamp(v, f'headlamp{side}', (1.722, 0.93, side * 0.665), 0.092, 'lens_head', 'f', depth=0.055, dome=0.014, segs=24)
        # front turn signal (amber, under the lamp, outboard)
        v.box(f'turn_f{side}', (1.712, 0.765, side * 0.69), (0.04, 0.05, 0.085), 'lens_amber', r=0.01)
        v.box(f'turn_fh{side}', (1.702, 0.765, side * 0.69), (0.04, 0.062, 0.097), 'chrome', r=0.012)
        # side repeater on the fender near the cowl
        build_round_lamp(v, f'rep{side}', (0.62, 1.10, side * (S - 0.002)), 0.022, 'lens_amber', 's', depth=0.01, sign=side, reflector=False, segs=10, dome=0.006)
        # hood latch clips
        v.box(f'latch{side}', (1.30, 1.205, side * 0.585), (0.07, 0.018, 0.03), 'black_paint', r=0.006)
    # radiator core behind the grille
    v.box('radiator', (1.53, 0.89, 0.0), (0.04, 0.42, 0.86), 'gap')
    # front bumper (channel), brackets, tow hooks, plate
    v.side('bumper_f', [(1.755, 0.50, 0.0), (1.875, 0.50, 0.012), (1.875, 0.655, 0.012), (1.755, 0.655, 0.0)], -0.87, 0.87, 'black_paint', bevel=0.006)
    for side in (1, -1):
        v.box(f'bumper_brk{side}', (1.70, 0.53, side * 0.41), (0.14, 0.09, 0.07), 'chassis', r=0.01)
        v.tube(f'towhook{side}', [(1.86, 0.48, side * 0.56), (1.96, 0.48, side * 0.56), (1.96, 0.40, side * 0.56), (1.90, 0.38, side * 0.56)], 0.016, 'black_paint', segs=8, bend_r=0.035)
    v.box('plate_f', (1.880, 0.58, 0.0), (0.006, 0.11, 0.48), 'plate', r=0.004)


def doors_and_frames(v):
    # windshield frame (raked 8 deg), glass, wipers
    base = TR(0.475, TOP + 0.01, 0) @ pitch_up(8.0)
    outer = [(-0.80, 0.0, 0.05), (0.80, 0.0, 0.05), (0.80, 0.64, 0.06), (-0.80, 0.64, 0.06)]
    inner = [(-0.745, 0.045, 0.04), (0.745, 0.045, 0.04), (0.745, 0.59, 0.05), (-0.745, 0.59, 0.05)]
    v.front('ws_frame', outer, -0.025, 0.025, 'paint_matte', holes=[inner], M=base)
    v.front('ws_seal', erode_ctrl(inner, -0.012), -0.012, 0.012, 'seal', holes=[erode_ctrl(inner, 0.008)], M=base)
    v.front('ws_glass', erode_ctrl(inner, -0.008), -0.003, 0.003, 'glass', M=base)
    v.box('ws_hinge_bar', (0.0, 0.0, 0.0), (0.03, 0.025, 1.5), 'black_paint', r=0.008, M=base)
    for side in (1, -1):
        sx = side * 0.36
        v.tube(f'wiper_arm{side}', [(0.0, 0.62, sx + 0.02), (-0.02, 0.36, sx - 0.06)], 0.006, 'black_paint', segs=6, M=base @ TR(-0.035, 0, 0))
        v.box(f'wiper_blade{side}', (-0.045, 0.40, sx - 0.05), (0.012, 0.42, 0.016), 'rubber', r=0.004, M=base @ roll_left(side * 12, 0.40, sx - 0.05))
        # exterior mirror on an arm off the windshield pillar
        v.tube(f'mirror_arm{side}', [(0.47, 1.36, side * 0.80), (0.46, 1.40, side * 0.90), (0.44, 1.46, side * 0.94)], 0.009, 'black_paint', segs=6, bend_r=0.04, bend_segs=2)
        v.box(f'mirror_head{side}', (0.43, 1.50, side * 0.975), (0.035, 0.17, 0.12), 'black_paint', r=0.015)
        v.box(f'mirror_glass{side}', (0.41, 1.50, side * 0.975), (0.004, 0.145, 0.10), 'reflector', r=0.004)
    if v.variant == 'open':
        return
    # door window frames (soft-top doors) + sliding glass
    for side in (1, -1):
        s0, s1 = side * 0.805, side * 0.835
        fd = [(0.43, TOP, 0.0), (0.385, 1.84, 0.035), (-0.33, 1.84, 0.035), (-0.355, TOP, 0.0)]
        fdi = [(0.395, TOP + 0.035, 0.02), (0.355, 1.805, 0.025), (-0.30, 1.805, 0.025), (-0.32, TOP + 0.035, 0.02)]
        v.side(f'dframe_f{side}', fd, s0, s1, 'paint_matte', holes=[fdi])
        v.side(f'dglass_f{side}', erode_ctrl(fdi, -0.008), side * 0.817, side * 0.823, 'glass')
        v.box(f'dslide_f{side}', (0.05, 1.52, side * 0.818), (0.02, 0.57, 0.018), 'seal', r=0.004)
        rd = [(-0.365, TOP, 0.0), (-0.365, 1.84, 0.035), (-1.035, 1.84, 0.035), (-1.045, TOP, 0.0)]
        rdi = [(-0.40, TOP + 0.035, 0.02), (-0.40, 1.805, 0.025), (-1.0, 1.805, 0.025), (-1.008, TOP + 0.035, 0.02)]
        v.side(f'dframe_r{side}', rd, s0, s1, 'paint_matte', holes=[rdi])
        v.side(f'dglass_r{side}', erode_ctrl(rdi, -0.008), side * 0.817, side * 0.823, 'glass')
    # door hardware
    for side in (1, -1):
        so = side * (SB + 0.004)
        for (f, u) in ((0.445, 0.72), (0.445, 1.10), (-0.345, 1.10), (-0.10, 0.66)):
            v.box(f'hinge{side}_{f}_{u}', (f, u, so), (0.05, 0.075, 0.02), 'black_paint', r=0.004)
            v.cyl(f'hinge_pin{side}_{f}_{u}', (f, u, so + side * 0.008), 0.009, 0.09, 'black_paint', axis='u', segs=6)
        for f in (-0.21, -0.89):
            v.box(f'handle_base{side}{f}', (f, 1.06, so), (0.05, 0.03, 0.012), 'chrome', r=0.004)
            v.tube(f'handle{side}{f}', [(f + 0.02, 1.06, so + side * 0.012), (f - 0.06, 1.05, so + side * 0.022), (f - 0.11, 1.045, so + side * 0.018)],
                   0.008, 'chrome', segs=6, bend_r=0.03, bend_segs=2)
        # fuel filler door
        v.cyl(f'fuel_door{side}', (-0.42, 0.66, so), 0.075, 0.008, 'paint_matte', axis='s', segs=16)


def canvas_top(v):
    roof = 1.975
    sec = lambda s, b: H([(0.0, b), (s, b, 0.0), (s, roof - 0.02, 0.11), (0.0, roof, 3.0)])
    outer = v.block('canvas', [(-1.765, sec(0.858, 1.165)), (0.40, sec(0.858, 1.165))], 'canvas', end0=0.06, n_f=14, nseg=4,
                    edge_div=sym_div([0, 2, 5]))
    sec_in = lambda s, b: H([(0.0, b), (s, b, 0.0), (s, roof - 0.032, 0.10), (0.0, roof - 0.012, 3.0)])
    inner = v.block('canvas_in', [(-1.753, sec_in(0.846, 1.10)), (0.50, sec_in(0.846, 1.10))], 'canvas', register=False, n_f=16, nseg=4,
                    edge_div=sym_div([0, 2, 5]))
    boolean(outer, inner)
    # open the front (windshield) and the door windows; rear window
    cuts = [v.box('cv_front', (0.60, 1.47, 0.0), (0.4, 0.76, 2.2), 'canvas', register=False)]
    for side in (1, -1):
        cuts.append(v.side('cv_door', [(0.50, 1.10, 0.0), (0.50, 1.84, 0.0), (-1.045, 1.84, 0.02), (-1.045, 1.10, 0.0)], side * 0.6, side * 1.0, 'canvas', register=False))
    cuts.append(v.front('cv_rwin', [(-0.42, 1.42, 0.04), (0.42, 1.42, 0.04), (0.42, 1.76, 0.04), (-0.42, 1.76, 0.04)], -1.9, -1.70, 'seal', register=False))
    boolean(outer, cuts)
    v.front('cv_rglass', [(-0.43, 1.41, 0.045), (0.43, 1.41, 0.045), (0.43, 1.77, 0.045), (-0.43, 1.77, 0.045)], -1.762, -1.758, 'glass')
    # sag between the bows (roof vertices only)
    bows = [0.38, -0.25, -1.0, -1.70]
    def sag(p):
        f, u, s = -p.y, p.z, p.x
        if u > 1.88:
            k = min(1.0, (u - 1.88) / 0.06)
            for a, b in zip(bows, bows[1:]):
                if b <= f <= a:
                    t = (f - b) / (a - b)
                    p.z -= 0.016 * math.sin(math.pi * t) * k * (1 - (s / 0.86) ** 2) ** 0.5
        return p
    apply_fn(outer.data, sag)
    # bows inside
    for f in bows[1:]:
        v.tube(f'bow{f}', [(f, TOP, 0.80), (f, 1.93, 0.79), (f, 1.95, 0.0), (f, 1.93, -0.79), (f, TOP, -0.80)], 0.011, 'black_paint', segs=6, bend_r=0.12, bend_segs=3)
    # leather straps along the lower edge behind the rear doors and at the back
    for side in (1, -1):
        for f in (-1.18, -1.40, -1.62):
            v.box(f'strap{side}{f}', (f, 1.15, side * 0.862), (0.03, 0.075, 0.006), 'vinyl_brown')
            v.box(f'buckle{side}{f}', (f, 1.125, side * 0.866), (0.026, 0.02, 0.004), 'steel')
    for s in (-0.55, -0.2, 0.2, 0.55):
        v.box(f'strap_b{s}', (-1.768, 1.15, s), (0.006, 0.075, 0.03), 'vinyl_brown')


def rear_end(v):
    # tail lamps (corner units), bumperettes, hitch, plate, spare wheel bracket
    for side in (1, -1):
        v.box(f'tail_house{side}', (-1.745, 0.76, side * 0.72), (0.03, 0.14, 0.10), 'black_paint', r=0.01)
        v.box(f'tail_red{side}', (-1.762, 0.79, side * 0.72), (0.012, 0.07, 0.08), 'lens_tail', r=0.008)
        v.box(f'tail_amb{side}', (-1.762, 0.722, side * 0.72), (0.012, 0.045, 0.08), 'lens_amber', r=0.008)
        v.side(f'bumper_r{side}', [(-1.79, 0.46, 0.008), (-1.70, 0.46, 0.0), (-1.70, 0.56, 0.0), (-1.79, 0.56, 0.008)], side * 0.58, side * 0.86, 'black_paint', bevel=0.005)
        v.box(f'mudflap{side}', (-1.70, 0.33, side * 0.72), (0.008, 0.30, 0.22), 'rubber', r=0.01)
    v.box('hitch_plate', (-1.76, 0.47, 0.0), (0.08, 0.06, 0.22), 'chassis', r=0.01)
    v.tube('hitch_hook', [(-1.80, 0.47, 0.0), (-1.87, 0.47, 0.0), (-1.87, 0.53, 0.0)], 0.02, 'chassis', segs=8, bend_r=0.03)
    v.box('plate_r', (-1.737, 0.66, -0.28), (0.006, 0.11, 0.30), 'plate', r=0.004)
    v.box('tg_handle', (-1.738, 1.0, -0.45), (0.012, 0.03, 0.12), 'chrome', r=0.006)
    v.box('spare_brk', (-1.76, 0.96, 0.27), (0.06, 0.16, 0.16), 'black_paint', r=0.01)
    v.instance('spare_wheel', 'wheel', -1.875, 0.965, 0.27, R=yaw_left(90))


def interior(v):
    # floor mats, tunnel, dash, gauges, column, pedals, levers, seats, bench, grab bar, mirror
    for side in (1, -1):
        v.box(f'mat{side}', (0.17, FLOOR + 0.006, side * 0.44), (0.40, 0.012, 0.56), 'rubber', r=0.01)
    v.block('tunnel', [(-0.62, H([(0, FLOOR - 0.01), (0.17, FLOOR - 0.01, 0.0), (0.15, 0.71, 0.05), (0.0, 0.73, 1.0)])),
                       (0.40, H([(0, FLOOR - 0.01), (0.20, FLOOR - 0.01, 0.0), (0.17, 0.76, 0.06), (0.0, 0.79, 1.0)]))],
            'paint_in', n_f=3, nseg=3)
    v.box('dash', (0.355, 1.10, 0.0), (0.11, 0.24, 1.58), 'paint_in', r=0.02)
    v.side('dash_pad', [(0.25, 1.205, 0.02), (0.43, 1.205, 0.0), (0.43, 1.245, 0.0), (0.27, 1.24, 0.015)], -0.79, 0.79, 'vinyl', bevel=0.01)
    v.box('cluster', (0.293, 1.115, 0.40), (0.012, 0.13, 0.30), 'plastic', r=0.01)
    for i, (s, r) in enumerate(((0.33, 0.042), (0.47, 0.042), (0.40, 0.03))):
        u = 1.12 if i < 2 else 1.07
        if i == 2: s = 0.40
        v.cyl(f'gauge{i}', (0.287, u if i < 2 else 1.065, s), r, 0.008, 'gauge', axis='f', segs=14)
        v.lathe(f'gauge_bez{i}', [(-0.006, r), (0.0, r + 0.006), (0.006, r + 0.004), (0.006, r - 0.001), (-0.006, r - 0.001)], 'chrome', at=(0.284, u if i < 2 else 1.065, s), axis='f', segs=14, closed=True)
    v.box('glovebox', (0.297, 1.12, -0.38), (0.006, 0.12, 0.30), 'paint_in', r=0.01)
    v.tube('grab_bar', [(0.30, 1.16, -0.18), (0.25, 1.17, -0.22), (0.25, 1.17, -0.55), (0.30, 1.16, -0.60)], 0.012, 'vinyl', segs=8, bend_r=0.03)
    # steering
    Rm = build_steering_wheel(v, 'steer', (0.02, 1.26, 0.40), 38.0, diameter=0.42, rim_t=0.013, kind='plastic', col_len=0.0)
    v.pivots['steering_wheel'] = Rm
    v.tube('steer_col', [(0.02 + 0.04 * math.cos(math.radians(38)), 1.26 - 0.04 * math.sin(math.radians(38)), 0.40),
                         (0.33, 1.26 - 0.31 * math.tan(math.radians(38)), 0.40)], 0.022, 'black_paint', segs=12)
    for i, s in enumerate((0.30, 0.42, 0.53)):
        v.box(f'pedal{i}', (0.31, 0.70, s), (0.02, 0.07, 0.06), 'rubber', r=0.008, M=pitch_up(-30, 0.31, 0.70))
        v.tube(f'pedal_arm{i}', [(0.31, 0.71, s), (0.36, 0.86, s)], 0.008, 'chassis', segs=6)
    for i, (f, s, top) in enumerate(((0.12, 0.04, 1.05), (0.02, -0.03, 0.95), (0.0, 0.03, 0.93))):
        v.tube(f'lever{i}', [(f + 0.06, 0.74, s), (f, top, s)], 0.009, 'black_paint', segs=8)
        v.lathe(f'knob{i}', [(-0.02, 0.0), (-0.02, 0.012), (0.0, 0.022), (0.02, 0.015), (0.028, 0.0)], 'plastic', at=(f, top, s), axis='u', segs=12)
        v.box(f'boot{i}', (f + 0.06, 0.75, s), (0.07, 0.04, 0.07), 'rubber', r=0.02)
    hips = []
    for side in (1, -1):
        obs, hip = build_seat(v, f'seat_f{side}', -0.03, 0.93, side * 0.40, width=0.48, depth=0.48, back_h=0.60, recline=12,
                              kind='vinyl', cush_t=0.11, floor_u=FLOOR)
        hips.append(hip)
    obs, hip = build_seat(v, 'bench', -0.74, 0.93, 0.0, width=1.30, depth=0.46, back_h=0.56, recline=14, kind='vinyl', cush_t=0.12, bolster=0.01)
    v.box('bench_base', (-0.97, 0.74, 0.0), (0.40, 0.36, 1.2), 'paint_in', r=0.02)
    v.empty('seat_0', *hips[0])
    v.empty('seat_1', *hips[1])
    v.empty('seat_2', hip[0], hip[1], 0.38)
    v.empty('seat_3', hip[0], hip[1], -0.38)
    v.box('rv_mirror', (0.36, 1.80, 0.0), (0.02, 0.07, 0.20), 'black_paint', r=0.012)
    # door cards (inner trim) + pulls
    for side in (1, -1):
        so = side * 0.795
        for (f0, f1) in ((0.40, -0.30), (-0.40, -0.98)):
            v.box(f'card{side}{f0}', ((f0 + f1) / 2, 0.95, so), (abs(f1 - f0) - 0.08, 0.36, 0.01), 'vinyl', r=0.005)
            v.box(f'pull{side}{f0}', ((f0 + f1) / 2 - 0.1, 1.05, so - side * 0.015), (0.12, 0.02, 0.012), 'black_paint', r=0.005)


def chassis(v):
    K = 'chassis'
    for side in (1, -1):
        v.box(f'rail{side}', (0.0, 0.38, side * 0.41), (3.62, 0.13, 0.06), K, r=0.006)
        # leaf springs (arched bands) + shackles
        for fc in (FA, RA):
            pts = []
            for i in range(9):
                t = -1 + 2 * i / 8
                pts.append((fc + 0.58 * t, 0.33 - 0.05 * (1 - t * t)))
            band = [(p[0], p[1] + 0.012) for p in pts] + [(p[0], p[1] - 0.028) for p in reversed(pts)]
            v.side(f'spring{side}{fc}', [(x, y, 0.0) for x, y in band], side * 0.385, side * 0.445, K, nseg=1)
            v.box(f'shock{side}{fc}', (fc + 0.16 * (1 if fc > 0 else -1), 0.43, side * 0.50), (0.05, 0.22, 0.05), 'black_paint',
                  M=pitch_up(12 if fc > 0 else -12, fc, 0.43))
    for f in (1.70, 0.45, -0.60, -1.76):
        v.box(f'xmember{f}', (f, 0.38, 0.0), (0.06, 0.10, 0.82), K, r=0.006)
    for fc in (FA, RA):
        v.cyl(f'axle{fc}', (fc, R, 0.0), 0.042, 1.30, K, axis='s', segs=14)
        v.lathe(f'diff{fc}', [(-0.12, 0.0), (-0.12, 0.05), (-0.09, 0.10), (-0.02, 0.125), (0.05, 0.11), (0.10, 0.07), (0.13, 0.03), (0.13, 0.0)],
                K, at=(fc, R, -0.12), axis='f', segs=12)
        for side in (1, -1):
            v.cyl(f'hubh{fc}{side}', (fc, R, side * 0.60), 0.085, 0.10, K, axis='s', segs=12)
            v.lathe(f'drum{fc}{side}', [(-0.04, 0.0), (-0.04, 0.14), (0.04, 0.14), (0.04, 0.0)], K, at=(fc, R, side * (TW - 0.10)), axis='s', segs=16)
    v.box('sump', (1.12, 0.42, 0.0), (0.66, 0.18, 0.46), K, r=0.03)
    v.box('gearbox', (0.42, 0.44, 0.0), (0.66, 0.18, 0.30), K, r=0.04)
    v.box('transfer', (0.02, 0.42, -0.05), (0.26, 0.18, 0.26), K, r=0.03)
    v.tube('prop_r', [(0.0, 0.40, -0.05), (RA + 0.12, R, -0.12)], 0.032, K, segs=10)
    v.tube('prop_f', [(0.10, 0.40, -0.05), (FA - 0.13, R, -0.12)], 0.030, K, segs=10)
    v.tube('tierod', [(FA + 0.17, R - 0.03, 0.62), (FA + 0.17, R - 0.03, -0.62)], 0.013, K, segs=8)
    v.tube('exhaust_pipe', [(1.05, 0.36, -0.30), (0.62, 0.30, -0.30), (-0.15, 0.31, -0.33)], 0.025, 'exhaust', segs=10, bend_r=0.12)
    v.cyl('muffler', (-0.45, 0.33, -0.36), 0.075, 0.55, 'exhaust', axis='f', segs=16, bevel=0.02)
    v.tube('tail_pipe', [(-0.73, 0.33, -0.36), (-1.0, 0.34, -0.40), (-1.55, 0.34, -0.40), (-1.83, 0.36, -0.55)], 0.022, 'exhaust', segs=10, bend_r=0.12)
    v.box('fuel_tank_l', (-0.45, 0.47, 0.62), (0.70, 0.12, 0.26), K, r=0.03)
    v.box('fuel_tank_r', (-0.45, 0.47, -0.62), (0.70, 0.12, 0.26), K, r=0.03)


def wheels(v):
    build_tire(v, 'tire', R, 0.215, 15 * 0.0254 / 2, 'lug', segs=36, nlug=19, group='wheel', lug_depth=0.017)
    build_steel_rim(v, 'rim', 15 * 0.0254 / 2, 0.152, kind='black_paint', group='wheel', segs=24, nuts=5, pcd=0.1397, dish=0.04)
    v.instance('wheel_fl', 'wheel', FA, R, TW)
    v.instance('wheel_fr', 'wheel', FA, R, -TW, flip=True)
    v.instance('wheel_rl', 'wheel', RA, R, TW)
    v.instance('wheel_rr', 'wheel', RA, R, -TW, flip=True)
    v.meta.update({'wheel_radius': R, 'wheelbase': WB, 'track': TRACK, 'seats': 4})
