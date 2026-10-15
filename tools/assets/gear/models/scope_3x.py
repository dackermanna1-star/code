# 3x prism sight (Spitfire-style): short ocular, boxy prism housing, 32 mm objective, integral Picatinny mount.
from gkit import rot_f, rot_s
from _optics import pic_base, cross_bolt, turret, knurl_ring

OUT = 'attachments'
TEX = 512
WEAR = 0.5
AX = 40.0
EYE_RELIEF = 65.0
META = dict(kind='scope', zoom=3.0, optical_axis_height_m=AX / 1000, eye_relief_m=EYE_RELIEF / 1000, lens_radius_m=0.0125,
            reticle='reticles/scope_3x.png', field_of_view_deg=13.0)


def build(g):
    # ocular
    g.lathe('ocular', [(-62, 0), (-62, 12.5), (-64, 13.6), (-65, 16.4), (-63.5, 17.4), (-40, 17.4), (-34, 16.0), (-28, 16.0), (-28, 0)],
            'anod', u=AX, segs=40)
    knurl_ring(g, -63.5, -52, 17.4, AX, 'eyering', n=28, kind='rubber')
    # prism housing: rounded box
    hb = [(-20, -17, 6), (20, -17, 6), (21, 15, 9), (-21, 15, 9)]
    g.front('prism', hb, -30, 16, 'anod', u=AX, bevel=2.0)
    g.front('prism_top', [(-15, 13, 4), (15, 13, 4), (13, 19, 3), (-13, 19, 3)], -26, 10, 'anod', u=AX, bevel=1.2)
    # objective
    g.lathe('objective', [(14, 0), (14, 16.5), (20, 17.0), (26, 18.4), (48, 18.4), (50, 17.4), (50, 15.4), (47.5, 14.2), (47.5, 0)],
            'anod', u=AX, segs=44)
    for f0 in (32, 36, 40):
        g.lathe(f'obj_ring{f0}', [(f0, 18.4), (f0 + 0.8, 18.9), (f0 + 1.6, 18.4)], 'anod', u=AX, segs=44)
    # turrets: elevation on top, windage right, illumination dial left
    turret(g, -8, AX, 17.5, 27.0, 8.5, 'elev', axis='u', cap='anod', ribs=12)
    turret(g, -8, AX, 19.5, 28.0, 8.5, 'wind', axis='s', side=1, cap='anod', ribs=12)
    turret(g, -8, AX, 19.5, 27.0, 11.5, 'illum', axis='s', side=-1, cap='rubber', ribs=0)
    for i in range(20):
        g.box(f'illum_r{i}', -8 - 0.8, -8 + 0.8, AX + 11.0, AX + 12.3, 6.5, 'rubber!', s=-(19.5 + 27.0 + 4) / 2 - 0.5, M=rot_s(i * 18.0, -8, AX))
    # integral mount: riser block + base
    g.front('riser', [(-12, 7.5, 1.5), (12, 7.5, 1.5), (14, AX - 16, 3), (-14, AX - 16, 3)], -26, 10, 'anod', bevel=1.2)
    pic_base(g, -30, 14)
    cross_bolt(g, -19, 'xb_r')
    cross_bolt(g, 4, 'xb_f')
    g.disc('lens', -62, 12.5, '=lens', 'lens', u=AX, face=-1)
    g.disc('lens_front', 47.5, 14.2, '=lens', 'lens_front', u=AX, face=1)
    g.empty('eye', -65 - EYE_RELIEF, AX)
    g.set_origin(0, 0)
