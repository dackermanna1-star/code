# Cheek riser pad for sniper stocks: padded U-shaped cordura cover with two buckled straps.
# Origin = where the pad sits on the stock comb (inner top surface), centred; the stock goes through the U along Z.
from gkit import rot_f, soft_box, apply_mods

OUT = 'attachments'
TEX = 512
MS = 1.5
META = dict(kind='stock', type='cheekpad', inner_width_m=0.042)


def build(g):
    outer = [(-27, -42, 6), (27, -42, 6), (29, 4, 10), (24, 26, 14), (-24, 26, 14), (-29, 4, 10)]
    inner = [(-21, -44, 2), (21, -44, 2), (21, -2, 6), (-21, -2, 6)]
    g.front('pad', outer, -70, 70, 'cordura_blk', holes=[inner], bevel=6.0, bres=3)
    # piping seam along the top edges
    for s in (-25.5, 25.5):
        g.box(f'pipe{s}', -69, 69, 19, 22, 2.5, 'cordura_blk!', s=s, r=1.2)
    # straps around the stock + buckles
    for k, f in enumerate((-42, 42)):
        g.front(f'strap{k}', [(-29.8, -44, 2), (29.8, -44, 2), (30.5, 5, 9), (25, 27.6, 12), (-25, 27.6, 12), (-30.5, 5, 9)],
                f - 12.5, f + 12.5, 'webbing_blk', holes=[[(-28.8, -43, 2), (28.8, -43, 2), (29.2, 4, 8), (24.0, 26.4, 11), (-24.0, 26.4, 11), (-29.2, 4, 8)]],
                bevel=0.5)
        g.box(f'buckle{k}', f - 15, f + 15, -40, -22, 4.0, 'plastic_blk', s=31.5, r=2.0)
    g.empty('cheek', 0, 26)
    g.set_origin(0, 0)
