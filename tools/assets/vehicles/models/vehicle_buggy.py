"""Two-seat VW-based dune buggy (Meyers Manx style fibreglass tub) with a tubular roll cage and exposed flat-four.
Approx. data: L 3.45 m, W 1.72 m, H 1.62 m (cage), wheelbase 2.10 m, tracks 1.36/1.40 m, tyres R 0.315 front / 0.355 rear."""
import math
from vkit import *

WB = 2.10
FA, RA = WB / 2, -WB / 2
RF, RR = 0.315, 0.355
TWF, TWR = 0.68, 0.70
TEX = 2048
META = {'name': 'Dune buggy (fibreglass tub, roll cage)',
        'references': ['https://en.wikipedia.org/wiki/Meyers_Manx', 'https://commons.wikimedia.org/wiki/Category:Meyers_Manx']}
CAGE = 'black_paint'


def H(pts):
    return mirror_half(pts)


def tub_sec(bot, side_top, fen_top, valley, fen_s=0.60, w=0.79, inner_s=0.40):
    """M-shaped section: low centre (valley) between two fender humps"""
    return H([(0.0, bot), (w - 0.06, bot, 0.05), (w, bot + 0.10, 0.06), (w, side_top, 0.10), (fen_s, fen_top, 0.13),
              (inner_s, valley + 0.02, 0.06), (0.0, valley, 1.0)])


def build(v):
    v.paint = '#c25a22'
    v.paint_coat = 0.25
    v.look = dict(dirt=1.3, wear=0.9, mud_top=0.85)
    v.uv_scale.update({'chassis': 0.45, 'steel': 0.6, 'gap': 0.2})
    keys = [
        (-1.62, tub_sec(0.36, 0.58, 0.66, 0.52, 0.55, 0.70, 0.30)),
        (-1.40, tub_sec(0.33, 0.66, 0.84, 0.56, 0.60, 0.80, 0.36)),
        (-1.05, tub_sec(0.32, 0.70, 0.90, 0.56, 0.61, 0.81, 0.36)),
        (-0.70, tub_sec(0.31, 0.70, 0.80, 0.60, 0.62, 0.80, 0.40)),
        (-0.45, tub_sec(0.30, 0.72, 0.74, 0.70, 0.64, 0.79, 0.45)),
        (0.45, tub_sec(0.30, 0.72, 0.74, 0.70, 0.64, 0.79, 0.45)),
        (0.72, tub_sec(0.31, 0.68, 0.76, 0.64, 0.60, 0.78, 0.42)),
        (1.05, tub_sec(0.33, 0.64, 0.82, 0.62, 0.58, 0.77, 0.40)),
        (1.40, tub_sec(0.37, 0.60, 0.74, 0.63, 0.52, 0.70, 0.36)),
        (1.66, tub_sec(0.44, 0.555, 0.615, 0.60, 0.40, 0.52, 0.26)),
    ]
    tub = v.block('tub', keys, 'paint', end0=0.05, end1=0.05, n_f=24, nseg=3, n_end=3, edge_div=sym_div([0, 0, 1, 1, 1, 1]))
    # wheel openings
    cuts = []
    for side in (1, -1):
        cuts.append(v.cyl('arch_f', (FA, RF + 0.02, side * 0.88), RF + 0.07, 0.68, 'chassis', axis='s', segs=32, register=False))
        cuts.append(v.cyl('arch_r', (RA, RR + 0.03, side * 0.80), RR + 0.08, 0.80, 'chassis', axis='s', segs=32, register=False))
    boolean(tub, cuts)
    # cockpit + engine bay openings
    cock = v.top('cockpit', [(-0.58, -0.62, 0.12), (0.52, -0.56, 0.22), (0.52, 0.56, 0.22), (-0.58, 0.62, 0.12)], 0.42, 1.4, 'paint_in', register=False)
    eng = v.top('engbay', [(-1.66, -0.36, 0.06), (-0.80, -0.38, 0.08), (-0.80, 0.38, 0.08), (-1.66, 0.36, 0.06)], 0.40, 1.4, 'chassis', register=False)
    boolean(tub, [cock, eng])
    set_kind_faces(tub, 'chassis', lambda c, n: n[1] < -0.6 and c[1] < 0.36)
    v.box('floor', (-0.05, 0.42, 0.0), (1.05, 0.02, 1.20), 'rubber', r=0.01)
    v.box('firewall', (-0.62, 0.62, 0.0), (0.03, 0.36, 1.16), 'paint_in', r=0.01)
    v.box('dash', (0.52, 0.74, 0.0), (0.06, 0.12, 1.08), 'vinyl', r=0.02)
    # --- roll cage ---
    r = 0.022
    for side in (1, -1):
        s = side
        v.tube(f'hoop_m{s}', [(-0.58, 0.60, s * 0.66), (-0.60, 1.50, s * 0.57), (-0.60, 1.56, 0.0)], r, CAGE, segs=10, bend_r=0.16)
        v.tube(f'hoop_f{s}', [(0.56, 0.70, s * 0.70), (0.20, 1.45, s * 0.58), (0.18, 1.50, 0.0)], r, CAGE, segs=10, bend_r=0.16)
        v.tube(f'roofbar{s}', [(0.20, 1.475, s * 0.52), (-0.60, 1.525, s * 0.52)], r * 0.9, CAGE, segs=10)
        v.tube(f'brace_r{s}', [(-0.61, 1.47, s * 0.50), (-1.50, 0.80, s * 0.40), (-1.55, 0.62, s * 0.40)], r * 0.9, CAGE, segs=10, bend_r=0.1)
        v.tube(f'sidebar{s}', [(0.48, 0.86, s * 0.69), (-0.585, 0.86, s * 0.645)], r * 0.9, CAGE, segs=10)
        v.tube(f'nerf{s}', [(FA - 0.30, 0.36, s * 0.83), (FA - 0.42, 0.42, s * 0.86), (RA + 0.45, 0.42, s * 0.86), (RA + 0.33, 0.36, s * 0.83)], 0.02, CAGE, segs=10, bend_r=0.08)
    v.tube('hoop_x', [(-0.60, 0.68, 0.62), (-0.60, 1.48, -0.55)], r * 0.85, CAGE, segs=10)
    v.tube('rear_x', [(-1.52, 0.72, 0.40), (-1.52, 0.72, -0.40)], r * 0.85, CAGE, segs=10)
    v.tube('bumper_f', [(1.50, 0.42, 0.55), (1.80, 0.44, 0.40), (1.80, 0.44, -0.40), (1.50, 0.42, -0.55)], 0.024, CAGE, segs=10, bend_r=0.12)
    v.tube('bumper_r', [(-1.50, 0.45, 0.62), (-1.78, 0.45, 0.50), (-1.78, 0.45, -0.50), (-1.50, 0.45, -0.62)], 0.024, CAGE, segs=10, bend_r=0.12)
    # windshield frame-less screen (small)
    v.box('screen_frame', (0.53, 0.86, 0.0), (0.03, 0.04, 1.02), 'black_paint', r=0.01)
    # --- engine (VW flat four) ---
    ef = -1.18
    v.box('crankcase', (ef, 0.56, 0.0), (0.40, 0.26, 0.30), 'alu', r=0.05)
    for side in (1, -1):
        for k in (-1, 1):
            prof = [(0.0, 0.0), (0.0, 0.050)]
            for j in range(6):
                x0 = 0.02 + j * 0.028
                prof += [(x0, 0.050), (x0, 0.062), (x0 + 0.014, 0.062), (x0 + 0.014, 0.050)]
            prof += [(0.20, 0.05), (0.20, 0.0)]
            ps = prof if side > 0 else [(-x, rr) for x, rr in prof]
            v.lathe(f'cyl{side}{k}', ps, 'steel', at=(ef + k * 0.085, 0.56, side * 0.15), axis='s', segs=12)
        v.box(f'head{side}', (ef, 0.56, side * 0.37), (0.36, 0.14, 0.06), 'alu', r=0.02)
        v.tube(f'header{side}', [(ef, 0.48, side * 0.36), (ef - 0.05, 0.40, side * 0.30), (-1.58, 0.42, side * 0.22)], 0.018, 'exhaust', segs=8, bend_r=0.06)
    v.lathe('fan_shroud', [(-0.16, 0.0), (-0.16, 0.14), (-0.08, 0.17), (0.08, 0.17), (0.16, 0.14), (0.16, 0.0)], 'black_paint', at=(ef + 0.02, 0.76, 0.0), axis='f', segs=20)
    v.cyl('alternator', (ef + 0.22, 0.83, 0.0), 0.055, 0.12, 'steel', axis='f', segs=14)
    v.cyl('air_filter', (ef - 0.05, 0.93, 0.0), 0.11, 0.07, 'chrome', axis='u', segs=20)
    v.box('gearbox', (-0.80, 0.50, 0.0), (0.40, 0.20, 0.34), 'alu', r=0.05)
    v.cyl('muffler', (-1.60, 0.44, 0.0), 0.08, 0.50, 'exhaust', axis='s', segs=14)
    for side in (1, -1):
        v.tube(f'tailpipe{side}', [(-1.62, 0.44, side * 0.20), (-1.76, 0.48, side * 0.22)], 0.022, 'chrome', segs=10)
    v.empty('exhaust', -1.77, 0.48, -0.22, M=yaw_left(180))
    # --- running gear ---
    K = 'chassis'
    v.box('beam_f', (FA + 0.05, RF + 0.04, 0.0), (0.18, 0.10, 1.0), K, r=0.02)
    for side in (1, -1):
        v.tube(f'arm_f{side}', [(FA + 0.05, RF + 0.04, side * 0.50), (FA, RF, side * (TWF - 0.10))], 0.025, K, segs=8)
        v.tube(f'shock_f{side}', [(FA, RF + 0.02, side * (TWF - 0.16)), (FA + 0.10, 0.72, side * 0.48)], 0.024, 'steel', segs=8)
        v.tube(f'arm_r{side}', [(-0.70, 0.40, side * 0.45), (RA, RR, side * (TWR - 0.10))], 0.03, K, segs=8)
        v.tube(f'axle_r{side}', [(RA, RR, side * 0.10), (RA, RR, side * (TWR - 0.10))], 0.03, K, segs=8)
        v.tube(f'shock_r{side}', [(RA, RR + 0.02, side * (TWR - 0.16)), (RA + 0.15, 0.80, side * 0.48)], 0.026, 'steel', segs=8)
        v.lathe(f'drum_f{side}', [(-0.04, 0.0), (-0.04, 0.12), (0.04, 0.12), (0.04, 0.0)], K, at=(FA, RF, side * (TWF - 0.09)), axis='s', segs=16)
        v.lathe(f'drum_r{side}', [(-0.04, 0.0), (-0.04, 0.13), (0.04, 0.13), (0.04, 0.0)], K, at=(RA, RR, side * (TWR - 0.10)), axis='s', segs=16)
    # --- lamps ---
    for side in (1, -1):
        v.tube(f'lamp_stalk{side}', [(1.30, 0.70, side * 0.40), (1.34, 0.80, side * 0.40)], 0.012, 'chrome', segs=6)
        v.lathe(f'lamp_can{side}', [(-0.08, 0.0), (-0.08, 0.05), (-0.04, 0.085), (0.0, 0.09), (0.0, 0.0)], 'chrome', at=(1.35, 0.86, side * 0.40), axis='f', segs=20)
        build_round_lamp(v, f'headlamp{side}', (1.355, 0.86, side * 0.40), 0.08, 'lens_head', 'f', depth=0.05, segs=20, dome=0.012)
        v.box(f'tail{side}', (-1.66, 0.62, side * 0.50), (0.03, 0.06, 0.10), 'lens_tail', r=0.01)
        v.box(f'tail_h{side}', (-1.645, 0.62, side * 0.50), (0.03, 0.075, 0.115), 'black_paint', r=0.012)
    v.empty('light_l', 1.36, 0.86, 0.40)
    v.empty('light_r', 1.36, 0.86, -0.40)
    v.box('plate_r', (-1.70, 0.56, 0.0), (0.006, 0.11, 0.30), 'plate', r=0.004)
    # --- cockpit ---
    hips = []
    for side in (1, -1):
        obs, hip = build_seat(v, f'seat{side}', 0.02, 0.50, side * 0.34, width=0.46, depth=0.46, back_h=0.62, recline=18,
                              kind='vinyl', cush_t=0.08, bolster=0.05, headrest=False)
        hips.append(hip)
        v.box(f'seat_base{side}', (-0.20, 0.46, side * 0.34), (0.40, 0.08, 0.40), 'chassis', r=0.01)
    v.empty('seat_0', *hips[0]); v.empty('seat_1', *hips[1])
    Rm = build_steering_wheel(v, 'steer', (0.24, 0.84, 0.34), 30.0, diameter=0.34, rim_t=0.014, spokes=3, kind='vinyl', spoke_kind='steel')
    v.pivots['steering_wheel'] = Rm
    c = math.cos(math.radians(30)); sn = math.sin(math.radians(30))
    v.tube('steer_col', [(0.24 + 0.04 * c, 0.84 - 0.04 * sn, 0.34), (0.55, 0.84 - 0.31 * sn / c, 0.34)], 0.02, 'steel', segs=10)
    for i, s in enumerate((0.26, 0.35, 0.44)):
        v.box(f'pedal{i}', (0.52, 0.48, s), (0.02, 0.07, 0.06), 'rubber', r=0.006, M=pitch_up(-25, 0.52, 0.48))
    v.tube('shifter', [(0.15, 0.44, 0.0), (0.10, 0.70, 0.0)], 0.009, 'chrome', segs=6)
    v.lathe('shift_knob', [(-0.02, 0.0), (-0.02, 0.014), (0.0, 0.024), (0.02, 0.018), (0.03, 0.0)], 'plastic', at=(0.10, 0.70, 0.0), axis='u', segs=12)
    for i, s in enumerate((0.25, 0.40)):
        v.cyl(f'gauge{i}', (0.488, 0.76, s), 0.035, 0.01, 'gauge', axis='f', segs=14)
    # --- wheels ---
    build_tire(v, 'tire_f', RF, 0.185, 14 * 0.0254 / 2, 'knobby', segs=32, nlug=18, group='wheel_front', lug_depth=0.015)
    build_steel_rim(v, 'rim_f', 14 * 0.0254 / 2, 0.14, kind='chrome', group='wheel_front', segs=24, nuts=4, pcd=0.13, dish=0.03, holes=6)
    build_tire(v, 'tire_r', RR, 0.255, 15 * 0.0254 / 2, 'knobby', segs=32, nlug=18, group='wheel_rear', lug_depth=0.018)
    build_steel_rim(v, 'rim_r', 15 * 0.0254 / 2, 0.20, kind='chrome', group='wheel_rear', segs=24, nuts=4, pcd=0.13, dish=0.05, holes=6)
    v.instance('wheel_fl', 'wheel_front', FA, RF, TWF)
    v.instance('wheel_fr', 'wheel_front', FA, RF, -TWF, flip=True)
    v.instance('wheel_rl', 'wheel_rear', RA, RR, TWR)
    v.instance('wheel_rr', 'wheel_rear', RA, RR, -TWR, flip=True)
    v.meta.update({'wheel_radius': RR, 'wheel_radius_front': RF, 'wheel_radius_rear': RR, 'wheelbase': WB,
                   'track': round((TWF + TWR), 3), 'track_front': 2 * TWF, 'track_rear': 2 * TWR, 'seats': 2})
