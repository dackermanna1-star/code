# Tube red-dot sight (Aimpoint CompM-style 30 mm tube) on a one-piece QD ring mount.
# Origin = mount base on the rail top (u = 0), centred on the clamp. Optical axis at 39 mm (absolute co-witness).
from gkit import rot_f, rot_s

OUT = 'attachments'
TEX = 512
WEAR = 0.5
AX = 39.0
EYE_RELIEF = 140.0
META = dict(kind='reddot', zoom=1.0, optical_axis_height_m=AX / 1000, eye_relief_m=EYE_RELIEF / 1000,
            lens_radius_m=0.0136, reticle='reticles/reddot.png',
            notes='unlimited eye relief; eye placed 140 mm behind the rear lens')


def build(g):
    prof = [(-52, 0), (-52, 13.6), (-58.5, 14.4), (-60.5, 16.2), (-60, 18.6), (-58, 19.2), (-46, 19.2), (-44, 17.2),
            (-41, 15.2), (28, 15.2), (31, 17.4), (34, 19.4), (57.5, 19.4), (60.5, 18.4), (61, 16.4), (59, 14.6),
            (52, 13.6), (52, 0)]
    g.lathe('housing', prof, 'anod', u=AX, segs=40)
    for f0 in (-56, -52, -48):
        g.lathe(f'ring_r{f0}', [(f0, 19.2), (f0 + 0.8, 19.7), (f0 + 1.6, 19.2)], 'anod', u=AX, segs=40)
    for f0 in (40, 44, 48, 52):
        g.lathe(f'ring_f{f0}', [(f0, 19.4), (f0 + 0.8, 19.9), (f0 + 1.6, 19.4)], 'anod', u=AX, segs=40)
    # elevation (top) and windage (right) turrets with rubber caps
    tb = [(13.5, 0), (13.5, 10.5), (17, 10.5), (17.5, 10), (17.5, 0)]
    tc = [(17.5, 0), (17.5, 9.4), (26, 9.4), (27, 8.4), (27, 0)]
    g.lathe('elev_base', tb, 'anod', f=8, u=AX, axis='u', segs=28)
    g.lathe('elev_cap', tc, 'rubber', f=8, u=AX, axis='u', segs=28)
    g.lathe('wind_base', tb, 'anod', f=8, u=AX, axis='s', segs=28)
    g.lathe('wind_cap', tc, 'rubber', f=8, u=AX, axis='s', segs=28)
    # battery compartment + brightness dial on the left side
    du = AX - 2
    g.lathe('batt_body', [(-12, 0), (-12, 11.5), (-24, 11.5), (-25, 10.5), (-25, 0)], 'anod', f=-14, u=du, axis='s', segs=32)
    g.lathe('batt_dial', [(-25, 0), (-25, 12.0), (-33, 12.0), (-34, 11.0), (-34, 0)], 'rubber', f=-14, u=du, axis='s', segs=36)
    for i in range(20):
        g.box(f'dial_rib{i}', -14 - 0.9, -14 + 0.9, du + 11.6, du + 12.8, 7.0, 'rubber!', s=-29.5, M=rot_s(i * 18.0, -14, du))
    # ring mount
    g.lathe('ring', [(-8, 15.2), (-8, 20.5), (-7, 21.5), (11, 21.5), (12, 20.5), (12, 15.2)], 'anod', u=AX, segs=40, closed=True)
    g.front('stem', [(-8.5, 8.5, 2), (8.5, 8.5, 2), (6.5, AX - 16, 0), (-6.5, AX - 16, 0)], -8, 12, 'anod', bevel=0.8)
    for side in (-1, 1):
        g.lathe(f'cap_screw{side}', [(20.8, 0), (20.8, 2.9), (23.0, 2.9), (23.6, 2.2), (23.6, 0)], 'park', f=2, u=AX,
                axis='u', segs=16, M=rot_f(side * 42, AX, 0))
    # base with rail jaws
    base = [(-15.5, -6.5, 1.0), (-11.2, -6.5, 0.6), (-10.4, -3.6, 0), (-10.4, 0, 0), (10.4, 0, 0), (10.4, -3.6, 0),
            (11.2, -6.5, 0.6), (15.5, -6.5, 1.0), (15.8, 8.8, 2.2), (-15.8, 8.8, 2.2)]
    g.front('base', base, -17, 17, 'anod', bevel=1.0)
    # QD clamp knob (right side) with knurling and a washer
    g.lathe('washer', [(15.8, 0), (15.8, 9.5), (17.0, 9.5), (17.0, 0)], 'park', f=0, u=-0.5, axis='s', segs=28)
    g.lathe('knob', [(17.0, 0), (17.0, 8.2), (18, 9.2), (26, 9.2), (27, 8.2), (27, 0)], 'anod', f=0, u=-0.5, axis='s', segs=32)
    for i in range(18):
        g.box(f'knurl{i}', -0.8, 0.8, -0.5 + 8.9, -0.5 + 9.8, 7.0, 'anod!', s=22, M=rot_s(i * 20.0, 0, -0.5))
    # lenses (raw glass): rear = 'lens' (eye side), front objective
    g.disc('lens', -52.4, 13.6, '=lens', 'lens', u=AX, face=-1)
    g.disc('lens_front', 52.4, 13.6, '=lens_amber', 'lens_front', u=AX, face=1)
    g.empty('eye', -53 - EYE_RELIEF, AX)
    g.set_origin(0, 0)
