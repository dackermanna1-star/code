# Variable 2-6x tube scope (30 mm tube, 40 mm objective, throw lever) in a one-piece cantilever mount.
from gkit import rot_f, rot_s
from _optics import pic_base, cross_bolt, scope_ring, turret, knurl_ring

OUT = 'attachments'
TEX = 512
WEAR = 0.5
AX = 39.0
EYE_RELIEF = 90.0
META = dict(kind='scope', zoom=6.0, zoom_min=3.0, optical_axis_height_m=AX / 1000, eye_relief_m=EYE_RELIEF / 1000,
            lens_radius_m=0.0155, reticle='reticles/scope_6x.png', field_of_view_deg=6.5)


def build(g):
    prof = [(-134, 0), (-134, 15.5), (-137, 16.5), (-138, 19.5), (-136, 21.0), (-96, 21.0), (-90, 19.0), (-84, 16.4), (-80, 15.0),
            (-17, 15.0), (-16, 18.5), (16, 18.5), (17, 15.0), (66, 15.0), (84, 19.0), (92, 21.4), (128, 21.4), (130, 20.4),
            (130.5, 18.0), (128, 16.4), (128, 0)]
    g.lathe('housing', prof, 'anod', u=AX, segs=48)
    # saddle block
    g.front('saddle', [(-16, -16, 5), (16, -16, 5), (16, 16, 5), (-16, 16, 5)], -16, 16, 'anod', u=AX, bevel=2.0)
    knurl_ring(g, -136, -124, 21.0, AX, 'eyering', n=34, kind='rubber')
    knurl_ring(g, -112, -100, 21.0, AX, 'power', n=34, kind='anod', depth=0.8)
    # throw lever on the power ring (right side)
    g.box('throw', -109, -103, AX - 3, AX + 3, 12.0, 'anod', s=26.0, r=1.5)
    for f0 in (100, 105, 110, 115):
        g.lathe(f'obj_ring{f0}', [(f0, 21.4), (f0 + 0.8, 21.9), (f0 + 1.6, 21.4)], 'anod', u=AX, segs=48)
    turret(g, 0, AX, 16.0, 30.0, 10.5, 'elev', axis='u', cap='anod', ribs=18)
    turret(g, 0, AX, 16.0, 30.0, 10.5, 'wind', axis='s', side=1, cap='anod', ribs=18)
    turret(g, 0, AX, 16.0, 27.0, 10.5, 'illum', axis='s', side=-1, cap='rubber', ribs=0)
    # cantilever one-piece mount
    pic_base(g, -66, 44)
    scope_ring(g, -62, -48, AX, 15.0, 'ring_r')
    scope_ring(g, 28, 42, AX, 15.0, 'ring_f')
    cross_bolt(g, -40, 'xb_r')
    cross_bolt(g, 10, 'xb_f')
    g.disc('lens', -134, 15.5, '=lens', 'lens', u=AX, face=-1)
    g.disc('lens_front', 128, 16.4, '=lens', 'lens_front', u=AX, face=1)
    g.empty('eye', -138 - EYE_RELIEF, AX)
    g.set_origin(0, 0)
