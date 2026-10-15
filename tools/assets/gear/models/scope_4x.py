# 4x32 combat prism scope (ACOG TA31-style): forged housing, fibre-optic ridge, flat-top thumb-nut mount.
import gkit
from gkit import rot_f, rot_s, rot_u
from _optics import pic_base, thumb_nut, knurl_ring

OUT = 'attachments'
TEX = 512
WEAR = 0.5
AX = 44.0
EYE_RELIEF = 38.0
META = dict(kind='scope', zoom=4.0, optical_axis_height_m=AX / 1000, eye_relief_m=EYE_RELIEF / 1000, lens_radius_m=0.0115,
            reticle='reticles/scope_4x.png', field_of_view_deg=7.0, notes='short (38 mm) eye relief like the real ACOG')
gkit.KINDS['fibre'] = dict(base='#3a8a2a', var='#2f7a22', metal=0.0, rough=0.25, rvar=0.04, wear='#60b050', wear_amt=0.0,
                           wear_rough=0.3, pat='none', bump=0.0)


def build(g):
    # objective bell + housing (lathe) and a flattened forged body around the prism
    g.lathe('objective', [(36, 0), (36, 17.5), (44, 20.5), (50, 22.6), (76, 22.6), (78, 21.6), (78.5, 19.0), (76, 16.0), (76, 0)],
            'anod', u=AX, segs=48)
    g.lathe('neck', [(-30, 0), (-30, 15.5), (0, 16.5), (20, 17.5), (38, 18.5), (38, 0)], 'anod', u=AX, segs=40)
    body = [(-19, -16, 5), (19, -16, 5), (20, 10, 8), (12, 18, 4), (-12, 18, 4), (-20, 10, 8)]
    g.front('body', body, -36, 34, 'anod', u=AX, bevel=2.2)
    # tapered rear body and ocular
    g.lathe('rear', [(-72, 0), (-72, 12.0), (-74, 13.2), (-74.5, 15.4), (-72.5, 16.0), (-56, 16.0), (-48, 17.5), (-34, 18.5), (-30, 18.5), (-30, 0)],
            'anod', u=AX, segs=40)
    knurl_ring(g, -74, -64, 16.0, AX, 'eyering', n=26, kind='anod', depth=0.6)
    # fibre-optic ridge on top
    ridge = [(-46, AX + 14, 3), (30, AX + 14, 0), (30, AX + 24, 4), (-38, AX + 25, 6)]
    g.side('ridge', ridge, 12.0, 'anod', bevel=2.0)
    g.box('fibre_win', -34, 22, AX + 23.6, AX + 25.4, 5.0, 'fibre')
    g.box('fibre_cap', 22, 29, AX + 22, AX + 26.5, 8.0, 'anod')
    # adjuster caps (top front and right front)
    g.lathe('elev_cap', [(18.0, 0), (18.0, 7.5), (25.5, 7.5), (26.5, 6.5), (26.5, 0)], 'anod', f=20, u=AX, axis='u', segs=28)
    g.lathe('wind_cap', [(19.5, 0), (19.5, 7.5), (27.0, 7.5), (28.0, 6.5), (28.0, 0)], 'anod', f=20, u=AX, axis='s', segs=28)
    for i in range(12):
        g.box(f'elev_r{i}', 20 - 0.7, 20 + 0.7, AX + 19.5, AX + 26.0, 1.2, 'anod!', s=7.6, M=rot_u(i * 30.0, 20, 0))
    # flat-top mount block and thumb nuts (left side)
    g.front('mount', [(-15, 7.0, 1.5), (15, 7.0, 1.5), (16.5, AX - 15, 3), (-16.5, AX - 15, 3)], -30, 30, 'anod', bevel=1.4)
    pic_base(g, -32, 32)
    thumb_nut(g, -18, 'tn_r', side=-1)
    thumb_nut(g, 18, 'tn_f', side=-1)
    g.disc('lens', -72, 12.0, '=lens', 'lens', u=AX, face=-1)
    g.disc('lens_front', 76, 16.0, '=lens_amber', 'lens_front', u=AX, face=1)
    g.empty('eye', -74.5 - EYE_RELIEF, AX)
    g.set_origin(0, 0)
