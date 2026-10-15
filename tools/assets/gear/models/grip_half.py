# Half-angle grip: short stubby grip with a forward-swept front face. Origin = rail contact (top).
from _optics import under_clamp, clamp_screw

OUT = 'attachments'
TEX = 512
META = dict(kind='grip', type='half', mount='bottom rail')


def build(g):
    under_clamp(g, -28, 30)
    clamp_screw(g, 0, 'xs')
    side = [(-30, -5, 3), (34, -5, 3), (40, -14, 8), (22, -60, 10), (8, -66, 8), (-6, -62, 8), (-22, -26, 14), (-30, -12, 4)]
    g.side('grip', side, 27.0, 'poly', bevel=5.5, bres=3, taper=[(-30, 0.9), (0, 1.0), (40, 0.85)])
    for i in range(5):
        u = -24 - i * 7
        g.box(f'grv{i}', -18 + i * 3.0, 24 - i * 3.2, u - 1.2, u + 1.2, 27.8, 'poly!', r=1.0)
    g.empty('grip_support', 4, -35)
    g.set_origin(0, 0)
