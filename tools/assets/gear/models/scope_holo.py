# Holographic weapon sight (EXPS-style): battery body along the bore, hooded window, QD lever, rear buttons.
from gkit import rot_f, rot_s, rot_u, T
from _optics import pic_base

OUT = 'attachments'
TEX = 512
WEAR = 0.5
AX = 42.0
EYE_RELIEF = 150.0
META = dict(kind='holo', zoom=1.0, optical_axis_height_m=AX / 1000, eye_relief_m=EYE_RELIEF / 1000,
            window_size_m=[0.031, 0.024], reticle='reticles/holo.png',
            notes="'lens' is the rear window pane (semi-transparent); unlimited eye relief, eye placed 150 mm behind it")


def build(g):
    # battery body
    g.front('body', [(-19, 8.0, 3), (19, 8.0, 3), (19, 26, 4), (-19, 26, 4)], -48, 40, 'anod', bevel=1.6)
    g.front('nose', [(-15, 10, 3), (15, 10, 3), (15, 24, 3), (-15, 24, 3)], 40, 46, 'anod', bevel=1.4)
    # hood: rectangular frame tube with the window opening
    outer = [(-22, 23.5, 4), (22, 23.5, 4), (22, 60, 7), (-22, 60, 7)]
    hole = [(-16, 29.5, 2.5), (16, 29.5, 2.5), (16, 54.5, 3), (-16, 54.5, 3)]
    g.front('hood', outer, -30, 28, 'anod', holes=[hole], bevel=1.5)
    # window frames (lips) and glass
    lip_o = [(-17.5, 28.0, 3), (17.5, 28.0, 3), (17.5, 56.0, 3.5), (-17.5, 56.0, 3.5)]
    lip_i = [(-15.5, 30.0, 2), (15.5, 30.0, 2), (15.5, 54.0, 2), (-15.5, 54.0, 2)]
    g.front('lip_r', lip_o, -27, -23, 'anod', holes=[lip_i], bevel=0.6)
    g.front('lip_f', lip_o, 21, 25, 'anod', holes=[lip_i], bevel=0.6)
    pane = [(-15.6, 30.0, 2), (15.6, 30.0, 2), (15.6, 54.0, 2), (-15.6, 54.0, 2)]
    lens = g.front('lens', pane, -25.5, -24.5, '=window', group='lens', bevel=0.0)
    g.front('lens_front', pane, 22.5, 23.5, '=window', group='lens_front', bevel=0.0)
    # rear control buttons (left/right of the body rear face)
    for s in (-10, 0, 10):
        g.box(f'btn{s}', -50.5, -47, 13.5, 20.5, 7.0, 'rubber', s=s, r=1.5)
    # side adjuster recess plates
    g.box('wind_plate', -6, 6, 33, 45, 1.5, 'anod!', s=22.6, r=2.0)
    g.lathe('wind_screw', [(23.2, 0), (23.2, 3.2), (24.4, 3.2), (24.4, 0)], 'park', f=0, u=39, axis='s', segs=16)
    g.lathe('elev_screw', [(59.6, 0), (59.6, 3.2), (60.8, 3.2), (60.8, 0)], 'park', f=0, u=0, axis='u', segs=16)
    # base and QD lever on the right
    pic_base(g, -40, 32)
    g.lathe('qd_pivot', [(15.8, 0), (15.8, 5.5), (19.5, 5.5), (19.5, 0)], 'park', f=-10, u=1.0, axis='s', segs=20)
    g.side('qd_lever', [(-14, -3.5, 2), (24, -1.5, 3), (26, 4.5, 3), (-14, 6.0, 3)], 4.5, 'anod', s=21.0, bevel=1.2)
    g.empty('eye', -25.5 - EYE_RELIEF, AX)
    g.set_origin(0, 0)
