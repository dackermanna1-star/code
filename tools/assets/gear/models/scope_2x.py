# Compact fixed 2x tube scope (30 mm tube, 32 mm objective) in two rings on a one-piece Picatinny base.
from gkit import rot_f, rot_s
from _optics import pic_base, cross_bolt, scope_ring, turret, knurl_ring

OUT = 'attachments'
TEX = 512
WEAR = 0.5
AX = 38.0
EYE_RELIEF = 80.0
META = dict(kind='scope', zoom=2.0, optical_axis_height_m=AX / 1000, eye_relief_m=EYE_RELIEF / 1000, lens_radius_m=0.0135,
            reticle='reticles/scope_2x.png', field_of_view_deg=21.0)


def build(g):
    prof = [(-76, 0), (-76, 13.5), (-79, 14.5), (-80, 17.5), (-79, 19.0), (-62, 19.0), (-58, 17.0), (-50, 15.4), (-47, 15.0),
            (-6, 15.0), (-5, 17.2), (15, 17.2), (16, 15.0), (36, 15.0), (44, 17.0), (50, 18.6), (70, 18.6), (72, 17.6),
            (72, 15.4), (69, 14.0), (69, 0)]
    g.lathe('housing', prof, 'anod', u=AX, segs=44)
    knurl_ring(g, -78.5, -64, 19.0, AX, 'eyering', n=30, kind='rubber')
    turret(g, 5, AX, 15.0, 26.0, 8.8, 'elev', axis='u', cap='anod', ribs=14)
    turret(g, 5, AX, 15.0, 26.0, 8.8, 'wind', axis='s', side=1, cap='anod', ribs=14)
    turret(g, 5, AX, 15.0, 23.0, 10.0, 'illum', axis='s', side=-1, cap='rubber', ribs=0)
    pic_base(g, -34, 32)
    scope_ring(g, -32, -20, AX, 15.0, 'ring_r')
    scope_ring(g, 19, 31, AX, 15.0, 'ring_f')
    cross_bolt(g, -26, 'xb_r')
    cross_bolt(g, 25, 'xb_f')
    g.disc('lens', -76, 13.5, '=lens', 'lens', u=AX, face=-1)
    g.disc('lens_front', 69, 14.0, '=lens', 'lens_front', u=AX, face=1)
    g.empty('eye', -80 - EYE_RELIEF, AX)
    g.set_origin(0, 0)
