"""1980s dual-sport motorcycle (single cylinder, long dual seat, high fenders, upswept exhaust), 2 seats.
Approx. data: L 2.18 m, W 0.86 m (bars), seat 0.88 m, wheelbase 1.42 m, rake 28 deg, 21" front / 18" rear spoked wheels.
The steerable front end (fork, bars, lamp, front wheel) hangs under the 'handlebar' pivot on the steering axis."""
import math
from vkit import *

WB = 1.42
RF, RR = 0.343, 0.345
FF, FR = WB / 2, -WB / 2
RAKE = 28.0
HEAD = (0.338, 0.985)            # steering-head centre (f, u)
TEX = 2048
META = {'name': 'Dual-sport motorcycle (2 seats)',
        'references': ['https://commons.wikimedia.org/wiki/Category:Honda_XL_series', 'https://commons.wikimedia.org/wiki/Category:Yamaha_XT500']}


def ax(t, off=0.0):
    """point on the steering axis, t metres down from the head centre, offset forward (perpendicular) by off"""
    sr, cr = math.sin(math.radians(RAKE)), math.cos(math.radians(RAKE))
    return (HEAD[0] + sr * t + cr * off, HEAD[1] - cr * t + sr * off)


def H(pts):
    return mirror_half(pts)


def build(v):
    v.paint = '#b8201a'
    v.paint_coat = 0.3
    v.look = dict(dirt=1.1, wear=0.8, mud_top=0.7)
    v.uv_scale.update({'chassis': 0.6, 'steel': 0.7})
    K = 'black_paint'
    hub_f = (FF, RF); hub_r = (FR, RR)
    # ---------------- frame ----------------
    v.tube('head_tube', [(*ax(-0.09), 0.0), (*ax(0.09), 0.0)], 0.03, K, segs=12)
    v.tube('top_tube', [(*ax(-0.05), 0.0), (0.05, 0.96, 0.0), (-0.22, 0.90, 0.0)], 0.020, K, segs=10, bend_r=0.1)
    for side in (1, -1):
        s = side * 0.055
        v.tube(f'down_tube{side}', [(*ax(0.06), 0.0), (0.33, 0.62, s), (0.30, 0.30, s), (-0.10, 0.26, s), (-0.20, 0.42, s), (-0.22, 0.90, s * 1.4)],
               0.016, K, segs=8, bend_r=0.07)
        v.tube(f'seat_rail{side}', [(-0.22, 0.90, side * 0.08), (-0.80, 0.92, side * 0.085)], 0.013, K, segs=8)
        v.tube(f'sub_strut{side}', [(-0.20, 0.52, side * 0.07), (-0.62, 0.91, side * 0.085)], 0.012, K, segs=8)
    # swingarm + shocks + chain
    piv = (-0.19, 0.48)
    for side in (1, -1):
        s = side * 0.095
        v.tube(f'swingarm{side}', [(piv[0], piv[1], side * 0.07), (piv[0] - 0.08, piv[1] - 0.012, s), (FR, RR, s)], 0.018, K, segs=8, bend_r=0.05)
        v.tube(f'shock{side}', [(-0.58, 0.39, side * 0.11), (-0.50, 0.86, side * 0.10)], 0.017, 'steel', segs=10)
        v.lathe(f'spring{side}', [(0.0, 0.0), (0.0, 0.03), (0.26, 0.03), (0.26, 0.0)], 'paint', at=(0.0, 0.0, 0.0), axis='u', segs=10,
                M=TR(-0.556, 0.53, side * 0.106) @ pitch_up(-9.7))
    v.tube('swing_x', [(-0.33, 0.45, 0.095), (-0.33, 0.45, -0.095)], 0.014, K, segs=8)
    # chain run (left side) + sprockets
    cs = 0.115
    v.lathe('sprocket_r', [(-0.003, 0.0), (-0.003, 0.11), (0.003, 0.11), (0.003, 0.0)], 'steel', at=(FR, RR, cs), axis='s', segs=24)
    v.lathe('sprocket_f', [(-0.003, 0.0), (-0.003, 0.04), (0.003, 0.04), (0.003, 0.0)], 'steel', at=(-0.05, 0.42, cs), axis='s', segs=14)
    for (a, b) in (((-0.05, 0.46), (FR, RR + 0.11)), ((-0.05, 0.38), (FR, RR - 0.11))):
        v.tube(f'chain{a}{b}', [(a[0], a[1], cs), (b[0], b[1], cs)], 0.006, 'steel', segs=4)
    v.box('chain_guard', (-0.40, 0.45, cs + 0.012), (0.42, 0.03, 0.006), 'plastic', r=0.002, M=pitch_up(-9, -0.40, 0.45))
    # ---------------- engine (air-cooled single) ----------------
    v.box('crankcase', (0.04, 0.44, 0.0), (0.42, 0.26, 0.24), 'alu', r=0.05)
    for side in (1, -1):
        v.lathe(f'cover{side}', [(0.0, 0.0), (0.0, 0.11), (0.02 * side, 0.10), (0.03 * side, 0.06), (0.032 * side, 0.0)], 'alu',
                at=(0.06, 0.43, side * 0.12), axis='s', segs=18)
    cyl = [(0.0, 0.0), (0.0, 0.05)]
    for j in range(7):
        x0 = 0.015 + j * 0.026
        cyl += [(x0, 0.052), (x0, 0.075), (x0 + 0.012, 0.075), (x0 + 0.012, 0.052)]
    cyl += [(0.21, 0.05), (0.21, 0.0)]
    v.lathe('cylinder', cyl, 'alu', at=(0.10, 0.56, 0.0), axis='u', segs=14, M=pitch_up(-16, 0.10, 0.56))
    v.box('cyl_head', (0.165, 0.78, 0.0), (0.16, 0.06, 0.17), 'alu', r=0.02, M=pitch_up(-16, 0.165, 0.78))
    v.cyl('carb', (0.0, 0.715, 0.0), 0.03, 0.09, 'alu', axis='f', segs=12)
    v.tube('intake', [(0.07, 0.70, 0.0), (-0.05, 0.72, 0.0), (-0.16, 0.75, 0.0)], 0.024, 'rubber', segs=10, bend_r=0.05)
    v.box('airbox', (-0.25, 0.75, 0.0), (0.20, 0.16, 0.18), 'plastic', r=0.03)
    v.box('battery', (-0.30, 0.60, 0.0), (0.10, 0.12, 0.12), 'plastic', r=0.01)
    # upswept exhaust on the right side
    v.tube('header', [(0.22, 0.76, -0.04), (0.28, 0.66, -0.08), (0.20, 0.50, -0.14), (-0.10, 0.58, -0.17), (-0.40, 0.72, -0.17)],
           0.02, 'exhaust', segs=10, bend_r=0.08)
    v.cyl('muffler', (-0.60, 0.76, -0.175), 0.05, 0.42, 'black_paint', axis='f', segs=16, M=pitch_up(9, -0.60, 0.76), bevel=0.012)
    v.box('heat_shield', (-0.58, 0.79, -0.215), (0.26, 0.07, 0.012), 'steel', r=0.005, M=pitch_up(9, -0.58, 0.79))
    v.tube('tip', [(-0.80, 0.79, -0.175), (-0.86, 0.80, -0.175)], 0.018, 'chrome', segs=10)
    v.empty('exhaust', -0.87, 0.80, -0.175, M=yaw_left(180))
    # ---------------- tank, seat, panels, fender ----------------
    tsec = lambda w, b, t: H([(0.0, b), (w * 0.75, b, 0.03), (w, (b + t) / 2, 0.06), (w * 0.8, t - 0.02, 0.05), (0.0, t, 0.5)])
    v.block('tank', [(-0.13, tsec(0.11, 0.86, 1.02)), (0.05, tsec(0.165, 0.86, 1.07)), (0.28, tsec(0.12, 0.92, 1.06))], 'paint',
            end0=0.03, end1=0.06, n_f=6, nseg=3)
    v.cyl('tank_cap', (0.10, 1.07, 0.0), 0.035, 0.02, 'chrome', axis='u', segs=14)
    for side in (1, -1):
        v.box(f'knee_pad{side}', (0.0, 0.93, side * 0.155), (0.14, 0.07, 0.01), 'rubber', r=0.004)
    ssec = lambda w, b, t: H([(0.0, b), (w, b, 0.02), (w, t - 0.04, 0.05), (0.0, t, 0.4)])
    v.block('seat', [(-0.84, ssec(0.115, 0.84, 0.965)), (-0.45, ssec(0.14, 0.84, 0.985)), (-0.15, ssec(0.135, 0.88, 0.99)), (0.02, ssec(0.09, 0.98, 1.035))],
            'vinyl', end0=0.05, end1=0.06, n_f=6, nseg=3)
    v.box('grab_rail', (-0.76, 0.90, 0.0), (0.18, 0.02, 0.24), 'chrome', r=0.01)
    for side in (1, -1):
        v.side(f'side_panel{side}', [(-0.14, 0.64, 0.03), (-0.14, 0.86, 0.02), (-0.46, 0.88, 0.04), (-0.40, 0.66, 0.05)], side * 0.13, side * 0.15, 'plastic_grey')
        v.box(f'peg_r{side}', (0.0, 0.36, side * 0.21), (0.05, 0.025, 0.11), 'steel', r=0.008)
        v.box(f'peg_p{side}', (-0.40, 0.48, side * 0.20), (0.04, 0.022, 0.09), 'steel', r=0.008)
    fend = [(-0.55, 0.86, 0.02), (-0.72, 0.89, 0.02), (-1.05, 0.88, 0.03), (-1.07, 0.85, 0.02), (-0.72, 0.85, 0.02), (-0.55, 0.82, 0.02)]
    v.side('rear_fender', fend, -0.07, 0.07, 'plastic')
    v.box('tail_lamp_house', (-1.02, 0.84, 0.0), (0.05, 0.06, 0.12), 'black_paint', r=0.012)
    v.box('tail_lamp', (-1.048, 0.845, 0.0), (0.01, 0.045, 0.10), 'lens_tail', r=0.008)
    v.box('plate', (-1.0, 0.76, 0.0), (0.005, 0.12, 0.18), 'plate', r=0.004, M=pitch_up(10, -1.0, 0.76))
    for side in (1, -1):
        v.box(f'blinker_r{side}', (-0.95, 0.83, side * 0.12), (0.04, 0.03, 0.03), 'lens_amber', r=0.01)
    # kickstand (folded, left)
    v.tube('kickstand', [(-0.12, 0.30, 0.10), (-0.42, 0.33, 0.14)], 0.011, K, segs=6)
    # ---------------- steerable front end (handlebar group) ----------------
    G = 'handlebar'
    sr, cr = math.sin(math.radians(RAKE)), math.cos(math.radians(RAKE))
    v.pivot(G, HEAD[0], HEAD[1], 0.0, R=pitch_up(RAKE))
    for side in (1, -1):
        s = side * 0.085
        top = ax(-0.10, 0.04); low = ax(0.42, 0.04); bot = ax(0.70, 0.04)
        v.tube(f'stanchion{side}', [(*top, s), (*low, s)], 0.019, 'chrome', group=G, segs=12)
        v.tube(f'slider{side}', [(*low, s), (*bot, s)], 0.026, 'alu', group=G, segs=12)
        v.tube(f'gaiter{side}', [(*ax(0.26, 0.04), s), (*ax(0.42, 0.04), s)], 0.026, 'rubber', group=G, segs=10)
    for t in (-0.11, 0.10):
        c = ax(t, 0.03)
        v.box(f'clamp{t}', (c[0], c[1], 0.0), (0.07, 0.025, 0.24), 'alu', r=0.01, group=G, M=pitch_up(RAKE, c[0], c[1]))
    # handlebar: rises, sweeps back
    bar_c = ax(-0.17, -0.02)
    bars = [(bar_c[0] - 0.10, bar_c[1] + 0.06, 0.40), (bar_c[0] - 0.04, bar_c[1] + 0.05, 0.30), (bar_c[0], bar_c[1], 0.12),
            (bar_c[0], bar_c[1], -0.12), (bar_c[0] - 0.04, bar_c[1] + 0.05, -0.30), (bar_c[0] - 0.10, bar_c[1] + 0.06, -0.40)]
    v.tube('bar', bars, 0.011, 'chrome', group=G, segs=8, bend_r=0.06)
    for side in (1, -1):
        g0 = (bar_c[0] - 0.10, bar_c[1] + 0.06, side * 0.40)
        v.tube(f'grip{side}', [(g0[0] + 0.012, g0[1] - 0.004, side * 0.30), (g0[0] - 0.006, g0[1] + 0.003, side * 0.43)], 0.017, 'rubber', group=G, segs=10)
        v.tube(f'lever{side}', [(g0[0] + 0.03, g0[1], side * 0.30), (g0[0] + 0.07, g0[1] - 0.01, side * 0.36), (g0[0] + 0.05, g0[1] - 0.012, side * 0.43)],
               0.006, 'alu', group=G, segs=6)
        v.box(f'switch{side}', (g0[0] + 0.01, g0[1], side * 0.285), (0.04, 0.04, 0.03), 'plastic', r=0.008, group=G)
        v.tube(f'mirror_stalk{side}', [(g0[0] + 0.02, g0[1] + 0.02, side * 0.31), (g0[0] - 0.01, g0[1] + 0.13, side * 0.36)], 0.006, 'chrome', group=G, segs=6)
        v.lathe(f'mirror{side}', [(-0.015, 0.0), (-0.015, 0.045), (0.0, 0.05), (0.006, 0.04), (0.008, 0.0)], 'black_paint',
                at=(g0[0] - 0.015, g0[1] + 0.165, side * 0.365), axis='f', group=G, segs=14, M=None)
        v.box(f'blinker_f{side}', (*ax(-0.02, 0.10), side * 0.14), (0.04, 0.03, 0.03), 'lens_amber', r=0.01, group=G)
    v.cyl('speedo', (*ax(-0.20, 0.02), 0.0), 0.045, 0.05, 'black_paint', axis='f', group=G, segs=16, M=pitch_up(-40, *ax(-0.20, 0.02)))
    v.cyl('speedo_face', (ax(-0.20, 0.02)[0] - 0.026 * math.cos(math.radians(40)), ax(-0.20, 0.02)[1] + 0.026 * math.sin(math.radians(40)), 0.0), 0.038, 0.004,
          'gauge', axis='f', group=G, segs=16, M=pitch_up(-40, ax(-0.20, 0.02)[0] - 0.026 * math.cos(math.radians(40)), ax(-0.20, 0.02)[1] + 0.026 * math.sin(math.radians(40))))
    # headlamp in a small cowl on the fork
    hl = ax(0.02, 0.15)
    v.lathe('hl_shell', [(-0.10, 0.0), (-0.10, 0.04), (-0.06, 0.08), (0.0, 0.092), (0.004, 0.092), (0.004, 0.0)], 'black_paint', at=(hl[0], hl[1], 0.0), axis='f', group=G, segs=20)
    build_round_lamp(v, 'headlamp', (hl[0] + 0.004, hl[1], 0.0), 0.08, 'lens_head', 'f', depth=0.05, group=G, segs=20, dome=0.012)
    v.tube('hl_bracket', [(*ax(-0.08, 0.04), 0.0), (hl[0] - 0.08, hl[1], 0.0)], 0.01, K, group=G, segs=6)
    v.empty('light_l', hl[0] + 0.02, hl[1], 0.012, parent=G)
    v.empty('light_r', hl[0] + 0.02, hl[1], -0.012, parent=G)
    # front fender hugging the tyre (steers with the fork)
    v.lathe('front_fender', [(-0.058, RF + 0.032), (0.058, RF + 0.032), (0.062, RF + 0.044), (0.0, RF + 0.052), (-0.062, RF + 0.044)], 'plastic',
            at=(FF, RF, 0.0), axis='s', segs=16, group=G, a0=68.0, a1=152.0, closed=True)
    for side in (1, -1):
        v.tube(f'fender_stay{side}', [(*ax(0.62, 0.04), side * 0.085), (FF - 0.02, RF + 0.20, side * 0.064)], 0.006, 'steel', group=G, segs=5)
    # ---------------- wheels ----------------
    build_moto_tire(v, 'tire_f', RF, 0.080, 21 * 0.0254 / 2, segs=36, nknob=24, group='wheel_front')
    build_spoked_rim(v, 'rim_f', 21 * 0.0254 / 2, 0.042, group='wheel_front', hub_w=0.12, drum=True)
    build_moto_tire(v, 'tire_r', RR, 0.115, 18 * 0.0254 / 2, segs=36, nknob=22, group='wheel_rear', knob_h=0.014)
    build_spoked_rim(v, 'rim_r', 18 * 0.0254 / 2, 0.058, group='wheel_rear', hub_w=0.14, drum=True)
    v.instance('wheel_f', 'wheel_front', FF, RF, 0.0, parent=G)
    v.instance('wheel_r', 'wheel_rear', FR, RR, 0.0)
    # seats (rider, pillion)
    v.empty('seat_0', -0.18, 0.95, 0.0)
    v.empty('seat_1', -0.50, 0.97, 0.0)
    v.meta.update({'wheel_radius': RR, 'wheel_radius_front': RF, 'wheel_radius_rear': RR, 'wheelbase': WB, 'track': 0.0, 'seats': 2,
                   'rake_deg': RAKE})
