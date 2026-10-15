# Smoke grenade (M18-style): 64 x 114 mm sheet-steel can, white top, stencilled label, fuze/spoon/ring.
# Origin = can centre (hand grip). +Y = fuze up.
from _grenade import fuze

OUT = 'weapons'
TEX = 512
META = dict(kind='throwable', type='smoke')


def build(g):
    lbl = g.decal_kind('paint_olive', 'smoke', g.work + '/labels/smoke_label.png', weather=0.45)
    H = 57.0
    body = g.lathe('can', [(-H, 0), (-H, 29.5), (-H + 1.5, 31.6), (-H + 3, 31.75), (H - 9, 31.75), (H - 8, 31.0), (H - 8, 0)], lbl, axis='u', segs=48)
    g.decal_uv(body, ('cyl', 0, 0), (-75, -40, 75, 40), facing=None)
    g.lathe('rim_b', [(-H - 0.5, 30.0), (-H + 1.5, 32.3), (-H + 4, 32.3), (-H + 4, 31.5)], 'paint_olive', axis='u', segs=48)
    # painted top dome (smoke colour) with emission holes
    g.lathe('top', [(H - 8, 31.75), (H - 4, 32.0), (H - 2, 30.5), (H, 24), (H + 1.5, 12), (H + 1.5, 0)], 'gloss_wht', axis='u', segs=48)
    import math
    for k in range(4):
        a = math.radians(45 + 90 * k)
        g.lathe(f'hole{k}', [(H - 1.0, 0), (H - 1.0, 3.2), (H + 0.6, 3.2), (H + 0.6, 0)], 'paint_blk!', f=math.cos(a) * 19, s=math.sin(a) * 19, axis='u', segs=12)
    fuze(g, H + 1.5, lambda u: 31.9 if u < H - 4 else 31.9 - (u - (H - 4)) * 2.0, 10)
    g.set_origin(0, 0)
