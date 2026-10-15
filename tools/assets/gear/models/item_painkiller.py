# Painkillers: white HDPE pharmacy bottle with a ribbed child-proof cap and a printed label.
# Origin = bottom centre on the ground.
from gkit import rot_u

OUT = 'items'
TEX = 512
META = dict(kind='boost', type='painkiller')


def build(g):
    lbl = g.decal_kind('plastic_wht', 'pk', g.work + '/labels/painkiller.png', rough=0.5)
    g.lathe('bottle', [(0, 0), (0, 24), (1.5, 26.0), (4, 26.4), (66, 26.4), (72, 24.5), (76, 18.5), (88, 18.0), (88, 0)], 'plastic_wht', axis='u', segs=48)
    lab = g.lathe('label', [(10, 26.7), (62, 26.7)], lbl, axis='u', segs=48, cap0=False, cap1=False)
    g.decal_uv(lab, ('cyl', 0, 0), (-180, 10, 180, 62))
    g.lathe('cap', [(76, 0), (76, 23.5), (77.5, 24.8), (96, 24.8), (98, 23.2), (98.5, 0)], 'plastic_wht', axis='u', segs=48)
    for i in range(36):
        g.box(f'rib{i}', -0.8, 0.8, 78, 95, 1.6, 'plastic_wht!', s=25.0, M=rot_u(i * 10, 0, 0))
    g.set_origin(0, 0)
