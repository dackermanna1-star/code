# High-power tube scope (34 mm tube, 56 mm objective, exposed turrets, side parallax wheel) in tall rings.
from gkit import rot_f, rot_s
from _optics import pic_base, cross_bolt, scope_ring, turret, knurl_ring

OUT = 'attachments'
TEX = 1024
WEAR = 0.5
AX = 47.0
EYE_RELIEF = 95.0
META = dict(kind='scope', zoom=8.0, zoom_min=4.0, optical_axis_height_m=AX / 1000, eye_relief_m=EYE_RELIEF / 1000,
            lens_radius_m=0.0165, reticle='reticles/scope_8x.png', field_of_view_deg=4.8)


def build(g):
    prof = [(-172, 0), (-172, 16.5), (-175, 17.5), (-176, 20.5), (-174, 22.2), (-126, 22.2), (-118, 20.0), (-112, 17.0),
            (-30, 17.0), (-29, 21.0), (29, 21.0), (30, 17.0), (80, 17.0), (112, 30.0), (118, 32.6), (168, 32.6), (170, 31.6),
            (170.5, 29.0), (167.5, 27.5), (167.5, 0)]
    g.lathe('housing', prof, 'anod', u=AX, segs=56)
    g.front('saddle', [(-20, -19, 6), (20, -19, 6), (20, 19, 6), (-20, 19, 6)], -29, 29, 'anod', u=AX, bevel=2.2)
    knurl_ring(g, -174, -160, 22.2, AX, 'eyering', n=36, kind='rubber')
    knurl_ring(g, -148, -132, 22.2, AX, 'power', n=36, kind='anod', depth=1.0)
    g.box('throw', -144, -136, AX - 3.5, AX + 3.5, 12.0, 'anod', s=28.0, r=1.5)
    for f0 in (130, 136, 142, 148, 154):
        g.lathe(f'obj_ring{f0}', [(f0, 32.6), (f0 + 1.0, 33.2), (f0 + 2.0, 32.6)], 'anod', u=AX, segs=56)
    # exposed turrets + parallax wheel
    turret(g, 0, AX, 19.0, 40.0, 14.0, 'elev', axis='u', cap='anod', ribs=24, base_r=13.0)
    turret(g, 0, AX, 19.0, 38.0, 13.0, 'wind', axis='s', side=1, cap='anod', ribs=24, base_r=12.0)
    turret(g, 0, AX, 19.0, 30.0, 13.0, 'parallax', axis='s', side=-1, cap='anod', ribs=0, base_r=12.0)
    g.lathe('wheel', [(-30, 0), (-30, 26), (-31.5, 28), (-36.5, 28), (-38, 26), (-38, 0)], 'anod', f=0, u=AX, axis='s', segs=48)
    for i in range(24):
        g.box(f'wheel_r{i}', -1.2, 1.2, AX + 27.4, AX + 28.8, 5.0, 'anod!', s=-34.0, M=rot_s(i * 15.0, 0, AX))
    # tall rings on a long base
    pic_base(g, -92, 72)
    scope_ring(g, -88, -70, AX, 17.0, 'ring_r')
    scope_ring(g, 50, 68, AX, 17.0, 'ring_f')
    cross_bolt(g, -79, 'xb_r')
    cross_bolt(g, 59, 'xb_f')
    g.disc('lens', -172, 16.5, '=lens', 'lens', u=AX, face=-1)
    g.disc('lens_front', 167.5, 27.5, '=lens', 'lens_front', u=AX, face=1)
    g.empty('eye', -176 - EYE_RELIEF, AX)
    g.set_origin(0, 0)
